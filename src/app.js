// app.js — Scrivlo Draft Generation Engine v4.0
// Changes from v3:
// - Tag line now shows active AI provider from load balancer response (model field)
// - Pro: generateLandingPage() — Instant SEO Landing Page Generator (calls /api/seo-page)
// - Pro: showLandingPagePanel() — renders structured page output live in DOM
// - Pro: initProFeatures() — injects Pro tools UI on load if isPro()

// ── PAYMENT SUCCESS DETECTION (runs immediately on page load) ─────────────────
(function checkPaymentSuccess() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      localStorage.setItem('scrivlo_pro', 'true');
      localStorage.setItem('scrivlo_pro_ts', Date.now().toString());
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      document.addEventListener('DOMContentLoaded', function() { showProSuccessBanner(); });
      if (document.readyState !== 'loading') showProSuccessBanner();
    }
  } catch (e) {}
})();

function isPro() {
  try { return localStorage.getItem('scrivlo_pro') === 'true'; } catch (e) { return false; }
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
    '<span>🎉 Pro access activated — unlimited drafts + SEO Landing Page Generator unlocked!</span>' +
    '<button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;' +
    'border-radius:6px;padding:.25rem .6rem;cursor:pointer;font-size:.8rem">✕</button>'
  );
  document.body.prepend(banner);
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 7000);
}

// ── PRO FEATURES INIT (runs on DOMContentLoaded) ──────────────────────────────
// Injects the "Pro Power Tools" panel below the demo section if user is Pro.
function initProFeatures() {
  if (!isPro()) return;
  if (document.getElementById('scrivlo-pro-panel')) return;
  const panel = document.createElement('section');
  panel.id = 'scrivlo-pro-panel';
  panel.style.cssText = [
    'max-width:760px;margin:2.5rem auto;padding:2rem 1.5rem',
    'background:linear-gradient(135deg,#f5f3ff,#ede9fe)',
    'border-radius:16px;border:2px solid #c4b5fd'
  ].join(';');
  panel.innerHTML = (
    '<div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1rem">' +
    '<span style="background:#7c3aed;color:#fff;font-size:.72rem;font-weight:800;padding:.2rem .55rem;border-radius:20px;letter-spacing:.04em">PRO</span>' +
    '<h2 style="margin:0;font-size:1.15rem;color:#1a1a2e;font-weight:800">Instant SEO Landing Page Generator</h2>' +
    '</div>' +
    '<p style="font-size:.88rem;color:#6b7280;margin-bottom:1.25rem">' +
    'Enter your product name and a one-line description. The AI runs a 7-step pipeline and returns a complete, ' +
    'publish-ready landing page — headline, benefits, social proof, CTAs, and meta tags — in under 30 seconds.' +
    '</p>' +
    '<div style="display:grid;gap:.75rem;margin-bottom:1rem">' +
    '<input id="lpProductName" type="text" placeholder="Product name (e.g. Scrivlo)" ' +
    'style="padding:.7rem 1rem;border:1.5px solid #c4b5fd;border-radius:10px;font-size:.9rem;width:100%;box-sizing:border-box"/>' +
    '<textarea id="lpProductDesc" rows="3" placeholder="One-line description (e.g. Free AI content generator that turns any idea into a publish-ready draft in 30 seconds, for indie builders)" ' +
    'style="padding:.7rem 1rem;border:1.5px solid #c4b5fd;border-radius:10px;font-size:.9rem;width:100%;box-sizing:border-box;resize:vertical"></textarea>' +
    '</div>' +
    '<button onclick="generateLandingPage()" id="lpGenBtn" ' +
    'style="background:#7c3aed;color:#fff;border:none;padding:.75rem 1.75rem;border-radius:10px;font-weight:700;font-size:.9rem;cursor:pointer">' +
    '🚀 Generate SEO Landing Page' +
    '</button>' +
    '<div id="lpStatus" style="font-size:.82rem;color:#7c3aed;margin-top:.6rem;min-height:1.2rem"></div>' +
    '<div id="lpOutput" style="margin-top:1.5rem"></div>'
  );
  // Insert after demo section
  const demo = document.getElementById('demo');
  if (demo && demo.parentNode) {
    demo.parentNode.insertBefore(panel, demo.nextSibling);
  } else {
    document.body.appendChild(panel);
  }
}

