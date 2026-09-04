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

const TRUST_PAGES = [
  "privacy-policy.html",
  "about.html",
  "contact.html",
];

const CATEGORY_HUBS = [
  "bollywood.html",
  "cricket.html",
  "web-series.html",
  "Career.html",
  "Current-Affairs.html",
  "latest.html",
  "Music",
  "Review",
];

const MIN_WORDS = 500;

function getAllHtmlFiles() {
  const results = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) results.push(full);
    }
  }
  walk(ROOT);
  return results;
}

function isArticlePage(relPath) {
  return ARTICLE_CATEGORIES.some(
    (cat) => relPath.startsWith(cat + "/") || relPath.startsWith(cat + "\\")
  );
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

function readTextContent(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function extractSchemaType(html) {
  const results = [];
  const typeRegex = /"@type"\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = typeRegex.exec(html)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function hasPrivacyLink(html) {
  return /href="[^"]*privacy-policy\.html"/i.test(html);
}

function hasByline(html) {
  return (
    /class="[^"]*byline[^"]*"/i.test(html) ||
    /class="[^"]*author[^"]*"/i.test(html) ||
    /meta\s+name="author"/i.test(html) ||
    /Posted by/i.test(html)
  );
}

function hasInternalLinks(html, relPath) {
  const links = [
    ...html.matchAll(/href="([^"]+\.html)"/gi),
  ].map((m) => m[1]);
  return links.some((link) => {
    const resolved = path.normalize(path.dirname(relPath) + "/" + link);
    return resolved !== path.normalize(relPath);
  });
}

function validateArticle(relPath, html) {
  const issues = [];
  const text = readTextContent(html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (wordCount < MIN_WORDS) {
    issues.push(
      `WORD COUNT: ${wordCount} words (minimum ${MIN_WORDS} required)`
    );
  }

  const title = extractTitle(html);
  if (!title || title.includes("PAGE TITLE HERE")) {
    issues.push("TITLE: Missing or placeholder <title>");
  } else if (title.length > 60) {
    issues.push(`TITLE: Too long (${title.length} chars, max ~60)`);
  }

  const desc = extractMeta(html, "description");
  if (!desc) {
    issues.push("META DESCRIPTION: Missing");
  } else if (desc.length > 155) {
    issues.push(
      `META DESCRIPTION: Too long (${desc.length} chars, max ~155)`
    );
  }

  const ogTitle = extractMeta(html, "og:title");
  if (!ogTitle) issues.push("OG:TITLE: Missing");

  const ogDesc = extractMeta(html, "og:description");
  if (!ogDesc) issues.push("OG:DESCRIPTION: Missing");

  const ogImage = extractMeta(html, "og:image");
  if (!ogImage) issues.push("OG:IMAGE: Missing");

  const schemaTypes = extractSchemaType(html);
  if (!schemaTypes.includes("NewsArticle")) {
    issues.push("SCHEMA: Missing NewsArticle structured data");
  }

  const headlineMatch = html.match(/"headline"\s*:\s*"([^"]+)"/);
  if (!headlineMatch) {
    issues.push("SCHEMA: Missing headline in NewsArticle");
  }

  const datePublished = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (!datePublished) {
    issues.push("SCHEMA: Missing datePublished");
  }

  const authorMatch = html.match(
    /"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/
  );
  if (!authorMatch && !hasByline(html)) {
    issues.push("BYLINE: No visible author or schema author");
  }

  if (!hasInternalLinks(html, relPath)) {
    issues.push("INTERNAL LINKS: No internal links found");
  }

  const hasSubheadings =
    /<h[23][^>]*>/i.test(html) ||
    /<h[23]\s/i.test(html);
  if (wordCount > 400 && !hasSubheadings) {
    issues.push("STRUCTURE: 400+ words but no h2/h3 subheadings");
  }

  const hasAltText = /<img(?![^>]*alt=)/i.test(html);
  if (hasAltText) {
    issues.push("IMAGES: Found <img> tags without alt text");
  }

  const lang = html.match(/<html[^>]*lang="([^"]+)"/);
  if (!lang) {
    issues.push("LANG: Missing lang attribute on <html>");
  }

  return { wordCount, issues };
}

function validateSeo(relPath, html) {
  const issues = [];

  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  if (!canonical) {
    issues.push("CANONICAL: Missing canonical URL");
  }

  const robots = html.match(/<meta\s+name="robots"\s+content="([^"]+)"/i);
  if (!robots) {
    issues.push("ROBOTS: Missing robots meta tag");
  }

  const hreflang = html.match(/hreflang/i);
  if (relPath === "index.html" && !hreflang) {
    issues.push("HREFLANG: Missing on homepage");
  }

  return issues;
}

function validateTrustPages(html) {
  const issues = [];
  if (!hasPrivacyLink(html)) {
    issues.push("PRIVACY: No privacy-policy.html link in footer/body");
  }
  return issues;
}

