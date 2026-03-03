// api/seo-page.js — Scrivlo Pro: Instant SEO Landing Page Generator v1.0
// PRO-ONLY agentic feature.
// Takes a product idea (name + one-line description) and generates a
// complete, publish-ready landing page via a multi-step AI pipeline.
//
// Pipeline steps (sequential, all from one provider call with a structured schema):
//   Step 1 — Validate: Is this a real product concept?
//   Step 2 — SEO Research: Primary keyword + 4 LSI keywords
//   Step 3 — Headline hierarchy: H1, subheadline, supporting proof line
//   Step 4 — Benefits: 3 benefit blocks (icon, title, 2-sentence description)
//   Step 5 — Social proof hooks: 2 synthetic testimonial frames (no fake names)
//   Step 6 — CTA copy: Primary CTA, secondary CTA, urgency nudge
//   Step 7 — Meta: title tag, meta description, OG description
//
// Load balancer: same Gemini → Groq → SiliconFlow waterfall from generate.js v4.
// Returns a single structured JSON object. Client renders into live HTML preview.

const SEO_PAGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isValidProduct: {
      type: 'BOOLEAN',
      description: 'true if the input describes a real, buildable product concept; false if it is too vague, nonsense, or harmful.',
    },
    pivotMessage: {
      type: 'STRING',
      description: 'If isValidProduct is false, a friendly message explaining why and suggesting how to clarify the product description. Empty string if valid.',
    },
    seo: {
      type: 'OBJECT',
      properties: {
        primaryKeyword:  { type: 'STRING', description: 'The single most important SEO keyword for this product (2-4 words). Should match high intent.' },
        lsiKeywords: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Exactly 4 semantically related keywords that support the primary. Each 2-4 words.',
          minItems: 4, maxItems: 4,
        },
        searchIntent: { type: 'STRING', description: 'One sentence describing the search intent this page satisfies (e.g. "Someone looking to automate X without code").' },
      },
      required: ['primaryKeyword', 'lsiKeywords', 'searchIntent'],
    },
    hero: {
      type: 'OBJECT',
      properties: {
        h1:           { type: 'STRING', description: 'Main headline. Outcome-focused, specific, under 12 words. Must include or closely mirror the primary keyword.' },
        subheadline:  { type: 'STRING', description: '1-2 sentences expanding on the headline. Clarify WHO it is for and WHAT they get. Max 30 words.' },
        proofLine:    { type: 'STRING', description: 'A short credibility/social proof hook under the subheadline. E.g. "Used by 400+ indie founders" or "No credit card required". Keep it believable and specific.' },
        badgeText:    { type: 'STRING', description: 'A short badge/pill text (under 8 words) that sits above the headline. E.g. "Open beta — free forever plan".' },
      },
      required: ['h1', 'subheadline', 'proofLine', 'badgeText'],
    },
    benefits: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          emoji:       { type: 'STRING', description: 'A single relevant emoji as the icon.' },
          title:       { type: 'STRING', description: 'Benefit title — 3-6 words, outcome-framed.' },
          description: { type: 'STRING', description: '2 sentences explaining the tangible benefit. Be specific — name a metric, time saving, or concrete outcome.' },
        },
        required: ['emoji', 'title', 'description'],
      },
      description: 'Exactly 3 benefit blocks.',
      minItems: 3, maxItems: 3,
    },
    socialProof: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          quote:  { type: 'STRING', description: 'A realistic testimonial-style quote (1-2 sentences). Do NOT invent a real person name — use a role descriptor instead.' },
          author: { type: 'STRING', description: 'Role descriptor only, e.g. "Indie SaaS founder, 3 products launched" or "Freelance designer, 12 clients". No fake names.' },
        },
        required: ['quote', 'author'],
      },
      description: 'Exactly 2 social proof blocks.',
      minItems: 2, maxItems: 2,
    },
    cta: {
      type: 'OBJECT',
      properties: {
        primary:   { type: 'STRING', description: 'Primary CTA button text. Action-verb first, outcome-focused. Max 6 words. E.g. "Start building free" or "Generate my first draft".' },
        secondary: { type: 'STRING', description: 'Secondary CTA link text. Lower commitment. Max 6 words. E.g. "See a live example" or "Read how it works".' },
        urgency:   { type: 'STRING', description: 'A brief urgency or scarcity nudge under the CTA. Must be believable — no fake countdown timers. E.g. "Free plan available while in beta." Max 12 words.' },
      },
      required: ['primary', 'secondary', 'urgency'],
    },
    meta: {
      type: 'OBJECT',
      properties: {
        titleTag:        { type: 'STRING', description: 'HTML title tag content. 50-60 characters. Include primary keyword. Brand name at end with " | " separator.' },
        metaDescription: { type: 'STRING', description: 'Meta description. 140-155 characters. Include primary keyword, clear value prop, soft CTA.' },
        ogDescription:   { type: 'STRING', description: 'Open Graph description. 1-2 punchy sentences. 100-130 characters. Optimised for social sharing.' },
      },
      required: ['titleTag', 'metaDescription', 'ogDescription'],
    },
  },
  required: ['isValidProduct', 'pivotMessage', 'seo', 'hero', 'benefits', 'socialProof', 'cta', 'meta'],
};

