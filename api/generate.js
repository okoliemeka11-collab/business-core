// api/generate.js — Scrivlo AI Serverless Function v3.0 (gemini-2.0-flash)
// KEY IMPROVEMENTS over v2:
//   1. Gemini Structured Outputs (JSON Schema) — eliminates Mad Libs template substitution.
//      The model returns a validated JSON object; every field is genuinely generated, not filled.
//   2. Pre-flight topic validation — nonsense / gibberish input returns a sensible pivot message
//      rather than a garbled article.
//   3. Richer system prompt — no rigid section headings; Gemini owns the structure per topic.
//   4. Payment loop fix — success_url handling moved to revenue.js / app.js (client-side).

const RATE_LIMITS = { RPM: 12, RPD: 1200, MAX_OUTPUT_TOKENS: 1200 };

const counters = {
  minute: { count: 0, windowStart: Date.now() },
  day:    { count: 0, windowStart: Date.now() },
};

function checkRateLimit() {
  const now = Date.now();
  if (now - counters.minute.windowStart > 60000)  counters.minute = { count: 0, windowStart: now };
  if (now - counters.day.windowStart > 86400000)   counters.day    = { count: 0, windowStart: now };
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

// ── JSON SCHEMA for Structured Output ───────────────────────────────────────
// Gemini is forced to return a typed object. Every field is free-form text
// generated from scratch — no section headings are hard-coded in the prompt.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isValidTopic: {
      type: "BOOLEAN",
      description: "true if the input is a recognisable topic, false if it is gibberish, spam, or completely uninterpretable"
    },
    pivotMessage: {
      type: "STRING",
      description: "If isValidTopic is false, a short friendly message explaining what went wrong and suggesting a better topic. Empty string if isValidTopic is true."
    },
    tldr: {
      type: "STRING",
      description: "One sharp, specific insight that is the single most important thing to know about this topic. Max 2 sentences. Must NOT be generic."
    },
    whyNow: {
      type: "STRING",
      description: "2–3 sentences on why this topic is critically important right now in 2026. Reference a concrete trend, shift, or data point specific to this topic."
    },
    mistakes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title:       { type: "STRING", description: "Short name for the mistake (5–8 words)" },
          explanation: { type: "STRING", description: "2–3 sentences explaining precisely WHY this mistake happens and what the actual damage is" }
        },
        required: ["title", "explanation"]
      },
      description: "Exactly 3 common mistakes practitioners make on this specific topic. Must be specific to this topic, NOT generic advice.",
      minItems: 3,
      maxItems: 3
    },
    framework: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          step:        { type: "STRING", description: "Imperative action title (e.g. 'Audit your current X')" },
          detail:      { type: "STRING", description: "2–3 sentences of immediately actionable guidance. Include a concrete example or metric where possible." }
        },
        required: ["step", "detail"]
      },
      description: "Exactly 5 ordered steps for a practitioner to act on this topic today. Must be specific — not abstract.",
      minItems: 5,
      maxItems: 5
    },
    quickWin: {
      type: "STRING",
      description: "One specific action the reader can do in the next 30 minutes to get a tangible result on this topic."
    },
    metaDescription: {
      type: "STRING",
      description: "An SEO meta description for this article. 140–155 characters. Include the topic keyword naturally."
    }
  },
  required: ["isValidTopic", "pivotMessage", "tldr", "whyNow", "mistakes", "framework", "quickWin", "metaDescription"]
};

// ── SYSTEM PROMPT ────────────────────────────────────────────────────────────
// Deliberately free of rigid section names — the schema enforces structure,
// not the prompt. This prevents the model from copying prompt text verbatim.
function buildSystemPrompt(tone, topNiche) {
  const nicheHint = topNiche
    ? " The user's primary niche is " + topNiche + " — tailor examples to this context."
    : "";
  return (
    "You are Scrivlo, a world-class content strategist and practitioner writing for indie builders and solopreneurs." +
    " Your outputs are read by people who implement immediately — every word must earn its place." +
    " Tone: " + (tone || "direct, concrete, and practitioner-level") + "." + nicheHint +
    "\n\nCritical rules:" +
    "\n- Every insight you write must be SPECIFIC to the exact topic provided. Do NOT recycle generic startup or marketing advice." +
    "\n- If the topic is nonsense, gibberish, a random string, or completely uninterpretable as a real subject, set isValidTopic=false and write a helpful pivotMessage suggesting what the user might have meant." +
    "\n- The pivotMessage must be friendly and suggest 1–2 concrete alternative topics." +
    "\n- When isValidTopic=true, all other fields must be substantive and topic-specific. Zero filler." +
    "\n- Framework steps must be immediately actionable today — not aspirational." +
    "\n- quickWin must be completable in 30 minutes or less." +
    "\n- metaDescription must be 140–155 characters and include the topic's primary keyword."
  );
}

