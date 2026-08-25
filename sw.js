/* ============================================================
   hourhound service worker

   BIJ ELKE CODEWIJZIGING: verhoog VERSION hieronder.
   Dat is het enige wat je hoeft aan te passen. De cachenaam,
   de versiebadge in de app en de "nieuwe versie"-knop volgen
   automatisch uit deze regel.
   ============================================================ */

const VERSION = "0.1.18"; // various patches up to Patch J

const CACHE = "hourhound-" + VERSION;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./css/app.css",
  "./js/core.js",
  "./js/timer.js",
  "./js/wizard.js",
  "./js/views.js",
  "./js/controls.js",
  "./js/io.js",
  "./js/booking.js",
  "./js/app.js",
  "./js/hh.js",
  "./js/domain/time.js",
  "./js/domain/booking.js",
  "./js/domain/dvn.js",
  "./js/domain/overbooking.js",
  "./js/storage/indexeddb.js",
  "./js/services/admin.js",
  "./js/services/day-rules.js"
];

self.addEventListener("install", (e) => {
  // Geen skipWaiting() → nieuwe worker blijft "waiting"
  // tot de gebruiker via de knop SKIP_WAITING stuurt.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .catch((err) => {
        console.error("[SW] Install failed:", err);
      })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Alleen GET-requests van dezelfde origin
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) {
    return;
  }

  // Navigaties: netwerk eerst → nieuwe versie komt sneller binnen
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch (err) {
          return (await caches.match("./index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // Overige bestanden: cache eerst, netwerk als fallback
  e.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;

      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        return Response.error();
      }
    })()
  );
});

self.addEventListener("message", (e) => {
  const d = e.data || {};

  if (d.type === "GET_VERSION" && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ version: VERSION, cache: CACHE });
  }

  if (d.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
