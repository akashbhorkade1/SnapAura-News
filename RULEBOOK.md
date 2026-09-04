# SnapAura Space — Content, Design & Compliance Rulebook

*Internal reference for writing, building, and maintaining snapaura.space. Use this when drafting an article, building a new page, briefing a writer, or prepping for AdSense re-application.*

---

## 1. Site Snapshot

| | |
|---|---|
| **Name** | SnapAura Space |
| **Domain** | snapaura.space |
| **Type** | Multi-category digital news & entertainment platform |
| **Categories** | Bollywood · Cricket · OTT/Web Series · Music · Career · Current Affairs |
| **Languages** | Hindi, Marathi, English — including Hinglish |
| **Business goal** | Google AdSense approval → ad revenue |
| **Last AdSense verdict** | Rejected — "Low value content" |

---

## 2. The AdSense Problem, Precisely

Worth stating plainly since it drives half the rules below: Google doesn't reject sites for missing a specific word count — there's no official minimum. "Low value content" means Google's reviewers (using the same signals as Search's Helpful Content system) didn't think the site would be worth reading if ads weren't on it. Word count is just the easiest symptom to spot and fix. A site can hit 500 words on every page and still get flagged if the content is thin, generic, unedited AI output, or reads like it exists only to hold an ad slot.

So treat every rule in this document — not just the word-count floor — as part of the same goal: **make each page something a reader would bookmark even with zero ads on it.**

---

## 3. Language Policy

**Rule #1: one language per article.** Don't switch between pure Hindi, pure English, and Hinglish mid-piece — pick one register and hold it for the whole article. Inconsistency across the site (not just within one piece) is a live weakness worth fixing.

Suggested default per category — confirm/adjust against what your actual audience responds to:

| Category | Default | Why |
|---|---|---|
| Bollywood | Hindi / Hinglish | Entertainment readers engage more with conversational Hinglish |
| Music | Hindi / Hinglish | Follows Bollywood tone |
| OTT / Web Series | Hinglish / English | Streaming audience skews younger, urban, English-comfortable |
| Cricket | Hindi or English | Either works — keep it consistent within a series/tournament |
| Career | English | Job/exam/education content is searched and read in English |
| Current Affairs | Hindi or English | Match the seriousness of the source material |
| Marathi | Cross-category | Use for Maharashtra-specific stories regardless of category |

---

## 4. Editorial Standards

### 4.1 Length
- **500 words is the floor** for any standalone article — non-negotiable after the rejection.
- Real target: **600–900 words** for Bollywood/OTT/Music features, 500–700 for Cricket/Current Affairs news, 500–650 for Career posts.
- If the news itself is thin (a one-line score update, a single casting confirmation), **don't publish it standalone.** Fold it into a bigger roundup, a live-blog format, or hold it until there's enough around it to justify a page.
- Length is a floor, not the goal — padding a 200-word story to 500 with filler is exactly the pattern Google's reviewers are trained to catch. Add real reporting instead: background, comparison, context, quotes, what happens next.

### 4.2 Structure
Every article should have:
1. **Headline** — specific and accurate, not clickbait that the body doesn't deliver on
2. **Lead paragraph** — who/what/when/where in the first 2–3 sentences
3. **Body** — 3–5 sections with subheadings once you're past ~400 words
4. **Context paragraph** — why this matters, what led here, how it connects to other coverage
5. **Source line** — where the information came from
6. **Closing line** — what happens next, or a link to related coverage

### 4.3 Sourcing & Accuracy
- Never present rumors, leaks, or unconfirmed claims (retirements, breakups, casting, injuries, controversies) as settled fact.
- Use attribution language: *"according to [outlet],"* *"reports suggest,"* *"sources close to [person] say."*
- If a story is developing, say so — and go back and update the piece if it's confirmed or denied later, rather than leaving stale info live.
- Name the original outlet when re-reporting a story broken elsewhere.

### 4.4 Bylines
- Every article carries a named author (or a consistent staff byline) and, ideally, a one-line author bio somewhere on the site. Real, visible authorship is one of the clearer trust signals Google's reviewers look for — it's cheap to add and worth doing sitewide.

### 4.5 AI-Assisted Writing
Using AI to draft articles isn't itself a problem for Google — publishing raw, unedited AI output at scale is. Before anything AI-drafted goes live:
- Fact-check every name, date, number, and quote.
- Add something the AI couldn't: a local angle, a specific comparison, an opinion, a detail from actually watching/following the story.
- Rewrite at least the lead and closing in your own voice — a page that reads identically to a hundred other AI-generated summaries of the same news is exactly the "low value" pattern to avoid.

