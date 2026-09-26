const VERSION = "cq-v1";
const PRECACHE = `cq-precache-${VERSION}`;
const RUNTIME = `cq-runtime-${VERSION}`;

const OFFLINE_URL = "/offline";
const PAGES_TO_PRECACHE = ["/login", OFFLINE_URL];
const ASSETS_TO_PRECACHE = [
  "/favicon.ico",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/logos/logo.png",
];

const PRECACHE_FIRST_PATHS = new Set([
  "/favicon.ico",
  "/manifest.webmanifest",
  "/apple-icon.png",
  "/icon.png",
]);

const ASSET_PATTERN = /["']([^"']*\/_next\/static\/[^"']+\.(?:js|css|woff2))["']/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await Promise.allSettled([
        ...PAGES_TO_PRECACHE.map((url) => precachePage(cache, url)),
        ...ASSETS_TO_PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      ]);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("cq-") && key !== PRECACHE && key !== RUNTIME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function precachePage(cache, url) {
  try {
    const response = await fetch(new Request(url, { cache: "reload" }));
    if (!response.ok) return;

    const html = await response.text();

    await cache.put(
      url,
      new Response(html, {
        status: response.status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );

    const assets = new Set();
    let match = ASSET_PATTERN.exec(html);
    while (match) {
      assets.add(match[1]);
      match = ASSET_PATTERN.exec(html);
    }
    ASSET_PATTERN.lastIndex = 0;

    await Promise.allSettled(
      [...assets].map((asset) => cache.add(new Request(asset, { cache: "reload" }))),
    );
  } catch {
    return;
  }
}

function isCacheable(response) {
  return Boolean(
    response && response.ok && response.type === "basic" && !response.redirected,
  );
}

async function offlineFallback() {
  return (
    (await caches.match(OFFLINE_URL, { cacheName: PRECACHE })) ||
    (await caches.match(OFFLINE_URL)) ||
    new Response(
      "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">"
        + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        + "<title>Sem conexão</title>"
        + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;"
        + "justify-content:center;font-family:system-ui,sans-serif;background:#f8fafc;"
        + "color:#0f172a;text-align:center;padding:24px}"
        + "h1{font-size:20px}p{color:#475569;font-size:14px}</style></head>"
        + "<body><div><h1>Você está sem conexão</h1>"
        + "<p>Verifique sua internet e tente novamente.</p></div></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  );
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await caches.match(request));
    if (cached) return cached;

    const url = new URL(request.url);
    if (url.pathname !== OFFLINE_URL) {
      return Response.redirect(new URL(OFFLINE_URL, self.location.origin).href, 302);
    }

    return offlineFallback();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);

  if (cached) {
    fetch(request)
      .then((response) => {
        if (isCacheable(response)) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {});
    return cached;
  }

  const response = await fetch(request);
  if (isCacheable(response)) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    PRECACHE_FIRST_PATHS.has(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  const isImage =
    request.destination === "image" ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/landing/") ||
    url.pathname.startsWith("/backgrounds/") ||
    url.pathname.startsWith("/logos/");

  if (isImage) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
