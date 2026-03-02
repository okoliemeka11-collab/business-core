// api/generate.js — Scrivlo AI Serverless Function
// Vercel Serverless Function (Node.js 18) — runs on every generate request.
// Proxies to Gemini Flash API server-side. API key NEVER reaches the browser.
// Rate-limited to stay within Gemini free tier (15 RPM, 1500 RPD).

// Sliding-window rate limiter (module-level = persists across warm invocations)
const RATE_LIMITS = { RPM: 12, RPD: 1200, MAX_OUTPUT_TOKENS: 800 };
const counters = {
  minute: { count: 0, windowStart: Date.now() },
  day:    { count: 0, windowStart: Date.now() },
};

function checkRateLimit() {
  const now = Date.now();
  if (now - counters.minute.windowStart > 60000) {
    counters.minute = { count: 0, windowStart: now };
  }
  if (now - counters.day.windowStart > 86400000) {
    counters.day = { count: 0, windowStart: now };
  }
  if (counters.minute.count >= RATE_LIMITS.RPM) {
    const retryAfter = Math.ceil((60000 - (now - counters.minute.windowStart)) / 1000);
    return { allowed: false, reason: "rate_limit_minute", retryAfter };
  }
  if (counters.day.count >= RATE_LIMITS.RPD) {
    return { allowed: false, reason: "rate_limit_daily", retryAfter: 3600 };
  }
  counters.minute.count++;
  counters.day.count++;
  return { allowed: true };
}

function buildPrompt(topic, tone, topNiche) {
  const nicheHint = topNiche ? " The user focuses on the " + topNiche + " niche." : "";
  const system = "You are Scrivlo, an elite AI content engine for indie builders and solopreneurs." +
    "\nProduce publish-ready, SEO-optimised articles that feel like they were written by a sharp practitioner." +
    "\nTone: " + (tone || "balanced and direct") + "." + nicheHint +
    "\nRules:\n- Every insight must be specific and actionable — zero filler." +
    "\n- Structure: TL;DR → Why now → 3 Biggest Mistakes → 5-Step Framework → Quick Win → CTA." +
    "\n- Output clean HTML only (use <strong>, <br>, <ul>, <li>, <ol>). No markdown. No outer html/body tags." +
    "\n- Keep output under 750 words.";
  const user = "Write a comprehensive, publication-ready article about: \"" + topic + "\"\n\n" +
    "Make EVERY section genuinely specific to \"" + topic + "\" — not generic advice." +
    "\nThe TL;DR must capture the sharpest insight." +
    "\nThe 3 mistakes must have concrete explanations of WHY they fail." +
    "\nThe 5-step framework must be immediately actionable for someone working on this topic today.";
  return { system, user };
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    res.setHeader("Retry-After", String(rateCheck.retryAfter));
    return res.status(429).json({
      error: "rate_limited",
      reason: rateCheck.reason,
      retryAfter: rateCheck.retryAfter,
      message: rateCheck.reason === "rate_limit_minute"
        ? "Too many requests. Try again in " + rateCheck.retryAfter + "s."
        : "Daily limit reached. Resets at midnight UTC.",
    });
  }

  // Parse body
  const { topic, tone, topNiche } = req.body || {};
  if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
    return res.status(400).json({ error: "topic is required (min 3 chars)" });
  }

  const safeTopic = topic.trim().slice(0, 200);
  const safeTone  = (tone  || "balanced and direct").slice(0, 60);
  const safeNiche = (topNiche || "").slice(0, 40);

  // API key from Vercel env var
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "api_key_missing",
      message: "GEMINI_API_KEY environment variable not set in Vercel.",
    });
  }

  // Build Gemini request
  const { system, user } = buildPrompt(safeTopic, safeTone, safeNiche);
  const geminiPayload = {
    contents: [{ role: "user", parts: [{ text: user }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      maxOutputTokens: RATE_LIMITS.MAX_OUTPUT_TOKENS,
      temperature: 0.72,
      topP: 0.9,
      topK: 40,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  };

  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;

  try {
    const https = require("https");
    const body  = JSON.stringify(geminiPayload);

    const geminiData = await new Promise((resolve, reject) => {
      const options = {
        hostname: "generativelanguage.googleapis.com",
        path: "/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      };
      const reqG = https.request(options, (resG) => {
        let data = "";
        resG.on("data", chunk => { data += chunk; });
        resG.on("end", () => {
          try { resolve({ status: resG.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error("Parse error: " + data.slice(0, 200))); }
        });
      });
      reqG.on("error", reject);
      reqG.write(body);
      reqG.end();
    });

    if (geminiData.status === 429) {
      return res.status(429).json({ error: "upstream_quota", message: "Gemini quota reached. Try again in a minute." });
    }
    if (geminiData.status !== 200) {
      throw new Error("Gemini " + geminiData.status + ": " + JSON.stringify(geminiData.body).slice(0, 200));
    }

    const content = geminiData.body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!content) throw new Error("Empty response from Gemini");

    return res.status(200).json({
      success: true,
      content,
      model: "gemini-1.5-flash",
      topic: safeTopic,
      rateInfo: {
        minuteUsed: counters.minute.count,
        minuteLimit: RATE_LIMITS.RPM,
        dayUsed: counters.day.count,
        dayLimit: RATE_LIMITS.RPD,
      },
    });

  } catch (err) {
    return res.status(500).json({ error: "generation_failed", message: err.message });
  }
};