### 4.6 Tone
- Conversational but reads like reporting, not gossip.
- Avoid all-caps headlines and stacked exclamation points.

---

## 5. Design & Template Rules

### 5.1 Preview / Post Cards
- One reusable card template across the entire site.
- **Career and Current Affairs cards: text-only, no image** (established rule — keep it).
- All other categories: image + headline + 1–2 line excerpt + category tag + date.
- Card dimensions and typography stay identical across categories; only image presence/absence changes.

### 5.2 New Page Builds
- Deliver both the full article template and the index/preview-card component — as separate HTML files, or combined into one reference file when that's more convenient.
- Keep HTML/CSS self-contained (embedded styles) unless the live class names from the current site have been shared — when they have, match them exactly rather than introducing new class names.

---

## 6. Images & Media
- Owned photography, licensed stock (Pixabay, Pexels, Unsplash), or official press images only. **Never scrape images from Google Image search** — this is one of the more common copyright-related causes of "low value content" rejections, separate from the article-length issue.
- Every image needs descriptive alt text — helps SEO and reads as a content-quality signal.
- Keep a consistent aspect ratio per card type so grids don't break.

---

## 7. SEO & Metadata
- **Title tag:** unique per page, keyword-first, under ~60 characters.
- **Meta description:** unique, under ~155 characters, actually summarizes the content (not the headline restated).
- **Open Graph tags:** already implemented sitewide — keep populating `og:title`, `og:description`, `og:image` on every new page.
- **Schema.org `NewsArticle`:** already in use — every article needs real `headline`, `datePublished`, `author`, and `image` values, never left as placeholders.
- **Internal links:** every article links to at least 1–2 related SnapAura articles or its category page.

---

## 8. Legal & Trust Pages
- **Privacy Policy** — must be linked in the footer of *every* page. Currently missing on index, bollywood, cricket, and other category pages — add it everywhere.
- **About page** — has the right structure (Mission/Vision/Story + category grid); the copy itself needs correcting to describe SnapAura as a Bollywood/entertainment-led platform, not a current-affairs/politics/tech site.
- **Contact page** — Formspree integration (form ID `xbdznrwe`) — confirm submissions are actually arriving in the inbox, not just that the form visually submits on the front end.
- These three pages plus visible author bylines are exactly what AdSense reviewers use to judge whether a real, accountable publisher is behind the site — treat them as seriously as the articles themselves.

---

## 9. Site Structure & Technical Checklist
- Fix the non-functional **LIVE** nav button.
- Connect real URLs to the **footer social icons** (currently placeholders) — or remove them until they're real.
- **robots.txt** and **sitemap.xml** — confirm both exist and the sitemap is submitted in Google Search Console (setup still pending).
- **HTTPS** on every page — verify no mixed-content warnings.
- **Mobile responsiveness** on all templates, especially the card grids.
- **ads.txt** — not required for approval, so it's not a pre-application blocker, but set it up right after AdSense approval using the publisher ID from the new account; Google flags it as "highly recommended" and missing it after approval can cost revenue.

---

## 10. Pre-Publish Checklist (every article)
- [ ] 500+ words, and the length is earned (real reporting, not padding)
- [ ] One consistent language throughout
- [ ] Unconfirmed claims are clearly attributed
- [ ] Subheadings if the piece runs past ~400 words
- [ ] Byline present
- [ ] Meta title + description written (not left blank/default)
- [ ] Schema.org NewsArticle fields filled in
- [ ] Image is owned/licensed and has alt text
- [ ] At least one internal link
- [ ] Privacy Policy link visible in the footer

---

## 11. AdSense Re-Application Checklist
- [ ] Every live article clears the 500-word floor with real substance
- [ ] Privacy Policy linked sitewide
- [ ] About page copy matches the site's actual entertainment/Bollywood focus
- [ ] Contact form verified working end-to-end
- [ ] LIVE button fixed or removed
- [ ] Footer social links connected or removed
- [ ] No broken internal links
- [ ] Language is consistent within each article
- [ ] Bylines present across articles
- [ ] A visible, steady publishing history in the run-up to re-applying (the ~5-week runway already planned)

---

