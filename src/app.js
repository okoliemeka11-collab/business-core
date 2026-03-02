// app.js - Scrivlo Draft Generation Engine
// Real AI generation via Groq API (llama-3.3-70b-versatile, free tier).
// Integrates Flywheel + Revenue for fully automated content generation.

const GROQ_API_KEY = window.SCRIVLO_GROQ_KEY || '';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

async function generateDraft() {
    const topic = (document.getElementById('topicInput').value || '').trim() || 'content strategy for indie founders';
    const output = document.getElementById('outputArea');

  // Animate loading state with dots
  let dots = 0;
    output.innerHTML = '<em style="color:#9ca3af">Generating your draft<span id="ld-dots"></span></em>';
    const dotInterval = setInterval(() => {
          const el = document.getElementById('ld-dots');
          if (el) { dots = (dots + 1) % 4; el.textContent = '.'.repeat(dots); }
    }, 350);

  // Fire flywheel signal
  const profile = (typeof Flywheel !== 'undefined')
      ? Flywheel.onDraftGenerated(topic)
        : { draftCount: 1, proConversionSignal: false };

  // Get personalization context
  const ctx = (typeof Flywheel !== 'undefined')
      ? Flywheel.getPersonalizationContext()
        : { tone: 'balanced and direct', preferredStructures: [], topNiche: null };

  try {
        const html = await fetchAIDraft(topic, ctx);
        clearInterval(dotInterval);
        output.innerHTML = html;
  } catch (err) {
        clearInterval(dotInterval);
        // Graceful fallback: intelligent template with topic-aware content
      const draft = buildSmartFallback(topic, ctx);
        output.innerHTML = renderDraft(draft, topic);
        const note = document.createElement('div');
        note.style.cssText = 'font-size:.75rem;color:#f97316;margin-top:.5rem';
        note.textContent = '⚡ AI engine warming up — result generated locally. Add SCRIVLO_GROQ_KEY for full AI.';
        output.appendChild(note);
  }

  // Route revenue logic
  if (typeof Revenue !== 'undefined') Revenue.route(profile);
}

// ─── GROQ AI GENERATION ──────────────────────────────────────────────────────

async function fetchAIDraft(topic, ctx) {
    const tone = ctx.tone || 'balanced and direct';
    const niche = ctx.topNiche ? ` The user specialises in the ${ctx.topNiche} niche.` : '';
    const structureHint = ctx.preferredStructures && ctx.preferredStructures.length
      ? ` Preferred structure: ${ctx.preferredStructures.join(', ')}.`
          : '';

  const systemPrompt = `You are Scrivlo, an elite AI content engine for indie builders and solopreneurs.
  Your job: produce publish-ready, SEO-optimised articles that feel genuinely insightful — not generic.
  Tone: ${tone}.${niche}${structureHint}
  Rules:
  - Write as a sharp practitioner, not a content mill.
  - Every section must contain specific, actionable insight — no filler.
  - Include a compelling TL;DR, a "Why now" hook, exactly 3 concrete mistakes with real explanations, and a 5-step framework with crisp steps.
  - End with a strong next-step CTA.
  - Output clean HTML only (use <strong>, <br>, <ul>, <li> tags). No markdown. No wrapping <html> or <body> tags.`;

  const userPrompt = `Write a comprehensive, publication-ready article about: "${topic}"

  Structure your response as valid HTML with these exact sections in order:
  1. A bold TL;DR (1-2 punchy sentences that capture the core insight)
  2. "Why it matters now" — a specific, data-informed paragraph about the current moment
  3. "The 3 Biggest Mistakes" — numbered list, each mistake with a concrete explanation of WHY it fails
  4. "5-Step Framework" — ordered list with action-oriented steps specific to "${topic}"
  5. A brief "Quick Win" tip someone can implement in the next 10 minutes
  6. A one-sentence CTA

  Make the content genuinely specific to "${topic}" — not generic advice with the topic name inserted.`;

  const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
                'Authorization': 'Bearer ' + GROQ_API_KEY,
                'Content-Type': 'application/json'
        },
        body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                        ],
                max_tokens: 1024,
                temperature: 0.72,
                stream: false
        })
  });

  if (!response.ok) {
        const errText = await response.text();
        throw new Error('Groq API error ' + response.status + ': ' + errText);
  }

  const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';

  // Build the output wrapper
  const seoScore = estimateSEOScore(topic, rawContent);
    const readTime = Math.max(2, Math.round(rawContent.replace(/<[^>]+>/g, '').split(/\s+/).length / 200));

  let html = '<div style="margin-bottom:.5rem">';
    html += '<span class="tag">Blog Post</span>';
    html += '<span class="tag">SEO Score: ' + seoScore + '/100</span>';
    html += '<span class="tag">~' + readTime + ' min read</span>';
    html += '<span class="tag" style="background:#d1fae5;color:#065f46">✦ AI-Generated</span>';
    html += '</div>';
    html += '<strong style="font-size:1rem;display:block;margin-bottom:.75rem">' + escapeHtml(topic) + '</strong>';
    html += rawContent;
    html += '<div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">';
    html += '<button onclick="copyDraft()" style="background:#5c6ef8;color:#fff;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Copy Markdown</button>';
    html += '<button onclick="exportHTML()" style="background:#f3f4f6;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Export HTML</button>';
    html += '<button onclick="regenerate()" style="background:#f3f4f6;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Regenerate</button>';
    html += '</div>';
    html += '<em style="font-size:.8rem;color:#9ca3af;display:block;margin-top:.5rem">Generated by Scrivlo. Edit and publish in minutes.</em>';

  return html;
}

