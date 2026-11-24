// Saves a screenshot of the /analytics dashboard to analytics/dashboard.jpg for the weekly email.
// Run after stats.js: node shot.js (needs Playwright; if not found, run with NODE_PATH=$(npm root -g)).
// It loads the live page from phoenixtrackdays.com but swaps in this folder's fresh analytics/stats.json,
// so the picture matches what the site shows once this commit is live.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const stats = path.join(__dirname, "analytics", "stats.json");
  const out = path.join(__dirname, "analytics", "dashboard.jpg");
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 640, height: 1000 }, deviceScaleFactor: 2 });
    if (fs.existsSync(stats)) {
      const body = fs.readFileSync(stats, "utf8");
      await p.route("**/analytics/stats.json*", r => r.fulfill({ body, contentType: "application/json" }));
    }
    await p.goto("https://phoenixtrackdays.com/analytics/", { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForSelector("#tiles .tile b", { timeout: 20000 });
    await p.waitForTimeout(1000);
    await p.screenshot({ path: out, fullPage: true, type: "jpeg", quality: 82 });
    console.log("dashboard.jpg", Math.round(fs.statSync(out).size / 1024) + " KB");
  } finally { await b.close(); }
})().catch(e => { console.error("shot.js failed:", e.message); process.exit(1); });
