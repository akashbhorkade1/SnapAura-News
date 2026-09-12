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

// Career template v2 structural checks (EN core + MR quick guide, curated
// official links, no marketing CTAs). Enforced site-wide for Career articles.
const CAREER_REQUIRED_SECTIONS = [
  ["CAREER: Missing At-a-Glance card", /At a Glance|snap-glance/i],
  ["CAREER: Missing 'Can I Apply?' section", /Can I Apply\?/i],
  ["CAREER: Missing Marathi full-coverage section", /मराठीत/i],
  ["CAREER: Missing Important Links section", /Important Links/i],
];

const CAREER_BANNED_CTAS = [
  "CAREER: Banned marketing CTA (CLICK HERE / APPLY NOW style)", /click\s*here(\s*!{2,}|!)/i,
  "CAREER: Banned marketing CTA (APPLY NOW style)", /apply\s*now(\s*!{2,}|!)/i,
  "CAREER: Banned clickbait phrase (Golden Opportunity)", /golden\s*opportunity/i,
  "CAREER: Banned clickbait phrase (BEST GOVERNMENT JOB)", /best\s*government\s*job/i,
  "CAREER: Banned clickbait phrase (Life-changing)", /life[- ]changing\s*(job|opportunity)/i,
];

const CAREER_CHROME_LINK_RE = /majhinaukri\.in\/(tools|mock|tag|category|hall|result|current|new-updates|latest|career|notice-board|exam-time-table)|mocktest\.majhinaukri|games\.majhinaukri|tools\.majhinaukri|t\.me\/|whatsapp\.com\/channel|api\.whatsapp\.com|facebook\.com\/sharer|twitter\.com\/intent|x\.com\/intent|instagram\.com\/|play\.google\.com|linktr\.ee/i;

// Current Affairs template v2 checks (exam-oriented roundup).
const CA_REQUIRED_SECTIONS = [
  ["CURRENT-AFFAIRS: Missing Quick Scan table", /Quick Scan/i],
  ["CURRENT-AFFAIRS: Missing Prelims Focus", /Prelims Focus/i],
  ["CURRENT-AFFAIRS: Missing 1-Minute Revision", /1.?Minute Revision/i],
  ["CURRENT-AFFAIRS: Missing Quick Quiz", /Quick Quiz/i],
  ["CURRENT-AFFAIRS: Missing Marathi quick revision", /मराठीत/i],
];

// Generic-filler phrases marking the "publisher released a digest" anti-pattern.
const CA_BANNED_FILLER = [
  ["CURRENT-AFFAIRS: Generic filler (current affairs are an important part)", /current affairs are an important part/i],
  ["CURRENT-AFFAIRS: Generic filler (current affairs are vital)", /current affairs (?:is|are) vital/i],
  ["CURRENT-AFFAIRS: Generic filler (daily roundups serve as)", /daily roundups serve as/i],
  ["CURRENT-AFFAIRS: Generic filler (serves as an essential foundation)", /serves? as an essential foundation/i],
  ["CURRENT-AFFAIRS: Generic filler (convert vast daily news flows)", /convert vast daily news flows/i],
  ["CURRENT-AFFAIRS: Generic filler (Navigating Unspecified Details)", /navigating unspecified details/i],
  ["CURRENT-AFFAIRS: Generic filler (Key Structure of Civil Services Daily Analysis)", /key structure of civil services daily analysis/i],
  ["CURRENT-AFFAIRS: Generic filler (essential component of exam readiness)", /essential component of exam readiness/i],
  ["CURRENT-AFFAIRS: Generic filler (foundation for candidates navigating)", /foundation for candidates navigating/i],
];

// When a source genuinely has no topics, the allowed output is a clearly
// labelled short release/update article (the alternative to skipping).
function isCurrentAffairsReleaseVariant(region) {
  return /Release(s)? \/ Update|Release Announcement|Release Notice|Update Notice/i.test(region);
}