function buildUserPrompt(topic) {
  return (
    "Topic submitted by user: \"" + topic + "\"\n\n" +
    "First, honestly assess: is this a real, interpretable topic that a practitioner could write about? " +
    "Set isValidTopic accordingly.\n\n" +
    "If it IS a valid topic, generate every field with insights that are 100% specific to \"" + topic + "\". " +
    "Do not use placeholder phrases like \'in this space\', \'in today's world\', or \'as we know\'. " +
    "Name specific tools, metrics, platforms, or techniques that apply to this exact topic."
  );
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

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

  // Parse & sanitise body
  const { topic, tone, topNiche } = req.body || {};
  if (!topic || typeof topic !== "string" || topic.trim().length < 2) {
    return res.status(400).json({ error: "topic_required", message: "Please enter a topic (min 2 characters)." });
  }
  const safeTopic  = topic.trim().slice(0, 200);
  const safeTone   = (tone    || "direct, concrete, and practitioner-level").slice(0, 80);
  const safeNiche  = (topNiche || "").slice(0, 40);

  // API key check
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "api_key_missing", message: "GEMINI_API_KEY not set in Vercel environment." });
  }

  // Build Gemini Structured Output payload
  const geminiPayload = {
    contents: [{
      role: "user",
      parts: [{ text: buildUserPrompt(safeTopic) }]
    }],
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(safeTone, safeNiche) }]
    },
    generationConfig: {
      maxOutputTokens:  RATE_LIMITS.MAX_OUTPUT_TOKENS,
      temperature:      0.80,
      topP:             0.92,
      topK:             40,
      responseMimeType: "application/json",
      responseSchema:   RESPONSE_SCHEMA,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",  threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT",  threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  };

  try {
    const https = require("https");
    const bodyStr = JSON.stringify(geminiPayload);

    const geminiData = await new Promise((resolve, reject) => {
      const options = {
        hostname: "generativelanguage.googleapis.com",
        path: "/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey,
        method: "POST",
        headers: {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      };
      const reqG = https.request(options, (resG) => {
        let data = "";
        resG.on("data", chunk => { data += chunk; });
        resG.on("end", () => {
          try   { resolve({ status: resG.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error("Gemini parse error: " + data.slice(0, 300))); }
        });
      });
      reqG.on("error", reject);
      reqG.write(bodyStr);
      reqG.end();
    });

    if (geminiData.status === 429) {
      return res.status(429).json({ error: "upstream_quota", message: "Gemini free-tier quota reached. Try again in a minute." });
    }
    if (geminiData.status !== 200) {
      throw new Error("Gemini " + geminiData.status + ": " + JSON.stringify(geminiData.body).slice(0, 300));
    }

    // Extract structured JSON from Gemini response
    const rawText = geminiData.body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!rawText) throw new Error("Empty response from Gemini");

    let structured;
    try {
      structured = JSON.parse(rawText);
    } catch (e) {
      throw new Error("Gemini returned non-JSON despite structured output request: " + rawText.slice(0, 200));
    }

    // Validate required fields exist
    if (typeof structured.isValidTopic !== "boolean") {
      throw new Error("Structured output missing isValidTopic field");
    }

    return res.status(200).json({
      success:    true,
      structured,                // the validated object — app.js renders this
      topic:      safeTopic,
      model:      "gemini-2.0-flash",
      version:    "structured-v3",
      rateInfo: {
        minuteUsed:  counters.minute.count,
        minuteLimit: RATE_LIMITS.RPM,
        dayUsed:     counters.day.count,
        dayLimit:    RATE_LIMITS.RPD,
      },
    });

  } catch (err) {
    return res.status(500).json({ error: "generation_failed", message: err.message });
  }
};