document.addEventListener('DOMContentLoaded', initProFeatures);

// ── PRO: SEO LANDING PAGE GENERATOR ──────────────────────────────────────────
async function generateLandingPage() {
  if (!isPro()) {
    if (typeof Revenue !== 'undefined') Revenue.showUpgradeModal();
    return;
  }
  const productName = (document.getElementById('lpProductName')?.value || '').trim();
  const productDesc = (document.getElementById('lpProductDesc')?.value || '').trim();
  if (!productName) { alert('Please enter your product name.'); return; }
  if (!productDesc || productDesc.length < 10) { alert('Please add a short product description (min 10 characters).'); return; }

  const btn    = document.getElementById('lpGenBtn');
  const status = document.getElementById('lpStatus');
  const output = document.getElementById('lpOutput');

  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  output.innerHTML = '';

  const steps = [
    'Validating product concept…',
    'Researching SEO keywords…',
    'Crafting headline hierarchy…',
    'Writing benefit blocks…',
    'Generating social proof…',
    'Writing CTA copy…',
    'Building meta tags…',
  ];
  let stepIdx = 0;
  const stepInterval = setInterval(() => {
    if (status) status.textContent = '⚡ Step ' + (stepIdx + 1) + '/7: ' + steps[stepIdx % steps.length];
    stepIdx++;
  }, 2800);

  try {
    const res = await fetch('/api/seo-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName, productDescription: productDesc }),
    });
    clearInterval(stepInterval);
    const data = await res.json();

    if (!res.ok) {
      status.textContent = '';
      output.innerHTML = '<div style="color:#dc2626;padding:.75rem;background:#fef2f2;border-radius:8px">' +
        '❌ ' + escapeHtml(data.message || 'Generation failed') + '</div>';
      return;
    }

    status.textContent = '✅ Done! Powered by ' + escapeHtml(data.model || 'AI');
    output.innerHTML = renderLandingPagePreview(data.structured, productName, data.model);
  } catch (err) {
    clearInterval(stepInterval);
    status.textContent = '';
    output.innerHTML = '<div style="color:#dc2626;padding:.75rem;background:#fef2f2;border-radius:8px">' +
      '❌ Network error: ' + escapeHtml(err.message) + '</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Generate SEO Landing Page';
  }
}