function buildSeoSystemPrompt() {
  return (
    'You are Scrivlo Pro, an elite SaaS copywriter and SEO strategist.' +
    ' You specialize in writing high-converting landing pages for indie SaaS products and solo-built tools.' +
    ' Your output will be rendered directly into a live landing page — every word must earn its place.' +
    '\n\nCritical rules:' +
    '\n- Every element must be specific to the exact product described. Do NOT use generic SaaS template phrases.' +
    '\n- H1 must be outcome-focused, not feature-focused.' +
    '\n- Social proof quotes must be realistic and use role descriptors only — never invent real names.' +
    '\n- SEO keywords must reflect actual search demand for this type of product.' +
    '\n- CTAs must be action verbs first, not "Click here" or "Submit".' +
    '\n- If the product description is too vague, set isValidProduct=false with a helpful pivotMessage.' +
    '\n\nRespond ONLY with valid JSON matching the specified schema. No markdown, no extra text.'
  );
}

function buildSeoUserPrompt(productName, productDescription) {
  return (
    'Product name: "' + productName + '"\n' +
    'Product description: "' + productDescription + '"\n\n' +
    'Generate a complete, high-converting landing page for this product. ' +
    'All copy must be specific to this exact product — do not recycle generic SaaS language. ' +
    'Follow the JSON schema exactly. Return ONLY valid JSON, no prose outside it.'
  );
}

// ── UTILITY ──────────────────────────────────────────────────────────────────
function httpsPost(hostname, path, headers, bodyStr) {
  const https = require('https');
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

// ── PROVIDER CALLS ────────────────────────────────────────────────────────────
async function callGemini(apiKey, productName, productDesc) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildSeoUserPrompt(productName, productDesc) }] }],
    systemInstruction: { parts: [{ text: buildSeoSystemPrompt() }] },
    generationConfig: {
      maxOutputTokens: 1800,
      temperature: 0.75,
      topP: 0.90,
      topK: 40,
      responseMimeType: 'application/json',
      responseSchema: SEO_PAGE_SCHEMA,
    },
  };
  const r = await httpsPost(
    'generativelanguage.googleapis.com',
    '/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
    {}, JSON.stringify(payload)
  );
  if (r.status === 429) return { rateLimited: true };
  if (r.status !== 200) throw new Error('Gemini ' + r.status);
  const text = r.body?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Empty Gemini response');
  const structured = JSON.parse(text);
  if (typeof structured.isValidProduct !== 'boolean') throw new Error('Gemini schema mismatch');
  return { structured, provider: 'gemini-2.0-flash' };
}

async function callGroq(apiKey, productName, productDesc) {
  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: buildSeoSystemPrompt() },
      { role: 'user',   content: buildSeoUserPrompt(productName, productDesc) },
    ],
    max_tokens: 1800,
    temperature: 0.75,
    response_format: { type: 'json_object' },
  };
  const r = await httpsPost(
    'api.groq.com', '/openai/v1/chat/completions',
    { Authorization: 'Bearer ' + apiKey }, JSON.stringify(payload)
  );
  if (r.status === 429) return { rateLimited: true };
  if (r.status !== 200) throw new Error('Groq ' + r.status);
  const text = r.body?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty Groq response');
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const structured = JSON.parse(cleaned);
  if (typeof structured.isValidProduct !== 'boolean') throw new Error('Groq schema mismatch');
  return { structured, provider: 'groq-llama-3.3-70b' };
}

async function callSiliconFlow(apiKey, productName, productDesc) {
  const payload = {
    model: 'Qwen/Qwen2.5-72B-Instruct',
    messages: [
      { role: 'system', content: buildSeoSystemPrompt() },
      { role: 'user',   content: buildSeoUserPrompt(productName, productDesc) },
    ],
    max_tokens: 1800,
    temperature: 0.75,
    response_format: { type: 'json_object' },
  };
  const r = await httpsPost(
    'api.siliconflow.cn', '/v1/chat/completions',
    { Authorization: 'Bearer ' + apiKey }, JSON.stringify(payload)
  );
  if (r.status === 429) return { rateLimited: true };
  if (r.status !== 200) throw new Error('SiliconFlow ' + r.status);
  const text = r.body?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty SiliconFlow response');
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const structured = JSON.parse(cleaned);
  if (typeof structured.isValidProduct !== 'boolean') throw new Error('SiliconFlow schema mismatch');
  return { structured, provider: 'siliconflow-qwen2.5-72b' };
}

async function callWithFallback(productName, productDesc) {
  const geminiKey  = process.env.GEMINI_API_KEY;
  const groqKey    = process.env.GROQ_API_KEY;
  const siliconKey = process.env.SILICONFLOW_API_KEY;

  const providers = [
    geminiKey  ? { name: 'Gemini',      fn: () => callGemini(geminiKey, productName, productDesc) }       : null,
    groqKey    ? { name: 'Groq',        fn: () => callGroq(groqKey, productName, productDesc) }           : null,
    siliconKey ? { name: 'SiliconFlow', fn: () => callSiliconFlow(siliconKey, productName, productDesc) } : null,
  ].filter(Boolean);

  if (providers.length === 0) throw new Error('No AI API keys configured.');

  const skipped = [];
  for (const p of providers) {
    try {
      const result = await p.fn();
      if (result.rateLimited) { skipped.push(p.name + ':429'); continue; }
      result.fallbackChain = skipped;
      return result;
    } catch (e) {
      skipped.push(p.name + ':' + e.message.slice(0, 50));
    }
  }
  throw new Error('All providers failed. Tried: ' + skipped.join(' | '));
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

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
    const { structured, provider, fallbackChain } = await callWithFallback(safeName, safeDesc);
    return res.status(200).json({
      success: true,
      structured,
      productName: safeName,
      model: provider,
      version: 'seo-page-v1',
      fallbackChain: fallbackChain || [],
    });
  } catch (err) {
    if (err.message.includes('429') || err.message.includes('rate')) {
      return res.status(429).json({ error: 'upstream_quota', message: 'AI providers are rate-limited. Please try again in a moment.' });
    }
    return res.status(500).json({ error: 'generation_failed', message: err.message });
  }
};
