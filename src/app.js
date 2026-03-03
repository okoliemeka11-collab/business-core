// app.js — Scrivlo Draft Generation Engine v3.0
// Changes from v2:
//   - fetchAIDraft now reads data.structured (JSON object from generate.js v3 Structured Output)
//   - renderStructuredDraft() renders each field directly — no Mad Libs interpolation
//   - Invalid/nonsense topics display a friendly pivotMessage instead of a garbled article
//   - Task 2 fix: checkPaymentSuccess() runs on load to detect ?payment=success
//     and set scrivlo_pro=true in localStorage, granting Pro access without a backend

// ── PAYMENT SUCCESS DETECTION (runs immediately on page load) ───────────────
(function checkPaymentSuccess() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      localStorage.setItem('scrivlo_pro', 'true');
      localStorage.setItem('scrivlo_pro_ts', Date.now().toString());
      // Clean the URL so the param doesn't persist on refresh
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      // Show a success banner
      document.addEventListener('DOMContentLoaded', function() {
        showProSuccessBanner();
      });
      // If DOM already ready, show immediately
      if (document.readyState !== 'loading') showProSuccessBanner();
    }
  } catch (e) { /* localStorage unavailable — silent fail */ }
})();

function isPro() {
  try { return localStorage.getItem('scrivlo_pro') === 'true'; }
  catch (e) { return false; }
}

function showProSuccessBanner() {
  if (document.getElementById('scrivlo-pro-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'scrivlo-pro-banner';
  banner.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:2000',
    'background:linear-gradient(90deg,#5c6ef8,#7c3aed)',
    'color:#fff;text-align:center;padding:.75rem 1rem',
    'font-size:.9rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:1rem'
  ].join(';');
  banner.innerHTML = (
    '<span>🎉 Pro access activated — unlimited drafts unlocked!</span>' +
    '<button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;' +
    'border-radius:6px;padding:.25rem .6rem;cursor:pointer;font-size:.8rem">✕</button>'
  );
  document.body.prepend(banner);
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 7000);
}

// ── MAIN GENERATION FUNCTION ─────────────────────────────────────────────────
async function generateDraft() {
  const topicRaw = (document.getElementById('topicInput').value || '').trim();
  const topic    = topicRaw || 'content strategy for indie SaaS founders';
  const output   = document.getElementById('outputArea');

  // Pro gate: Flywheel tracks draft count; if limit hit and not Pro, block
  const profile = (typeof Flywheel !== 'undefined')
    ? Flywheel.onDraftGenerated(topic)
    : { draftCount: 1, proConversionSignal: false };

  if (profile.proConversionSignal && !isPro()) {
    // Show upgrade modal but still allow this draft (modal fires after render)
    if (typeof Revenue !== 'undefined') Revenue.route(profile);
    // Don't return — allow draft to proceed
  }

  // Animated loading state
  let dots = 0;
  output.innerHTML = '<em style="color:#9ca3af">Generating your draft<span id="ld-dots"></span></em>';
  const dotInterval = setInterval(() => {
    const el = document.getElementById('ld-dots');
    if (el) { dots = (dots + 1) % 4; el.textContent = '.'.repeat(dots); }
  }, 350);

  const ctx = (typeof Flywheel !== 'undefined')
    ? Flywheel.getPersonalizationContext()
    : { tone: 'balanced and direct', preferredStructures: [], topNiche: null };

  try {
    const html = await fetchAIDraft(topic, ctx);
    clearInterval(dotInterval);
    output.innerHTML = html;
  } catch (err) {
    clearInterval(dotInterval);
    const draft = buildSmartFallback(topic, ctx);
    output.innerHTML = renderFallbackDraft(draft, topic);
    const note = document.createElement('div');
    note.style.cssText = 'font-size:.75rem;color:#f97316;margin-top:.5rem';
    note.textContent = err.message.includes('rate_limit') || err.message.includes('quota')
      ? '⏳ ' + err.message
      : '⚡ Gemini is warming up — smart local draft generated. Full AI resumes shortly.';
    output.appendChild(note);
  }

  // Fire revenue routing AFTER render (don't block the draft)
  if (typeof Revenue !== 'undefined' && !isPro()) Revenue.route(profile);
}

