const CACHE_VERSION = "tidegraph-v0.2.2";
const APP_CACHE = `${CACHE_VERSION}-app`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/data.js",
  "./js/tide-graph.js",
  "./manifest.webmanifest",
  "./data/stations.json",
  "./data/stations.js",
  "./data/2026/TK.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) {
    return;
  }

  if (url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await matchCached(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    const cache = await caches.open(APP_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const fallback = await matchCached(request);
    if (fallback) {
      return fallback;
    }
    throw error;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (cached) {
      return cached;
    }
    throw new Error("No cached tide data");
  }
}

async function matchCached(request) {
  return (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
}
