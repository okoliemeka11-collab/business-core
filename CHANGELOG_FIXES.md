# CHANGELOG_FIXES.md — Scrivlo (business-core)

**Date:** 2026-03-03
**Operator:** Claude (Anthropic) via Chrome Connector
**Project:** https://business-core-three.vercel.app/
**Repository:** https://github.com/okoliemeka11-collab/business-core

---

## Bug Fixes

### 1. Vercel Build Failure — Invalid Runtime in vercel.json
- **Commit:** `4247f9b` — "fix: remove invalid nodejs18.x runtime from vercel.json"
- - **Problem:** The `vercel.json` specified `"runtime": "nodejs18.x"` in the functions block. Vercel v2 does not accept this format and returned: *"Function Runtimes must have a valid version, for example 'now-php@1.0.0'."*
  - - **Root Cause:** Incorrect runtime string format. Vercel expects either `@vercel/node@3` or omission (auto-detect).
    - - **Fix:** Removed the `runtime` field entirely from the functions config, keeping only `maxDuration: 10`. Vercel auto-detects Node.js for `.js` files in the `/api` directory.
      - - **Result:** Build went from Error to Ready (8s build time).
       
        - ### 2. Broken HTML Closing Tags in index.html (69 instances)
        - - **Commit:** `b9c3443` — "fix: repair 69 broken HTML closing tags and remove trailing garbage in index.html"
          - - **Problem:** Every closing tag in `src/index.html` was corrupted with a duplicate tag name appended. Example: `</div>div>`, `</svg>svg>`, `</a>a>`, `</section>section>`, `</span>span>`, `</button>button>`, `</p>p>`, `</h1>`, `</h2>`, etc.
            - - **Visible Impact:** Raw HTML tag names (like `div>`, `svg>`, `a>`, `button>`, `section>`, `span>`, `p>`) were rendering as visible text on the live site.
              - - **Fix:** Used regex find-and-replace (`<\/([a-z0-9]+)>\1>` to `</$1>`) across all 69 instances. Also removed 7 lines of trailing garbage closing tags at the end of the file (`</html></p>`, `</footer></li></li>`, `</ul></p></p></h2></h1>`, etc.).
                - - **Result:** All HTML renders cleanly with zero visible tag artifacts.
                 
                  - ---

                  ## Gemini API Integration

                  ### Architecture
                  - **Model:** Google Gemini 2.0 Flash (gemini-2.0-flash)
                  - - **SDK:** Direct HTTPS calls to `generativelanguage.googleapis.com` (no SDK dependency, zero npm packages)
                    - - **Endpoint:** `POST /api/generate` — Vercel Serverless Function
                      - - **Auth:** `process.env.GEMINI_API_KEY` set in Vercel Environment Variables (all environments)
                       
                        - ### Cost-Safety Wrapper
                        - The following hard limits are enforced in `api/generate.js` to prevent any billing events:
                       
                        - | Limit | Value | Gemini Free Tier |
                        - |-------|-------|------------------|
                        - | Requests per Minute (RPM) | 12 | 15 RPM free |
                        - | Requests per Day (RPD) | 1,200 | 1,500 RPD free |
                        - | Max Output Tokens | 800 | Free tier unlimited |
                        - | Function Max Duration | 10s | Vercel Hobby: 60s |

                        - Sliding-window rate limiter resets counters per minute and per day.
                        - - If rate limit is hit, the API returns `429` with a `Retry-After` header.
                          - - If `GEMINI_API_KEY` is missing, the API returns `503` with a clear message.
                            - - The frontend gracefully falls back to an intelligent topic-aware local draft generator when the API is unavailable.
                             
                              - ### Fallback System
                              - - 5 vertical-aware content templates (Marketing, Product, AI, Finance, General)
                                - - Topic detection via keyword matching
                                  - - Generates structured drafts with TL;DR, Mistakes, Framework sections
                                    - - No API call needed — runs entirely client-side
                                     
                                      - ---

                                      ## Deployment Verification

                                      - **Vercel Plan:** Hobby (Free)
                                      - - **Latest Deployment:** `9aKFPUh2r` — Ready (8s build)
                                        - - **Live URL:** https://business-core-three.vercel.app/ — Fully functional
                                          - - **Build Errors:** 0
                                            - - **Console Errors:** 0
                                              - - **Broken Elements:** 0
                                                - 
                                                ---

                                                ## Cost Confirmation

                                                | Service | Cost |
                                                |---------|------|
                                                | Vercel Hosting (Hobby) | $0.00 |
                                                | Gemini API (Free Tier) | $0.00 |
                                                | GitHub Repository | $0.00 |
                                                | Domain | Default Vercel subdomain | $0.00 |
                                                | **Total Operational Cost** | **$0.00** |

                                                No paid services were utilized. All infrastructure runs within free-tier limits.
