// notify.js: send "new dates" / "date changed" alerts through OneSignal after the daily refresh.
// Usage: ONESIGNAL_KEY=<app api key> node notify.js <old data.js> <new data.js>
//        add DRY=1 to print what would be sent without sending.
// Compares upcoming events (today through 12 months) in the old and new data files.
// Sends at most one alert per type (track days, schools, kart track/supermoto) to subscribers
// who picked that type (OneSignal tags day/school/moto = "1"). No packages needed (Node 18+).
const fs = require("fs"), vm = require("vm");
const APP_ID = "6add44ce-8e44-4390-b115-f66ec67534c6";
const SITE = "https://phoenixtrackdays.com/";
const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) { console.error("usage: node notify.js <old data.js> <new data.js>"); process.exit(2); }
const load = p => { const w = {}; vm.runInNewContext(fs.readFileSync(p, "utf8"), { window: w }); return w; };
const O = load(oldPath), N = load(newPath), T = N.TRACKS || {};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date());
const end = (() => { const [y, m, d] = today.split("-").map(Number); return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; })();
const up = ev => (ev || []).filter(e => (e.e || e.d) >= today && e.d <= end);
const key = e => [e.d, e.e || "", e.t, e.org, e.type].join("|");
const oldUp = up(O.EVENTS), newUp = up(N.EVENTS);
if (!oldUp.length) { console.log("No upcoming events in the old file; skipping alerts (first run or bad file)."); process.exit(0); }
const oldKeys = new Set(oldUp.map(key)), newKeys = new Set(newUp.map(key));
let added = newUp.filter(e => !oldKeys.has(key(e)));
let gone = oldUp.filter(e => !newKeys.has(key(e)) && e.d >= today);
// pair a vanished date with a new one for the same organizer, track and type within 45 days: that's a move
const DAY = 86400000, dt = s => new Date(s + "T12:00:00Z");
const moved = [];
gone = gone.filter(g => {
  const i = added.findIndex(a => a.org === g.org && a.t === g.t && a.type === g.type && Math.abs(dt(a.d) - dt(g.d)) <= 45 * DAY);
  if (i < 0) return true;
  moved.push({ from: g, to: added[i] }); added.splice(i, 1); return false;
});
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fd = e => { const a = dt(e.d), b = e.e ? dt(e.e) : null; let s = `${MON[a.getUTCMonth()]} ${a.getUTCDate()}`;
  if (b) s += b.getUTCMonth() === a.getUTCMonth() ? `–${b.getUTCDate()}` : ` – ${MON[b.getUTCMonth()]} ${b.getUTCDate()}`; return s; };
const tn = e => (T[e.t] && T[e.t].name) || e.t;
const line = e => `${e.org} at ${tn(e)}, ${fd(e)}`;
const LABEL = { day: "track day", school: "school", moto: "kart track / supermoto" };
const msgs = [];
for (const type of ["day", "school", "moto"]) {
  const a = added.filter(e => e.type === type), m = moved.filter(x => x.to.type === type), c = gone.filter(e => e.type === type);
  if (!a.length && !m.length && !c.length) continue;
  const parts = [];
  a.slice(0, 3).forEach(e => parts.push(line(e)));
  m.slice(0, 2).forEach(x => parts.push(`${x.from.org} at ${tn(x.from)}: ${fd(x.from)} moved to ${fd(x.to)}`));
  c.slice(0, 2).forEach(e => parts.push(`${line(e)} is off the schedule`));
  const more = a.length + m.length + c.length - parts.length;
  let heading;
  if (a.length && !m.length && !c.length) heading = a.length === 1 ? `New ${LABEL[type]} date` : `${a.length} new ${LABEL[type]} dates`;
  else if (!a.length && m.length && !c.length) heading = m.length === 1 ? `${LABEL[type][0].toUpperCase() + LABEL[type].slice(1)} date changed` : `${m.length} ${LABEL[type]} dates changed`;
  else heading = `${LABEL[type][0].toUpperCase() + LABEL[type].slice(1)} schedule update`;
  const body = parts.join("\n") + (more > 0 ? `\n+${more} more` : "");
  const tracks = new Set([...a, ...c, ...m.map(x => x.to)].map(e => e.t));
  const url = SITE + "?app=1" + (tracks.size === 1 ? "#" + [...tracks][0] : "#schedule-block");
  msgs.push({ type, heading, body, url });
}
console.log(`Today ${today}. New ${added.length}, moved ${moved.length}, off the schedule ${gone.length}.`);
// safety: a scraping glitch can make many dates vanish or reappear at once; don't blast subscribers with it
if (gone.length > 6 || added.length > 40) { console.log("Too many changes at once; not sending alerts. Check the data before trusting this run."); process.exit(3); }
if (!msgs.length) { console.log("No changes to alert."); process.exit(0); }
(async () => {
  let fail = 0;
  for (const m of msgs) {
    console.log(`\n[${m.type}] ${m.heading}\n${m.body}\n${m.url}`);
    if (process.env.DRY) continue;
    if (!process.env.ONESIGNAL_KEY) { console.error("ONESIGNAL_KEY not set; not sent."); fail++; continue; }
    const r = await fetch("https://api.onesignal.com/notifications", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Key " + process.env.ONESIGNAL_KEY },
      body: JSON.stringify({ app_id: APP_ID, target_channel: "push", headings: { en: m.heading }, contents: { en: m.body }, url: m.url,
        filters: [{ field: "tag", key: m.type, relation: "=", value: "1" }], web_push_topic: "ptd-" + m.type }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errors) { console.error("Send failed:", r.status, JSON.stringify(j)); fail++; } else console.log("Sent:", j.id || "(no id)", j.recipients !== undefined ? `to ${j.recipients}` : "");
  }
  process.exit(fail ? 1 : 0);
})();
