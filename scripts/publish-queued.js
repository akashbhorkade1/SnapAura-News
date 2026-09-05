#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(ROOT, "drafts", "queue.json");
const GENERATED_DIR = path.join(ROOT, "drafts", "generated");
const MANIFEST_PATH = path.join(GENERATED_DIR, ".retention.json");
const DAILY_LIMIT = 5;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function fail(message) {
  console.error(`Publish queue error: ${message}`);
  process.exitCode = 1;
}

function updateCategoryHub(destination, html) {
  const category = destination.split(/[\\/]/)[0];
  const hubs = {
    bollywood: "bollywood.html",
    Cricket: "cricket.html",
    "web-series": "web-series.html",
    Career: "Career.html",
    "Current-Affairs": "Current-Affairs.html",
  };
  const hub = hubs[category];
  const title = (html.match(/<h1[^>]*>([^<]+)</i) || ["", "New SnapAura article"])[1].trim();
  const description = (html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || ["", "Read the latest SnapAura update."])[1];
  const image = (html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i) || ["", "https://snapaura.space/assets/img/the-bluff-review.jpg"])[1];
  const imagePath = image.replace("https://snapaura.space/", "");
  const card = `\n          <div class="post-preview">\n            <a href="${destination}" style="text-decoration: none;">\n              <div class="post-preview-img-container">\n                <span class="badge-music-special">${category.toUpperCase()}</span>\n                <img src="${imagePath}" alt="${title}" class="snap-image" width="800" height="450">\n              </div>\n              <div class="mt-3">\n                <h2 class="post-title">${title}</h2>\n                <p>${description}</p>\n              </div>\n            </a>\n            <p class="post-meta">SnapAura News Desk</p>\n          </div>\n          <hr class="my-4" />\n`;
  const pages = [hub, "latest.html"].filter(Boolean);
  for (const page of pages) {
    const pagePath = path.join(ROOT, page);
    if (!fs.existsSync(pagePath)) continue;
    let pageHtml = fs.readFileSync(pagePath, "utf8");
    if (pageHtml.includes(`href="${destination}"`)) continue;
    pageHtml = pageHtml.replace(/\s*<\/section>/i, `${card}        </section>`);
    fs.writeFileSync(pagePath, pageHtml, "utf8");
  }
}

function cleanupExpiredDrafts() {
  if (!fs.existsSync(MANIFEST_PATH)) return;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return;
  }
  const now = Date.now();
  for (const [file, generatedAt] of Object.entries(manifest)) {
    if (now - new Date(generatedAt).getTime() <= 24 * 60 * 60 * 1000) continue;
    const filePath = path.join(GENERATED_DIR, file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    delete manifest[file];
    console.log(`Removed expired draft: drafts/generated/${file}`);
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

if (!fs.existsSync(QUEUE_PATH)) {
  console.log("No publish queue found; nothing to publish.");
  process.exit(0);
}

cleanupExpiredDrafts();

const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
if (!Array.isArray(queue)) fail("drafts/queue.json must contain an array.");
if (!Array.isArray(queue)) process.exit(1);

let queueChanged = false;
for (let i = queue.length - 1; i >= 0; i--) {
  const entry = queue[i];
  if (!entry.publishedAt && entry.source && !fs.existsSync(path.resolve(ROOT, entry.source))) {
    console.log(`Removed stale queue entry (draft missing): ${entry.source}`);
    queue.splice(i, 1);
    queueChanged = true;
  }
}

const due = queue
  .map((item, index) => ({ item, index }))
  .filter(({ item }) => item.publishDate && item.publishDate <= today && !item.publishedAt)
  .sort((a, b) => a.item.publishDate.localeCompare(b.item.publishDate))
  .slice(0, DAILY_LIMIT);

for (const { item } of due) {
  if (!item.source || !item.destination) {
    fail("each queued article needs source and destination paths");
    continue;
  }

  const source = path.resolve(ROOT, item.source);
  const destination = path.resolve(ROOT, item.destination);
  if (!source.startsWith(ROOT) || !destination.startsWith(ROOT)) {
    fail(`paths must stay inside the repository: ${item.source}`);
    continue;
  }
  if (!fs.existsSync(source)) {
    fail(`draft not found: ${item.source}`);
    continue;
  }
  if (fs.existsSync(destination)) {
    fail(`destination already exists: ${item.destination}`);
    continue;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  let html = fs.readFileSync(source, "utf8");
  html = html.replace(/(href|src)="\.\.\/\.\.\//g, '$1="../');
  const canonical = `https://snapaura.space/${item.destination.replace(/\\/g, "/")}`;
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${canonical}">`);
  html = html.replace(/(<meta\s+property="og:url"\s+content=")[^"]*("[^>]*>)/i, `$1${canonical}$2`);
  html = html.replace(/(<meta\s+name="robots"\s+content=")[^"]*("[^>]*>)/i, "$1index, follow$2");
  fs.writeFileSync(destination, html, "utf8");
  fs.unlinkSync(source);
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    delete manifest[path.basename(source)];
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
  updateCategoryHub(item.destination.replace(/\\/g, "/"), html);
  item.publishedAt = new Date().toISOString();
  console.log(`Published ${item.destination}`);
}

if (queueChanged || due.length > 0) {
  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

console.log(`Published ${due.length} article(s) today; daily limit is ${DAILY_LIMIT}.`);