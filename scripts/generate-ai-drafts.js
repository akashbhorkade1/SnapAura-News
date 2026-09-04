#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "drafts", "generated");
const BASE_URL = "https://snapaura.space";
const TODAY = new Date().toISOString().slice(0, 10);

const SOURCES = [
  { category: "bollywood", language: "Hindi", feed: "https://news.google.com/rss/search?q=Bollywood+when:1d&hl=en-IN&gl=IN&ceid=IN:en", image: "assets/img/the-bluff-review.jpg" },
  { category: "web-series", language: "Hindi", feed: "https://news.google.com/rss/search?q=OTT+web+series+India+when:1d&hl=en-IN&gl=IN&ceid=IN:en", image: "assets/img/the-bluff-review.jpg" },
  { category: "Cricket", language: "English", feed: "https://news.google.com/rss/search?q=cricket+India+when:1d&hl=en-IN&gl=IN&ceid=IN:en", image: "assets/img/ind-vs-zim-t20.jpg" },
  { category: "Career", language: "English", feed: "https://news.google.com/rss/search?q=India+jobs+exams+education+when:1d&hl=en-IN&gl=IN&ceid=IN:en", image: "assets/img/ssb-constable-bharti-2026.jpg" },
  { category: "Current-Affairs", language: "Hindi", feed: "https://news.google.com/rss/search?q=India+current+affairs+when:1d&hl=en-IN&gl=IN&ceid=IN:en", image: "assets/img/the-bluff-review.jpg" },
];

function xmlDecode(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

async function getStories(source) {
  const response = await fetch(source.feed, { headers: { "user-agent": "SnapAura-News/1.0" } });
  if (!response.ok) throw new Error(`${source.category} feed returned ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 5).map((match) => {
    const item = match[1];
    const read = (tag) => xmlDecode((item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")) || ["", ""])[1]);
    return { title: read("title"), link: read("link"), description: read("description"), source: source };
  }).filter((story) => story.title && story.link);
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

async function createArticle(story) {
  const prompt = `You are an editor for SnapAura News. Create one original, fact-based ${story.source.language} article from the supplied source lead. Do not invent facts, quotes, numbers, or claims. Attribute every reported fact to the named source and clearly mark uncertainty. Write 600-850 words, with 3-5 HTML h2 headings and paragraph tags. Return ONLY valid JSON with keys title, description, bodyHtml, sourceLine. title must be under 60 characters and description under 155 characters. The bodyHtml must not include html, head, script, style, or article tags. Include a useful context section and a closing paragraph.\n\nCategory: ${story.source.category}\nSource title: ${story.title}\nSource description: ${story.description}\nSource URL: ${story.link}`;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ generationConfig: { temperature: 0.2, responseMimeType: "application/json" }, contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no article content");
  return JSON.parse(text);
}

function renderArticle(article, story) {
  const relative = `${story.source.category}/${slugify(article.title)}.html`;
  const canonical = `${BASE_URL}/${relative}`;
  const locale = story.source.language === "English" ? "en_IN" : "hi_IN";
  return { relative, html: `<!DOCTYPE html>\n<html lang="${story.source.language === "English" ? "en" : "hi"}">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="author" content="SnapAura News Desk">\n  <meta name="robots" content="noindex, nofollow">\n  <title>${article.title} - SnapAura</title>\n  <meta name="description" content="${article.description}">\n  <meta property="og:title" content="${article.title} - SnapAura">\n  <meta property="og:description" content="${article.description}">\n  <meta property="og:image" content="${BASE_URL}/${story.source.image}">\n  <meta property="og:url" content="${canonical}">\n  <meta property="og:type" content="article">\n  <meta property="og:locale" content="${locale}">\n  <link rel="stylesheet" href="../css/styles.css">\n  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: article.title, image: [`${BASE_URL}/${story.source.image}`], datePublished: TODAY, author: { "@type": "Organization", name: "SnapAura" }, description: article.description })}</script>\n</head>\n<body>\n  <main class="container px-4 px-lg-5 py-4">\n    <article>\n      <h1>${article.title}</h1>\n      <p class="post-meta">SnapAura News Desk - ${TODAY}</p>\n      <img src="../${story.source.image.replace(/^assets\//, "assets/")}" alt="${article.title}" width="800" height="450">\n      ${article.bodyHtml}\n      <p class="snap-source small">${article.sourceLine} <a href="${story.link}" rel="noopener noreferrer">Original report</a></p>\n      <p><a href="../${story.source.category === "Cricket" ? "cricket.html" : `${story.source.category}.html`}">More ${story.source.category} coverage</a></p>\n    </article>\n  </main>\n</body>\n</html>\n` };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const seen = existingText();
  const stories = (await Promise.all(SOURCES.map(getStories))).flat().filter((story) => !seen.includes(story.link));
  if (stories.length < 3) throw new Error("Fewer than three new stories were found in the configured feeds");
  for (const story of stories.slice(0, 3)) {
    const article = await createArticle(story);
    const rendered = renderArticle(article, story);
    const output = path.join(OUTPUT_DIR, path.basename(rendered.relative));
    fs.writeFileSync(output, rendered.html, "utf8");
    console.log(`Draft created: drafts/generated/${path.basename(output)} (${story.source.category})`);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });