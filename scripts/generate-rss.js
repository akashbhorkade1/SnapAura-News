#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = "https://snapaura.space";

const ARTICLE_CATEGORIES = [
  "bollywood",
  "Cricket",
  "web-series",
  "Music",
  "Career",
  "Current-Affairs",
  "Latest",
  "Review",
];

function isArticlePage(relPath) {
  return ARTICLE_CATEGORIES.some(
    (cat) => relPath.startsWith(cat + "/") || relPath.startsWith(cat + "\\")
  );
}

function extractMeta(html, tag) {
  const re = new RegExp(
    `<meta\\s+(?:name|property)=["']${tag}["']\\s+content=["']([^"']*)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractDatePublished(html) {
  const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function readDescription(html) {
  const desc = extractMeta(html, "description");
  if (desc) return desc;
  const ogDesc = extractMeta(html, "og:description");
  if (ogDesc) return ogDesc;
  return "";
}

function generateRSS() {
  const allHtml = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) allHtml.push(full);
    }
  }
  walk(ROOT);

  const items = [];

  for (const file of allHtml) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (rel === "index.html") continue;
    if (!isArticlePage(rel) && !isRootArticle(rel)) continue;

    const html = fs.readFileSync(file, "utf-8");
    const title = extractTitle(html);
    if (!title || title.includes("PAGE TITLE HERE")) continue;

    const datePub = extractDatePublished(html);
    const desc = readDescription(html);
    const link = `${BASE_URL}/${rel}`;

    items.push({
      title: title.replace(/–\s*SnapAura.*$/i, "").trim(),
      link,
      description: desc,
      pubDate: datePub
        ? new Date(datePub).toUTCString()
        : new Date().toUTCString(),
    });
  }

  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  let rss = '<?xml version="1.0" encoding="UTF-8" ?>\n';
  rss += '<rss version="2.0">\n';
  rss += "  <channel>\n";
  rss += `    <title>SnapAura</title>\n`;
  rss += `    <link>${BASE_URL}</link>\n`;
  rss += `    <description>Bollywood, OTT, Cricket, Career &amp; Current Affairs News</description>\n`;
  rss += `    <language>hi-IN</language>\n`;
  rss += `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;

  for (const item of items.slice(0, 50)) {
    rss += "    <item>\n";
    rss += `      <title>${escapeXml(item.title)}</title>\n`;
    rss += `      <link>${escapeXml(item.link)}</link>\n`;
    rss += `      <description>${escapeXml(item.description)}</description>\n`;
    rss += `      <pubDate>${item.pubDate}</pubDate>\n`;
    rss += "    </item>\n";
  }

  rss += "  </channel>\n";
  rss += "</rss>\n";

  fs.writeFileSync(path.join(ROOT, "rss.xml"), rss, "utf-8");
  console.log(`RSS feed generated with ${Math.min(items.length, 50)} items.`);
}

function isRootArticle(relPath) {
  const rootArticles = fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith(".html"));
  const nonCategoryRoots = rootArticles.filter(
    (f) =>
      ![
        "index.html",
        "bollywood.html",
        "cricket.html",
        "web-series.html",
        "Career.html",
        "Current-Affairs.html",
        "latest.html",
        "live.html",
        "about.html",
        "contact.html",
        "privacy-policy.html",
      ].includes(f)
  );
  return nonCategoryRoots.includes(relPath);
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

generateRSS();