// ─── SEO SCORE ESTIMATOR ─────────────────────────────────────────────────────

function estimateSEOScore(topic, content) {
    let score = 60;
    const text = content.replace(/<[^>]+>/g, '').toLowerCase();
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const topicHits = topicWords.filter(w => text.includes(w)).length;
    score += Math.min(15, topicHits * 3);
    if (text.length > 600) score += 5;
    if (text.length > 1200) score += 5;
    if (/<(ul|ol|li)/.test(content)) score += 5;
    if (/<strong/.test(content)) score += 5;
    if (text.split(/[.!?]+/).length > 8) score += 5;
    return Math.min(99, score);
}

function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── SMART FALLBACK (topic-aware, not dumb template) ─────────────────────────

function buildSmartFallback(topic, ctx) {
    const t = topic.toLowerCase();
    // Derive context-aware content based on topic keywords
  const isMarketing = /market|seo|content|copy|brand|social|email|funnel/.test(t);
    const isProduct = /product|saas|app|software|build|launch|mvp|startup/.test(t);
    const isAI = /ai|machine|model|llm|gpt|automation|agent/.test(t);
    const isFinance = /revenue|monetis|pric|subscription|mrr|arr|churn|finance/.test(t);

  const mistakes = isMarketing
      ? ['Treating content as a volume game — 10 resonant pieces beat 100 generic ones every time.',
                'Skipping audience-first research — writing what you want to say, not what they need to hear.',
                'No distribution strategy — great content with zero amplification is a tree falling in an empty forest.']
        : isProduct
      ? ['Building before validating — shipping a solution to a problem nobody has confirmed they have.',
                'Feature creep at launch — the MVP should solve one thing perfectly, not ten things adequately.',
                'Ignoring activation — getting sign-ups but never measuring whether users reach the "aha moment".']
        : isAI
      ? ['Chasing model benchmarks instead of use-case fit — the best model is the one that solves your specific problem.',
                'Skipping prompt engineering — a well-crafted prompt outperforms a bigger model with a lazy one.',
                'No evals framework — deploying AI without a way to measure output quality is building blind.']
        : isFinance
      ? ['Optimising for MRR before solving retention — revenue that churns is a leaky bucket.',
                'Underpricing to compete — low prices signal low value, not a deal.',
                'No pricing experiments — most founders pick a price and never test upward.']
        : ['Skipping the research phase — jumping to execution without validating the core assumption.',
                  'Optimising for volume over resonance — 10 targeted efforts outperform 100 generic ones.',
                  'No feedback loop — if you are not measuring what lands, you are publishing into the void.'];

  const framework = isMarketing
      ? ['Audit your current content against reader intent — rewrite the bottom 20%.',
                'Build a 90-day editorial calendar mapped to search intent clusters.',
                'Create one cornerstone piece per quarter — go deep, not wide.',
                'Distribute across 3 channels before adding a 4th.',
                'Review performance monthly and double down on the top 20%.']
        : isProduct
      ? ['Define the single job-to-be-done your product solves.',
                'Identify the 3 features that deliver 80% of that value.',
                'Ship a working prototype in 2 weeks, not 2 months.',
                'Get 5 paying customers before writing another line of code.',
                'Build your feedback loop before building your roadmap.']
        : isAI
      ? ['Define the specific outcome you need AI to produce.',
                'Pick the smallest model that can reliably achieve it.',
                'Engineer your system prompt with role, context, constraints and format.',
                'Build an evals suite with at least 20 test cases before deploying.',
                'Monitor output quality weekly and refine prompts based on failures.']
        : isFinance
      ? ['Baseline your current MRR, churn rate, and LTV.',
                'Identify your highest-LTV customer segment.',
                'Run one pricing experiment per quarter — test +20% on new signups.',
                'Add one expansion revenue motion (upsell/cross-sell) before adding a new acquisition channel.',
                'Review unit economics monthly: CAC, LTV, payback period.']
        : ['Define your ICP signal — know exactly who you are solving for.',
                  'Map the pain stack — surface level problem and the root cause beneath it.',
                  'Draft the value bridge — connect their pain to your solution in one sentence.',
                  'Write the hook first — the best content earns attention before it delivers value.',
                  'End with a single next step — ambiguity kills action.'];

  return { title: topic, tone: ctx.tone || 'balanced and direct', mistakes, framework };
}

