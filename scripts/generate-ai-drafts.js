#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "drafts", "generated");
const MANIFEST_PATH = path.join(OUTPUT_DIR, ".retention.json");
const RETENTION_MS = 24 * 60 * 60 * 1000;
const BASE_URL = "https://snapaura.space";
const INDIA_TIME_ZONE = "Asia/Kolkata";
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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
  const mainContent = pageContent.match(/<article[\s\S]*?<\/article>/i)?.[0] || pageContent.match(/class=["'][^"']*(?:entry-content|post-content)[^"']*["'][\s\S]*?<\/div>/i)?.[0] || pageContent;
  const importantLinks = [...mainContent.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((link) => /^https?:\/\//i.test(link));
  const cleanContent = mainContent.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 18000);
  return { ...story, sourceUrl: story.link, description: story.description, rawContent: cleanContent, importantLinks, source: { category: currentAffairs ? "Current-Affairs" : "Career", language: currentAffairs ? "Marathi" : "English", image: DEFAULT_IMAGE } };
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
  const stories = await Promise.all([
    getNewsStory("Bollywood entertainment", "bollywood", "Hindi", seen),
    getNewsStory("Indian OTT web series Netflix", "web-series", "Hindi", seen),
    getNewsStory("India cricket", "Cricket", "English", seen),
    getMajhiStory(seen),
    getNewsStory("India current affairs", "Current-Affairs", "Marathi", seen),
  ]);
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
  const careerRules = story.source.category === "Career" ? "Create one article containing clearly labelled English, Hindi, and Marathi sections. Preserve every original important application link supplied in the source inside an HTML Important Links section. Do not invent or alter URLs. Keep source attribution to Majhi Naukri." : "";
  const currentRules = story.source.category === "Current-Affairs" ? `This is a ${story.schedule || "daily"} Current Affairs article. Use a dated, exam-useful roundup structure and state the coverage period accurately.` : "";
  const prompt = `You are an editor for SnapAura News. Create one original, fact-based article from the supplied source lead. Do not invent facts, quotes, numbers, or claims. Attribute every reported fact to the named source and clearly mark uncertainty. Write 600-850 words, with 3-5 HTML h2 headings and paragraph tags. Return ONLY valid JSON with keys title, description, keywords, bodyHtml, sourceLine. title must be under 60 characters and description under 155 characters. keywords must be a short comma-separated list. sourceLine must name the original publication. The bodyHtml must not include html, head, script, style, or article tags. Include a useful context section and a closing paragraph. ${careerRules} ${currentRules}\n\nGoogle trend topic: ${story.trend || "none"}\nCategory: ${story.source.category}\nSource title: ${story.title}\nSource description: ${story.description}\nSource page content: ${(story.rawContent || "").slice(0, 18000)}\nSource URL: ${story.sourceUrl || story.link}\nOriginal important links: ${(story.importantLinks || []).join("\n")}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY.trim())}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ generationConfig: { temperature: 0.2, responseMimeType: "application/json" }, contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini generateContent returned HTTP ${response.status}. Check API access, quota, and key restrictions. Details: ${await response.text()}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no article content");
  const article = JSON.parse(text);
  if (story.source.category === "Career" && story.importantLinks?.length) {
    const links = story.importantLinks.map((link) => `<li><a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a></li>`).join("");
    article.bodyHtml += `<h2>Important Links</h2><ul>${links}</ul>`;
  }
  return article;
}

function findRelatedArticle(category, currentFile) {
  const categoryDir = path.join(ROOT, category);
  if (!fs.existsSync(categoryDir)) return null;
  const candidate = fs.readdirSync(categoryDir).find((file) => file.endsWith(".html") && file !== currentFile);
  if (!candidate) return null;
  const html = fs.readFileSync(path.join(categoryDir, candidate), "utf8");
  const title = (html.match(/<title>([^<]+)</i) || ["", candidate])[1].replace(/\s*[-–]\s*SnapAura.*$/i, "").trim();
  return { href: `../../${category}/${candidate}`, title };
}

function renderArticle(article, story) {
  const filename = `${slugify(article.title)}.html`;
  const relative = `${story.source.category}/${filename}`;
  const canonical = `${BASE_URL}/${relative}`;
  const locale = story.source.language === "English" ? "en_IN" : "hi_IN";
  const language = story.source.language === "English" ? "en" : story.source.language === "Hindi" ? "hi" : "mr";
  const categoryPage = story.source.category === "Cricket" ? "cricket.html" : `${story.source.category}.html`;
  const relatedHeading = language === "en" ? "Related coverage" : language === "hi" ? "संबंधित खबरें" : "संबंधित बातम्या";
  const related = findRelatedArticle(story.source.category, filename);
  const relatedHtml = related ? `<hr class="my-5"><div class="related-post"><h3>${relatedHeading}</h3><a href="${related.href}">${related.title}</a></div>` : "";
  const pageKey = slugify(article.title);
  const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: article.title, image: [`${BASE_URL}/${story.source.image}`], datePublished: TODAY, author: { "@type": "Organization", name: "SnapAura" }, publisher: { "@type": "Organization", name: "SnapAura" }, description: article.description });
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
  <meta property="og:image" content="${BASE_URL}/${story.source.image}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="${locale}">
  <meta property="article:published_time" content="${TODAY}T00:00:00+05:30">
  <meta property="article:section" content="${story.source.category}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${article.title} - SnapAura">
  <meta name="twitter:description" content="${article.description}">
  <meta name="twitter:image" content="${BASE_URL}/${story.source.image}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/x-icon" href="../../assets/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400;1,700&family=Merriweather:wght@400;700&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.3.0/css/all.min.css" crossorigin="anonymous">
  <link rel="stylesheet" href="../../css/styles.css">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1892357947938832" crossorigin="anonymous"></script>
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
  <nav class="category-nav">
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
  <header class="masthead clean-header">
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
      <img src="../../${story.source.image}" alt="${article.title}" class="snap-image" width="800" height="450">
      ${article.bodyHtml}
      <p class="snap-source small text-muted">${article.sourceLine} <a href="${story.sourceUrl || story.link}" rel="noopener noreferrer">Original report</a></p>
      <p><a href="../../${categoryPage}">More ${story.source.category} coverage</a></p>
      ${relatedHtml}
      <div class="engagement-bar"><button id="like-btn" aria-label="Like">Like <span id="like-count">0</span></button><button id="dislike-btn" aria-label="Dislike">Dislike <span id="dislike-count">0</span></button><button id="share-btn" aria-label="Share">Share</button></div>
    </div></div></div></article>
  <footer class="bg-dark text-light pt-5 pb-3"><div class="container"><div class="row"><div class="col-md-3"><h5>SnapAura</h5><p>SnapAura is an entertainment &amp; career updates platform bringing you the latest on Bollywood, web series, and the film industry.</p></div><div class="col-md-3"><h5>Categories</h5><ul class="list-unstyled"><li><a href="${BASE_URL}/bollywood.html" class="text-light">Bollywood</a></li><li><a href="${BASE_URL}/web-series.html" class="text-light">Web Series</a></li><li><a href="${BASE_URL}/cricket.html" class="text-light">Cricket</a></li><li><a href="${BASE_URL}/Career.html" class="text-light">Career</a></li></ul></div><div class="col-md-3"><h5>Quick Links</h5><ul class="list-unstyled"><li><a href="${BASE_URL}/index.html" class="text-light">Home</a></li><li><a href="${BASE_URL}/about.html" class="text-light">About</a></li><li><a href="${BASE_URL}/contact.html" class="text-light">Contact Us</a></li><li><a href="${BASE_URL}/privacy-policy.html" class="text-light">Privacy Policy</a></li></ul></div><div class="col-md-3"><h5>Social Media</h5><a href="https://www.facebook.com/profile.php?id=100067758124332" class="text-light me-2"><i class="fab fa-facebook-f"></i></a><a href="https://www.instagram.com/snapaura.space" class="text-light me-2"><i class="fab fa-instagram"></i></a><a href="https://youtube.com/@snapaura-space" class="text-light"><i class="fab fa-youtube"></i></a></div></div><hr class="bg-secondary"><div class="text-center small">© 2026 SnapAura | Trusted Entertainment &amp; Career Updates | <a href="#top" class="text-light">Back to Top</a></div></div></footer>
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
  if (stories.length < 5) throw new Error(`Fewer than five scheduled category stories were found; found ${stories.length}`);
  for (const [index, story] of stories.entries()) {
    const article = await createArticle(story, model);
    const rendered = renderArticle(article, story);
    const output = path.join(OUTPUT_DIR, `${String(index + 1).padStart(2, "0")}-${path.basename(rendered.relative)}`);
    fs.writeFileSync(output, rendered.html, "utf8");
    retentionManifest[path.basename(output)] = new Date().toISOString();
    console.log(`Draft created: drafts/generated/${path.basename(output)} (${story.source.category})`);
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(retentionManifest, null, 2)}\n`, "utf8");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });