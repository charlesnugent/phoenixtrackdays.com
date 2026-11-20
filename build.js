// Builds calendar.ics (subscribe feed) and ics/<id>.ics (one per event) from data.js.
// Run: node build.js   (after any change to data.js)
const fs = require("fs"), path = require("path");
global.window = {}; require("./data.js");
const T = window.TRACKS, EV = window.EVENTS, RULES = window.BIKE_RULES || {}, LV = window.LEVELS || {};
const evId = e => { let s = [e.d, e.t, e.org, e.cfg || ""].join("|"), h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return e.d + "-" + e.t + "-" + h.toString(36); };
const ymd = s => s.replace(/-/g, "");
const next = s => { const [y,m,d] = s.split("-").map(Number); const x = new Date(Date.UTC(y, m-1, d+1)); return x.toISOString().slice(0,10).replace(/-/g,""); };
const esc = s => String(s).replace(/\\/g,"\\\\").replace(/;/g,"\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
const fold = l => { const out = []; while (l.length > 74) { out.push(l.slice(0,74)); l = " " + l.slice(74); } out.push(l); return out.join("\r\n"); };
const stamp = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z$/,"Z");
const vevent = e => { const tr = T[e.t];
  const desc = [LV[e.org], e.price, e.note, RULES[e.org], "Book: " + (e.url || tr.site), "More dates: https://phoenixtrackdays.com/"].filter(Boolean).join("\n");
  return ["BEGIN:VEVENT", "UID:" + evId(e) + "@phoenixtrackdays.com", "DTSTAMP:" + stamp,
    "DTSTART;VALUE=DATE:" + ymd(e.d), "DTEND;VALUE=DATE:" + next(e.e || e.d),
    "SUMMARY:" + esc(`${tr.name}${e.cfg ? " " + e.cfg : ""}: ${e.org}`),
    "LOCATION:" + esc(tr.name + ", " + tr.city), "DESCRIPTION:" + esc(desc),
    (e.url || tr.site) ? "URL:" + (e.url || tr.site) : null, "END:VEVENT"].filter(Boolean).map(fold).join("\r\n"); };
const cal = (evs, name) => ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//phoenixtrackdays.com//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
  "X-WR-CALNAME:" + name, "X-WR-TIMEZONE:America/Phoenix", "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H",
  ...evs.map(vevent), "END:VCALENDAR"].join("\r\n") + "\r\n";
const today = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Phoenix"}).format(new Date());
const upcoming = EV.filter(e => (e.e || e.d) >= today);
fs.writeFileSync("calendar.ics", cal(upcoming, "Phoenix Area Motorcycle Track Days"));
fs.rmSync("ics", { recursive: true, force: true }); fs.mkdirSync("ics");
upcoming.forEach(e => fs.writeFileSync(path.join("ics", evId(e) + ".ics"), cal([e], `${T[e.t].name}: ${e.org}`)));
console.log("calendar.ics +", upcoming.length, "event files");
