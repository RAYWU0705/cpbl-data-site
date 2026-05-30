/* =========================================================
   Ray's CPBL Data Site
   service-worker.js
   v5.5.3-PWA-APP-SHELL
========================================================= */

const CACHE_VERSION = "v5.5.3-pwa-app-shell";
const APP_SHELL_CACHE = `cpbl-app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `cpbl-runtime-${CACHE_VERSION}`;

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./schedule.html",
  "./standings.html",
  "./teams.html",
  "./team.html",
  "./team-roster.html",
  "./team-transactions.html",
  "./player.html",
  "./search.html",
  "./game-day.html",
  "./farm-schedule.html",
  "./version.html",
  "./about.html",
  "./rules.html",
  "./season.html",
  "./demo.html",
  "./css/style.css",
  "./css/match.css",
  "./css/player.css",
  "./css/farm-match.css",
  "./js/version.js",
  "./js/pages/index.js",
  "./js/pages/match.js",
  "./js/pages/player.js",
  "./js/pages/search.js",
  "./assets/logo/cpbl.png",
  "./assets/logo/brothers.png",
  "./assets/logo/lions.png",
  "./assets/logo/monkeys.png",
  "./assets/logo/dragons.png",
  "./assets/logo/guardians.png",
  "./assets/logo/hawks.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn("[PWA] install cache skipped:", err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("cpbl-") && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith(".json") || url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function navigationHandler(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);

    if (cached) return cached;

    return caches.match("./index.html");
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    return cached || caches.match("./index.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}
