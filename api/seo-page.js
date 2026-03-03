// api/seo-page.js — Scrivlo Pro: Instant SEO Landing Page Generator v2.0
// ARCHITECTURE: Groq-only (llama-3.3-70b-versatile). All Gemini/SiliconFlow logic removed.
// PRO-ONLY: Requires valid session with tier=pro.
// Takes product name + description, runs 7-step pipeline, returns structured JSON for live HTML preview.

const https = require('https');

// ── AUTH VALIDATION (shared with generate.js) ────────────────────────────────
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

// ── PROMPTS ───────────────────────────────────────────────────────────────────
function buildSeoSystemPrompt() {
    return (
          'You are Scrivlo Pro, an elite SaaS copywriter and SEO strategist.' +
          ' You specialize in writing high-converting landing pages for indie SaaS products and solo-built tools.' +
          '\n\nCritical rules:' +
          '\n- Every element must be specific to the exact product described. Do NOT use generic SaaS template phrases.' +
          '\n- H1 must be outcome-focused, not feature-focused.' +
          '\n- Social proof quotes must use role descriptors only — never invent real names.' +
          '\n- CTAs must start with action verbs, not "Click here" or "Submit".' +
          '\n- If the product description is too vague, set isValidProduct=false with a helpful pivotMessage.' +
          '\n\nRespond ONLY with valid JSON matching this exact schema (no markdown, no extra text):' +
          '\n{"isValidProduct":bool,"pivotMessage":"string",' +
          '"seo":{"primaryKeyword":"string","lsiKeywords":["string","string","string","string"],"searchIntent":"string"},' +
          '"hero":{"h1":"string","subheadline":"string","proofLine":"string","badgeText":"string"},' +
          '"benefits":[{"emoji":"string","title":"string","description":"string"},{"emoji":"string","title":"string","description":"string"},{"emoji":"string","title":"string","description":"string"}],' +
          '"socialProof":[{"quote":"string","author":"string"},{"quote":"string","author":"string"}],' +
          '"cta":{"primary":"string","secondary":"string","urgency":"string"},' +
          '"meta":{"titleTag":"string","metaDescription":"string","ogDescription":"string"}}'
        );
}

function buildSeoUserPrompt(productName, productDescription) {
    return (
          'Product name: "' + productName + '"\n' +
          'Product description: "' + productDescription + '"\n\n' +
          'Generate a complete, high-converting landing page for this product. ' +
          'lsiKeywords must have exactly 4 items. benefits must have exactly 3 items. socialProof must have exactly 2 items. ' +
          'All copy must be specific to this exact product. Return ONLY valid JSON, no prose outside it.'
        );
}

// ── GROQ HTTPS HELPER ─────────────────────────────────────────────────────────
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

async function callGroq(productName, productDesc) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not configured in Vercel environment variables.');

  const payload = {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildSeoSystemPrompt() },
          { role: 'user', content: buildSeoUserPrompt(productName, productDesc) },
              ],
        max_tokens: 1800,
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
    if (typeof structured.isValidProduct !== 'boolean') throw new Error('Groq schema mismatch: missing isValidProduct');

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
                  message: 'Sign in to use Pro features.',
                  redirect: '/login',
          });
    }

    // Pro-only gate
    if (session.tier !== 'pro') {
          return res.status(403).json({
                  error: 'pro_required',
                  message: 'The SEO Landing Page Generator is a Pro feature. Upgrade to unlock it.',
          });
    }

    const { productName, productDescription } = req.body || {};
    if (!productName || typeof productName !== 'string' || productName.trim().length < 2) {
          return res.status(400).json({ error: 'product_name_required', message: 'Please provide a product name.' });
    }
    if (!productDescription || typeof productDescription !== 'string' || productDescription.trim().length < 10) {
          return res.status(400).json({ error: 'product_description_required', message: 'Please describe your product (min 10 characters).' });
    }

    const safeName = productName.trim().slice(0, 80);
    const safeDesc = productDescription.trim().slice(0, 400);

    try {
          const { structured, provider } = await callGroq(safeName, safeDesc);
          return res.status(200).json({
                  success: true,
                  structured,
                  productName: safeName,
                  model: provider,
                  version: 'seo-page-v2',
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
