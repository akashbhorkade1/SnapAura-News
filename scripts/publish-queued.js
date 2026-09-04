#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(ROOT, "drafts", "queue.json");
const DAILY_LIMIT = 3;
const today = new Date().toISOString().slice(0, 10);

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
  if (!hub) return;
  const hubPath = path.join(ROOT, hub);
  if (!fs.existsSync(hubPath) || html.includes(`href="${destination}"`)) return;
  const title = (html.match(/<h1[^>]*>([^<]+)</i) || ["", "New SnapAura article"])[1].trim();
  const description = (html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || ["", "Read the latest SnapAura update."])[1];
  const image = (html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i) || ["", "https://snapaura.space/assets/img/the-bluff-review.jpg"])[1];
  const imagePath = image.replace("https://snapaura.space/", "");
  const card = `\n          <div class="post-preview">\n            <a href="${destination}" style="text-decoration: none;">\n              <div class="post-preview-img-container">\n                <span class="badge-music-special">${category.toUpperCase()}</span>\n                <img src="${imagePath}" alt="${title}" class="snap-image" width="800" height="450">\n              </div>\n              <div class="mt-3">\n                <h2 class="post-title">${title}</h2>\n                <p>${description}</p>\n              </div>\n            </a>\n            <p class="post-meta">SnapAura News Desk</p>\n          </div>\n          <hr class="my-4" />\n`;
  let hubHtml = fs.readFileSync(hubPath, "utf8");
  hubHtml = hubHtml.replace(/\s*<\/section>/i, `${card}        </section>`);
  fs.writeFileSync(hubPath, hubHtml, "utf8");
}

if (!fs.existsSync(QUEUE_PATH)) {
  console.log("No publish queue found; nothing to publish.");
  process.exit(0);
}

const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
if (!Array.isArray(queue)) fail("drafts/queue.json must contain an array.");
if (!Array.isArray(queue)) process.exit(1);

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
  html = html.replace(/(<meta\s+name="robots"\s+content=")[^"]*("[^>]*>)/i, "$1index, follow$2");
  fs.writeFileSync(destination, html, "utf8");
  updateCategoryHub(item.destination.replace(/\\/g, "/"), html);
  item.publishedAt = new Date().toISOString();
  console.log(`Published ${item.destination}`);
}

if (due.length > 0) {
  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

console.log(`Published ${due.length} article(s) today; daily limit is ${DAILY_LIMIT}.`);