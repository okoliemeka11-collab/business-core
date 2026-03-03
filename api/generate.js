// api/generate.js — Scrivlo AI Serverless Function v5.0
// ARCHITECTURE: Groq-only (llama-3.3-70b-versatile). All Gemini/SiliconFlow logic removed.
// Auth: validates JWT session token from Authorization header or scrivlo_token cookie.
// Tier: checks user tier — free users limited to 3 drafts/day, pro users unlimited.

const https = require('https');

// ── RATE LIMITS ──────────────────────────────────────────────────────────────
const RATE_LIMITS = { RPM: 20, RPD: 2000, MAX_OUTPUT_TOKENS: 1200 };
const counters = {
    minute: { count: 0, windowStart: Date.now() },
    day: { count: 0, windowStart: Date.now() },
};

function checkRateLimit() {
    const now = Date.now();
    if (now - counters.minute.windowStart > 60000) counters.minute = { count: 0, windowStart: now };
    if (now - counters.day.windowStart > 86400000) counters.day = { count: 0, windowStart: now };
    if (counters.minute.count >= RATE_LIMITS.RPM) {
          const retryAfter = Math.ceil((60000 - (now - counters.minute.windowStart)) / 1000);
          return { allowed: false, reason: 'rate_limit_minute', retryAfter };
    }
    if (counters.day.count >= RATE_LIMITS.RPD) {
          return { allowed: false, reason: 'rate_limit_daily', retryAfter: 3600 };
    }
    counters.minute.count++;
    counters.day.count++;
    return { allowed: true };
}

// ── JWT SESSION VALIDATION ───────────────────────────────────────────────────
// Lightweight HMAC-SHA256 JWT verify (no external deps, pure Node crypto)
function verifySession(req) {
    try {
          const crypto = require('crypto');
          const secret = process.env.AUTH_SECRET || 'scrivlo-dev-secret-change-in-prod';

      // Get token from Authorization header or cookie
      let token = null;
          const authHeader = req.headers['authorization'] || '';
          if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
          if (!token) {
                  const cookies = req.headers['cookie'] || '';
                  const match = cookies.match(/scrivlo_token=([^;]+)/);
                  if (match) token = decodeURIComponent(match[1]);
          }
          if (!token) return { valid: false, reason: 'no_token' };

      const parts = token.split('.');
          if (parts.length !== 3) return { valid: false, reason: 'malformed' };

      const [header, payload, sig] = parts;
          const expectedSig = crypto
            .createHmac('sha256', secret)
            .update(header + '.' + payload)
            .digest('base64url');
          if (sig !== expectedSig) return { valid: false, reason: 'invalid_signature' };

      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
          if (data.exp && Date.now() / 1000 > data.exp) return { valid: false, reason: 'expired' };

      return { valid: true, userId: data.sub, email: data.email, tier: data.tier || 'free' };
    } catch (e) {
          return { valid: false, reason: 'parse_error' };
    }
}

// ── PER-USER DAILY DRAFT COUNTER (in-memory, resets on cold start) ───────────
// In production, replace with KV store (Vercel KV free tier)
const userDraftCounts = new Map();
const FREE_DAILY_LIMIT = 3;

function checkUserDraftLimit(userId, tier) {
    if (tier === 'pro') return { allowed: true };
    const today = new Date().toISOString().slice(0, 10);
    const key = userId + ':' + today;
    const count = userDraftCounts.get(key) || 0;
    if (count >= FREE_DAILY_LIMIT) {
          return { allowed: false, count, limit: FREE_DAILY_LIMIT };
    }
    userDraftCounts.set(key, count + 1);
    return { allowed: true, count: count + 1, limit: FREE_DAILY_LIMIT };
}

// ── SHARED RESPONSE SCHEMA (OpenAI JSON mode) ────────────────────────────────
function buildSystemPrompt(tone, topNiche) {
    const nicheHint = topNiche ? ' The user primary niche is ' + topNiche + ' — tailor examples to this context.' : '';
    return (
          'You are Scrivlo, a world-class content strategist writing for indie builders and solopreneurs.' +
          ' Tone: ' + (tone || 'direct, concrete, and practitioner-level') + '.' +
          nicheHint +
          '\n\nCritical rules:' +
          '\n- Every insight must be SPECIFIC to the exact topic provided. Do NOT recycle generic advice.' +
          '\n- If the topic is nonsense, gibberish, or completely uninterpretable, set isValidTopic=false.' +
          '\n- Framework steps must be immediately actionable today.' +
          '\n- quickWin must be completable in 30 minutes or less.' +
          '\n- metaDescription must be 140-155 characters and include the topic primary keyword.' +
          '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown fences, no extra text. Schema:' +
          '\n{"isValidTopic":bool,"pivotMessage":"string","tldr":"string","whyNow":"string",' +
          '"mistakes":[{"title":"string","explanation":"string"}],' +
          '"framework":[{"step":"string","detail":"string"}],' +
          '"quickWin":"string","metaDescription":"string"}'
        );
}

