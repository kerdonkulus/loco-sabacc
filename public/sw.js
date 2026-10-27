// Service worker: caches the app so it works at the table with no signal.
// Paths are relative to the worker's scope, so the app can live under any path.

const CACHE = "sabacc-v1";
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL("./", SCOPE).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Cache the page plus the hashed scripts and styles it references.
      const res = await fetch(INDEX, { cache: "no-store" });
      const html = await res.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => new URL(m[1], SCOPE).href);
      await cache.put(INDEX, res);
      const extras = ["manifest.webmanifest", "icons/icon-192.png"].map((p) => new URL(p, SCOPE).href);
      await cache.addAll([...new Set([...assets, ...extras])]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    // Network first so updates arrive, falling back to the cached app offline.
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(CACHE)).put(INDEX, res.clone());
          return res;
        } catch {
          return (await caches.match(INDEX)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Assets have hashed names, so a cached copy is always correct.
  event.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })(),
  );
});