// ── SEO LANDING PAGE RENDERER ─────────────────────────────────────────────────
function renderLandingPagePreview(s, productName, model) {
  if (!s) return '<div style="color:#dc2626">Invalid response structure.</div>';

  // Invalid product
  if (!s.isValidProduct) {
    return (
      '<div style="padding:1.25rem;background:#fef3c7;border-radius:10px;border:1px solid #fde68a">' +
      '<strong style="color:#92400e">⚠️ Product description needs more detail</strong><br>' +
      '<p style="color:#78350f;margin:.5rem 0 0">' + escapeHtml(s.pivotMessage || 'Please refine your description.') + '</p>' +
      '</div>'
    );
  }

  let html = '';

  // Header bar
  html += '<div style="background:#7c3aed;color:#fff;padding:.6rem 1rem;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center">';
  html += '<span style="font-weight:700;font-size:.9rem">🏠 Landing Page Preview</span>';
  html += '<span style="font-size:.75rem;opacity:.8">Powered by ' + escapeHtml(model || 'AI') + '</span>';
  html += '</div>';
  html += '<div style="border:2px solid #7c3aed;border-top:none;border-radius:0 0 12px 12px;padding:1.5rem;background:#fff">';

  // SEO section
  html += '<div style="background:#f5f3ff;border-radius:8px;padding:.9rem 1rem;margin-bottom:1.25rem">';
  html += '<strong style="color:#5b21b6;font-size:.85rem">🔍 SEO Research</strong><br>';
  html += '<div style="margin:.5rem 0 .25rem"><strong>Primary keyword:</strong> <span style="color:#1a1a2e">' + escapeHtml(s.seo?.primaryKeyword || '') + '</span></div>';
  html += '<div style="margin-bottom:.25rem"><strong>LSI keywords:</strong> ' + (s.seo?.lsiKeywords || []).map(k => '<span style="background:#ede9fe;color:#5b21b6;padding:.1rem .45rem;border-radius:12px;font-size:.8rem;margin-right:.25rem">' + escapeHtml(k) + '</span>').join('') + '</div>';
  html += '<div><strong>Search intent:</strong> <em style="color:#6b7280">' + escapeHtml(s.seo?.searchIntent || '') + '</em></div>';
  html += '</div>';

  // Hero section
  html += '<div style="border-left:4px solid #7c3aed;padding:.75rem 1rem;margin-bottom:1.25rem">';
  html += '<div style="display:inline-block;background:#ede9fe;color:#5b21b6;font-size:.72rem;font-weight:700;padding:.15rem .5rem;border-radius:20px;margin-bottom:.4rem">' + escapeHtml(s.hero?.badgeText || '') + '</div><br>';
  html += '<h1 style="margin:.3rem 0 .5rem;font-size:1.4rem;color:#1a1a2e">' + escapeHtml(s.hero?.h1 || '') + '</h1>';
  html += '<p style="color:#374151;margin:.25rem 0 .35rem;font-size:.95rem">' + escapeHtml(s.hero?.subheadline || '') + '</p>';
  html += '<p style="color:#9ca3af;font-size:.8rem;font-style:italic">' + escapeHtml(s.hero?.proofLine || '') + '</p>';
  html += '</div>';

  // Benefits
  html += '<strong style="color:#1a1a2e">✨ Benefits</strong>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.75rem;margin:.6rem 0 1.25rem">';
  (s.benefits || []).forEach(b => {
    html += '<div style="background:#f9fafb;border-radius:10px;padding:.9rem">';
    html += '<div style="font-size:1.4rem;margin-bottom:.3rem">' + escapeHtml(b.emoji || '') + '</div>';
    html += '<strong style="font-size:.88rem">' + escapeHtml(b.title || '') + '</strong>';
    html += '<p style="font-size:.82rem;color:#6b7280;margin:.3rem 0 0">' + escapeHtml(b.description || '') + '</p>';
    html += '</div>';
  });
  html += '</div>';

  // Social proof
  html += '<strong style="color:#1a1a2e">💬 Social Proof</strong>';
  html += '<div style="display:grid;gap:.6rem;margin:.6rem 0 1.25rem">';
  (s.socialProof || []).forEach(sp => {
    html += '<div style="background:#f0fdf4;border-left:3px solid #22c55e;padding:.7rem 1rem;border-radius:0 8px 8px 0">';
    html += '<p style="font-style:italic;color:#374151;margin:0 0 .3rem">"' + escapeHtml(sp.quote || '') + '"</p>';
    html += '<span style="font-size:.78rem;color:#6b7280">— ' + escapeHtml(sp.author || '') + '</span>';
    html += '</div>';
  });
  html += '</div>';

  // CTA
  html += '<strong style="color:#1a1a2e">📣 CTA Copy</strong>';
  html += '<div style="display:flex;gap:.75rem;margin:.6rem 0 1.25rem;flex-wrap:wrap;align-items:center">';
  html += '<span style="background:#5c6ef8;color:#fff;padding:.55rem 1.2rem;border-radius:8px;font-weight:700;font-size:.9rem">' + escapeHtml(s.cta?.primary || '') + '</span>';
  html += '<span style="border:1.5px solid #5c6ef8;color:#5c6ef8;padding:.5rem 1.1rem;border-radius:8px;font-size:.9rem">' + escapeHtml(s.cta?.secondary || '') + '</span>';
  html += '<em style="font-size:.8rem;color:#9ca3af">' + escapeHtml(s.cta?.urgency || '') + '</em>';
  html += '</div>';

  // Meta
  html += '<strong style="color:#1a1a2e">🏷️ Meta Tags</strong>';
  html += '<div style="background:#f8f7ff;border-radius:8px;padding:.9rem;margin:.6rem 0 1.25rem;font-size:.82rem">';
  html += '<div style="margin-bottom:.4rem"><strong>Title tag:</strong> <span style="color:#1d4ed8">' + escapeHtml(s.meta?.titleTag || '') + '</span></div>';
  html += '<div style="margin-bottom:.4rem"><strong>Meta desc:</strong> <span style="color:#374151">' + escapeHtml(s.meta?.metaDescription || '') + '</span></div>';
  html += '<div><strong>OG desc:</strong> <span style="color:#374151">' + escapeHtml(s.meta?.ogDescription || '') + '</span></div>';
  html += '</div>';

  // Export button
  html += '<div style="display:flex;gap:.5rem;flex-wrap:wrap">';
  html += '<button onclick="copyLandingPage()" style="background:#5c6ef8;color:#fff;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">📋 Copy as HTML</button>';
  html += '<button onclick="exportLandingPageHTML()" style="background:#f3f4f6;border:none;padding:.4rem .9rem;border-radius:6px;font-size:.8rem;cursor:pointer">⬇️ Export HTML</button>';
  html += '</div>';

  html += '</div>'; // close preview card
  return html;
}

