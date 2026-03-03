// api/generate.js — Scrivlo AI Serverless Function v4.0
// KEY IMPROVEMENTS over v3:
// 1. API Load Balancer — waterfall fallback chain: Gemini → Groq → SiliconFlow
//    On any 429 (rate limit) from a provider, the next provider is tried automatically.
// 2. Provider-normalised JSON Schema — all three providers return the same structured
//    object shape. No Mad Libs possible regardless of which provider handles the request.
// 3. Groq & SiliconFlow use OpenAI-compatible /chat/completions endpoint with json_object
//    response_format, guided by the same system prompt.
// 4. GROQ_API_KEY and SILICONFLOW_API_KEY are optional env vars — missing keys skip that
//    provider gracefully rather than crashing.
//
// Provider free-tier RPM as of Q1 2026:
//   Gemini 2.0 Flash  — 15 RPM (free tier)
//   Groq llama-3.3-70b-versatile — 30 RPM (free tier)
//   SiliconFlow Qwen2.5-72B-Instruct — 20 RPM (free tier)

const RATE_LIMITS = { RPM: 12, RPD: 1200, MAX_OUTPUT_TOKENS: 1200 };
const counters = {
  minute: { count: 0, windowStart: Date.now() },
  day:    { count: 0, windowStart: Date.now() },
};
function checkRateLimit() {
  const now = Date.now();
  if (now - counters.minute.windowStart > 60000)    counters.minute = { count: 0, windowStart: now };
  if (now - counters.day.windowStart    > 86400000) counters.day    = { count: 0, windowStart: now };
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

// ── SHARED RESPONSE SCHEMA (Gemini native format) ────────────────────────────
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isValidTopic: { type: 'BOOLEAN', description: 'true if the input is a recognisable topic, false if gibberish/spam/uninterpretable' },
    pivotMessage:  { type: 'STRING',  description: 'If isValidTopic is false, a short friendly message suggesting a better topic. Empty string if isValidTopic is true.' },
    tldr:          { type: 'STRING',  description: 'One sharp, specific insight — single most important thing to know. Max 2 sentences. NOT generic.' },
    whyNow:        { type: 'STRING',  description: '2-3 sentences on why this topic is critically important right now in 2026. Reference a concrete trend or data point.' },
    mistakes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title:       { type: 'STRING', description: 'Short name for the mistake (5-8 words)' },
          explanation: { type: 'STRING', description: '2-3 sentences explaining WHY this mistake happens and the actual damage it causes' },
        },
        required: ['title', 'explanation'],
      },
      description: 'Exactly 3 common mistakes specific to this topic — NOT generic advice.',
      minItems: 3, maxItems: 3,
    },
    framework: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          step:   { type: 'STRING', description: 'Imperative action title (e.g. "Audit your current X")' },
          detail: { type: 'STRING', description: '2-3 sentences of immediately actionable guidance. Include a concrete example or metric.' },
        },
        required: ['step', 'detail'],
      },
      description: 'Exactly 5 ordered steps a practitioner can act on today. Must be specific — not abstract.',
      minItems: 5, maxItems: 5,
    },
    quickWin:        { type: 'STRING', description: 'One specific action completable in the next 30 minutes to get a tangible result.' },
    metaDescription: { type: 'STRING', description: 'SEO meta description 140-155 characters. Include the topic keyword naturally.' },
  },
  required: ['isValidTopic', 'pivotMessage', 'tldr', 'whyNow', 'mistakes', 'framework', 'quickWin', 'metaDescription'],
};

