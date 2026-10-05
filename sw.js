/* Service worker — app shell offline das Finanças */
const PREFIX = "financeos-";
const VERSION = PREFIX + "v3";
const CORE = [
  "./", "./index.html", "./finance.js", "./manifest.webmanifest",
  "./shared/base.css", "./shared/ui.js", "./shared/store.js", "./shared/sync.js", "./shared/domain.js", "./shared/app.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

// Só apaga caches desta app: todas as páginas rblucas2.github.io/* partilham a mesma origem
// (e por isso o mesmo CacheStorage) — apagar tudo destruiria as caches das outras apps.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // Supabase, CDNs: não mexer
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // network-first: versão mais recente quando há internet; cache só como fallback offline
  e.respondWith(
    fetch(req, { cache: "no-store" }).then((r) => {
      if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req).then((m) => m || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
