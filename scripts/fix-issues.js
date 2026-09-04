#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = "https://snapaura.space";

const CATEGORY_HUBS = [
  { file: "bollywood.html", url: "/bollywood.html" },
  { file: "cricket.html", url: "/cricket.html" },
  { file: "web-series.html", url: "/web-series.html" },
  { file: "Career.html", url: "/Career.html" },
  { file: "Current-Affairs.html", url: "/Current-Affairs.html" },
  { file: "latest.html", url: "/latest.html" },
  { file: "live.html", url: "/live.html" },
];

const CATEGORY_INDEX_PAGES = [
  { file: "Review/index.html", url: "/Review/index.html" },
];

function fixCategoryHubs() {
  for (const hub of CATEGORY_HUBS) {
    const filePath = path.join(ROOT, hub.file);
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP: ${hub.file} not found`);
      continue;
    }
    let html = fs.readFileSync(filePath, "utf-8");
    let changed = false;

    if (!html.includes('rel="canonical"')) {
      html = html.replace(
        /(<link[^>]*href="[^"]*styles\.css"[^>]*\/?>)/i,
        `$1\n  <link rel="canonical" href="${BASE_URL}${hub.url}" />`
      );
      changed = true;
    }

    if (!html.includes('name="robots"')) {
      html = html.replace(
        /(<meta\s+name="author"[^>]*\/?>)/i,
        `$1\n  <meta name="robots" content="index, follow" />`
      );
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(filePath, html, "utf-8");
      console.log(`  FIXED: ${hub.file}`);
    } else {
      console.log(`  OK: ${hub.file}`);
    }
  }

  for (const hub of CATEGORY_INDEX_PAGES) {
    const filePath = path.join(ROOT, hub.file);
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP: ${hub.file} not found`);
      continue;
    }
    let html = fs.readFileSync(filePath, "utf-8");
    let changed = false;

    if (!html.includes('rel="canonical"')) {
      html = html.replace(
        /(<link[^>]*href="[^"]*styles\.css"[^>]*\/?>)/i,
        `$1\n  <link rel="canonical" href="${BASE_URL}${hub.url}" />`
      );
      changed = true;
    }

    if (!html.includes('name="robots"')) {
      const authorMatch = html.match(/<meta\s+name="author"[^>]*\/?>/i);
      if (authorMatch) {
        html = html.replace(
          authorMatch[0],
          `${authorMatch[0]}\n  <meta name="robots" content="index, follow" />`
        );
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, html, "utf-8");
      console.log(`  FIXED: ${hub.file}`);
    } else {
      console.log(`  OK: ${hub.file}`);
    }
  }
}

function fixIndexPage() {
  const filePath = path.join(ROOT, "index.html");
  let html = fs.readFileSync(filePath, "utf-8");
  let changed = false;

  if (!html.includes('name="robots"')) {
    const authorMatch = html.match(/<meta\s+name="author"[^>]*\/?>/i);
    if (authorMatch) {
      html = html.replace(
        authorMatch[0],
        `${authorMatch[0]}\n  <meta name="robots" content="index, follow" />`
      );
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, html, "utf-8");
    console.log(`  FIXED: index.html`);
  } else {
    console.log(`  OK: index.html`);
  }
}

function addCanonicalToArticle(relPath) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) return false;
  let html = fs.readFileSync(filePath, "utf-8");

  if (html.includes('rel="canonical"')) return false;

  const url = `${BASE_URL}/${relPath.replace(/\\/g, "/")}`;

  const cssLinkMatch = html.match(/<link[^>]*href="[^"]*styles\.css"[^>]*\/?>/i);
  if (cssLinkMatch) {
    html = html.replace(cssLinkMatch[0], `${cssLinkMatch[0]}\n  <link rel="canonical" href="${url}" />`);
  } else {
    html = html.replace(
      /<\/head>/i,
      `  <link rel="canonical" href="${url}" />\n</head>`
    );
  }

  fs.writeFileSync(filePath, html, "utf-8");
  return true;
}

function addOgDescription(relPath) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) return false;
  let html = fs.readFileSync(filePath, "utf-8");

  if (html.includes('og:description') || html.includes('og\\:description')) return false;

  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  if (!descMatch) return false;

  const desc = descMatch[1];
  const ogUrlMatch = html.match(/<meta\s+property="og:url"[^>]*>/i);

  if (ogUrlMatch) {
    html = html.replace(
      ogUrlMatch[0],
      `${ogUrlMatch[0]}\n  <meta property="og:description" content="${desc.replace(/"/g, "&quot;")}" />`
    );
  } else {
    const ogImageMatch = html.match(/<meta\s+property="og:image"[^>]*>/i);
    if (ogImageMatch) {
      html = html.replace(
        ogImageMatch[0],
        `${ogImageMatch[0]}\n  <meta property="og:description" content="${desc.replace(/"/g, "&quot;")}" />`
      );
    }
  }

  fs.writeFileSync(filePath, html, "utf-8");
  return true;
}