## 12. Open Issues Tracker
Update this as items get fixed:
1. Privacy Policy link missing on index/category pages
2. LIVE nav button non-functional
3. Footer social icons not linked to real accounts
4. Contact form backend delivery — needs end-to-end verification
5. About page copy needs realignment to entertainment/Bollywood focus

---

## 13. Automation & CI/CD

*This section covers the automated checks, workflows, and scripts that enforce the rules above — so nothing ships without passing validation.*

### 13.1 Local Automation Scripts

The `scripts/` directory contains Node.js validation tools. Run them via npm:

```bash
npm run validate           # Run all validations
npm run validate:articles  # Article quality checks (word count, metadata, schema, bylines)
npm run validate:seo       # SEO checks (canonical, robots, hreflang)
npm run validate:links     # Broken internal link detection
npm run validate:trust     # Trust page + footer validation
npm run validate:footer    # Footer-only checks
npm run generate:sitemap   # Regenerate sitemap.xml
npm run generate:rss       # Regenerate rss.xml
npm run check:all          # Full pipeline: validate + sitemap + RSS
npm run serve              # Local dev server on port 3000
```

### 13.2 What `npm run validate` Checks

| Check | Rule Enforced |
|---|---|
| Word count < 500 | Section 4.1 — 500-word floor |
| Missing/placeholder `<title>` | Section 7 — unique title tag |
| `<title>` > 60 chars | Section 7 — under ~60 characters |
| Missing meta description | Section 7 — unique per page |
| Meta description > 155 chars | Section 7 — under ~155 characters |
| Missing `og:title`, `og:description`, `og:image` | Section 7 — Open Graph tags |
| Missing NewsArticle schema | Section 7 — Schema.org |
| Missing `headline`/`datePublished` in schema | Section 7 — real values, not placeholders |
| No author byline or schema author | Section 4.4 — bylines |
| No internal links | Section 7 — 1–2 related articles |
| 400+ words without h2/h3 | Section 4.2 — subheadings required |
| `<img>` without alt text | Section 6 — descriptive alt text |
| Missing `lang` attribute | Accessibility / SEO |
| Missing canonical URL | Section 7 |
| Missing robots meta | Section 9 |
| Broken internal links | Section 9 — no broken links |
| Missing privacy-policy link on trust pages | Section 8 |
| Missing social icons in footer | Section 9 |
| Placeholder social links | Section 9 |

### 13.3 GitHub Actions Workflows

#### CI Pipeline (`.github/workflows/ci.yml`)
Runs on every push and PR to `master`:
1. **Validate** — runs `npm run validate` to check all articles, SEO, links, trust pages
2. **Sitemap** — auto-generates `sitemap.xml` via `npm run generate:sitemap`
3. **RSS** — auto-generates `rss.xml` via `npm run generate:rss`
4. **Commit artifacts** — if sitemap or RSS changed, commits them back

#### Sitemap Generation (`.github/workflows/generate-sitemap.yml`)
Runs on push to `master` — already existing, regenerates `sitemap.xml` with correct priorities and lastmod dates.

#### Auto RSS (`.github/workflows/auto-rss.yml`)
Runs on push to `master` — regenerates `rss.xml` from all article pages with proper dates, titles, and descriptions.

### 13.4 Workflow: Adding a New Article

1. Create the HTML file in the correct category directory (e.g., `bollywood/new-article.html`)
2. Use the existing article template (copy from a similar article in the same category)
3. Fill in all required fields: title, meta description, OG tags, schema, canonical, byline
4. Ensure 500+ words of real content
5. Add at least one internal link to another SnapAura article
6. Run `npm run validate:articles` locally to verify
7. Commit and push — CI will validate automatically
8. If CI passes, the article is live after GitHub Pages deploys
9. Sitemap and RSS are updated automatically by CI

### 13.5 Workflow: Pre-AdSense Re-Application

1. Run `npm run check:all` to get a full report
2. Fix every issue flagged by the validator
3. Manually verify the AdSense Re-Application Checklist (Section 11)
4. Confirm the Contact form works end-to-end
5. Confirm About page copy is aligned
6. Push fixes and verify CI passes green
7. Re-apply to AdSense

### 13.6 CI Failure = Do Not Ship

If any validation fails in CI, the build exits with code 1 and the PR/push is flagged. Fix the issues before merging. The rules in this document are not aspirational — they are enforced by automation.

---

*Living document — update the checklists as fixes land and rules evolve.*
