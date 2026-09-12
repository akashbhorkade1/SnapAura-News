#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "drafts", "generated");
const MANIFEST_PATH = path.join(OUTPUT_DIR, ".retention.json");
const QUEUE_PATH = path.join(ROOT, "drafts", "queue.json");
const RETENTION_MS = 24 * 60 * 60 * 1000;
const BASE_URL = "https://snapaura.space";
const INDIA_TIME_ZONE = "Asia/Kolkata";
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const GEMINI_MAX_ATTEMPTS = Math.max(1, Number.parseInt(process.env.GEMINI_MAX_ATTEMPTS || "4", 10) || 4);
const RETRYABLE_GEMINI_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const IMAGELESS_CATEGORIES = new Set(["Career", "Current-Affairs"]);

const ENTERTAINMENT_TERMS = /bollywood|movie|film|actor|actress|celebrity|singer|song|ott|netflix|web series|trailer|review|music|television|tv|bigg boss|reality show/i;
const DEFAULT_IMAGE = "assets/img/the-bluff-review.jpg";

function xmlDecode(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

async function getStories(source) {
  let response;
  try {
    response = await fetch(source.feed, { headers: { "user-agent": "SnapAura-News/1.0" } });
  } catch (error) {
    throw new Error(`${source.category} feed request failed: ${error.message}`);
  }
  if (!response.ok) throw new Error(`${source.category} feed returned HTTP ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 5).map((match) => {
    const item = match[1];
    const read = (tag) => xmlDecode((item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")) || ["", ""])[1]);
    return { title: read("title"), link: read("link"), description: read("description"), source: source };
  }).filter((story) => story.title && story.link);
}

function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const item = match[1];
    const read = (tag) => xmlDecode((item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")) || ["", ""])[1]);
    const raw = (tag) => (item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")) || ["", ""])[1];
    return { title: read("title"), link: read("link"), description: read("description"), content: read("content:encoded"), rawContent: raw("content:encoded"), pubDate: read("pubDate"), traffic: read("ht:approx_traffic") };
  }).filter((item) => item.title && item.link);
}

function trafficNumber(value) {
  const match = String(value).replace(/,/g, "").match(/[\d.]+/);
  return match ? Number(match[0]) * (/m/i.test(value) ? 1000000 : /k/i.test(value) ? 1000 : 1) : 0;
}

async function resolveSourceUrl(url) {
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "SnapAura-News/1.0" } });
    return response.url || url;
  } catch {
    return url;
  }
}

async function getTrendingEntertainmentStories(seen) {
  const trendsResponse = await fetch("https://trends.google.com/trending/rss?geo=IN", { headers: { "user-agent": "SnapAura-News/1.0" } });
  if (!trendsResponse.ok) throw new Error(`Google Trends RSS returned HTTP ${trendsResponse.status}`);
  const trends = parseItems(await trendsResponse.text());
  const candidates = [];
  for (const trend of trends.slice(0, 40)) {
    const query = encodeURIComponent(`${trend.title} entertainment when:1d`);
    const response = await fetch(`https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`, { headers: { "user-agent": "SnapAura-News/1.0" } });
    if (!response.ok) continue;
    const news = parseItems(await response.text()).find((item) => ENTERTAINMENT_TERMS.test(`${trend.title} ${item.title} ${item.description}`) && !seen.includes(item.link));
    if (!news) continue;
    candidates.push({
      ...news,
      title: `${trend.title}: ${news.title}`,
      trend: trend.title,
      trendTraffic: trend.traffic,
      source: { category: "bollywood", language: "Hindi", image: DEFAULT_IMAGE },
    });
    if (candidates.length === 5) break;
  }
  const resolved = await Promise.all(candidates.map(async (story) => ({ ...story, sourceUrl: await resolveSourceUrl(story.link) })));
  return resolved.sort((a, b) => trafficNumber(b.trendTraffic) - trafficNumber(a.trendTraffic));
}

async function getNewsStory(query, category, language, seen) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const response = await fetch(url, { headers: { "user-agent": "SnapAura-News/1.0" } });
  if (!response.ok) throw new Error(`${category} news feed returned HTTP ${response.status}`);
  const story = parseItems(await response.text()).find((item) => !seen.includes(item.link));
  if (!story) throw new Error(`No new ${category} story found`);
  return { ...story, sourceUrl: await resolveSourceUrl(story.link), source: { category, language, image: DEFAULT_IMAGE } };
}

async function getMajhiStory(seen, currentAffairs = false) {
  const response = await fetch("https://majhinaukri.in/feed/", { headers: { "user-agent": "SnapAura-News/1.0" } });
  if (!response.ok) throw new Error(`Majhi Naukri feed returned HTTP ${response.status}`);
  const items = parseItems(await response.text());
  const story = items.find((item) => !seen.includes(item.link) && (currentAffairs ? /current affairs/i.test(`${item.title} ${item.description}`) : !/current affairs/i.test(`${item.title} ${item.description}`)));
  if (!story) throw new Error(`No new Majhi Naukri ${currentAffairs ? "Current Affairs" : "Career"} story found`);
  let pageContent = story.rawContent || story.description || "";
  try {
    const pageResponse = await fetch(story.link, { headers: { "user-agent": "SnapAura-News/1.0" } });
    if (pageResponse.ok) pageContent = await pageResponse.text();
  } catch {}
  const extracted = extractArticleBody(pageContent, story.link);
  return { ...story, sourceUrl: story.link, description: story.description, rawContent: extracted.text, importantLinks: extracted.links, source: { category: currentAffairs ? "Current-Affairs" : "Career", language: currentAffairs ? "Marathi" : "English", image: DEFAULT_IMAGE } };
}

// Patterns that identify site-chrome links which must never be treated as
// article "important links": source-site nav/footer/tool menus, social
// follow buttons, and share-intent URLs. A previous incident published a
// Career article with ~155 anchors because the full majhinaukri.in page
// (nav, tools menu, share widgets) was scraped into the draft.
//
// Career IMPORTANT-LINKS policy (see CAREER_LINK_POLICY below): only
//   1. official recruitment notification PDF
//   2. official online application portal
//   3. official website of the recruiting organisation
// may survive as "Important Links" (1-3 links max, never invented).
// Everything else — mock tests, calculators, tools, app downloads,
// Telegram/WhatsApp/social, linktree, promos, category/tag archives,
// unrelated articles — is chrome and must be dropped.
const CHROME_LINK_PATTERNS = [
  /\/tools\//i,
  /\/games?\b/i,
  /\/mock-?test/i,
  /\/quizzes?\b/i,
  /\/calculators?\b/i,
  /\/category\//i,
  /\/tag\//i,
  /\/tags\//i,
  /\/topics?\//i,
  /\/current-recruitment\/?$/i,
  /\/sarkari-naukri\/?$/i,
  /\/results?\/?$/i,
  /\/admit-?cards?\/?$/i,
  /\/answer-?keys?\/?$/i,
  /\/syllabus\/?$/i,
  /play\.google\.com\/store/i,
  /apps\.apple\.com/i,
  /api\.whatsapp\.com\/send/i,
  /wa\.me\//i,
  /whatsapp\.com\/channel/i,
  /t\.me\//i,
  /telegram\.me\//i,
  /twitter\.com\/intent/i,
  /x\.com\/intent/i,
  /facebook\.com\/sharer/i,
  /linkedin\.com\/share/i,
  /pinterest\.com\/pin/i,
  /mailto:/i,
  /#respond|#comments?|#reply/i,
  /\/author\//i,
  /\/page\/\d+/i,
  /\/feed\/?$/i,
  /\/sitemap/i,
  /twitter\.com\//i,
  /(^|\.)x\.com\//i,
  /youtube\.com\//i,
  /youtu\.be\//i,
  /linkedin\.com\//i,
  /\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?)(\?|$)/i,
];

const CHROME_TEXT_PATTERNS = [
  /^(home|about( us)?|contact( us)?|privacy policy|terms|disclaimer|sitemap|advertise|write for us)$/i,
  /^(follow|share|subscribe|download (our |the )?app|join (us )?on|get job alerts)$/i,
  /^(facebook|instagram|twitter|\bx\b|telegram|whatsapp|youtube|linkedin)$/i,
  /^(tools?|games?|mock ?tests?|quizzes|calculators?|typing tests?)$/i,
  /^(current recruitment|sarkari naukri|results?|admit cards?|answer keys?|syllabus)$/i,
  /mock ?test/i,
  /calculator/i,
  /download.*app|app.*download/i,
  /join.*(telegram|whatsapp)/i,
];

// Career automation: curated-official-links-only policy + Gen Z template v2.
// Only 3 slots exist: notification PDF/page, apply portal, official website.
const CAREER_LINK_POLICY = "Keep an 'Important Links' section with ONLY official links from the original notification/source: (1) Notification PDF or notification page, (2) Online Application portal, (3) Official Website. Never invent URLs; omit a missing link. Dedupe URLs; max 3 links; never add mock tests, calculators, tools, apps, Telegram/WhatsApp/social, linktree, promos, category pages, or unrelated articles. CTA labels stay calm and useful ('Notification & Online Application', 'Official Website') - never 'CLICK HERE!!!', 'APPLY NOW!!!' or other aggressive marketing language.";

// Career template v2: English complete core + Marathi quick guide (NOT a
// translation). Flow and style rules every Career article must follow.
const CAREER_STYLE_GUIDE = "CAREER TEMPLATE V3 (English complete core + FULL Marathi coverage; Gen Z, mobile-first, accuracy overrides engagement). FLOW in this order: (1) Hook: 1-2 sentence lead answering what job, how many vacancies, who can apply, and the last date. (2) At-a-Glance card: Organization, Posts, Vacancies, Qualification, Age, Fee, Last Date, Location - use 'To be announced' if unknown, never guess. (3) 'Can I Apply?' with short sub-blocks: Qualification, Experience (if required), Age, Other requirements - only what the source supports - followed by one neutral decision line. (4) 'Why This Job?' with 2-4 practical points ONLY if the source supports them; never clickbait like 'Golden Opportunity' or 'BEST GOVERNMENT JOB'. (5) 'Important Dates' as a small timeline table (Applications Open, Last Date, Exam Date), last date emphasized. (6) 'Application Fee' as a category/fee table - only categories the source lists. (7) 'Selection Process' as short steps ONLY if in the source, otherwise exactly: 'Selection process: Check the official notification.' (8) 'Quick Eligibility Check' as a self-checklist (qualification, experience, age, documents, deadline) that never claims the reader is eligible. (9) 'What should I do now?' up to 5 practical steps, ending with saving application/confirmation details. (10) Background only if genuinely useful, max 80-100 words, never generic institutional filler. (11) 'मराठीत झटपट समजून घ्या' (with 🇮🇳 marker): a FULL Marathi section that mirrors ALL the English content to the same depth - eligibility (qualification, experience, age), posts and vacancies, important dates, application fee, selection process, job location and the action steps - written as natural, everyday conversational Marathi mixed with common English job terms (job, vacancy, form, last date), NEVER a word-for-word translation but NEVER only a 3-4 sentence summary either; every fact present in English must also appear in Marathi; make the Marathi section substantial, typically roughly half the length of the English core (never pad, but the old 3-4 sentence 'quick guide' is banned); avoid Sanskritized or bureaucratic constructions. (12) Important Links (see link policy). STYLE: simple, modern, Indian-job-seeker-friendly English; short paragraphs; emoji only as section markers (🔥📅🎓🎂💰🏢💼📝🚀✅); mention the reporting source once inside the body - there is NO separate source footer line ('Source: … Original report') on Career pages; say 'Not specified in the available source' for gaps; no fixed word target - complete but concise, a 2-4 minute read; never pad or repeat.";

// Current Affairs template v2: exam-oriented roundup. The MOST IMPORTANT rule:
// never fabricate topics when the source is only an announcement/digest lead.
const CURRENT_AFFAIRS_STYLE_GUIDE = "CURRENT AFFAIRS TEMPLATE V2 (exam-oriented, Gen Z, mobile-first, accuracy overrides engagement). Only generate the article when the supplied source content ACTUALLY contains the day's current-affairs topics - never pretend an announcement or digest headline contains today's news. FLOW (use only the sections the source genuinely supports): (1) Short intro: 1-2 sentences telling the reader the coverage date and what they will learn; never write 'current affairs are important for exams...'. (2) 'Today's Current Affairs - Quick Scan' (📰 marker): a compact responsive table card listing EACH actual topic from the source and its UPSC focus (Polity, Economy, Environment, Science & Technology, International Relations, etc.) - only assign categories the content clearly supports. (3) One h2 per actual topic with short sub-blocks: 'Why in News?' (current relevance), 'What Happened?' (the actual development), 'Key Facts' (3-6 bullets), then 'UPSC Connection 🎯' only when the source justifies a syllabus/exam link; keep each topic tight - no essays. (4) '🎯 Prelims Focus': a facts card with Prelims-type bullets (organisation, location, article, act, constitutional provision, species, index, report, institution, scientific term, year, scheme, geography) - ONLY source-supported facts, otherwise write 'Not specified in the source'. (5) '✍️ Mains Angle': for topics that support analysis - issue/background, significance, challenges, way forward, plus an optional 'Possible Mains Question'; do not force it for trivial topics. (6) '⚡ 1-Minute Revision': 5-10 ultra-concise numbered revision points (organisation, location, development, key number, initiative). (7) '🧠 Quick Quiz': 3-5 MCQs (A-D options) with 'Answer:' and a one-line 'Why:' based ONLY on facts present in the article/source. (8) '🇮🇳 मराठीत झटपट Revision': a natural, conversational Marathi summary for Marathi-speaking exam students - each topic in 1-2 lines, then 'परीक्षेसाठी लक्षात ठेवा' with 3-5 📌 bullet points; everyday Marathi mixed with common English exam words; never a word-for-word translation; keep it concise. DO NOT generate sections that explain why current affairs matter, how daily compilations work, generic UPSC prep advice, generic civil-services descriptions, or publisher descriptions - explain CURRENT EVENTS, not what current affairs are. STYLE: modern, concise, scannable; emojis only as section markers; every fact attributed once per topic to the named source; 'Not specified in the source' / 'To be confirmed from the official source' for gaps; never invent topics, dates, statistics, schemes, reports, rankings, exam relevance or URLs; do NOT add an 'Important Links' section inside the body (the page template adds the original source link).";

// Generic-filler phrases that are banned in any Current Affairs article -
// they mark the announcement-only digest anti-pattern.
const CA_BANNED_PHRASES = [
  /current affairs are an important part/i,
  /current affairs (?:is|are) vital/i,
  /daily roundups serve as/i,
  /serves? as an essential foundation/i,
  /convert vast daily news flows/i,
  /navigating unspecified details/i,
  /key structure of civil services daily analysis/i,
  /essential component of exam readiness/i,
  /foundation for candidates navigating/i,
];

// The MOST IMPORTANT Current Affairs rule: if the source does not actually
// contain current-affairs topics, never fabricate them. Returns true only
// when the retrieved source text shows real, topic-bearing content.
function stripEchoes(text, story) {
  let out = String(text || "");
  for (const ignore of [story && story.title, story && story.description]) {
    if (ignore) out = out.split(String(ignore)).join(" ");
  }
  return out;
}

// The MOST IMPORTANT Current Affairs rule: if the source does not actually
// contain current-affairs topics, never fabricate them. A genuine compilation
// REPORTS several concrete developments; an announcement-only lead talks
// ABOUT the digest (publisher praise, "roundups serve as...", syllabus talk)
// without naming actual events. Count development-reporting sentences.
const CA_DEV_VERB_RE = /\b(?:launched|approved|appointed|signed|released|inaugurated|unveiled|announced|reported that|declared|won|banned|imposed|recommended|submitted|celebrated|observed|hosted|discovered|elevated|ratified|hiked|revised|amended|cleared|notified|was (?:added|launched|approved|appointed|signed|released|inaugurated|unveiled|held|organised|concluded))\b/i;

function hasCurrentAffairsTopics(story) {
  const body = stripEchoes(story.rawContent, story);
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 60) return false;
  const sentences = body.split(/(?<=[.!?])\s+/);
  let devSentences = 0;
  for (const sentence of sentences) {
    if (CA_DEV_VERB_RE.test(sentence)) devSentences += 1;
  }
  return devSentences >= 3;
}

async function fetchFullSourceText(story) {
  const url = story.sourceUrl || story.link;
  if (!url) return "";
  try {
    const response = await fetch(url, { headers: { "user-agent": "SnapAura-News/1.0" } });
    if (!response.ok) return "";
    return extractArticleBody(await response.text(), url).text;
  } catch {
    return "";
  }
}

// Try to obtain the complete original content. Returns true when topics are
// available; false when the source is genuinely announcement-only (=> skip).
async function enrichCurrentAffairsStory(story) {
  if (hasCurrentAffairsTopics(story)) return true;
  const fetched = await fetchFullSourceText(story);
  if (fetched && fetched.trim().length > 0) story.rawContent = fetched;
  return hasCurrentAffairsTopics(story);
}

// Returns notification|apply|website|null for a scraped URL + label.
function classifyCareerLink(href, linkText) {
  const url = String(href || "");
  const text = String(linkText || "").toLowerCase();
  if (/\.pdf(\?|#|$)/i.test(url)) return "notification";
  if (/notification|advertisement|\badvt\b/i.test(url + " " + text)) return "notification";
  if (/apply|application|registration|recruit|online-form|apply-online/i.test(url + " " + text)) return "apply";
  if (/\.(gov\.in|nic\.in|org\.in|ac\.in|edu\.in)(\/|$)/i.test(url)) return "website";
  if (/official[- ]?website|department[- ]?(site|portal)/i.test(text)) return "website";
  return null;
}

function extractArticleBody(pageHtml, sourceUrl) {
  if (!/<[a-z][\s>]/i.test(pageHtml)) {
    // Source is already plain text (e.g. RSS content) — nothing to strip.
    return { text: pageHtml.replace(/\s+/g, " ").slice(0, 18000), links: [] };
  }
  // 1. Drop whole-page chrome containers before looking for the article body.
  let html = pageHtml
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");
  // 2. Prefer the real article body: <article>, then entry/post content divs.
  const body =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    html.match(/<div[^>]*class=["'][^"']*(?:entry-content|post-content|article-content|td-post-content|single-post-content)[^"']*["'][\s\S]*?<\/div\s*>\s*(?:<\/div\s*>)?/i)?.[0] ||
    html;
  // 3. Remove leftover chrome widgets commonly embedded inside the body.
  const cleaned = body
    .replace(/<div[^>]*class=["'][^"']*(?:share|social|follow|subscribe|newsletter|related-posts?|author-box|post-navigation|comments?|widget|sidebar|breadcrumb|tags?)[^"']*["'][\s\S]*?<\/div\s*>/gi, " ")
    .replace(/<ul[^>]*class=["'][^"']*(?:share|social|follow)[^"']*["'][\s\S]*?<\/ul\s*>/gi, " ");
  // 4. Collect candidate links (label + URL) and discard chrome:
  // site nav, tools, social follow, share-intent URLs.
  const seen = new Set();
  const links = [];
  for (const match of cleaned.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a\s*>/gi)) {
    let href = match[1].trim();
    const linkText = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!/^https?:\/\//i.test(href)) continue;
    try {
      href = new URL(href, sourceUrl).toString();
    } catch {
      continue;
    }
    if (CHROME_LINK_PATTERNS.some((re) => re.test(href))) continue;
    if (linkText && CHROME_TEXT_PATTERNS.some((re) => re.test(linkText))) continue;
    const key = href.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(linkText ? (linkText + " | " + href) : href);
    if (links.length >= 30) break;
  }
  const text = cleaned.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 18000);
  return { text, links };
}

function scheduleLabel() {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: INDIA_TIME_ZONE, weekday: "short" }).format(new Date());
  const sunday = weekday === "Sun";
  const firstOfMonth = Number(TODAY.slice(8, 10)) === 1;
  if (sunday && firstOfMonth) return "weekly and monthly";
  if (sunday) return "weekly";
  if (firstOfMonth) return "monthly";
  return "daily";
}

async function getScheduledStories(seen) {
  const results = await Promise.allSettled([
    getNewsStory("Bollywood entertainment", "bollywood", "Hindi", seen),
    getNewsStory("Indian OTT web series Netflix", "web-series", "Hindi", seen),
    getNewsStory("India cricket", "Cricket", "English", seen),
    getMajhiStory(seen),
    getNewsStory("India current affairs", "Current-Affairs", "Marathi", seen),
  ]);
  const stories = [];
  for (const result of results) {
    if (result.status === "fulfilled") stories.push(result.value);
    else console.error("Scheduled story skipped: " + (result.reason && result.reason.message ? result.reason.message : result.reason));
  }
  const label = scheduleLabel();
  if (label !== "daily") {
    const extra = await getMajhiStory(seen, true);
    extra.schedule = label;
    stories.push(extra);
  }
  return stories;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || `story-${Date.now()}`;
}

function existingText() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) files.push(fs.readFileSync(full, "utf8").slice(0, 5000));
    }
  }
  walk(ROOT);
  return files.join("\n");
}

function loadRetentionManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return {};
  }
}

function removeExpiredDrafts(manifest) {
  const now = Date.now();
  for (const [file, generatedAt] of Object.entries(manifest)) {
    if (now - new Date(generatedAt).getTime() <= RETENTION_MS) continue;
    const filePath = path.join(OUTPUT_DIR, file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    delete manifest[file];
    console.log(`Removed expired draft: drafts/generated/${file}`);
  }
}

function addToPublishQueue(source, destination) {
  let queue = [];
  if (fs.existsSync(QUEUE_PATH)) {
    try {
      queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
    } catch {
      queue = [];
    }
  }
  if (!Array.isArray(queue)) queue = [];
  if (!queue.some((item) => item.source === source || item.destination === destination)) {
    queue.push({ source, destination, publishDate: TODAY });
    fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  }
}

async function resolveModel() {
  const apiKey = process.env.GEMINI_API_KEY.trim();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`Gemini models request returned HTTP ${response.status}. Check that the key is a Google AI Studio Gemini key with Generative Language API access. Details: ${await response.text()}`);
  const data = await response.json();
  const models = (data.models || []).filter((model) => model.supportedGenerationMethods?.includes("generateContent"));
  const preferred = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const usable = models.filter((model) => !/gemini-2\.5-flash/i.test(model.name));
  const selected = usable.find((model) => model.name === `models/${preferred}`) || usable.find((model) => /gemini-3\.6-flash/i.test(model.name)) || usable.find((model) => /gemini.*flash/i.test(model.name));
  if (!selected) throw new Error("Gemini returned no model supporting generateContent");
  console.log(`Using Gemini model: ${selected.name.replace(/^models\//, "")}`);
  return selected.name.replace(/^models\//, "");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response, attempt) {
  const retryAfterSeconds = Number.parseFloat(response?.headers.get("retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return Math.ceil(retryAfterSeconds * 1000);
  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

async function createArticle(story, model) {
  const category = story.source.category;
  const careerRules = category === "Career" ? `CAREER MODE (bilingual English core + Marathi quick guide; template v2). ${CAREER_LINK_POLICY} ${CAREER_STYLE_GUIDE} Use "To be announced" for unknown dates, "Not specified in the available source" for other gaps, and label provisional vacancies as provisional.` : "";
  const currentRules = category === "Current-Affairs" ? `CURRENT AFFAIRS MODE (exam-oriented template v2). ${CURRENT_AFFAIRS_STYLE_GUIDE}` : "";
  const lengthRules = category === "Current-Affairs"
    ? `Write a complete-but-concise exam-oriented Current Affairs article. The 'Source page content' below CONTAINS the real current-affairs topics - structure THOSE topics with the template sections and never write an announcement-only digest. Coverage date: ${story.pubDate || story.schedule || TODAY}.`
    : "Write 600-850 words, with 3-5 HTML h2 headings and paragraph tags. Include a useful context section and a closing paragraph.";
  const prompt = `You are an editor for SnapAura News. Create one original, fact-based article from the supplied source lead. Do not invent facts, quotes, numbers, or claims. Attribute every reported fact to the named source and clearly mark uncertainty. ${lengthRules} Return ONLY valid JSON with keys title, description, keywords, bodyHtml, sourceLine. title must be under 60 characters and description under 155 characters. keywords must be a short comma-separated list. sourceLine must name the original publication. The bodyHtml must not include html, head, script, style, or article tags. ${careerRules} ${currentRules}\n\nGoogle trend topic: ${story.trend || "none"}\nCategory: ${category}\nSource title: ${story.title}\nSource description: ${story.description}\nSource page content: ${(story.rawContent || "").slice(0, 18000)}\nSource URL: ${story.sourceUrl || story.link}\nOriginal important links: ${(story.importantLinks || []).join("\n")}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY.trim())}`;
  const request = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ generationConfig: { temperature: 0.2, responseMimeType: "application/json" }, contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  };
  let data;
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(url, request);
    } catch (error) {
      if (attempt === GEMINI_MAX_ATTEMPTS) throw new Error(`Gemini generateContent request failed after ${attempt} attempts: ${error.message}`);
      const delay = retryDelay(null, attempt);
      console.warn(`Gemini request failed (${error.message}); retrying in ${delay / 1000}s (attempt ${attempt + 1}/${GEMINI_MAX_ATTEMPTS}).`);
      await sleep(delay);
      continue;
    }
    if (response.ok) {
      data = await response.json();
      break;
    }
    const details = await response.text();
    if (!RETRYABLE_GEMINI_STATUS_CODES.has(response.status) || attempt === GEMINI_MAX_ATTEMPTS) {
      throw new Error(`Gemini generateContent returned HTTP ${response.status}. Check API access, quota, and key restrictions. Details: ${details}`);
    }
    const delay = retryDelay(response, attempt);
    console.warn(`Gemini generateContent returned HTTP ${response.status}; retrying in ${delay / 1000}s (attempt ${attempt + 1}/${GEMINI_MAX_ATTEMPTS}).`);
    await sleep(delay);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no article content");
  const article = JSON.parse(text);
  sanitizeArticleBody(article, story);
  return article;
}
// Marketing/clickbait CTAs banned in Career bodies (template v2 §17, §21).
const BANNED_CTA_PATTERNS = [
  /click\s*here(\s*!{2,}|!)/gi,
  /apply\s*now(\s*!{2,}|!)/gi,
  /golden\s*opportunity/gi,
  /best\s*government\s*job/gi,
  /life[- ]changing\s*(job|opportunity)/gi,
  /don'?t\s*miss(\s*this)?\s*!{2,}/gi,
  /limited\s*time\s*(offer|chance)/gi,
  /hurry\s*!{1,}/gi,
];

// Career template v2 structural check: warn (never fabricate) when a
// required section is missing from a Career body.
function careerStructureWarnings(html) {
  const warnings = [];
  const required = [
    ["At a Glance card", /At a Glance|snap-glance/i],
    ["Can I Apply? section", /Can I Apply\?/i],
    ["Marathi full-coverage section", /मराठीत/i],
    ["Important Links section", /Important Links/i],
  ];
  for (const [name, re] of required) {
    if (!re.test(html)) warnings.push("missing " + name);
  }
  return warnings;
}

// Current Affairs template v2 structural check: warn (never fabricate) when a
// required section is missing from a Current Affairs body.
function currentAffairsStructureWarnings(html) {
  const warnings = [];
  const required = [
    ["Quick Scan table", /Quick Scan/i],
    ["Prelims Focus section", /Prelims Focus/i],
    ["1-Minute Revision section", /1.?Minute Revision/i],
    ["Quick Quiz section", /Quick Quiz/i],
    ["Marathi quick revision", /मराठीत/i],
    ["at least one topic heading", /<h2\b/],
  ];
  for (const [name, re] of required) {
    if (!re.test(html)) warnings.push("missing " + name);
  }
  return warnings;
}

function stripBannedCtas(html) {
  let out = html;
  for (const re of BANNED_CTA_PATTERNS) out = out.replace(re, "");
  return out.replace(/!{2,}/g, "!");
}

// Remove generic-filler paragraphs (the announcement-only digest anti-pattern).
// Whole-paragraph removal avoids leaving sentence fragments behind.
function stripCaFiller(html) {
  let out = html;
  for (const re of CA_BANNED_PHRASES) {
    out = out.replace(new RegExp("<p[^>]*>[\\s\\S]*?(?:" + re.source + ")[\\s\\S]*?</p\\s*>", "gi"), "");
  }
  return out;
}

// Safety net: Career bodies keep at most 3 curated official links and 12
// anchors total; Current Affairs bodies keep no Important-Links link farm.
function sanitizeArticleBody(article, story) {
  if (!article || typeof article.bodyHtml !== "string") return;
  let html = article.bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  html = html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a\s*>/gi, (tag, href) => {
    const url = String(href || "").trim();
    if (!/^https?:\/\//i.test(url)) return tag;
    if (CHROME_LINK_PATTERNS.some((re) => re.test(url))) return "";
    return tag;
  });
  const anchorCount = (html.match(/<a\b/gi) || []).length;
  const isCareer = story && story.source && story.source.category === "Career";
  const isCurrentAffairs = story && story.source && story.source.category === "Current-Affairs";
  const maxAnchors = isCareer ? 12 : 15;
  if (isCareer) {
    html = stripBannedCtas(html);
    html = enforceCareerImportantLinks(html, story);
    const warnings = careerStructureWarnings(html);
    if (warnings.length > 0) {
      console.warn(`Career template v2 warnings: ${warnings.join("; ")}.`);
    }
  }
  if (isCurrentAffairs) {
    html = stripCaFiller(html);
    // Current Affairs pages must not become link farms: drop any model-written
    // Important Links block - the page template adds the original source link.
    html = html.replace(/<h2[^>]*>\s*Important Links[^<]*<\/h2\s*>\s*(<p[^>]*>[\s\S]{0,400}?<\/p\s*>)?\s*<ul[\s\S]*?<\/ul\s*>/i, "");
    const warnings = currentAffairsStructureWarnings(html);
    if (warnings.length > 0) {
      console.warn(`Current Affairs template v2 warnings: ${warnings.join("; ")}.`);
    }
  }
  if (anchorCount > maxAnchors) {
    // Prefer to drop the appended Important Links dump first: it is the
    // known failure mode (155 raw majhinaukri.in URLs in one <ul>).
    const withoutDump = html.replace(/<h2[^>]*>\s*Important Links\s*<\/h2\s*>\s*<ul[\s\S]*?<\/ul\s*>/i, "");
    html = (withoutDump.match(/<a\b/gi) || []).length <= anchorCount ? withoutDump : html;
  }
  article.bodyHtml = html;
}

function escapeHtmlAttr(value) {
  return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Rebuild Career Important Links from curated official URLs only.
// Labels fixed; hrefs are curated source URLs (never invented).
// Returns "" when nothing official survived (omit, don't guess).
function buildCareerImportantLinks(curated) {
  const list = (Array.isArray(curated) ? curated : []).slice(0, 3);
  if (list.length === 0) return "";
  const labelFor = function (url) {
    const slot = classifyCareerLink(url, "");
    if (slot === "notification") return "Notification (PDF)";
    if (slot === "apply") return "Online Application";
    return "Official Website";
  };
  const items = list.map(function (url) { return "  <li><a href=\"" + escapeHtmlAttr(url) + "\" rel=\"noopener noreferrer nofollow\">" + labelFor(url) + "</a></li>"; }).join("\n");
  return "<h2>Important Links</h2>\n<p>Preserved application and information links from the original notification source:</p>\n<ul class=\"snap-important-links\">\n" + items + "\n</ul>";
}

function curateCareerLinks(links) {
  const picked = { notification: null, apply: null, website: null };
  const seen = {};
  const queue = Array.isArray(links) ? links : [];
  const cands = [];
  for (const entry of queue) {
    const line = String(entry == null ? "" : entry).trim();
    if (!line) continue;
    const m = line.match(/https?:\/\/[^\s|<>"]+/i);
    const url = m ? m[0].trim() : "";
    if (!url) continue;
    const label = line.replace(url, " ").trim();
    cands.push({ url: url, label: label });
  }
  const rank = function (c) {
    const slot = classifyCareerLink(c.url, c.label);
    if (slot === "notification") return 0;
    if (slot === "apply") return 1;
    if (slot === "website") return 2;
    return 9;
  };
  cands.sort(function (a, b) { return rank(a) - rank(b); });
  for (const c of cands) {
    const key = c.url.toLowerCase().replace(/\/$/, "");
    if (seen[key]) continue;
    seen[key] = true;
    const slot = classifyCareerLink(c.url, c.label);
    if (!slot || picked[slot]) continue;
    try { picked[slot] = new URL(c.url).toString(); } catch (e) { continue; }
    if (picked.notification && picked.apply && picked.website) break;
  }
  const out = [];
  if (picked.notification) out.push(picked.notification);
  if (picked.apply) out.push(picked.apply);
  if (picked.website) out.push(picked.website);
  return out.slice(0, 3);
}

// Replace ANY model-written Important Links block with the curated one.
// Also strips model-invented anchors that match banned chrome patterns.
function enforceCareerImportantLinks(html, story) {
  let out = String(html == null ? "" : html);
  const curated = curateCareerLinks(story && story.importantLinks ? story.importantLinks : []);
  const block = buildCareerImportantLinks(curated);
  const pattern = /<h2[^>]*>\s*Important Links[^<]*<\/h2\s*>\s*(<p[^>]*>[\s\S]{0,400}?<\/p\s*>)?\s*<ul[\s\S]*?<\/ul\s*>/i;
  if (pattern.test(out)) { out = out.replace(pattern, block || ""); }
  else if (block) { out = out + "\n" + block; }
  return out;
}

function findRelatedArticles(category, currentFile, limit) {
  const categoryDir = path.join(ROOT, category);
  if (!fs.existsSync(categoryDir)) return [];
  const max = Math.max(1, Math.min(3, Number(limit) || 2));
  const files = fs.readdirSync(categoryDir).filter(function (f) { return f.endsWith(".html") && f !== currentFile; }).slice(0, max);
  const out = [];
  for (const file of files) {
    let title = file;
    try {
      const page = fs.readFileSync(path.join(categoryDir, file), "utf8");
      const m = page.match(/<title>([^<]+)</i);
      title = (m ? m[1] : file).replace(/\s*[-–]\s*SnapAura.*$/i, "").trim() || file;
    } catch (e) { title = file; }
    out.push({ href: ("../../" + category + "/" + file), title: title });
  }
  return out;
}

function renderArticle(article, story) {
  const filename = `${slugify(article.title)}.html`;
  const relative = `${story.source.category}/${filename}`;
  const canonical = `${BASE_URL}/${relative}`;
  const isCareer = story.source.category === "Career";
  const isCurrentAffairs = story.source.category === "Current-Affairs";
  const locale = "en_IN";
  const language = "en";
  const categoryPage = `${story.source.category}.html`;
  const related = isCareer || isCurrentAffairs ? findRelatedArticles(story.source.category, filename, 3) : findRelatedArticles(story.source.category, filename, 1);
  const relatedHeading = isCareer ? "More Career Updates" : isCurrentAffairs ? "More Current Affairs" : "Related coverage";
  const relatedHtml = related.length === 0 ? "" : `<hr class="my-5"><div class="related-post"><h3>${relatedHeading}</h3>` + related.map(function (r) { return `<a href="${r.href}">${r.title}</a>`; }).join("") + `</div>`;
  const pageKey = slugify(article.title);
  const showImage = !IMAGELESS_CATEGORIES.has(story.source.category);
  const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: article.title, ...(showImage ? { image: [`${BASE_URL}/${story.source.image}`] } : {}), datePublished: TODAY, author: { "@type": "Organization", name: "SnapAura" }, publisher: { "@type": "Organization", name: "SnapAura" }, description: article.description });
  const imageMetadata = showImage ? `  <meta property="og:image" content="${BASE_URL}/${story.source.image}">
  <meta name="twitter:image" content="${BASE_URL}/${story.source.image}">
` : "";
  const articleImage = showImage ? `      <img src="../../${story.source.image}" alt="${article.title}" class="snap-image" width="800" height="450">
` : "";
  const twitterCard = showImage ? "summary_large_image" : "summary";
  const careerCss = isCareer ? "  <style>.snap-glance{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0;padding:16px;border:1px solid #e9ecef;border-radius:14px;background:#f8f9fa;}.snap-glance div{background:#fff;border:1px solid #eef0f2;border-radius:10px;padding:10px 12px;font-size:.92rem;}.snap-glance strong{display:block;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:#6c757d;margin-bottom:2px;}.snap-deadline{border-left:4px solid #dc3545;background:#fff5f5;border-radius:12px;padding:14px 16px;margin:18px 0;}.snap-important-links{list-style:none;padding:0;margin:12px 0;display:grid;gap:10px;}.snap-important-links a{display:block;padding:12px 16px;border:1px solid #dee2e6;border-radius:12px;text-decoration:none;font-weight:600;min-height:44px;}.snap-key{overflow-x:auto;margin:14px 0;border:1px solid #e9ecef;border-radius:12px;}.snap-key table{width:100%;border-collapse:collapse;min-width:320px;}.snap-key th,.snap-key td{text-align:left;padding:10px 12px;border-bottom:1px solid #eef0f2;font-size:.93rem;}.related-post{display:grid;gap:10px;}.related-post a{display:block;padding:10px 12px;border:1px solid #e9ecef;border-radius:10px;text-decoration:none;}.snap-why{list-style:none;padding:12px 14px;margin:14px 0;background:#fffdf2;border:1px solid #fff3cd;border-left:4px solid #ffc107;border-radius:12px;}.snap-why li{padding:3px 0;font-size:.94rem;}.snap-elig{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;}.snap-elig div{background:#fff;border:1px solid #eef0f2;border-radius:10px;padding:10px 12px;font-size:.93rem;}.snap-elig strong{display:block;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:#6c757d;margin-bottom:3px;}.snap-check{list-style:none;padding:12px 14px;margin:14px 0;background:#f8f9fa;border:1px solid #e9ecef;border-radius:12px;}.snap-check li{padding:4px 0;font-size:.94rem;}.snap-mr{background:#fff8f1;border:1px solid #ffe0b2;border-radius:14px;padding:14px 16px;margin:16px 0;}.snap-mr ul{list-style:none;padding:0;margin:10px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:8px;}.snap-mr li{background:#fff;border:1px solid #f2e6d8;border-radius:10px;padding:8px 10px;font-size:.9rem;}@media (max-width:576px){.snap-glance{grid-template-columns:1fr;}.snap-elig{grid-template-columns:1fr;}.snap-mr ul{grid-template-columns:1fr;}}</style>\n" : "";
const caCss = isCurrentAffairs ? "  <style>.ca-scan{overflow-x:auto;margin:14px 0;border:1px solid #e9ecef;border-radius:12px;}.ca-scan table{width:100%;border-collapse:collapse;min-width:260px;}.ca-scan th,.ca-scan td{text-align:left;padding:9px 12px;border-bottom:1px solid #eef0f2;font-size:.93rem;}.ca-topic{margin:18px 0;padding:14px 16px;border:1px solid #e9ecef;border-radius:14px;background:#fcfcfd;}.ca-facts{list-style:none;padding:10px 12px;margin:10px 0;background:#f8f9fa;border:1px solid #e9ecef;border-radius:12px;}.ca-facts li{padding:3px 0;font-size:.93rem;}.ca-rev{margin:14px 0;padding:14px 16px;background:#eef6ff;border:1px solid #cfe4fb;border-left:4px solid #0d6efd;border-radius:12px;}.ca-rev ol{margin:0;padding-left:20px;}.ca-rev li{padding:2px 0;font-size:.93rem;}.ca-quiz{margin:14px 0;padding:14px 16px;background:#fff;border:1px solid #e9ecef;border-radius:12px;}.ca-quiz p{margin:6px 0;}.ca-mr{background:#fff8f1;border:1px solid #ffe0b2;border-radius:14px;padding:14px 16px;margin:16px 0;}.ca-mr ul{list-style:none;padding:0;margin:8px 0 0;}.ca-mr li{padding:2px 0;font-size:.93rem;}.ca-focus{background:#f4f9ff;border:1px solid #d6e9ff;border-radius:12px;padding:12px 14px;margin:14px 0;}@media (max-width:576px){.ca-topic{padding:12px;}.ca-scan table{min-width:240px;}}</style>\n" : "";
  const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="google-adsense-account" content="ca-pub-1892357947938832">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <meta name="author" content="SnapAura News Desk">
  <meta name="robots" content="noindex, nofollow">
  <title>${article.title} - SnapAura</title>
  <meta name="description" content="${article.description}">
  <meta name="keywords" content="${article.keywords || story.source.category}">
  <meta name="news_keywords" content="${article.keywords || story.source.category}">
  <meta property="og:title" content="${article.title} - SnapAura">
  <meta property="og:description" content="${article.description}">
${imageMetadata}  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="${locale}">
  <meta property="article:published_time" content="${TODAY}T00:00:00+05:30">
  <meta property="article:section" content="${story.source.category}">
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:title" content="${article.title} - SnapAura">
  <meta name="twitter:description" content="${article.description}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/x-icon" href="../../assets/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400;1,700&family=Merriweather:wght@400;700&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.3.0/css/all.min.css" crossorigin="anonymous">
  <link rel="stylesheet" href="../../css/styles.css">
${careerCss}${caCss}  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1892357947938832" crossorigin="anonymous"></script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-DJQ7J0Y2RG"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-DJQ7J0Y2RG');</script>
  <script type="application/ld+json">${schema}</script>
</head>
<body>
  <div class="top-brand-bar">
    <div class="container d-flex justify-content-center align-items-center flex-wrap py-2">
      <div class="brand-links d-flex flex-wrap gap-3">
        <a href="../../index.html">SnapAura Space</a>
        <a class="nav-link" href="../../bollywood.html">SnapAura Hindi</a>
        <a class="nav-link" href="../../web-series.html">SnapAura OTT</a>
        <a class="nav-link" href="../../Career.html">SnapAura Career</a>
      </div>
    </div>
  </div>
  <nav class="category-nav site-chrome">
    <ul class="d-flex flex-wrap justify-content-center gap-4 py-2 list-unstyled mb-0">
      <li><a class="nav-link" href="../../latest.html">Latest</a></li>
      <li><a class="nav-link" href="../../bollywood.html">Bollywood</a></li>
      <li><a class="nav-link" href="../../web-series.html">Web Series</a></li>
      <li><a class="nav-link" href="../../Review/">Reviews</a></li>
      <li><a class="nav-link" href="../../cricket.html">Cricket</a></li>
      <li><a class="nav-link" href="../../Career.html">Career</a></li>
      <li><a class="nav-link" href="../../Current-Affairs.html">Current Affairs</a></li>
    </ul>
  </nav>
  <header class="masthead clean-header site-chrome">
    <div class="container position-relative px-4 px-lg-5 text-center">
      <div class="row gx-4 gx-lg-5 justify-content-center">
        <div class="col-md-10 col-lg-8 col-xl-7">
          <div class="post-heading">
            <h1 class="post-title">${article.title}</h1>
            <span class="meta">SnapAura ${story.source.category} Desk – ${TODAY}</span>
            <hr class="purple-divider" />
          </div>
        </div>
      </div>
    </div>
  </header>
  <article class="mb-4"><div class="container px-4 px-lg-5"><div class="row justify-content-center"><div class="col-md-10 col-lg-8 col-xl-7">
${articleImage}      ${article.bodyHtml}
      ${isCareer ? "" : `      <p class="snap-source small text-muted">${article.sourceLine} <a href="${story.sourceUrl || story.link}" rel="noopener noreferrer">Original report</a></p>`}
      <p><a href="../../${categoryPage}">More ${story.source.category} coverage</a></p>
      ${relatedHtml}
      <div class="engagement-bar"><button id="like-btn" aria-label="Like">Like <span id="like-count">0</span></button><button id="dislike-btn" aria-label="Dislike">Dislike <span id="dislike-count">0</span></button><button id="share-btn" aria-label="Share">Share</button></div>
    </div></div></div></article>
  <footer class="bg-dark text-light pt-5 pb-3 site-chrome"><div class="container"><div class="row"><div class="col-md-3"><h5>SnapAura</h5><p>SnapAura is an entertainment &amp; career updates platform bringing you the latest on Bollywood, web series, and the film industry.</p></div><div class="col-md-3"><h5>Categories</h5><ul class="list-unstyled"><li><a href="${BASE_URL}/bollywood.html" class="text-light">Bollywood</a></li><li><a href="${BASE_URL}/web-series.html" class="text-light">Web Series</a></li><li><a href="${BASE_URL}/cricket.html" class="text-light">Cricket</a></li><li><a href="${BASE_URL}/Career.html" class="text-light">Career</a></li></ul></div><div class="col-md-3"><h5>Quick Links</h5><ul class="list-unstyled"><li><a href="${BASE_URL}/index.html" class="text-light">Home</a></li><li><a href="${BASE_URL}/about.html" class="text-light">About</a></li><li><a href="${BASE_URL}/contact.html" class="text-light">Contact Us</a></li><li><a href="${BASE_URL}/privacy-policy.html" class="text-light">Privacy Policy</a></li></ul></div><div class="col-md-3"><h5>Social Media</h5><a href="https://www.facebook.com/profile.php?id=100067758124332" class="text-light me-2"><i class="fab fa-facebook-f"></i></a><a href="https://www.instagram.com/snapaura.space" class="text-light me-2"><i class="fab fa-instagram"></i></a><a href="https://youtube.com/@snapaura-space" class="text-light"><i class="fab fa-youtube"></i></a></div></div><hr class="bg-secondary"><div class="text-center small">© 2026 SnapAura | Trusted Entertainment &amp; Career Updates | <a href="#top" class="text-light">Back to Top</a></div></div></footer>
  <script src="../../js/scripts.js"></script><script>const pageKey='${pageKey}';for(const type of ['likes','dislikes'])document.getElementById(type==='likes'?'like-count':'dislike-count').textContent=localStorage.getItem(type+'_'+pageKey)||'0';document.getElementById('like-btn').onclick=()=>{const k='likes_'+pageKey;localStorage.setItem(k,Number(localStorage.getItem(k)||0)+1);location.reload();};document.getElementById('dislike-btn').onclick=()=>{const k='dislikes_'+pageKey;localStorage.setItem(k,Number(localStorage.getItem(k)||0)+1);location.reload();};document.getElementById('share-btn').onclick=()=>navigator.share?navigator.share({title:document.title,url:location.href}):navigator.clipboard.writeText(location.href);</script>
</body>
</html>
`;
  return { relative, html };
}
/* <html lang="${story.source.language === "English" ? "en" : "hi"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="author" content="SnapAura News Desk">
  <meta name="robots" content="noindex, nofollow">
  <title>${article.title} - SnapAura</title>
  <meta name="description" content="${article.description}">
  <meta property="og:title" content="${article.title} - SnapAura">
  <meta property="og:description" content="${article.description}">
  <meta property="og:image" content="${BASE_URL}/${story.source.image}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="${locale}">
  <link rel="canonical" href="${canonical}">
  <link rel="stylesheet" href="../../css/styles.css">
  <script type="application/ld+json">${schema}</script>
</head>
<body>
  <main class="container px-4 px-lg-5 py-4">
    <article>
      <h1>${article.title}</h1>
      <p class="post-meta">SnapAura News Desk - ${TODAY}</p>
      <img src="../../${story.source.image}" alt="${article.title}" width="800" height="450">
      ${article.bodyHtml}
      <p class="snap-source small">${article.sourceLine} <a href="${story.link}" rel="noopener noreferrer">Original report</a></p>
      <p><a href="../../${categoryPage}">More ${story.source.category} coverage</a></p>
    </article>
  </main>
  <footer class="bg-dark text-light pt-5 pb-3">
    <div class="container">
      <div class="row">
        <div class="col-md-3"><h5>SnapAura</h5><p>SnapAura is an entertainment &amp; career updates platform bringing you the latest on Bollywood, web series, and the film industry.</p></div>
        <div class="col-md-3"><h5>Categories</h5><ul class="list-unstyled"><li><a href="https://snapaura.space/bollywood.html" class="text-light">Bollywood</a></li><li><a href="https://snapaura.space/web-series.html" class="text-light">Web Series</a></li><li><a href="https://snapaura.space/cricket.html" class="text-light">Cricket</a></li><li><a href="https://snapaura.space/Career.html" class="text-light">Career</a></li></ul></div>
        <div class="col-md-3"><h5>Quick Links</h5><ul class="list-unstyled"><li><a href="https://snapaura.space/index.html" class="text-light">Home</a></li><li><a href="https://snapaura.space/about.html" class="text-light">About</a></li><li><a href="https://snapaura.space/contact.html" class="text-light">Contact Us</a></li><li><a href="https://snapaura.space/privacy-policy.html" class="text-light">Privacy Policy</a></li></ul></div>
        <div class="col-md-3"><h5>Social Media</h5><a href="https://www.facebook.com/profile.php?id=100067758124332" class="text-light me-2" target="_blank" rel="noopener noreferrer"><i class="fab fa-facebook-f"></i></a><a href="https://www.instagram.com/snapaura.space" class="text-light me-2" target="_blank" rel="noopener noreferrer"><i class="fab fa-instagram"></i></a><a href="https://youtube.com/@snapaura-space" class="text-light" target="_blank" rel="noopener noreferrer"><i class="fab fa-youtube"></i></a></div>
      </div>
      <hr class="bg-secondary" />
      <div class="text-center small">© 2026 SnapAura | Trusted Entertainment &amp; Career Updates | <a href="#top" class="text-light">🔝 Back to Top</a></div>
    </div>
  </footer>
</body>
</html>
`;
  return { relative, html };
}
*/

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const retentionManifest = loadRetentionManifest();
  removeExpiredDrafts(retentionManifest);
  const model = await resolveModel();
  const seen = existingText();
  const stories = await getScheduledStories(seen);
  if (stories.length === 0) throw new Error("No scheduled category stories were found");
  for (const [index, story] of stories.entries()) {
    if (story.source.category === "Current-Affairs") {
      // MOST IMPORTANT rule: never generate a Current Affairs article from an
      // announcement-only lead. Attempt to retrieve the complete source first;
      // if the source truly has no topics, skip generation instead of faking.
      const ready = await enrichCurrentAffairsStory(story);
      if (!ready) {
        console.warn(`Skipped Current-Affairs draft '${story.title}': source is an announcement-only lead with no actual topics.`);
        continue;
      }
    }
    const article = await createArticle(story, model);
    const rendered = renderArticle(article, story);
    const output = path.join(OUTPUT_DIR, `${String(index + 1).padStart(2, "0")}-${path.basename(rendered.relative)}`);
    fs.writeFileSync(output, rendered.html, "utf8");
    retentionManifest[path.basename(output)] = new Date().toISOString();
    addToPublishQueue(`drafts/generated/${path.basename(output)}`, rendered.relative);
    console.log(`Draft created: drafts/generated/${path.basename(output)} (${story.source.category})`);
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(retentionManifest, null, 2)}\n`, "utf8");
}

if (process.env.NODE_ENV === "test") {
  module.exports = {
    extractArticleBody,
    sanitizeArticleBody,
    classifyCareerLink,
    curateCareerLinks,
    buildCareerImportantLinks,
    enforceCareerImportantLinks,
    careerStructureWarnings,
    currentAffairsStructureWarnings,
    renderArticle,
    stripBannedCtas,
    stripCaFiller,
    hasCurrentAffairsTopics,
    BANNED_CTA_PATTERNS,
    CA_BANNED_PHRASES,
    CURRENT_AFFAIRS_STYLE_GUIDE,
    CAREER_LINK_POLICY,
    CAREER_STYLE_GUIDE,
    CHROME_LINK_PATTERNS,
    CHROME_TEXT_PATTERNS,
  };
} else {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
