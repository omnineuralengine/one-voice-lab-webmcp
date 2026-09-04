/* ONE Voice Lab offline shell.
 * Deliberately excludes API routes, media, range requests, and authenticated
 * requests so sensitive customer or provider data never enters this cache. */
const CACHE_NAME = "one-voice-lab-shell-v1";
const SHELL_URLS = [
  "/",
  "/providers",
  "/evaluate",
  "/simulation-lab",
  "/build",
  "/learn",
  "/pre-sales-studio",
  "/architecture-studio",
  "/",
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/pocket-deepgram-180.png",
  "/pocket-deepgram-192.png",
  "/pocket-deepgram-512.png",
];
const PUBLIC_ASSET_URLS = new Set([
  "/manifest.webmanifest",
  "/pocket-deepgram-180.png",
  "/pocket-deepgram-192.png",
  "/pocket-deepgram-512.png",
  "/brand/one-voice-lab-logo.png",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => (key.startsWith("pocket-deepgram-") || key.startsWith("one-voice-lab-")) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/") || ["/settings", "/bench", "/membership"].includes(url.pathname)) return;
  if (["code", "token", "access_token", "refresh_token", "state"].some((name) => url.searchParams.has(name))) return;
  if (request.headers.has("authorization") || request.headers.has("range")) return;
  if (["audio", "video"].includes(request.destination)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request, SHELL_URLS.includes(url.pathname)));
    return;
  }

  if (isCacheEligibleAsset(url, request.destination)) {
    event.respondWith(cacheFirstAsset(request));
  }
});

function isCacheEligibleAsset(url, destination) {
  if (url.pathname.startsWith("/_next/static/")) {
    return ["style", "script", "font", "image", "worker"].includes(destination);
  }
  return PUBLIC_ASSET_URLS.has(url.pathname) && ["image", "manifest"].includes(destination);
}

async function networkFirstNavigation(request, cacheEligible) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (cacheEligible && response.ok && !/(?:no-store|private)/i.test(cacheControl)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request))
      || (urlForRequest(request).pathname === "/" ? await cache.match("/") : null)
      || (await cache.match("/offline.html"));
  }
}

function urlForRequest(request) {
  return new URL(request.url);
}
async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (response.ok && !/(?:no-store|private)/i.test(cacheControl)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}
