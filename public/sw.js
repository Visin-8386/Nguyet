/* eslint-disable */
const CACHE = "nguyet-v6";
const HEAVY = ["/models/", "/wasm/"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  const isHeavy = HEAVY.some((p) => url.pathname.includes(p));

  if (isHeavy) {
    // Cache-first cho model/wasm (lớn, ít thay đổi).
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
  } else {
    // Network-first cho HTML/CSS/JS để cập nhật nhanh.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
  }
});