function copyLandingPage() {
  const content = document.getElementById('lpOutput')?.innerHTML || '';
  navigator.clipboard.writeText(content)
    .then(() => alert('Landing page HTML copied!'))
    .catch(() => alert('Select the output and copy manually.'));
}

function exportLandingPageHTML() {
  const content = document.getElementById('lpOutput')?.innerHTML || '';
  const productName = document.getElementById('lpProductName')?.value || 'product';
  const blob = new Blob([
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>' + productName + ' — Landing Page by Scrivlo</title></head>' +
    '<body style="font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:1rem">' +
    content + '</body></html>'
  ], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scrivlo-landing-page.html';
  a.click();
}

// ── MAIN GENERATION FUNCTION ────────────────────────────────────────────────────
async function generateDraft() {
  const topicRaw = (document.getElementById('topicInput').value || '').trim();
  const topic = topicRaw || 'content strategy for indie SaaS founders';
  const output = document.getElementById('outputArea');

  const profile = (typeof Flywheel !== 'undefined') ? Flywheel.onDraftGenerated(topic) : { draftCount: 1, proConversionSignal: false };
  if (profile.proConversionSignal && !isPro()) {
    if (typeof Revenue !== 'undefined') Revenue.route(profile);
  }

  let dots = 0;
  output.innerHTML = '<em style="color:#9ca3af">Generating your draft<span id="ld-dots"></span></em>';
  const dotInterval = setInterval(() => {
    const el = document.getElementById('ld-dots');
    if (el) { dots = (dots + 1) % 4; el.textContent = '.'.repeat(dots); }
  }, 350);

  const ctx = (typeof Flywheel !== 'undefined') ? Flywheel.getPersonalizationContext() : { tone: 'balanced and direct', preferredStructures: [], topNiche: null };

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

  if (typeof Revenue !== 'undefined' && !isPro()) Revenue.route(profile);
}

async function fetchAIDraft(topic, ctx) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, tone: ctx.tone || 'direct, concrete, and practitioner-level', topNiche: ctx.topNiche || null }),
  });
  const data = await res.json();
  if (res.status === 429)  throw new Error(data.message || 'Rate limit reached — please wait a moment.');
  if (res.status === 503 && data.error === 'api_key_missing') throw new Error('api_key_missing');
  if (!res.ok) throw new Error(data.message || 'Generation failed (' + res.status + ')');

  if (data.structured) return renderStructuredDraft(data.structured, topic, data.model);
  if (data.content) {
    const seoScore = estimateSEOScore(topic, data.content);
    const wc = data.content.replace(/<[^>]+>/g, '').split(/\s+/).length;
    const rt = Math.max(2, Math.round(wc / 200));
    let html = buildTagLine('Blog Post', seoScore, rt, true, data.model);
    html += '<strong style="font-size:1rem;display:block;margin-bottom:.75rem">' + escapeHtml(topic) + '</strong>';
    html += data.content;
    html += renderActionButtons();
    html += '<em style="font-size:.8rem;color:#9ca3af;display:block;margin-top:.5rem">Generated by Scrivlo.</em>';
    return html;
  }
  throw new Error('Unexpected response format from /api/generate');
}

