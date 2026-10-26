// Offline support. The build stamps VERSION with a content hash, so each deploy
// gets a fresh cache and old ones are removed.
const VERSION = "__VERSION__";
const CACHE = `stepwise-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Network first, so students always get the latest version when online;
// the cache is only used when the network fails.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
      if (hit) return hit;
      if (req.mode === "navigate") return (await cache.match(url.pathname)) ?? (await cache.match("/"));
      return Response.error();
    }
  })());
});
