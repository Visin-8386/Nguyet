/* eslint-env serviceworker */
// Service worker: cache model + wasm + ảnh để lần tải sau nhanh hơn.
const CACHE = "nguyet-v1";
const CACHEABLE = ["/models/", "/wasm/", "/assets/"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!CACHEABLE.some((p) => url.pathname.includes(p))) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        });
      }),
    ),
  );
});
