/* ============================================================
   hourhound service worker

   BIJ ELKE CODEWIJZIGING: verhoog VERSION hieronder.
   Dat is het enige wat je hoeft aan te passen. De cachenaam,
   de versiebadge in de app en de "nieuwe versie"-knop volgen
   automatisch uit deze regel.
   ============================================================ */

const VERSION = "0.1.21"; // Patch X2 - consistent release cache

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
  "./js/services/day-rules.js",
  "./js/services/timer.js",
  "./js/state.js",
  "./js/app-runtime.js",
  "./js/services/settings.js",
  "./js/ui/modal.js",
  "./js/ui/now-live-view.js",
  "./js/ui/day-status-view.js",
  "./js/ui/day-close-controller.js",
  "./js/ui/day-editor-controller.js",
  "./js/ui/now-recent-view.js",
  "./js/ui/day-view.js",
  "./js/ui/day-controller.js",
  "./js/ui/week-view.js",
  "./js/ui/week-controller.js",
  "./js/ui/dvn-view.js",
  "./js/ui/overbooking-view.js",
  "./js/ui/overbooking-controller.js",
  "./js/ui/manage-view.js",
  "./js/ui/manage-controller.js",
  "./js/ui/live-controller.js",
  "./js/ui/day-table-controller.js",
];

const canonicalUrl = (url) => {
  const parsed = new URL(url, location.href);
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
};

const SHELL_URLS = new Set(ASSETS.map((asset) => canonicalUrl(asset)));

self.addEventListener("install", (e) => {
  // Geen skipWaiting() → nieuwe worker blijft "waiting"
  // tot de gebruiker via de knop SKIP_WAITING stuurt.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS.map((asset) => new Request(new URL(asset, location.href), {cache: "reload"}))))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("hourhound-") && k !== CACHE).map((k) => caches.delete(k))
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

  const shellRequest = req.mode === "navigate" || SHELL_URLS.has(canonicalUrl(req.url));

  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const cache = await caches.open(CACHE);
          return (await cache.match(canonicalUrl("./index.html"))) || Response.error();
        } catch (err) {
          return Response.error();
        }
      })()
    );
    return;
  }

  e.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(CACHE);
        const hit = await cache.match(shellRequest ? canonicalUrl(req.url) : req);
        if (hit) return hit;
        if (shellRequest) return Response.error();
      } catch (err) {
        if (shellRequest) return Response.error();
        cache = null;
      }

      try {
        const fresh = await fetch(req);
        if (cache && fresh && fresh.ok) {
          try {
            await cache.put(req, fresh.clone());
          } catch (err) {
            // A quota or storage error must not hide a usable network response.
          }
        }
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
