const VERSION = "__PWA_BUILD_ID__";
const PRECACHE = `cq-precache-${VERSION}`;
const RUNTIME = `cq-runtime-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_RUNTIME_ENTRIES = 100;
const PUBLIC_ASSETS = new Set([
  "/favicon.ico", "/manifest.webmanifest", "/apple-icon.png", "/icon.png",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/logos/logo.png",
]);

function cacheable(response) {
  return response.ok && response.type === "basic" && !response.redirected
    && !/no-store|private/i.test(response.headers.get("Cache-Control") || "")
    && response.headers.get("Vary") !== "*";
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    try {
      const response = await fetch(new Request(OFFLINE_URL, {cache: "reload", credentials: "omit"}));
      if (!cacheable(response)) throw new Error("Offline page unavailable");
      const html = await response.clone().text();
      const assets = new Set(PUBLIC_ASSETS);
      const pattern = /["']([^"']*\/_next\/static\/[^"']+\.(?:js|css|woff2))["']/g;
      for (const match of html.matchAll(pattern)) {
        const url = new URL(match[1], self.location.origin);
        if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) assets.add(url.href);
      }
      // A partially downloaded release must never replace a working offline page.
      await cache.addAll([...assets].map(url => new Request(url, {cache: "reload", credentials: "omit"})));
      await cache.put(OFFLINE_URL, response);
    } catch (error) {
      await caches.delete(PRECACHE);
      throw error;
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("cq-") && key !== PRECACHE && key !== RUNTIME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

let pendingWrites = Promise.resolve();
function store(request, response) {
  pendingWrites = pendingWrites.then(async () => {
    const cache = await caches.open(RUNTIME);
    await cache.put(request, response);
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES)).map(key => cache.delete(key)));
  }).catch(() => {}); // Quota failure must not break an online response.
  return pendingWrites;
}

async function assetResponse(request, event) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) event.waitUntil(store(request, response.clone()));
  return response;
}

async function navigationResponse(request) {
  try {
    // Never persist HTML from login, protected routes, admin or the landing page.
    return await fetch(request);
  } catch {
    if (new URL(request.url).pathname !== OFFLINE_URL) {
      return Response.redirect(new URL(OFFLINE_URL, self.location.origin).href, 302);
    }
    return (await caches.match(OFFLINE_URL, {cacheName: PRECACHE})) || new Response(
      '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title><h1>Você está sem conexão</h1><p>Verifique sua internet e tente novamente.</p></html>',
      {status: 503, headers: {"Content-Type": "text/html; charset=utf-8"}},
    );
  }
}

self.addEventListener("fetch", event => {
  const {request} = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/accounts/")) return;
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
  } else if (url.pathname.startsWith("/_next/static/") || PUBLIC_ASSETS.has(url.pathname)) {
    event.respondWith(assetResponse(request, event));
  }
  // API, RSC/prefetch, optimizer images, uploads and user files stay network-only.
});
