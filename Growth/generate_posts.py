#!/usr/bin/env python3
"""
Growth/generate_posts.py -- Scrivlo Traffic Flywheel
=====================================================
Generates Value-First marketing posts for high-traffic communities
relevant to indie builders, AI tools, and content creation.

Targets 5 high-traffic subreddits (research-validated):
  1. r/Entrepreneur      -- 3.8M members, indie/startup founders
  2. r/SideProject       -- 430K members, builders shipping products
  3. r/juststart         -- 230K members, new content creators
  4. r/artificial        -- 2.1M members, AI tools discussion
  5. r/content_marketing -- 110K members, content strategy

Usage:
    python3 Growth/generate_posts.py
    python3 Growth/generate_posts.py --dry-run
    python3 Growth/generate_posts.py --no-ai

Requirements:
    pip install requests python-dotenv google-generativeai
    Set GEMINI_API_KEY in .env or Vercel environment variables.

Cost: $0.00 -- uses Gemini Flash free tier (1500 RPD, 15 RPM).
"""

import os, sys, json, time, argparse, textwrap
from datetime import datetime, timezone

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# -- Constants ----------------------------------------------------------------
SITE_URL  = "https://business-core-three.vercel.app"
SITE_NAME = "Scrivlo"
SITE_DESC = "free AI content engine for indie builders -- publish-ready drafts in 30 seconds"

# 5 high-traffic community targets (research-validated)
COMMUNITIES = [
    {
        "platform":    "reddit",
        "subreddit":   "Entrepreneur",
        "members":     "3.8M",
        "audience":    "indie founders and solopreneurs",
        "tone":        "practical, numbers-driven, no hype",
        "hook_style":  "I built X and learned Y",
        "best_time":   "Tue/Wed 8-10am EST",
        "rules_note":  "No direct promotion in title. Value-first, mention tool naturally.",
    },
    {
        "platform":    "reddit",
        "subreddit":   "SideProject",
        "members":     "430K",
        "audience":    "indie hackers shipping solo projects",
        "tone":        "builder-to-builder, honest about trade-offs",
        "hook_style":  "Show HN style: what you built and why",
        "best_time":   "Mon/Thu 9am-12pm EST",
        "rules_note":  "Self-promotion allowed on weekends. Show the product demo.",
    },
    {
        "platform":    "reddit",
        "subreddit":   "juststart",
        "members":     "230K",
        "audience":    "new content creators and bloggers",
        "tone":        "beginner-friendly, step-by-step, encouraging",
        "hook_style":  "How I went from X to Y using free tools",
        "best_time":   "Wed/Sun 10am-2pm EST",
        "rules_note":  "Tutorials and case studies perform best. Include screenshots.",
    },
    {
        "platform":    "reddit",
        "subreddit":   "artificial",
        "members":     "2.1M",
        "audience":    "AI enthusiasts, builders, early adopters",
        "tone":        "technically informed, honest about limitations",
        "hook_style":  "I tested X AI tools -- here is what actually works",
        "best_time":   "Daily 9-11am PST",
        "rules_note":  "No shill posts. Compare fairly. Mention competitors honestly.",
    },
    {
        "platform":    "reddit",
        "subreddit":   "content_marketing",
        "members":     "110K",
        "audience":    "content marketers and strategists",
        "tone":        "data-driven, ROI-focused, professional",
        "hook_style":  "Case study: X approach drove Y result",
        "best_time":   "Tue/Thu 8-10am EST",
        "rules_note":  "Case studies and data posts dominate. Avoid listicles.",
    },
]

POST_TYPES = ["case_study", "tutorial", "comparison", "insight"]


# -- Gemini Flash Post Generator -----------------------------------------------

def generate_post_with_gemini(community, post_type, topic, api_key):
    """Generate a value-first post using Gemini Flash (free tier)."""
    if not HAS_GENAI:
        raise ImportError("Run: pip install google-generativeai")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    prompt = (
        f"You are a growth marketer writing a value-first post for r/{community['subreddit']}.\n"
        f"Audience: {community['members']} members, {community['audience']}\n"
        f"Tone: {community['tone']}\n"
        f"Hook style: {community['hook_style']}\n"
        f"Rules note: {community['rules_note']}\n\n"
        f"Topic: {topic}\n"
        f"Post type: {post_type}\n"
        f"Site to reference naturally: {SITE_URL} -- {SITE_DESC}\n\n"
        "Write a Reddit post with:\n"
        "1. TITLE -- compelling, no clickbait, max 200 chars\n"
        "2. BODY -- lead with genuine value (300-400 words), mention the site naturally at the end\n"
        "3. CTA -- one soft call to action (e.g., share a link or offer to help)\n\n"
        "Return JSON: {\"title\": \"\", \"body\": \"\", \"cta\": \"\", \"estimated_upvotes\": \"low|medium|high\"}"
    )

    response = model.generate_content(prompt)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"title": f"[{post_type}] {topic}", "body": raw, "cta": SITE_URL,
                "estimated_upvotes": "medium"}


