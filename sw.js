/* ============================================================
   hourhound service worker

   BIJ ELKE CODEWIJZIGING: verhoog VERSION hieronder.
   Dat is het enige wat je hoeft aan te passen. De cachenaam,
   de versiebadge in de app en de "nieuwe versie"-knop volgen
   automatisch uit deze regel.
   ============================================================ */

const VERSION = "0.1.9"; // bug fixes

const CACHE = "hourhound-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Navigaties: netwerk eerst, zodat een nieuwe versie meteen binnenkomt.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put("./index.html", fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // Overige bestanden: cache eerst, netwerk als aanvulling.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return Response.error();
    }
  })());
});

self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "GET_VERSION" && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ version: VERSION, cache: CACHE });
  }
  if (d.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
