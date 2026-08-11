const CACHE_VERSION = "tidegraph-v0.1.3";
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
  "./data/2026/AB.js",
  "./data/2026/AO.js",
  "./data/2026/AY.js",
  "./data/2026/B3.js",
  "./data/2026/CS.js",
  "./data/2026/DJ.js",
  "./data/2026/HK.js",
  "./data/2026/IS.js",
  "./data/2026/KB.js",
  "./data/2026/KC.js",
  "./data/2026/KG.js",
  "./data/2026/KR.js",
  "./data/2026/MY.js",
  "./data/2026/MZ.js",
  "./data/2026/NH.js",
  "./data/2026/NG.js",
  "./data/2026/NS.js",
  "./data/2026/OM.js",
  "./data/2026/ON.js",
  "./data/2026/OS.js",
  "./data/2026/QS.js",
  "./data/2026/QF.js",
  "./data/2026/SM.js",
  "./data/2026/S6.js",
  "./data/2026/SK.js",
  "./data/2026/TA.js",
  "./data/2026/T1.js",
  "./data/2026/TB.js",
  "./data/2026/TK.js",
  "./data/2026/TT.js",
  "./data/2026/TY.js",
  "./data/2026/WN.js",
  "./data/2026/YJ.js",
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

  if (url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  const cache = await caches.open(APP_CACHE);
  cache.put(request, response.clone());
  return response;
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
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw new Error("No cached tide data");
  }
}