def generate_post_local(community, post_type, topic):
    """Offline fallback -- generate a templated post without API."""
    body_map = {
        "Entrepreneur": (
            f"Spent months stuck on {topic}. Here is what finally worked.\n\n"
            "**What I tried first:** Manual. Overpriced tools ($49/mo). Hours lost.\n\n"
            f"**What worked:** {SITE_NAME} -- {SITE_DESC}. The real unlock was treating "
            "content as a compound asset, not a one-off task.\n\n"
            f"**Process I use now:**\n1. Idea to {SITE_URL} -- 30s draft\n"
            "2. Edit for voice (10 min)\n3. Publish + track\n\n"
            "Cut time spent by ~70%. Quality stayed the same.\n\n"
            "Happy to share the full workflow if useful."
        ),
        "SideProject": (
            f"Hey r/SideProject -- shipped {SITE_NAME} last week.\n\n"
            f"{SITE_DESC.capitalize()}.\n\n"
            f"**Problem it solves:** {topic} is a bottleneck for every solo builder I know.\n\n"
            "**What I built:**\n"
            "- Free tier: 5 drafts/month, markdown + HTML export\n"
            "- Pro: $9/mo -- unlimited drafts, brand voice, CMS publish\n\n"
            f"**Live demo:** {SITE_URL}\n\n"
            "Would love feedback from this community specifically."
        ),
        "DEFAULT": (
            f"Quick share for anyone dealing with {topic}.\n\n"
            f"Been using {SITE_NAME} ({SITE_URL}) -- {SITE_DESC}.\n\n"
            "Free tier covers most use cases. No $49/mo subscription.\n\n"
            "Let me know if you want to see a sample output."
        ),
    }
    body = body_map.get(community["subreddit"], body_map["DEFAULT"])
    return {
        "title": f"How I solved {topic} for free (no agency, no $49/mo tools)",
        "body": body,
        "cta": f"Try it free: {SITE_URL}",
        "estimated_upvotes": "medium",
        "best_time_to_post": community["best_time"],
    }


# -- Live Site Fetch -----------------------------------------------------------

def fetch_site_stats(site_url):
    """Fetch live site data to reference in posts."""
    stats = {"url": site_url, "name": SITE_NAME, "tagline": SITE_DESC,
             "free_tier": "5 drafts/month", "pro_price": "$9/month",
             "competitors": "Jasper ($49+), Copy.ai ($49+)",
             "fetched_at": datetime.now(timezone.utc).isoformat(), "live": False}
    if not HAS_REQUESTS:
        return stats
    try:
        resp = requests.get(site_url, timeout=8)
        if resp.ok:
            stats["live"] = True
            stats["response_ms"] = int(resp.elapsed.total_seconds() * 1000)
    except Exception as e:
        stats["fetch_error"] = str(e)
    return stats


# -- Output --------------------------------------------------------------------

def save_posts(posts, output_dir="Growth/output"):
    """Save generated posts to JSON + markdown files."""
    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    json_path = os.path.join(output_dir, f"posts_{ts}.json")
    md_path   = os.path.join(output_dir, f"posts_{ts}.md")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# Scrivlo Growth Posts -- {ts}\n\n")
        for p in posts:
            f.write(f"## r/{p['subreddit']} | {p['post_type']}\n\n")
            f.write(f"**Best time:** {p.get('best_time_to_post', '')}\n\n")
            f.write(f"**Title:** {p['title']}\n\n")
            f.write(f"**Body:**\n\n{p['body']}\n\n")
            f.write(f"**CTA:** {p.get('cta', '')}\n\n---\n\n")
    return md_path


# -- Main ----------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrivlo Traffic Flywheel")
    parser.add_argument("--site",    default=SITE_URL)
    parser.add_argument("--topic",   default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-ai",   action="store_true")
    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY", "")

    print(f"\n{'='*60}")
    print(f"  Scrivlo Traffic Flywheel | {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"  AI: {'Gemini Flash' if api_key and not args.no_ai else 'Local templates'}")
    print(f"  Communities: {len(COMMUNITIES)}")
    print(f"{'='*60}\n")

    site_stats = fetch_site_stats(args.site)
    print(f"Site: {'Live' if site_stats['live'] else 'Offline (using cached data)'}")

    default_topics = [
        "AI content tools for solopreneurs",
        "building a content system with zero budget",
        "SEO writing for indie product pages",
        "how to publish 10x faster as a solo founder",
        "replacing expensive content tools with free AI",
    ]

    posts = []
    for i, community in enumerate(COMMUNITIES):
        topic = args.topic or default_topics[i % len(default_topics)]
        post_type = POST_TYPES[i % len(POST_TYPES)]
        print(f"Generating for r/{community['subreddit']} [{post_type}]: {topic[:50]}...")
        try:
            if api_key and not args.no_ai:
                post_data = generate_post_with_gemini(community, post_type, topic, api_key)
                post_data["generated_by"] = "gemini-1.5-flash"
                if i < len(COMMUNITIES) - 1:
                    time.sleep(5)  # Stay under 12 RPM
            else:
                post_data = generate_post_local(community, post_type, topic)
                post_data["generated_by"] = "local_template"
            post_data.update({"subreddit": community["subreddit"],
                              "platform": community["platform"],
                              "topic": topic, "post_type": post_type,
                              "site_url": args.site,
                              "generated_at": datetime.now(timezone.utc).isoformat()})
            posts.append(post_data)
            print(f"  OK: {post_data['title'][:70]}...")
        except Exception as e:
            print(f"  ERROR: {e}")

    print(f"\nGenerated {len(posts)}/{len(COMMUNITIES)} posts.")
    if not args.dry_run:
        md_path = save_posts(posts)
        print(f"Saved: {md_path}")
    else:
        for p in posts:
            print(f"\n--- r/{p['subreddit']} ---")
            print(f"Title: {p['title']}")
            print(f"Body: {p['body'][:120]}...")

    print("\nNext steps:")
    print("  1. Review posts in Growth/output/")
    print("  2. Edit for your voice (~10 min per post)")
    print("  3. Post during peak times listed per community")
    print(f"  4. Track traffic in analytics -> {args.site}")


if __name__ == "__main__":
    main()