function validateCurrentAffairsTemplate(relPath, html, issues) {
  if (!relPath.startsWith("Current-Affairs/") && !relPath.startsWith("Current-Affairs\\")) return;
  const region = articleRegion(html);

  for (const [msg, re] of CA_BANNED_FILLER) {
    if (re.test(region)) issues.push(msg);
  }

  // Strict template checks apply to v2-template articles, recognised by their
  // Quick Scan / 1-Minute Revision markers. A clearly-labelled Release/Update
  // article is the allowed short alternative for topic-less sources.
  if (isCurrentAffairsReleaseVariant(region)) return;
  if (!/Quick Scan|1.?Minute Revision/i.test(region)) return;
  for (const [msg, re] of CA_REQUIRED_SECTIONS) {
    if (!re.test(region)) issues.push(msg);
  }
  const h2Count = (region.match(/<h2\b/gi) || []).length;
  if (h2Count < 3) issues.push("CURRENT-AFFAIRS: Too few sections for a v2 Current Affairs article (min ~3 h2 headings)");
}

function articleRegion(html) {
  const m = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/i);
  return m ? m[0] : "";
}

function validateCareerTemplate(relPath, html, issues) {
  if (!relPath.startsWith("Career/") && !relPath.startsWith("Career\\")) return;

  const region = articleRegion(html);
  for (const [msg, re] of CAREER_REQUIRED_SECTIONS) {
    if (!re.test(region)) issues.push(msg);
  }

  for (let i = 0; i < CAREER_BANNED_CTAS.length; i += 2) {
    if (CAREER_BANNED_CTAS[i + 1].test(region)) issues.push(CAREER_BANNED_CTAS[i]);
  }

  // Curated Important Links: max 3 anchors, official URLs only.
  const linksMatch = region.match(/Important Links[\s\S]{0,200}?<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (linksMatch) {
    const items = [...linksMatch[1].matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)];
    if (items.length > 3) issues.push(`CAREER: Important Links has ${items.length} links (max 3)`);
    for (const item of items) {
      if (CAREER_CHROME_LINK_RE.test(item[1])) {
        issues.push("CAREER: Non-official link inside Important Links section");
        break;
      }
    }
  }

  const anchors = (region.match(/<a\b/gi) || []).length;
  if (anchors > 12) issues.push(`CAREER: ${anchors} links in article body (max 12)`);

  // Career pages have no separate source footer line ("Source: … Original report").
  if (/SnapAura is not the recruiting authority/i.test(region) || />Original report<\/a>/i.test(region)) {
    issues.push("CAREER: Remove the 'Source: … Original report' footer line from Career pages");
  }

  // Marathi section must mirror the English core (at least ~30% of its words;
  // the old "quick guide" pattern sat around 8-10%, a full mirror is far higher).
  const mrMatch = region.match(/<h2[^>]*>[^<]*मराठीत[\s\S]*?(?=<h2\b|<\/article>)/i);
  if (mrMatch) {
    const mrWords = readTextContent(mrMatch[0]).split(/\s+/).filter(Boolean).length;
    const enWords = readTextContent(region.replace(mrMatch[0], "")).split(/\s+/).filter(Boolean).length;
    if (mrWords < enWords * 0.3) {
      issues.push(`CAREER: Marathi section is only a summary (~${mrWords} words vs ~${enWords} English words) — full Marathi coverage mirroring the English content is required`);
    }
  }
}

function validateArticle(relPath, html) {
  const issues = [];
  const text = readTextContent(html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const isCA = relPath.startsWith("Current-Affairs/") || relPath.startsWith("Current-Affairs\\");
  const minWords = isCA && isCurrentAffairsReleaseVariant(articleRegion(html)) ? 120 : isCA ? 300 : MIN_WORDS;
  if (wordCount < minWords) {
    issues.push(
      `WORD COUNT: ${wordCount} words (minimum ${minWords} required)`
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

  const imageOptional = relPath.startsWith("Career/") || relPath.startsWith("Career\\") || relPath.startsWith("Current-Affairs/") || relPath.startsWith("Current-Affairs\\");
  const ogImage = extractMeta(html, "og:image");
  if (!ogImage && !imageOptional) issues.push("OG:IMAGE: Missing");

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

  validateCareerTemplate(relPath, html, issues);
  validateCurrentAffairsTemplate(relPath, html, issues);
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
    if (rel.endsWith("/index.html")) return false; // category hub pages (e.g. Review/index.html)
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
