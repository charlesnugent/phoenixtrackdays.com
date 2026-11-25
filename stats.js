// Builds analytics/stats.json for the public /analytics page from the GoatCounter API.
// Usage: GC_TOKEN=... node stats.js   (the token is read from the environment and never written out)
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GC_TOKEN;
if (!TOKEN) { console.error("GC_TOKEN is not set"); process.exit(1); }
const BASE = "https://phoenixtrackdays.goatcounter.com/api/v0";
const LAUNCH = "2026-11-20";
global.window = {}; require("./data.js");
const EV = window.EVENTS || [], TR = window.TRACKS || {}, FEAT = window.FEATURED || [];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(p) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + "/" + p, { headers: { Authorization: "Bearer " + TOKEN } });
    const t = await r.text();
    if (r.status === 401 || r.status === 403) throw new Error("GoatCounter token rejected (" + r.status + ")");
    try { const j = JSON.parse(t); await sleep(400); return j; } catch (_) { await sleep(3000); }
  }
  throw new Error("GoatCounter API failed: " + p);
}

// Arizona has no DST: UTC-7 all year.
const azToday = () => new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const maxDate = (a, b) => (a > b ? a : b);
const rng = (s, e) => `start=${s}&end=${e}`;
const merge = rows => { const m = new Map(); rows.forEach(([k, n]) => m.set(k, (m.get(k) || 0) + n)); return [...m].sort((a, b) => b[1] - a[1]); };

(async () => {
  const T = azToday(), END = addDays(T, 1);
  const s30 = maxDate(LAUNCH, addDays(T, -29));

  const all = await api(`stats/total?${rng(LAUNCH, END)}`);
  const w = await api(`stats/total?${rng(addDays(T, -6), END)}`);
  const pw = await api(`stats/total?${rng(addDays(T, -13), addDays(T, -7))}`);
  const m30 = await api(`stats/total?${rng(s30, END)}`);

  const daily = (all.stats || []).filter(s => s.day >= LAUNCH && s.day <= T).map(s => ({ d: s.day, n: s.daily })).slice(-30);

  const hits = await api(`stats/hits?${rng(s30, END)}&limit=100`);
  const ev = (hits.hits || []).filter(h => h.event);
  const kind = p => p.startsWith("book: ") ? "book" : p.startsWith("featured: ") ? "featured" : p.startsWith("org: ") ? "org" : "other";
  const sum = k => ev.filter(h => kind(h.path) === k).reduce((a, h) => a + h.count, 0);
  const booking = ev.filter(h => ["book", "featured"].includes(kind(h.path)));
  // Resolve each click to its event in data.js so featured events credit every organizer.
  // Paths: "book: <org> · <track>", "featured: <track>" (old) or "featured: <name> · <track>"; titles add " · <date>".
  const info = h => {
    const k = kind(h.path), parts = h.path.replace(/^(book|featured): /, "").split(" · ");
    const date = ((h.title || "").match(/(\d{4}-\d{2}-\d{2})$/) || [])[1];
    const track = parts[parts.length - 1], first = parts.length > 1 ? parts[0] : null;
    const org = k === "book" ? first : null, named = k === "featured" ? first : null;
    const e = date && EV.find(x => x.d === date && (TR[x.t] || {}).name === track && (!org || x.org === org)
      && (!named || (x.note || "").startsWith(named)));
    const feat = (e && FEAT.find(n => (e.note || "").startsWith(n))) || named;
    let orgs = org ? [org] : [];
    if (e && feat) { const m = e.note.slice(feat.length).match(/\bwith (.+?)(?:[.;]|$)/);
      const co = m ? m[1].split(/,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/).map(x => x.trim()).filter(Boolean) : [];
      orgs = [e.org, ...co.filter(o => o !== e.org)]; }
    else if (e && !orgs.length) orgs = [e.org];
    return { track, feat, orgs, date, n: h.count };
  };
  const and = a => a.length < 2 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  const resolved = booking.map(info);
  const byOrg = merge(resolved.flatMap(r => (r.orgs.length ? r.orgs : ["Unknown"]).map(o => [o, r.n])));
  // Taps on an organizer's name in the Organizers section ("org: <name>"), named the way the schedule names them.
  const evOrgs = [...new Set(EV.map(e => e.org))];
  const orgName = n => evOrgs.find(o => o === n) || evOrgs.find(o => n.startsWith(o + " ") || n.includes("(" + o + ")"))
    || evOrgs.find(o => o.startsWith(n + " ")) || n;
  const site = merge(ev.filter(h => kind(h.path) === "org").map(h => [orgName(h.path.slice(5).trim()), h.count]));
  // One row per event (name or track, date, organizers); a featured event's Details and Book taps on the same date merge.
  const top = merge(resolved.map(r => [JSON.stringify([r.feat ? `${r.feat} at ${r.track}` : r.track, and(r.orgs) || (r.feat ? "Featured" : ""), r.date || ""]), r.n]))
    .slice(0, 8).map(([k, n]) => { const [track, org, d] = JSON.parse(k); return { org, track, d, n }; });

  const refs = await api(`stats/toprefs?${rng(s30, END)}&limit=20`);
  const refRows = merge((refs.stats || []).map(r => [r.name ? r.name.replace(/^www\./, "").replace(/^(l|m)\.facebook\.com$/, "facebook.com") : "Direct or unknown", r.count])).slice(0, 6);

  const sizes = await api(`stats/sizes?${rng(s30, END)}`);
  const dev = { phone: 0, tablet: 0, desktop: 0 };
  (sizes.stats || []).forEach(s => { if (s.id === "phone") dev.phone += s.count; else if (s.id === "tablet") dev.tablet += s.count; else if (/desktop/.test(s.id)) dev.desktop += s.count; });

  const locs = await api(`stats/locations?${rng(s30, END)}&limit=20`);
  const locRows = (locs.stats || []).filter(l => l.count).map(l => [l.name || "Unknown", l.count]).slice(0, 6);

  const out = {
    updated: new Date().toISOString(),
    today: T, since: LAUNCH, since30: s30,
    visits: { all: all.total || 0, last7: w.total || 0, prev7: pw.total || 0, last30: m30.total || 0 },
    daily,
    clicks: { booking: sum("book") + sum("featured"), book: sum("book"), featured: sum("featured"), org: sum("org"), sent: sum("book") + sum("featured") + sum("org"), byOrg: byOrg.slice(0, 8), site: site.slice(0, 8), top },
    refs: refRows, devices: dev, locations: locRows,
  };
  fs.mkdirSync(path.join(__dirname, "analytics"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "analytics", "stats.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`stats.json: ${out.visits.all} visits since ${LAUNCH}, ${out.clicks.booking} booking clicks (30 days)`);
})().catch(e => { console.error(e.message); process.exit(1); });
