// Phoenix Track Days service worker: lets the installed app open offline with the last schedule it saw.
// Pages and data: network first (always fresh when online), cached copy when offline.
// Icons, fonts and other static files: cache first.
const CACHE = "ptd-v1";
const CORE = ["/", "/index.html", "/data.js?v=2", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (/goatcounter|gc\.zgo\.at|web3forms/.test(u.host)) return; // never cache analytics or the contact form
  const fresh = r.mode === "navigate" || (u.origin === location.origin && /\.(js|json|ics)$|\/$/.test(u.pathname));
  if (fresh) {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; })
      .catch(() => caches.match(r, { ignoreSearch: r.mode === "navigate" }).then(m => m || caches.match("/"))));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok || res.type === "opaque") { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; })));
});