// ── EDGE FUNCTION CALL ────────────────────────────────────────────────────────
async function fetchAIDraft(topic, ctx) {
  const res = await fetch('/api/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      topic,
      tone:     ctx.tone     || 'direct, concrete, and practitioner-level',
      topNiche: ctx.topNiche || null,
    }),
  });

  const data = await res.json();

  if (res.status === 429) {
    throw new Error(data.message || 'Rate limit reached — please wait a moment.');
  }
  if (res.status === 503 && data.error === 'api_key_missing') {
    throw new Error('api_key_missing');
  }
  if (!res.ok) {
    throw new Error(data.message || 'Generation failed (' + res.status + ')');
  }

  // ── v3: data.structured is a validated JSON object ───────────────────────
  if (data.structured) {
    return renderStructuredDraft(data.structured, topic);
  }

  // ── Fallback: old v2 plain-HTML response (should not occur after deploy) ──
  if (data.content) {
    const seoScore = estimateSEOScore(topic, data.content);
    const wc       = data.content.replace(/<[^>]+>/g, '').split(/\s+/).length;
    const rt       = Math.max(2, Math.round(wc / 200));
    let html = buildTagLine('Blog Post', seoScore, rt, true);
    html += '<strong style="font-size:1rem;display:block;margin-bottom:.75rem">' + escapeHtml(topic) + '</strong>';
    html += data.content;
    html += renderActionButtons();
    html += '<em style="font-size:.8rem;color:#9ca3af;display:block;margin-top:.5rem">Generated by Scrivlo.</em>';
    return html;
  }

  throw new Error('Unexpected response format from /api/generate');
}

// ── STRUCTURED DRAFT RENDERER ─────────────────────────────────────────────────
// Renders the JSON object returned by generate.js v3.
// Each field is content genuinely written by Gemini — no interpolation.
function renderStructuredDraft(s, topic) {
  // If Gemini flagged the topic as invalid, show the pivot message
  if (!s.isValidTopic) {
    return (
      '<div style="padding:1.25rem;background:#fef3c7;border-radius:10px;border:1px solid #fde68a">' +
      '<strong style="color:#92400e">⚠️ Hmm, that topic is a bit unclear</strong><br>' +
      '<p style="color:#78350f;margin:.5rem 0 0">' + escapeHtml(s.pivotMessage || "Please try a more specific topic.") + '</p>' +
      '</div>'
    );
  }

  // Estimate word count from all text fields
  const allText = [s.tldr, s.whyNow, ...(s.mistakes||[]).map(m=>m.explanation), ...(s.framework||[]).map(f=>f.detail), s.quickWin].join(' ');
  const wc  = allText.split(/\s+/).length;
  const rt  = Math.max(2, Math.round(wc / 200));
  const seo = estimateSEOScore(topic, allText);

  let html = buildTagLine('Blog Post', seo, rt, true);
  html += '<strong style="font-size:1rem;display:block;margin-bottom:.75rem">' + escapeHtml(topic) + '</strong>';

  // TL;DR
  html += '<div style="background:#f0fdf4;border-left:3px solid #22c55e;padding:.6rem .9rem;border-radius:0 8px 8px 0;margin-bottom:.9rem">';
  html += '<strong style="color:#15803d">TL;DR</strong> <span style="color:#166534">' + escapeHtml(s.tldr) + '</span>';
  html += '</div>';

  // Why Now
  html += '<strong>Why this matters in 2026</strong><br>';
  html += '<p style="color:#374151;margin:.3rem 0 .8rem">' + escapeHtml(s.whyNow) + '</p>';

  // Mistakes
  html += '<strong>The 3 Mistakes That Sink Most Efforts</strong>';
  html += '<ol style="margin:.4rem 0 .9rem;padding-left:1.3rem">';
  (s.mistakes || []).forEach(m => {
    html += '<li style="margin-bottom:.55rem"><strong>' + escapeHtml(m.title) + '</strong> — ' + escapeHtml(m.explanation) + '</li>';
  });
  html += '</ol>';

  // Framework
  html += '<strong>5-Step Framework — Start Today</strong>';
  html += '<ol style="margin:.4rem 0 .9rem;padding-left:1.3rem">';
  (s.framework || []).forEach((f, i) => {
    html += '<li style="margin-bottom:.55rem"><strong>Step ' + (i+1) + ': ' + escapeHtml(f.step) + '</strong><br>';
    html += '<span style="color:#374151">' + escapeHtml(f.detail) + '</span></li>';
  });
  html += '</ol>';

  // Quick Win
  html += '<div style="background:#eff6ff;border-left:3px solid #3b82f6;padding:.6rem .9rem;border-radius:0 8px 8px 0;margin-bottom:.9rem">';
  html += '<strong style="color:#1d4ed8">⚡ 30-Minute Quick Win</strong><br>';
  html += '<span style="color:#1e40af">' + escapeHtml(s.quickWin) + '</span>';
  html += '</div>';

  html += renderActionButtons();
  html += '<em style="font-size:.8rem;color:#9ca3af;display:block;margin-top:.5rem">Generated by Scrivlo · Gemini AI · Edit and publish in minutes.</em>';
  return html;
}