function validateFooter(html) {
  const issues = [];
  const hasFooterSocial =
    /fab fa-facebook|fab fa-instagram|fab fa-youtube|fab fa-x-twitter/i.test(
      html
    );
  if (!hasFooterSocial) {
    issues.push("FOOTER: Missing social media icons");
  }

  const socialLinks = [
    ...html.matchAll(/href="(https?:\/\/[^"]+)"/gi),
  ].map((m) => m[1]);
  const hasPlaceholder = socialLinks.some(
    (l) => l.includes("example.com") || l === "#" || l === ""
  );
  if (hasPlaceholder) {
    issues.push("FOOTER: Found placeholder social links (# or example.com)");
  }
  return issues;
}

function checkBrokenInternalLinks(allFiles) {
  const issues = [];
  const allRelPaths = new Set(
    allFiles.map((f) => path.relative(ROOT, f).replace(/\\/g, "/"))
  );

  for (const file of allFiles) {
    const relPath = path.relative(ROOT, file).replace(/\\/g, "/");
    const html = fs.readFileSync(file, "utf-8");
    const links = [
      ...html.matchAll(/href="([^"]+\.html)"/gi),
    ].map((m) => m[1]);

    for (const link of links) {
      if (link.startsWith("http") || link.startsWith("//")) continue;
      const resolved = path
        .normalize(path.dirname(relPath) + "/" + link)
        .replace(/\\/g, "/");
      if (!allRelPaths.has(resolved) && resolved !== "index.html") {
        issues.push(`BROKEN LINK: ${relPath} -> ${link} (resolves to ${resolved}, not found)`);
      }
    }
  }
  return issues;
}

function run() {
  const args = process.argv.slice(2);
  const mode = args[0] ? args[0].replace("--", "") : "all";

  const allFiles = getAllHtmlFiles();
  let totalIssues = 0;
  const report = [];

  const articleFiles = allFiles.filter((f) => {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    return isArticlePage(rel) || isRootArticle(rel);
  });

  const trustFiles = allFiles.filter((f) => {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    return TRUST_PAGES.includes(rel);
  });

  if (mode === "all" || mode === "articles") {
    console.log("\n=== ARTICLE VALIDATION ===\n");
    for (const file of articleFiles) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      const html = fs.readFileSync(file, "utf-8");
      const result = validateArticle(rel, html);
      if (result.issues.length > 0) {
        console.log(`\n  ${rel} (${result.wordCount} words):`);
        result.issues.forEach((i) => console.log(`    - ${i}`));
        totalIssues += result.issues.length;
      } else {
        console.log(`  ${rel} - OK (${result.wordCount} words)`);
      }
    }
  }

  if (mode === "all" || mode === "seo") {
    console.log("\n=== SEO VALIDATION ===\n");
    for (const file of allFiles) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      const html = fs.readFileSync(file, "utf-8");
      const issues = validateSeo(rel, html);
      if (issues.length > 0) {
        console.log(`\n  ${rel}:`);
        issues.forEach((i) => console.log(`    - ${i}`));
        totalIssues += issues.length;
      }
    }
  }

  if (mode === "all" || mode === "links") {
    console.log("\n=== BROKEN LINK CHECK ===\n");
    const brokenLinks = checkBrokenInternalLinks(allFiles);
    if (brokenLinks.length > 0) {
      brokenLinks.forEach((i) => console.log(`  ${i}`));
      totalIssues += brokenLinks.length;
    } else {
      console.log("  No broken internal links found.");
    }
  }

  if (mode === "all" || mode === "trust") {
    console.log("\n=== TRUST PAGE VALIDATION ===\n");
    for (const file of trustFiles) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      const html = fs.readFileSync(file, "utf-8");
      const issues = validateTrustPages(html);
      if (issues.length > 0) {
        console.log(`  ${rel}:`);
        issues.forEach((i) => console.log(`    - ${i}`));
        totalIssues += issues.length;
      } else {
        console.log(`  ${rel} - OK`);
      }
    }

    console.log("\n=== FOOTER VALIDATION (all pages) ===\n");
    let footerIssues = 0;
    for (const file of allFiles) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      const html = fs.readFileSync(file, "utf-8");
      const issues = validateFooter(html);
      if (issues.length > 0) {
        console.log(`  ${rel}:`);
        issues.forEach((i) => console.log(`    - ${i}`));
        footerIssues += issues.length;
      }
    }
    if (footerIssues === 0) console.log("  All footers OK.");
    totalIssues += footerIssues;
  }

  if (mode === "all" || mode === "footer") {
    if (mode === "footer") {
      console.log("\n=== FOOTER VALIDATION (all pages) ===\n");
      for (const file of allFiles) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        const html = fs.readFileSync(file, "utf-8");
        const issues = validateFooter(html);
        if (issues.length > 0) {
          console.log(`  ${rel}:`);
          issues.forEach((i) => console.log(`    - ${i}`));
          totalIssues += issues.length;
        }
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total issues found: ${totalIssues}`);
  console.log(`Files scanned: ${allFiles.length}`);
  console.log(`Article files: ${articleFiles.length}`);

  process.exit(totalIssues > 0 ? 1 : 0);
}

run();