function renderStructuredDraft(s, topic, model) {
  if (!s.isValidTopic) {
    return (
      '<div style="padding:1.25rem;background:#fef3c7;border-radius:10px;border:1px solid #fde68a">' +
      '<strong style="color:#92400e">⚠️ Hmm, that topic is a bit unclear</strong><br>' +
      '<p style="color:#78350f;margin:.5rem 0 0">' + escapeHtml(s.pivotMessage || 'Please try a more specific topic.') + '</p>' +
      '</div>'
    );
  }

  const allText = [s.tldr, s.whyNow, ...(s.mistakes||[]).map(m=>m.explanation), ...(s.framework||[]).map(f=>f.detail), s.quickWin].join(' ');
  const wc = allText.split(/\s+/).length;
  const rt = Math.max(2, Math.round(wc / 200));
  const seo = estimateSEOScore(topic, allText);
  let html = buildTagLine('Blog Post', seo, rt, true, model);
  html += '<strong style="font-size:1rem;display:block;margin-bottom:.75rem">' + escapeHtml(topic) + '</strong>';

  html += '<div style="background:#f0fdf4;border-left:3px solid #22c55e;padding:.6rem .9rem;border-radius:0 8px 8px 0;margin-bottom:.9rem">';
  html += '<strong style="color:#15803d">TL;DR</strong> <span style="color:#166534">' + escapeHtml(s.tldr) + '</span>';
  html += '</div>';

  html += '<strong>Why this matters in 2026</strong><br>';
  html += '<p style="color:#374151;margin:.3rem 0 .8rem">' + escapeHtml(s.whyNow) + '</p>';

  html += '<strong>The 3 Mistakes That Sink Most Efforts</strong>';
  html += '<ol style="margin:.4rem 0 .9rem;padding-left:1.3rem">';
  (s.mistakes || []).forEach(m => {
    html += '<li style="margin-bottom:.55rem"><strong>' + escapeHtml(m.title) + '</strong> — ' + escapeHtml(m.explanation) + '</li>';
  });
  html += '</ol>';

  html += '<strong>5-Step Framework — Start Today</strong>';
  html += '<ol style="margin:.4rem 0 .9rem;padding-left:1.3rem">';
  (s.framework || []).forEach((f, i) => {
    html += '<li style="margin-bottom:.55rem"><strong>Step ' + (i+1) + ': ' + escapeHtml(f.step) + '</strong><br>';
    html += '<span style="color:#374151">' + escapeHtml(f.detail) + '</span></li>';
  });
  html += '</ol>';

  html += '<div style="background:#eff6ff;border-left:3px solid #3b82f6;padding:.6rem .9rem;border-radius:0 8px 8px 0;margin-bottom:.9rem">';
  html += '<strong style="color:#1d4ed8">⚡ 30-Minute Quick Win</strong><br>';
  html += '<span style="color:#1e40af">' + escapeHtml(s.quickWin) + '</span>';
  html += '</div>';

  html += renderActionButtons();
  html += '<em style="font-size:.8rem;color:#9ca3af;display:block;margin-top:.5rem">Generated by Scrivlo · ' + escapeHtml(model || 'Gemini AI') + ' · Edit and publish in minutes.</em>';
  return html;
}

// model param added to show active provider in tag line
function buildTagLine(type, seo, rt, isAI, model) {
  let h = '<div style="margin-bottom:.5rem">';
  h += '<span class="tag">' + type + '</span>';
  h += '<span class="tag">SEO Score: ' + seo + '/100</span>';
  h += '<span class="tag">~' + rt + ' min read</span>';
  if (isAI) {
    const providerLabel = model ? escapeHtml(model.split('-')[0].charAt(0).toUpperCase() + model.split('-')[0].slice(1)) + ' AI' : 'Gemini AI';
    h += '<span class="tag" style="background:#d1fae5;color:#065f46">✦ ' + providerLabel + '</span>';
  }
  h += '</div>';
  return h;
}

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