function addNewsArticleSchema(relPath) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) return false;
  let html = fs.readFileSync(filePath, "utf-8");

  if (html.includes('"@type":"NewsArticle"') || html.includes('"@type": "NewsArticle"')) return false;

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i);
  const datePublishedMatch = html.match(/(\d{4})-(\d{2})-(\d{2})/);

  const headline = titleMatch
    ? titleMatch[1].replace(/\s*[-–—]\s*SnapAura\s*$/i, "").trim()
    : "SnapAura News";
  const description = descMatch ? descMatch[1] : "";
  const image = ogImageMatch
    ? ogImageMatch[1]
    : "https://snapaura.space/assets/favicon.ico";
  const datePublished = datePublishedMatch
    ? `${datePublishedMatch[1]}-${datePublishedMatch[2]}-${datePublishedMatch[3]}`
    : new Date().toISOString().split("T")[0];
  const url = `${BASE_URL}/${relPath.replace(/\\/g, "/")}`;

  const schema = `<script type="application/ld+json">
  {"@context":"https://schema.org","@type":"NewsArticle","headline":"${headline.replace(/"/g, '\\"')}","datePublished":"${datePublished}","dateModified":"${datePublished}","author":{"@type":"Organization","name":"SnapAura"},"publisher":{"@type":"Organization","name":"SnapAura","logo":{"@type":"ImageObject","url":"https://snapaura.space/assets/favicon.ico"}},"image":["${image}"],"description":"${description.replace(/"/g, '\\"')}","mainEntityOfPage":{"@type":"WebPage","@id":"${url}"}}
  </script>`;

  html = html.replace(/<\/head>/i, `${schema}\n</head>`);

  fs.writeFileSync(filePath, html, "utf-8");
  return true;
}

function fixBrokenLinks() {
  const filePath = path.join(ROOT, "bollywood.html");
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, "utf-8");
  html = html.replace(
    /Bollywood\/ranbir-kapoor-mulshi-property-investment\.html/g,
    "bollywood/ranbir-kapoor-mulshi-property-investment.html"
  );
  fs.writeFileSync(filePath, html, "utf-8");
  console.log("  FIXED: bollywood.html broken link");

  const ca1 = path.join(ROOT, "Current-Affairs/july-august-2025-current-affairs.html");
  if (fs.existsSync(ca1)) {
    let html2 = fs.readFileSync(ca1, "utf-8");
    html2 = html2.replace(
      /\.\.\/Bollywood\//g,
      "../bollywood/"
    );
    fs.writeFileSync(ca1, html2, "utf-8");
    console.log("  FIXED: Current-Affairs/july-august-2025-current-affairs.html broken link");
  }

  const ca2 = path.join(ROOT, "Current-Affairs/spardha-pariksha-current-affairs-september-2025.html");
  if (fs.existsSync(ca2)) {
    let html3 = fs.readFileSync(ca2, "utf-8");

    html3 = html3.replace(
      /href="index\.html"/g,
      'href="../index.html"'
    );
    html3 = html3.replace(
      /href="bollywood\.html"/g,
      'href="../bollywood.html"'
    );
    html3 = html3.replace(
      /href="cricket\.html"/g,
      'href="../cricket.html"'
    );
    html3 = html3.replace(
      /href="web-series\.html"/g,
      'href="../web-series.html"'
    );
    html3 = html3.replace(
      /href="Career\.html"/g,
      'href="../Career.html"'
    );
    html3 = html3.replace(
      /href="latest\.html"/g,
      'href="../latest.html"'
    );
    html3 = html3.replace(
      /href="Current-Affairs\.html"/g,
      'href="../Current-Affairs.html"'
    );

    fs.writeFileSync(ca2, html3, "utf-8");
    console.log("  FIXED: Current-Affairs/spardha-pariksha-current-affairs-september-2025.html broken links");
  }
}

const ROOT_ARTICLES = [
  "arijit-singh-news.html",
  "ind-vs-nz-result.html",
  "january-movies.html",
  "ott-jan.html",
  "panchayat-season-5-update.html",
  "pickleball-league-sonyliv.html",
  "post-radhika-apte.html",
  "rcb-wpl-win.html",
  "robin-kaye-news.html",
  "seema-sajdeh-divorce-news.html",
  "shreyas-iyer-back.html",
  "tvk-election-symbol.html",
];

const CATEGORY_ARTICLES = [
  "bollywood/ranbir-kapoor-mulshi-property-investment.html",
  "bollywood/vijay-sangeetha-divorce-court-hearing.html",
  "Cricket/india-vs-zimbabwe-super8-t20-world-cup.html",
  "Career/ssb-constable-bharti-2026.html",
  "Current-Affairs/july-august-2025-current-affairs.html",
  "Current-Affairs/spardha-pariksha-current-affairs-september-2025.html",
  "Music/arijit-singh-retirement-news.html",
  "web-series/accused-netflix-review.html",
  "Review/the-bluff-movie-review.html",
  "Latest/Instagram-bbc-child-safety-investigation.html",
];

const ALL_ARTICLES = [...ROOT_ARTICLES, ...CATEGORY_ARTICLES];

console.log("\n=== FIXING CATEGORY HUBS (canonical + robots) ===\n");
fixCategoryHubs();

console.log("\n=== FIXING INDEX PAGE (robots) ===\n");
fixIndexPage();

console.log("\n=== FIXING BROKEN LINKS ===\n");
fixBrokenLinks();

console.log("\n=== ADDING CANONICAL URLS ===\n");
for (const article of ALL_ARTICLES) {
  const result = addCanonicalToArticle(article);
  console.log(`  ${result ? "FIXED" : "SKIP"}: ${article}`);
}

console.log("\n=== ADDING OG:DESCRIPTION ===\n");
for (const article of ALL_ARTICLES) {
  const result = addOgDescription(article);
  console.log(`  ${result ? "FIXED" : "SKIP"}: ${article}`);
}

console.log("\n=== ADDING NEWSARTICLE SCHEMA ===\n");
for (const article of ALL_ARTICLES) {
  const result = addNewsArticleSchema(article);
  console.log(`  ${result ? "FIXED" : "SKIP"}: ${article}`);
}

console.log("\n=== DONE ===");
console.log("Note: Title shortening, meta description shortening, and content expansion must be done manually per article.");