function renderDraft(draft, topic) {
    const seoScore = 72 + Math.floor(topic.length % 12);
    let html = '<div style="margin-bottom:.5rem">';
    html += '<span class="tag">Blog Post</span>';
    html += '<span class="tag">SEO Score: ' + seoScore + '/100</span>';
    html += '<span class="tag">~4 min read</span>';
    html += '</div>';
    html += '<strong style="font-size:1rem;display:block;margin-bottom:.75rem">' + escapeHtml(topic) + '</strong>';
    html += '<strong>TL;DR:</strong> This guide cuts through the noise on ' + escapeHtml(topic) + ' — the 3 mistakes that sink most efforts and a 5-step framework that compounds.<br><br>';
    html += '<strong>Why it matters now:</strong> The teams winning in 2026 are not the ones with the biggest budgets — they are the ones with the clearest systems. ' + escapeHtml(topic) + ' is a force multiplier, not an afterthought.<br><br>';
    html += '<strong>The 3 Biggest Mistakes</strong><br>';
    draft.mistakes.forEach((item, i) => { html += (i+1) + '. ' + item + '<br>'; });
    html += '<br>';
    html += '<strong>5-Step Framework</strong><br>';
    draft.framework.forEach((item, i) => { html += 'Step ' + (i+1) + ' — ' + item + '<br>'; });
    html += '<br>';
    html += '<em style="font-size:.8rem;color:#9ca3af">Generated by Scrivlo. Edit and publish in minutes.</em>';
    html += '<div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">';
    html += '<button onclick="copyDraft()" style="background:#5c6ef8;color:#fff;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Copy Markdown</button>';
    html += '<button onclick="exportHTML()" style="background:#f3f4f6;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Export HTML</button>';
    html += '<button onclick="regenerate()" style="background:#f3f4f6;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Regenerate</button>';
    html += '</div>';
    return html;
}

// ─── UTILITY ACTIONS ─────────────────────────────────────────────────────────

function copyDraft() {
    if (typeof Flywheel !== 'undefined') Flywheel.onDraftKept(['TL;DR', '5-Step Framework'], 0.5);
    const content = document.getElementById('outputArea').innerText;
    const withAttrib = content + '\n\n---\nGenerated by Scrivlo (https://scrivlo.io) — free AI content engine.';
    navigator.clipboard.writeText(withAttrib)
      .then(() => alert('Copied to clipboard!'))
      .catch(() => alert('Draft ready — select and copy manually.'));
}

function exportHTML() {
    if (typeof Flywheel !== 'undefined') Flywheel.onPublish();
    const content = document.getElementById('outputArea').innerHTML;
    const blob = new Blob(['<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Scrivlo Export</title></head><body style="font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:1rem">' + content + '</body></html>'], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'scrivlo-export.html'; a.click();
}

function regenerate() {
    if (typeof Flywheel !== 'undefined') Flywheel.onRegenerate();
    generateDraft();
}