function buildUserPrompt(topic) {
    return (
          'Topic: "' + topic + '"\n\n' +
          'Generate a complete content brief. Return ONLY valid JSON matching the schema in your system prompt. ' +
          'mistakes array must have exactly 3 items. framework array must have exactly 5 items. ' +
          'All content must be 100% specific to "' + topic + '" — no filler, no generic advice.'
        );
}

// ── GROQ API CALL ────────────────────────────────────────────────────────────
function httpsPost(hostname, path, headers, bodyStr) {
    return new Promise((resolve, reject) => {
          const options = {
                  hostname, path, method: 'POST',
                  headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(bodyStr),
                            ...headers,
                  },
          };
          const req = https.request(options, (res) => {
                  let data = '';
                  res.on('data', chunk => { data += chunk; });
                  res.on('end', () => {
                            try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                            catch (e) { reject(new Error('Parse error: ' + data.slice(0, 300))); }
                  });
          });
          req.on('error', reject);
          req.write(bodyStr);
          req.end();
    });
}

async function callGroq(topic, tone, topNiche) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not configured in Vercel environment variables.');

  const payload = {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildSystemPrompt(tone, topNiche) },
          { role: 'user', content: buildUserPrompt(topic) },
              ],
        max_tokens: RATE_LIMITS.MAX_OUTPUT_TOKENS,
        temperature: 0.80,
        response_format: { type: 'json_object' },
  };

  const result = await httpsPost(
        'api.groq.com',
        '/openai/v1/chat/completions',
    { Authorization: 'Bearer ' + apiKey },
        JSON.stringify(payload)
      );

  if (result.status === 429) {
        const retryAfter = result.body?.error?.message?.match(/(\d+)/)?.[1] || 30;
        throw new Error('rate_limit:' + retryAfter);
  }
    if (result.status !== 200) {
          throw new Error('Groq ' + result.status + ': ' + JSON.stringify(result.body).slice(0, 200));
    }

  const rawText = result.body?.choices?.[0]?.message?.content || '';
    if (!rawText) throw new Error('Empty response from Groq');

  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const structured = JSON.parse(cleaned);
    if (typeof structured.isValidTopic !== 'boolean') throw new Error('Groq schema mismatch: missing isValidTopic');

  return { structured, provider: 'groq-llama-3.3-70b-versatile' };
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── AUTH CHECK ──────────────────────────────────────────────────────────────
    const session = verifySession(req);
    if (!session.valid) {
          return res.status(401).json({
                  error: 'unauthenticated',
                  reason: session.reason,
                  message: 'Sign in to generate drafts.',
                  redirect: '/login',
          });
    }

    // ── TIER / DRAFT LIMIT CHECK ────────────────────────────────────────────────
    const draftCheck = checkUserDraftLimit(session.userId, session.tier);
    if (!draftCheck.allowed) {
          return res.status(403).json({
                  error: 'draft_limit_reached',
                  tier: 'free',
                  used: draftCheck.count,
                  limit: draftCheck.limit,
                  message: 'You have used all ' + FREE_DAILY_LIMIT + ' free drafts for today. Upgrade to Pro for unlimited access.',
          });
    }

    // ── APP-LEVEL RATE LIMIT ────────────────────────────────────────────────────
    const rateCheck = checkRateLimit();
    if (!rateCheck.allowed) {
          res.setHeader('Retry-After', String(rateCheck.retryAfter));
          return res.status(429).json({
                  error: 'rate_limited',
                  reason: rateCheck.reason,
                  retryAfter: rateCheck.retryAfter,
                  message: rateCheck.reason === 'rate_limit_minute'
                    ? 'Too many requests. Try again in ' + rateCheck.retryAfter + 's.'
                            : 'Daily limit reached. Resets at midnight UTC.',
          });
    }

    // ── PARSE & SANITISE BODY ───────────────────────────────────────────────────
    const { topic, tone, topNiche } = req.body || {};
    if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
          return res.status(400).json({ error: 'topic_required', message: 'Please enter a topic (min 2 characters).' });
    }

    const safeTopic = topic.trim().slice(0, 200);
    const safeTone = (tone || 'direct, concrete, and practitioner-level').slice(0, 80);
    const safeNiche = (topNiche || '').slice(0, 40);

    try {
          const { structured, provider } = await callGroq(safeTopic, safeTone, safeNiche);
          return res.status(200).json({
                  success: true,
                  structured,
                  topic: safeTopic,
                  model: provider,
                  version: 'groq-v5',
                  tier: session.tier,
                  draftsUsedToday: draftCheck.count,
                  draftsLimit: session.tier === 'pro' ? null : FREE_DAILY_LIMIT,
          });
    } catch (err) {
          if (err.message.startsWith('rate_limit:')) {
                  return res.status(429).json({
                            error: 'upstream_quota',
                            message: 'Groq is temporarily rate-limited. Please try again in a moment.',
                  });
          }
          if (err.message.includes('GROQ_API_KEY')) {
                  return res.status(503).json({ error: 'api_key_missing', message: err.message });
          }
          return res.status(500).json({ error: 'generation_failed', message: err.message });
    }
};
