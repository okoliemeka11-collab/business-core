// api/repurpose.js — Scrivlo Pro: Content Repurposing Engine v1.0
// PRO-ONLY exclusive feature. Standout competitor differentiator.
// 
// Takes any long-form draft (blog post, article, essay) and instantly generates
// 5 platform-optimized variants in one Groq API call:
//   1. Twitter/X Thread  — hook + 8 numbered tweets + CTA
//   2. LinkedIn Post     — professional narrative with hook, insight, CTA
//   3. Email Newsletter  — subject line + body + PS
//   4. Reddit Post       — title + authentic community-style body (no marketing)
//   5. Short-Form Blog   — 300-word punchy summary for Medium/Substack
//
// Why this beats every competitor at $9/mo:
// Jasper, Copy.ai, and Buffer all charge $49-99/mo for content repurposing.
// Scrivlo Pro includes it at $9/mo — making it a 5-10x value gap.

const https = require('https');

// ── AUTH (shared pattern) ─────────────────────────────────────────────────────
function verifySession(req) {
    try {
          const crypto = require('crypto');
          const secret = process.env.AUTH_SECRET || 'scrivlo-dev-secret-change-in-prod';
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
          const expectedSig = crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');
          if (sig !== expectedSig) return { valid: false, reason: 'invalid_signature' };
          const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
          if (data.exp && Date.now() / 1000 > data.exp) return { valid: false, reason: 'expired' };
          return { valid: true, userId: data.sub, email: data.email, tier: data.tier || 'free' };
    } catch (e) {
          return { valid: false, reason: 'parse_error' };
    }
}

// ── PROMPTS ───────────────────────────────────────────────────────────────────
function buildRepurposeSystemPrompt() {
    return (
          'You are Scrivlo Pro, a world-class content repurposing specialist.' +
          ' Your job is to take a long-form draft and adapt it into 5 platform-native formats.' +
          '\n\nCritical rules for each format:' +
          '\n- Twitter thread: Hook tweet that stops the scroll. 8 numbered insight tweets (max 280 chars each). Final CTA tweet. Total 10 tweets.' +
          '\n- LinkedIn post: Professional but human. Opens with a bold insight or contrarian take. 150-200 words. Ends with a question to drive comments.' +
          '\n- Email newsletter: Compelling subject line (under 50 chars). Preview text (under 100 chars). Body 200-250 words. Conversational, not corporate. One clear CTA.' +
          '\n- Reddit post: NEVER sound like marketing. Title as a genuine question or insight. Body reads like a real community member sharing a lesson. 150-200 words. No CTAs.' +
          '\n- Short-form blog: Punchy 300-word summary version. Hook sentence. Core insight. 3 actionable takeaways. Closing line.' +
          '\n\nExtract the ACTUAL insights from the provided draft — do not write generic content.' +
          '\nReturn ONLY valid JSON matching this exact schema (no markdown, no extra text):' +
          '\n{"twitter":{"hook":"string","tweets":["string","string","string","string","string","string","string","string"],"cta":"string"},' +
          '"linkedin":{"post":"string"},' +
          '"email":{"subject":"string","preview":"string","body":"string","cta":"string"},' +
          '"reddit":{"title":"string","body":"string"},' +
          '"shortBlog":{"headline":"string","body":"string","takeaways":["string","string","string"],"closing":"string"}}'
        );
}

function buildRepurposeUserPrompt(draft, platform) {
    const platformNote = platform ? ' Focus especially on the ' + platform + ' format.' : '';
    return (
          'Long-form draft to repurpose:\n\n"""\n' + draft + '\n"""\n\n' +
          'Repurpose this draft into all 5 platform formats.' + platformNote +
          ' Extract real insights from this specific draft. Return ONLY the JSON object.'
        );
}

// ── GROQ HTTPS ────────────────────────────────────────────────────────────────
function httpsPost(hostname, path, headers, bodyStr) {
    return new Promise((resolve, reject) => {
          const options = {
                  hostname, path, method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
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

async function callGroq(draft, platform) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not configured in Vercel environment variables.');

  const payload = {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildRepurposeSystemPrompt() },
          { role: 'user', content: buildRepurposeUserPrompt(draft, platform) },
              ],
        max_tokens: 2400,
        temperature: 0.75,
        response_format: { type: 'json_object' },
  };

  const result = await httpsPost(
        'api.groq.com',
        '/openai/v1/chat/completions',
    { Authorization: 'Bearer ' + apiKey },
        JSON.stringify(payload)
      );

  if (result.status === 429) throw new Error('rate_limit:30');
    if (result.status !== 200) throw new Error('Groq ' + result.status + ': ' + JSON.stringify(result.body).slice(0, 200));

  const rawText = result.body?.choices?.[0]?.message?.content || '';
    if (!rawText) throw new Error('Empty response from Groq');

  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const structured = JSON.parse(cleaned);

  // Validate required keys
  const required = ['twitter', 'linkedin', 'email', 'reddit', 'shortBlog'];
    for (const key of required) {
          if (!structured[key]) throw new Error('Groq schema mismatch: missing ' + key);
    }

  return { structured, provider: 'groq-llama-3.3-70b-versatile' };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Auth check
    const session = verifySession(req);
    if (!session.valid) {
          return res.status(401).json({
                  error: 'unauthenticated',
                  reason: session.reason,
                  message: 'Sign in to use the Content Repurposing Engine.',
                  redirect: '/login',
          });
    }

    // Pro-only gate
    if (session.tier !== 'pro') {
          return res.status(403).json({
                  error: 'pro_required',
                  message: 'The Content Repurposing Engine is a Pro feature. Upgrade to unlock it.',
                  upgradeUrl: 'https://buy.stripe.com/test_cNi00lejKe1g6CV3oo2wU00',
          });
    }

    const { draft, platform } = req.body || {};

    if (!draft || typeof draft !== 'string' || draft.trim().length < 100) {
          return res.status(400).json({
                  error: 'draft_too_short',
                  message: 'Please provide a draft with at least 100 characters to repurpose.',
          });
    }

    if (draft.length > 8000) {
          return res.status(400).json({
                  error: 'draft_too_long',
                  message: 'Draft too long. Please trim to under 8,000 characters.',
          });
    }

    const safeDraft = draft.trim();
    const safePlatform = typeof platform === 'string' ? platform.slice(0, 30) : null;

    try {
          const { structured, provider } = await callGroq(safeDraft, safePlatform);
          return res.status(200).json({
                  success: true,
                  repurposed: structured,
                  model: provider,
                  version: 'repurpose-v1',
                  charCount: safeDraft.length,
          });
    } catch (err) {
          if (err.message.startsWith('rate_limit:')) {
                  return res.status(429).json({ error: 'upstream_quota', message: 'Groq is temporarily rate-limited. Please try again in a moment.' });
          }
          if (err.message.includes('GROQ_API_KEY')) {
                  return res.status(503).json({ error: 'api_key_missing', message: err.message });
          }
          return res.status(500).json({ error: 'generation_failed', message: err.message });
    }
};
