#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = "https://snapaura.space";
const TODAY = new Date().toISOString().split("T")[0];

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

function generateSitemap() {
  const files = getAllHtmlFiles();
  const urls = [];

  urls.push({
    loc: `${BASE_URL}/`,
    lastmod: TODAY,
    changefreq: "daily",
    priority: "1.0",
  });

  const highPriority = [
    "bollywood.html",
    "cricket.html",
    "web-series.html",
    "latest.html",
    "Career.html",
    "Current-Affairs.html",
  ];
  const lowPriority = ["about.html", "contact.html", "privacy-policy.html"];

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (rel === "index.html") continue;

    let priority = "0.7";
    let changefreq = "weekly";

    if (highPriority.includes(rel)) {
      priority = "0.9";
      changefreq = "daily";
    } else if (lowPriority.includes(rel)) {
      priority = "0.6";
      changefreq = "monthly";
    } else if (rel === "live.html") {
      priority = "0.5";
      changefreq = "daily";
    }

    let lastmod = TODAY;
    try {
      const { execSync } = require("child_process");
      lastmod = execSync(`git log -1 --format="%cs" -- "${rel}"`, {
        cwd: ROOT,
        encoding: "utf-8",
      }).trim();
      if (!lastmod) lastmod = TODAY;
    } catch {}

    urls.push({
      loc: `${BASE_URL}/${rel}`,
      lastmod,
      changefreq,
      priority,
    });
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const u of urls) {
    xml += "  <url>\n";
    xml += `    <loc>${u.loc}</loc>\n`;
    xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
    xml += `    <priority>${u.priority}</priority>\n`;
    xml += "  </url>\n";
  }

  xml += "</urlset>\n";

  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf-8");
  console.log(`Sitemap generated with ${urls.length} URLs.`);
}

generateSitemap();
