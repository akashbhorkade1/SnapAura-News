#!/usr/bin/env node

// Validates drafts/generated/*.html the same way CI does, without shell-quoting pitfalls.
// - All drafts require NewsArticle, datePublished, og:title, og:description.
// - Non-Career drafts require a `snap-source` attribution line.
// - Career drafts intentionally have NO snap-source line (see renderArticle in
//   generate-ai-drafts.js and the "Remove the 'Source: Original report' footer
//   line" rule in validate.js). They use curated Important Links instead.

const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "drafts", "generated");

function sectionOf(html) {
  // Accept both attribute orders and both quote styles:
  // <meta property="article:section" content="Career">
  // <meta content='Career' property='article:section'>
  const patterns = [
    /article:section[^>]*content\s*=\s*["']([^"']+)["']/i,
    /content\s*=\s*["']([^"']+)["'][^>]*article:section/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) throw new Error(`Expected drafts directory ${OUTPUT_DIR} to exist`);
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".html")).sort();
  console.log("Generated drafts:", files);
  const strict = process.env.STRICT !== "0";
  if (files.length < 1 && strict) throw new Error(`Expected at least one generated draft, found ${files.length}`);
  if (files.length < 1) {
    // Local convenience: drafts/generated is ephemeral (populated by
    // generate:drafts at CI runtime). STRICT=0 lets a clean checkout pass.
    console.log("No generated drafts found, skipping (STRICT=0).");
    return;
  }
  for (const f of files) {
    const h = fs.readFileSync(path.join(OUTPUT_DIR, f), "utf8");
    for (const required of ["NewsArticle", "datePublished", "og:title", "og:description"]) {
      if (!h.includes(required)) throw new Error(`Missing ${required} in ${f}`);
    }
    const section = sectionOf(h);
    const isCareer = section.toLowerCase() === "career";
    if (isCareer) {
      // Career trust model = curated Important Links (+ glance card), never snap-source.
      if (!/Important Links/i.test(h) && !/snap-glance/i.test(h)) {
        throw new Error(`Missing Important Links / snap-glance trust block in Career draft ${f}`);
      }
      if (/Original report<\/a>/i.test(h)) {
        throw new Error(`Career draft ${f} must not contain a snap-source 'Original report' line`);
      }
    } else {
      if (!h.includes("snap-source")) throw new Error(`Missing snap-source in ${f}`);
    }
  }
  console.log("All generated drafts passed validation.");
}

main();
