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
  fs.copyFileSync(source, destination);
  item.publishedAt = new Date().toISOString();
  console.log(`Published ${item.destination}`);
}

if (due.length > 0) {
  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

console.log(`Published ${due.length} article(s) today; daily limit is ${DAILY_LIMIT}.`);