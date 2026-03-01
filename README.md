# LoopDraft
### AI Content Engine for Indie Builders

> Turn any idea into a publish-ready draft in 30 seconds. Free. No agency. No blank page.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/okoliemeka11-collab/business-core)

---

## What is LoopDraft?

LoopDraft is a free AI content engine built for indie makers, solopreneurs, and small teams.
It generates structured, SEO-aware blog posts, newsletters, and threads in under 30 seconds.
The more you use it, the more it learns your voice — compounding personalization with every draft.

**Pricing:** Free forever (5 drafts/mo) | Pro $9/mo (unlimited)

---

## Deploy in 30 Seconds

**Option A — One-click Vercel deploy:**
Click the Deploy button above. Done.

**Option B — Manual:**
```bash
git clone https://github.com/okoliemeka11-collab/business-core
cd business-core
npx vercel --prod
```

---

## Repository Structure

```
/business-core
├── SYSTEM_MOAT.md          <- Growth engineering and competitive strategy
├── README.md               <- This file
├── vercel.json             <- Zero-config Vercel deployment
└── src/
    ├── index.html          <- MVP landing page (live demo + Stripe Pro upgrade)
    ├── styles.css          <- Design system (CSS variables)
    ├── flywheel.js         <- Data flywheel: localStorage voice profile engine
    ├── revenue.js          <- Revenue layer: Stripe modal + affiliate injection
    └── app.js              <- Draft generation engine
```

---

## Tech Stack (100% Free Tier)

| Layer | Tool | Cost |
|---|---|---|
| Hosting | Vercel | Free |
| Code | GitHub | Free |
| AI Generation | Groq API (free tier) | Free |
| Payments | Stripe Payment Links | Free (2.9% + 30c per transaction) |
| Email | Loops.so | Free up to 1,000 contacts |
| Analytics | Umami (self-hosted) | Free |

**Infrastructure cost at launch: $0.00**

---

## Revenue Model

1. **Affiliate links** — injected into every free export (Groq, Vercel, Ghost)
2. **Pro upgrade** — $9/mo via Stripe Payment Link, triggered by flywheel at draft #5
3. **Watermark lead gen** — 'Powered by LoopDraft' on free exports drives referrals
4. **Trend newsletter** — anonymized topic data sold as sponsorships at Month 6

---

## Business Strategy

See [SYSTEM_MOAT.md](./SYSTEM_MOAT.md) for the full competitive audit, data flywheel architecture,
traffic engine, revenue optimization logic, and 12-month moat compounding schedule.

---

## Contact

hello@loopdraft.io

---

*Built with zero budget. Designed to compound. LoopDraft - 2026.*
