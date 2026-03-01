# SYSTEM_MOAT.md
## LoopDraft — Principal Growth Engineering Document
### Version 1.0 | January 2026 | $0.00 Total Spend

---

## 1. COMPETITIVE AUDIT

| Incumbent | Price | Primary Acquisition | Core Weakness |
|---|---|---|---|
| Jasper AI | $49/mo min | Paid ads + affiliate SEO | Enterprise-first UX |
| Copy.ai | $49/mo Pro | Product Hunt + G2 + SEO | Stateless output |
| Writesonic | $19/mo | AppSumo LTDs + affiliates | UX complexity |
| Beehiiv | $42/mo | Creator word-of-mouth | Newsletter-only |
| Notion AI | $10 add-on | Bundled in 30M Notion users | Walled garden |

### THE BLIND SPOT
Every incumbent fails on one or both axes:
- **(A) Price** — all cost >=\$10/mo before delivering value, pricing out 80% of bootstrappers
- **(B) Intelligence** — all generate stateless, generic content with zero user voice memory

**LoopDraft owns the unclaimed territory:** $0 entry + compounding personalization + built-in SEO distribution.

---

## 2. DATA FLYWHEEL ARCHITECTURE

```
USER ACTION -> SIGNAL CAPTURED -> PROFILE UPDATED -> NEXT DRAFT IMPROVED
     ^                                                          |
     +---------------------- COMPOUNDS ON EVERY LOOP <---------+
```

- Zero server. Zero PII. All intelligence in localStorage.
- Voice fingerprint takes 20+ interactions to build — competitors can't replicate it.
- Switching cost = losing your entire voice profile.

### Signal Events
| Event | Effect |
|---|---|
| Draft kept | Weight this structure higher |
| Draft regenerated | Expand variation pool |
| Draft #5 generated | Trigger Pro upgrade modal |
| 15+ drafts | Unlock affiliate offer |
| 3+ publishes | Flag as power user |

---

## 3. TRAFFIC ENGINE

| Platform | Script | Frequency |
|---|---|---|
| Reddit (r/SaaS, r/IndieHackers) | social-distributor.js | 3x/week |
| Hacker News Show HN | social-distributor.js | Monthly |
| LinkedIn Creator | social-distributor.js | 3x/week |
| X/Twitter Threads | social-distributor.js | Daily |
| Programmatic SEO (500+ pages) | seo-page-builder.js | Weekly cron |

**SEO Page Patterns (500+ pages):**
- `free AI [content_type] generator for [niche]` — 168 pages
- `[modifier] AI writer for [niche]` — 126 pages
- `[competitor] alternative free 2026` — 20 pages

---

## 4. REVENUE STACK (Zero Human Intervention)

**Layer 1 — Affiliate (Day 0)**
Groq + Vercel + Ghost affiliate links injected into every export footer.
Est. $50-200/mo at 1,000 MAU.

**Layer 2 — Freemium Gate (Month 1)**
Draft #5 triggers Pro modal. Stripe Payment Link: `https://buy.stripe.com/test_cNi00lejKe1g6CV3oo2wU00`
Webhook -> Zapier -> Airtable -> Loops.so email. Human intervention: 0.
Est. $180-450/mo at 1,000 MAU (2-5% conversion).

**Layer 3 — Watermark Lead Gen (Month 2)**
'Powered by LoopDraft' on free exports. 3-7 referral impressions per doc.

**Layer 4 — Trend Newsletter (Month 6)**
Anonymized topic data -> weekly Trend Report. Sponsorships $500-2,000/edition.

---

## 5. MOAT COMPOUNDING SCHEDULE

| Month | MAU | Revenue | Milestone |
|---|---|---|---|
| 0 | 0 | $0 | MVP live, flywheel seeded |
| 1 | 50 | $0-45 | First 50 voice profiles |
| 2 | 200 | $100-200 | SEO indexing begins |
| 3 | 500 | $250-450 | Personalization noticeable |
| 6 | 2,000 | $1,000-2,000 | Moat defensible |
| 12 | 10,000 | $5,000-15,000 | Deep moat, trend report live |

---

## 6. AUTOMATED SYSTEMS INVENTORY

| System | File | Human Required |
|---|---|---|
| Data Flywheel | src/flywheel.js | Never |
| Revenue Layer | src/revenue.js | Never |
| Draft Engine | src/app.js | Never |
| SEO Page Builder | scripts/seo-page-builder.js | Never |
| Social Distributor | scripts/social-distributor.js | Review only |
| Payment Router | Stripe Payment Link | Never |
| Onboarding Email | Loops.so + Zapier | Never |

---

## 7. NORTH STAR METRICS

- **Primary:** Weekly Active Drafters (WAD) — target 400 by Month 6
- **Flywheel:** Voice Profile Depth — target >8 avg interactions
- **Revenue:** MRR — target $1,000 by Month 6
- **SEO:** Pages indexed — target 200+ by Month 6
- **Retention:** 30-day return rate — target >35%

---

## 8. REPO STRUCTURE

```
/business-core
├── SYSTEM_MOAT.md          <- This document
├── README.md               <- Business plan and deploy guide
├── vercel.json             <- Deployment config
└── src/
    ├── index.html          <- MVP landing page (Stripe integrated)
    ├── styles.css          <- Design system
    ├── flywheel.js         <- Data flywheel engine
    ├── revenue.js          <- Revenue layer (Stripe + affiliates)
    └── app.js              <- Draft generation engine
```

---
*SYSTEM_MOAT.md - LoopDraft Growth OS - v1.0 - January 2026 - $0.00 total spend*