// ── SMART FALLBACK ─────────────────────────────────────────────────────────────
function buildSmartFallback(topic, ctx) {
  const t = topic.toLowerCase();
  const isMarketing = /market|seo|content|copy|brand|social|email|funnel|traffic/.test(t);
  const isProduct   = /product|saas|app|software|build|launch|mvp|startup|feature/.test(t);
  const isAI        = /\bai\b|machine|model|llm|gpt|automation|agent|prompt/.test(t);
  const isFinance   = /revenue|monetis|pric|subscription|mrr|arr|churn|finance|profit/.test(t);

  const mistakes = isMarketing ? [
    'Treating content as a volume game — 10 resonant pieces beat 100 generic ones every time.',
    'Skipping audience-first research — writing what you want to say, not what they need to hear.',
    'No distribution strategy — great content with zero amplification is a tree falling in an empty forest.',
  ] : isProduct ? [
    'Building before validating — shipping a solution to a problem nobody has confirmed they have.',
    'Feature creep at launch — the MVP should solve one thing perfectly, not ten things adequately.',
    'Ignoring activation — getting sign-ups but never measuring if users reach the "aha moment".',
  ] : isAI ? [
    'Chasing model benchmarks instead of use-case fit — the best model solves your specific problem.',
    'Skipping prompt engineering — a well-crafted prompt outperforms a bigger model with a lazy one.',
    'No evals framework — deploying AI without a way to measure output quality is building blind.',
  ] : isFinance ? [
    'Optimising for MRR before solving retention — revenue that churns is a leaky bucket.',
    'Underpricing to compete — low prices signal low value, not a deal.',
    'No pricing experiments — most founders pick a price and never test upward.',
  ] : [
    'Skipping the research phase — jumping to execution without validating the core assumption.',
    'Optimising for volume over resonance — 10 targeted efforts outperform 100 generic ones.',
    'No feedback loop — if you are not measuring what lands, you are publishing into the void.',
  ];

  const framework = isMarketing ? [
    'Audit your content against reader intent — rewrite the bottom 20%.',
    'Build a 90-day editorial calendar mapped to search intent clusters.',
    'Create one cornerstone piece per quarter — go deep, not wide.',
    'Distribute across 3 channels before adding a 4th.',
    'Review performance monthly and double down on the top 20%.',
  ] : isProduct ? [
    'Define the single job-to-be-done your product solves.',
    'Identify the 3 features that deliver 80% of that value.',
    'Ship a working prototype in 2 weeks, not 2 months.',
    'Get 5 paying customers before writing another line of code.',
    'Build your feedback loop before building your roadmap.',
  ] : isAI ? [
    'Define the specific outcome you need AI to produce.',
    'Pick the smallest model that can reliably achieve it.',
    'Engineer your system prompt with role, context, constraints and format.',
    'Build an evals suite with at least 20 test cases before deploying.',
    'Monitor output quality weekly and refine prompts based on failures.',
  ] : isFinance ? [
    'Baseline your MRR, churn rate, and LTV.',
    'Identify your highest-LTV customer segment.',
    'Run one pricing experiment per quarter — test +20% on new signups.',
    'Add one expansion revenue motion before a new acquisition channel.',
    'Review unit economics monthly: CAC, LTV, payback period.',
  ] : [
    'Define your ICP signal — know exactly who you are solving for.',
    'Map the pain stack — surface level problem and the root cause beneath it.',
    'Draft the value bridge — connect their pain to your solution in one sentence.',
    'Write the hook first — the best content earns attention before it delivers value.',
    'End with a single next step — ambiguity kills action.',
  ];

  return { title: topic, tone: ctx.tone || 'balanced and direct', mistakes, framework };
}

function renderFallbackDraft(draft, topic) {
  const seoScore = 72 + Math.floor(topic.length % 12);
  let html = buildTagLine('Blog Post', seoScore, 4, false);
  html += '<strong style="font-size:1rem;display:block;margin-bottom:.75rem">' + escapeHtml(topic) + '</strong>';
  html += '<strong>TL;DR:</strong> This guide cuts through the noise on ' + escapeHtml(topic) +
    ' — the 3 mistakes that sink most efforts and a 5-step framework that compounds.<br><br>';
  html += '<strong>Why it matters now:</strong> The teams winning in 2026 are not the ones with the biggest budgets — they are the ones with the clearest systems. ' +
    escapeHtml(topic) + ' is a force multiplier, not an afterthought.<br><br>';
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
