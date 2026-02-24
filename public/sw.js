/* ─── Service Worker ───────────────────────────────────
   Cache-first strategy for static assets.
   Network-first for API calls and dynamic content.
   ────────────────────────────────────────────────────── */

/// <reference lib="webworker" />

const CACHE_NAME = "resume-maker-v1";
const STATIC_ASSETS = ["/", "/index.html"];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API calls and external requests — always go to network
  if (
    url.origin !== sw.location.origin ||
    url.pathname.startsWith("/api") ||
    request.url.includes("googleapis.com") ||
    request.url.includes("azure.com") ||
    request.url.includes("clerk.") ||
    request.url.includes("supabase.")
  ) {
    return;
  }

  // For static assets (JS, CSS, fonts, images): cache-first
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "image" ||
    url.pathname.match(/\.(js|css|woff2?|ttf|png|svg|ico|webp)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // HTML pages: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
      .then((response) => response || new Response("Offline", { status: 503 })),
  );
});