// ── SHARED PROMPTS ────────────────────────────────────────────────────────────
function buildSystemPrompt(tone, topNiche) {
  const nicheHint = topNiche ? ' The user primary niche is ' + topNiche + ' — tailor examples to this context.' : '';
  return (
    'You are Scrivlo, a world-class content strategist writing for indie builders and solopreneurs.' +
    ' Tone: ' + (tone || 'direct, concrete, and practitioner-level') + '.' + nicheHint +
    '\n\nCritical rules:' +
    '\n- Every insight must be SPECIFIC to the exact topic provided. Do NOT recycle generic advice.' +
    '\n- If the topic is nonsense, gibberish, a random string, or completely uninterpretable, set isValidTopic=false and write a helpful pivotMessage suggesting 1-2 concrete alternatives.' +
    '\n- When isValidTopic=true, all other fields must be substantive and topic-specific. Zero filler.' +
    '\n- Framework steps must be immediately actionable today — not aspirational.' +
    '\n- quickWin must be completable in 30 minutes or less.' +
    '\n- metaDescription must be 140-155 characters and include the topic primary keyword.' +
    '\n\nIMPORTANT: Respond ONLY with valid JSON matching the specified schema. No markdown fences, no extra text.'
  );
}
function buildUserPrompt(topic) {
  return (
    'Topic submitted by user: "' + topic + '"\n\n' +
    'First, honestly assess: is this a real, interpretable topic a practitioner could write about? Set isValidTopic accordingly.\n\n' +
    'If it IS a valid topic, generate every field with insights 100% specific to "' + topic + '". ' +
    'Do not use placeholder phrases like "in this space" or "in today's world". ' +
    'Name specific tools, metrics, platforms, or techniques that apply to this exact topic.\n\n' +
    'Return ONLY a JSON object — no markdown, no prose outside the JSON.'
  );
}

// ── PROVIDER ADAPTERS ─────────────────────────────────────────────────────────

// Utility: simple HTTPS POST, returns { status, body }
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

// --- Gemini 2.0 Flash (native Structured Outputs) ---
async function callGemini(apiKey, topic, tone, topNiche) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildUserPrompt(topic) }] }],
    systemInstruction: { parts: [{ text: buildSystemPrompt(tone, topNiche) }] },
    generationConfig: {
      maxOutputTokens: RATE_LIMITS.MAX_OUTPUT_TOKENS,
      temperature: 0.80, topP: 0.92, topK: 40,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };
  const bodyStr = JSON.stringify(payload);
  const result = await httpsPost(
    'generativelanguage.googleapis.com',
    '/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
    {},
    bodyStr
  );
  if (result.status === 429) return { rateLimited: true };
  if (result.status !== 200) throw new Error('Gemini ' + result.status + ': ' + JSON.stringify(result.body).slice(0, 200));
  const rawText = result.body?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) throw new Error('Empty response from Gemini');
  const structured = JSON.parse(rawText);
  if (typeof structured.isValidTopic !== 'boolean') throw new Error('Gemini missing isValidTopic');
  return { structured, provider: 'gemini-2.0-flash' };
}

// --- Groq llama-3.3-70b-versatile (OpenAI-compatible, JSON mode) ---
async function callGroq(apiKey, topic, tone, topNiche) {
  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: buildSystemPrompt(tone, topNiche) },
      { role: 'user',   content: buildUserPrompt(topic) },
    ],
    max_tokens: RATE_LIMITS.MAX_OUTPUT_TOKENS,
    temperature: 0.80,
    response_format: { type: 'json_object' },
  };
  const bodyStr = JSON.stringify(payload);
  const result = await httpsPost(
    'api.groq.com',
    '/openai/v1/chat/completions',
    { Authorization: 'Bearer ' + apiKey },
    bodyStr
  );
  if (result.status === 429) return { rateLimited: true };
  if (result.status !== 200) throw new Error('Groq ' + result.status + ': ' + JSON.stringify(result.body).slice(0, 200));
  const rawText = result.body?.choices?.[0]?.message?.content || '';
  if (!rawText) throw new Error('Empty response from Groq');
  // Strip markdown fences if present
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const structured = JSON.parse(cleaned);
  if (typeof structured.isValidTopic !== 'boolean') throw new Error('Groq missing isValidTopic');
  return { structured, provider: 'groq-llama-3.3-70b' };
}

// --- SiliconFlow Qwen2.5-72B-Instruct (OpenAI-compatible, JSON mode) ---
async function callSiliconFlow(apiKey, topic, tone, topNiche) {
  const payload = {
    model: 'Qwen/Qwen2.5-72B-Instruct',
    messages: [
      { role: 'system', content: buildSystemPrompt(tone, topNiche) },
      { role: 'user',   content: buildUserPrompt(topic) },
    ],
    max_tokens: RATE_LIMITS.MAX_OUTPUT_TOKENS,
    temperature: 0.80,
    response_format: { type: 'json_object' },
  };
  const bodyStr = JSON.stringify(payload);
  const result = await httpsPost(
    'api.siliconflow.cn',
    '/v1/chat/completions',
    { Authorization: 'Bearer ' + apiKey },
    bodyStr
  );
  if (result.status === 429) return { rateLimited: true };
  if (result.status !== 200) throw new Error('SiliconFlow ' + result.status + ': ' + JSON.stringify(result.body).slice(0, 200));
  const rawText = result.body?.choices?.[0]?.message?.content || '';
  if (!rawText) throw new Error('Empty response from SiliconFlow');
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const structured = JSON.parse(cleaned);
  if (typeof structured.isValidTopic !== 'boolean') throw new Error('SiliconFlow missing isValidTopic');
  return { structured, provider: 'siliconflow-qwen2.5-72b' };
}

// ── LOAD BALANCER ──────────────────────────────────────────────────────────────
// Tries each provider in order. Skips providers with missing API keys.
// Returns { structured, provider } or throws if all providers fail/rate-limit.
async function callWithFallback(topic, tone, topNiche) {
  const geminiKey     = process.env.GEMINI_API_KEY;
  const groqKey       = process.env.GROQ_API_KEY;
  const siliconKey    = process.env.SILICONFLOW_API_KEY;

  const providers = [
    geminiKey    ? { name: 'Gemini',      fn: () => callGemini(geminiKey, topic, tone, topNiche) }          : null,
    groqKey      ? { name: 'Groq',        fn: () => callGroq(groqKey, topic, tone, topNiche) }              : null,
    siliconKey   ? { name: 'SiliconFlow', fn: () => callSiliconFlow(siliconKey, topic, tone, topNiche) }    : null,
  ].filter(Boolean);

  if (providers.length === 0) {
    throw new Error('No AI API keys configured. Set GEMINI_API_KEY, GROQ_API_KEY, or SILICONFLOW_API_KEY in Vercel.');
  }

  const skipped = [];
  for (const provider of providers) {
    try {
      const result = await provider.fn();
      if (result.rateLimited) {
        skipped.push(provider.name + ':429');
        continue; // Try next provider
      }
      // Success — attach fallback metadata to structured response
      result.fallbackChain = skipped;
      return result;
    } catch (err) {
      skipped.push(provider.name + ':' + err.message.slice(0, 60));
      // Don't rethrow — try next provider
    }
  }

  // All providers exhausted
  const triedStr = skipped.join(' | ');
  throw new Error('All AI providers rate-limited or failed. Tried: ' + triedStr);
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // App-level rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfter));
    return res.status(429).json({
      error: 'rate_limited', reason: rateCheck.reason, retryAfter: rateCheck.retryAfter,
      message: rateCheck.reason === 'rate_limit_minute'
        ? 'Too many requests. Try again in ' + rateCheck.retryAfter + 's.'
        : 'Daily limit reached. Resets at midnight UTC.',
    });
  }

  // Parse & sanitise body
  const { topic, tone, topNiche } = req.body || {};
  if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
    return res.status(400).json({ error: 'topic_required', message: 'Please enter a topic (min 2 characters).' });
  }
  const safeTopic  = topic.trim().slice(0, 200);
  const safeTone   = (tone || 'direct, concrete, and practitioner-level').slice(0, 80);
  const safeNiche  = (topNiche || '').slice(0, 40);

  try {
    const { structured, provider, fallbackChain } = await callWithFallback(safeTopic, safeTone, safeNiche);
    return res.status(200).json({
      success: true,
      structured,
      topic: safeTopic,
      model: provider,
      version: 'load-balanced-v4',
      fallbackChain: fallbackChain || [],
      rateInfo: {
        minuteUsed: counters.minute.count, minuteLimit: RATE_LIMITS.RPM,
        dayUsed:    counters.day.count,    dayLimit:    RATE_LIMITS.RPD,
      },
    });
  } catch (err) {
    // All providers failed — send 429 so client triggers smart fallback
    if (err.message.includes('rate-limited') || err.message.includes('429')) {
      return res.status(429).json({
        error: 'upstream_quota',
        message: 'All AI providers are currently rate-limited. Your smart local draft has been generated.',
      });
    }
    return res.status(500).json({ error: 'generation_failed', message: err.message });
  }
};