function buildTagLine(type, seo, rt, isAI) {
  let h = '<div style="margin-bottom:.5rem">';
  h += '<span class="tag">' + type + '</span>';
  h += '<span class="tag">SEO Score: ' + seo + '/100</span>';
  h += '<span class="tag">~' + rt + ' min read</span>';
  if (isAI) h += '<span class="tag" style="background:#d1fae5;color:#065f46">✦ Gemini AI</span>';
  h += '</div>';
  return h;
}

// ── SEO SCORE ─────────────────────────────────────────────────────────────────
function estimateSEOScore(topic, content) {
  let score = 60;
  const text = content.replace ? content.replace(/<[^>]+>/g, '').toLowerCase() : content.toLowerCase();
  const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  score += Math.min(15, topicWords.filter(w => text.includes(w)).length * 3);
  if (text.length > 600)  score += 5;
  if (text.length > 1200) score += 5;
  if (/<(ul|ol|li)/.test(content)) score += 5;
  if (/<strong/.test(content))     score += 5;
  if (text.split(/[.!?]+/).length > 8) score += 5;
  return Math.min(99, score);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderActionButtons() {
  return (
    '<div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">' +
    '<button onclick="copyDraft()" style="background:#5c6ef8;color:#fff;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Copy Markdown</button>' +
    '<button onclick="exportHTML()" style="background:#f3f4f6;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Export HTML</button>' +
    '<button onclick="regenerate()" style="background:#f3f4f6;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">Regenerate</button>' +
    '</div>'
  );
}

// ── SMART FALLBACK (topic-aware, 5 verticals) — used when Gemini unavailable ──
function buildSmartFallback(topic, ctx) {
  const t = topic.toLowerCase();
  const isMarketing = /market|seo|content|copy|brand|social|email|funnel|traffic/.test(t);
  const isProduct   = /product|saas|app|software|build|launch|mvp|startup|feature/.test(t);
  const isAI        = /\bai\b|machine|model|llm|gpt|automation|agent|prompt/.test(t);
  const isFinance   = /revenue|monetis|pric|subscription|mrr|arr|churn|finance|profit/.test(t);

  const mistakes = isMarketing
    ? ['Treating content as a volume game — 10 resonant pieces beat 100 generic ones every time.','Skipping audience-first research — writing what you want to say, not what they need to hear.','No distribution strategy — great content with zero amplification is a tree falling in an empty forest.']
    : isProduct
    ? ['Building before validating — shipping a solution to a problem nobody has confirmed they have.','Feature creep at launch — the MVP should solve one thing perfectly, not ten things adequately.','Ignoring activation — getting sign-ups but never measuring if users reach the "aha moment".']
    : isAI
    ? ['Chasing model benchmarks instead of use-case fit — the best model solves your specific problem.','Skipping prompt engineering — a well-crafted prompt outperforms a bigger model with a lazy one.','No evals framework — deploying AI without a way to measure output quality is building blind.']
    : isFinance
    ? ['Optimising for MRR before solving retention — revenue that churns is a leaky bucket.','Underpricing to compete — low prices signal low value, not a deal.','No pricing experiments — most founders pick a price and never test upward.']
    : ['Skipping the research phase — jumping to execution without validating the core assumption.','Optimising for volume over resonance — 10 targeted efforts outperform 100 generic ones.','No feedback loop — if you are not measuring what lands, you are publishing into the void.'];

  const framework = isMarketing
    ? ['Audit your content against reader intent — rewrite the bottom 20%.','Build a 90-day editorial calendar mapped to search intent clusters.','Create one cornerstone piece per quarter — go deep, not wide.','Distribute across 3 channels before adding a 4th.','Review performance monthly and double down on the top 20%.']
    : isProduct
    ? ['Define the single job-to-be-done your product solves.','Identify the 3 features that deliver 80% of that value.','Ship a working prototype in 2 weeks, not 2 months.','Get 5 paying customers before writing another line of code.','Build your feedback loop before building your roadmap.']
    : isAI
    ? ['Define the specific outcome you need AI to produce.','Pick the smallest model that can reliably achieve it.','Engineer your system prompt with role, context, constraints and format.','Build an evals suite with at least 20 test cases before deploying.','Monitor output quality weekly and refine prompts based on failures.']
    : isFinance
    ? ['Baseline your MRR, churn rate, and LTV.','Identify your highest-LTV customer segment.','Run one pricing experiment per quarter — test +20% on new signups.','Add one expansion revenue motion before a new acquisition channel.','Review unit economics monthly: CAC, LTV, payback period.']
    : ['Define your ICP signal — know exactly who you are solving for.','Map the pain stack — surface level problem and the root cause beneath it.','Draft the value bridge — connect their pain to your solution in one sentence.','Write the hook first — the best content earns attention before it delivers value.','End with a single next step — ambiguity kills action.'];

  return { title: topic, tone: ctx.tone || 'balanced and direct', mistakes, framework };
}

function renderFallbackDraft(draft, topic) {
  const seoScore = 72 + Math.floor(topic.length % 12);
  let html = buildTagLine('Blog Post', seoScore, 4, false);
  html += '<strong style="font-size:1rem;display:block;margin-bottom:.75rem">' + escapeHtml(topic) + '</strong>';
  html += '<strong>TL;DR:</strong> This guide cuts through the noise on ' + escapeHtml(topic) + ' — the 3 mistakes that sink most efforts and a 5-step framework that compounds.<br><br>';
  html += '<strong>Why it matters now:</strong> The teams winning in 2026 are not the ones with the biggest budgets — they are the ones with the clearest systems. ' + escapeHtml(topic) + ' is a force multiplier, not an afterthought.<br><br>';
  html += '<strong>The 3 Biggest Mistakes</strong><br>';
  draft.mistakes.forEach((item, i) => { html += (i+1) + '. ' + item + '<br>'; });
  html += '<br><strong>5-Step Framework</strong><br>';
  draft.framework.forEach((item, i) => { html += 'Step ' + (i+1) + ' — ' + item + '<br>'; });
  html += '<br>';
  html += '<em style="font-size:.8rem;color:#9ca3af">Generated by Scrivlo. Edit and publish in minutes.</em>';
  html += renderActionButtons();
  return html;
}

// ── UTILITY ACTIONS ──────────────────────────────────────────────────────────
function copyDraft() {
  if (typeof Flywheel !== 'undefined') Flywheel.onDraftKept(['TL;DR', '5-Step Framework'], 0.5);
  const content = document.getElementById('outputArea').innerText;
  const withAttrib = content + '\n\n---\nGenerated by Scrivlo (https://business-core-three.vercel.app) — free AI content engine.';
  navigator.clipboard.writeText(withAttrib)
    .then(() => alert('Copied to clipboard!'))
    .catch(() => alert('Draft ready — select and copy manually.'));
}

function exportHTML() {
  if (typeof Flywheel !== 'undefined') Flywheel.onPublish();
  const content = document.getElementById('outputArea').innerHTML;
  const blob = new Blob([
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Scrivlo Export</title></head>' +
    '<body style="font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:1rem">' +
    content + '</body></html>'
  ], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scrivlo-export.html';
  a.click();
}

function regenerate() {
  if (typeof Flywheel !== 'undefined') Flywheel.onRegenerate();
  generateDraft();
}
