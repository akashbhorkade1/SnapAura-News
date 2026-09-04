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

async function createArticle(story, model) {
  const prompt = `You are an editor for SnapAura News. Create one original, fact-based ${story.source.language} article from the supplied source lead. Do not invent facts, quotes, numbers, or claims. Attribute every reported fact to the named source and clearly mark uncertainty. Write 600-850 words, with 3-5 HTML h2 headings and paragraph tags. Return ONLY valid JSON with keys title, description, bodyHtml, sourceLine. title must be under 60 characters and description under 155 characters. The bodyHtml must not include html, head, script, style, or article tags. Include a useful context section and a closing paragraph.\n\nCategory: ${story.source.category}\nSource title: ${story.title}\nSource description: ${story.description}\nSource URL: ${story.link}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY.trim())}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ generationConfig: { temperature: 0.2, responseMimeType: "application/json" }, contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini generateContent returned HTTP ${response.status}. Check API access, quota, and key restrictions. Details: ${await response.text()}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no article content");
  return JSON.parse(text);
}

function renderArticle(article, story) {
  const relative = `${story.source.category}/${slugify(article.title)}.html`;
  const canonical = `${BASE_URL}/${relative}`;
  const locale = story.source.language === "English" ? "en_IN" : "hi_IN";
  const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: article.title, image: [`${BASE_URL}/${story.source.image}`], datePublished: TODAY, author: { "@type": "Organization", name: "SnapAura" }, description: article.description });
  const categoryPage = story.source.category === "Cricket" ? "cricket.html" : `${story.source.category}.html`;
  const html = `<!DOCTYPE html>
<html lang="${story.source.language === "English" ? "en" : "hi"}">
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
  <footer><a href="../../privacy-policy.html">Privacy Policy</a> <a href="https://www.facebook.com/snapaura"><i class="fab fa-facebook"></i></a></footer>
</body>
</html>
`;
  return { relative, html };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const model = await resolveModel();
  const seen = existingText();
  const results = await Promise.allSettled(SOURCES.map(getStories));
  const feedErrors = results.filter((result) => result.status === "rejected").map((result) => result.reason.message);
  const stories = results.filter((result) => result.status === "fulfilled").flatMap((result) => result.value).filter((story) => !seen.includes(story.link));
  if (feedErrors.length > 0) console.warn(`Feed warnings: ${feedErrors.join("; ")}`);
  if (stories.length < 3) throw new Error("Fewer than three new stories were found in the configured feeds");
  for (const [index, story] of stories.slice(0, 3).entries()) {
    const article = await createArticle(story, model);
    const rendered = renderArticle(article, story);
    const output = path.join(OUTPUT_DIR, `${String(index + 1).padStart(2, "0")}-${path.basename(rendered.relative)}`);
    fs.writeFileSync(output, rendered.html, "utf8");
    console.log(`Draft created: drafts/generated/${path.basename(output)} (${story.source.category})`);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });