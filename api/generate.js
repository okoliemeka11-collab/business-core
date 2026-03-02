// api/generate.js — Scrivlo AI Edge Function
// Vercel Edge Runtime — runs globally at the CDN edge, $0 cost on free tier.
// Proxies requests to Gemini Flash API with server-side rate limiting.
// API key stays in Vercel env vars — never exposed to the browser.

export const config = { runtime: 'edge' };

// ─── RATE LIMITER ────────────────────────────────────────────────────────────
// Gemini Flash free tier: 15 RPM, 1M TPM, 1500 RPD
// We enforce: 12 RPM (buffer), 1200 RPD (buffer), ~800K TPD (estimated)
// Using sliding window in Edge memory (resets per Edge instance cold-start).
// For production scale, replace with Vercel KV (still free tier).

const RATE_LIMITS = {
  RPM: 12,       // requests per minute (free tier: 15)
  RPD: 1200,     // requests per day (free tier: 1500)
  MAX_INPUT_TOKENS_ESTIMATE: 600,  // ~600 tokens per request avg
  MAX_OUTPUT_TOKENS: 800,
};

// Edge-scoped counters (survive across requests in same instance, reset on cold start)
const counters = {
  minute: { count: 0, windowStart: Date.now() },
  day:    { count: 0, windowStart: Date.now() },
};

function checkRateLimit() {
  const now = Date.now();

  // Reset minute window
  if (now - counters.minute.windowStart > 60_000) {
    counters.minute = { count: 0, windowStart: now };
  }
  // Reset day window
  if (now - counters.day.windowStart > 86_400_000) {
    counters.day = { count: 0, windowStart: now };
  }

  if (counters.minute.count >= RATE_LIMITS.RPM) {
    const retryAfter = Math.ceil((60_000 - (now - counters.minute.windowStart)) / 1000);
    return { allowed: false, reason: 'rate_limit_minute', retryAfter };
  }
  if (counters.day.count >= RATE_LIMITS.RPD) {
    return { allowed: false, reason: 'rate_limit_daily', retryAfter: 3600 };
  }

  counters.minute.count++;
  counters.day.count++;
  return { allowed: true };
}

// ─── CORS HELPER ─────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ─── PROMPT BUILDER ──────────────────────────────────────────────────────────
function buildPrompt(topic, tone, topNiche) {
  const nicheHint = topNiche ? ` The user focuses on the ${topNiche} niche.` : '';
  return {
    system: `You are Scrivlo, an elite AI content engine built for indie builders and solopreneurs.
Produce publish-ready, SEO-optimised articles that feel like they were written by a sharp practitioner.
Tone: ${tone || 'balanced and direct'}.${nicheHint}
Rules:
- Every insight must be specific and actionable — zero filler.
- Structure: TL;DR → Why now → 3 Biggest Mistakes → 5-Step Framework → Quick Win → CTA.
- Output clean HTML only (use <strong>, <br>, <ul>, <li>, <ol>). No markdown. No outer html/body tags.
- Keep output under 750 words for fast loading.`,
    user: `Write a comprehensive, publication-ready article about: "${topic}"

Make EVERY section genuinely specific to "${topic}" — not generic advice with the topic name swapped in.
The TL;DR must capture the sharpest insight. The 3 mistakes must have concrete explanations of WHY they fail.
The 5-step framework must be immediately actionable for someone working on "${topic}" today.`
  };
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
export default async function handler(request) {
  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

  // Rate limit check
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({
      error: 'rate_limited',
      reason: rateCheck.reason,
      retryAfter: rateCheck.retryAfter,
      message: rateCheck.reason === 'rate_limit_minute'
        ? `Too many requests. Try again in ${rateCheck.retryAfter}s.`
        : 'Daily limit reached. Resets at midnight UTC.',
    }), {
      status: 429,
      headers: { ...CORS_HEADERS, 'Retry-After': String(rateCheck.retryAfter) },
    });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const { topic, tone, topNiche } = body;
  if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
    return new Response(JSON.stringify({ error: 'topic is required (min 3 chars)' }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  // Sanitise — max 200 chars to prevent abuse
  const safeTopic = topic.trim().slice(0, 200);
  const safeTone  = (tone  || 'balanced and direct').slice(0, 60);
  const safeNiche = (topNiche || '').slice(0, 40);

  // Get API key from env (set in Vercel dashboard)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'api_key_missing',
      message: 'GEMINI_API_KEY environment variable not set in Vercel.',
    }), { status: 503, headers: CORS_HEADERS });
  }

  // Build Gemini Flash request
  const { system, user } = buildPrompt(safeTopic, safeTone, safeNiche);
  const geminiPayload = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      maxOutputTokens: RATE_LIMITS.MAX_OUTPUT_TOKENS,
      temperature: 0.72,
      topP: 0.9,
      topK: 40,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      // If quota exceeded upstream, return 429 to client
      if (geminiRes.status === 429) {
        return new Response(JSON.stringify({
          error: 'upstream_quota',
          message: 'Gemini quota reached. Try again in a minute.',
        }), { status: 429, headers: CORS_HEADERS });
      }
      throw new Error(`Gemini ${geminiRes.status}: ${errText.slice(0, 200)}`);
    }

    const data = await geminiRes.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    return new Response(JSON.stringify({
      success: true,
      content,
      model: 'gemini-1.5-flash',
      topic: safeTopic,
      rateInfo: {
        minuteUsed: counters.minute.count,
        minuteLimit: RATE_LIMITS.RPM,
        dayUsed: counters.day.count,
        dayLimit: RATE_LIMITS.RPD,
      },
    }), { status: 200, headers: CORS_HEADERS });

  } catch (err) {
    return new Response(JSON.stringify({
      error: 'generation_failed',
      message: err.message,
    }), { status: 500, headers: CORS_HEADERS });
  }
}
