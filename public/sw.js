const CACHE_PREFIX = "omnevum-shell-";
const CACHE_NAME = "omnevum-shell-v1";
const UPDATE_KIND = "SHELL_ONLY";
const PRECACHE_URLS = ["./"];
const CACHE_HISTORY_NAME = "omnevum-history";
const CACHE_HISTORY_URL = "./__omnevum-cache-history__";
const RETAINED_GENERATIONS = 2;

async function activeCache() {
  return caches.open(CACHE_NAME);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((path) => new URL(path, self.registration.scope).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([caches.keys(), caches.open(CACHE_HISTORY_NAME)])
      .then(async ([keys, historyCache]) => {
        const historyResponse = await historyCache.match(new URL(CACHE_HISTORY_URL, self.registration.scope).href);
        let history = [];
        if (historyResponse) {
          try {
            const parsed = await historyResponse.json();
            if (Array.isArray(parsed)) history = parsed.filter((value) => typeof value === "string");
          } catch {
            history = [];
          }
        }
        const existingSet = new Set(keys);
        history = history.filter((name) => name === CACHE_NAME || existingSet.has(name));
        const existingGenerations = keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
        const generations = [...new Set([CACHE_NAME, ...history, ...existingGenerations])].slice(0, RETAINED_GENERATIONS);
        await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !generations.includes(key)).map((key) => caches.delete(key)));
        await historyCache.put(new URL(CACHE_HISTORY_URL, self.registration.scope).href, new Response(JSON.stringify(generations), { headers: { "content-type": "application/json" } }));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message.type !== "string") return;
  if (message.type === "OMNEVUM_SW_STATUS_REQUEST") {
    const port = event.ports?.[0];
    port?.postMessage({ type: "OMNEVUM_SW_STATUS", cacheName: CACHE_NAME, updateKind: UPDATE_KIND, scope: self.registration.scope });
    return;
  }
  if (message.type === "OMNEVUM_SW_ACTIVATE") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            void activeCache().then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => activeCache().then((cache) => cache.match(request).then((cached) => cached ?? cache.match(new URL("./", self.registration.scope).href))))
    );
    return;
  }

  event.respondWith(
    activeCache().then((cache) => cache.match(request)).then((cached) =>
      cached ?? fetch(request).then((response) => {
        if (response.ok) void activeCache().then((cache) => cache.put(request, response.clone()));
        return response;
      })
    )
  );
});
