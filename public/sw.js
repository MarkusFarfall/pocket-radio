/* Эфир — Service Worker.
 * Стратегии (в духе Workbox):
 *  - навигация / оболочка:  NetworkFirst с откатом в кэш → приложение открывается офлайн;
 *  - same-origin статика:   StaleWhileRevalidate;
 *  - аудио и кросс-доменные потоки: НЕ перехватываются (идут напрямую, в т.ч. LAN).
 * Каталог, избранное и статистика лежат в IndexedDB и от SW не зависят. */
const VERSION = "v3";
const SHELL = "radio-shell-" + VERSION;
const AUDIO_CACHE = "radio-audio-v1";
const IMG_CACHE = "radio-img-v1";
const IMG_LIMIT = 220;

// Картинки с других доменов (фото паков, логотипы станций, обложки подкастов):
// отдаём из кэша сразу и обновляем в фоне, чтобы без сети интерфейс не «пустел».
async function imageStrategy(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then(async (res) => {
      if (res && (res.ok || res.type === "opaque")) {
        await cache.put(req, res.clone());
        const keys = await cache.keys();
        if (keys.length > IMG_LIMIT) await Promise.all(keys.slice(0, keys.length - IMG_LIMIT).map((k) => cache.delete(k)));
      }
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || net;
}
const PRECACHE = ["./", "manifest.webmanifest", "icon-512.jpg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("radio-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.destination === "image" && url.origin !== self.location.origin) {
    event.respondWith(imageStrategy(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.destination === "audio" || req.destination === "video" || req.headers.has("range")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./").then((r) => r || caches.match(req)))
    );
    return;
  }

  event.respondWith(
    caches.open(SHELL).then((cache) =>
      cache.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
  if (e.data === "clearAudio") caches.delete(AUDIO_CACHE);
  if (e.data === "clearImages") caches.delete(IMG_CACHE);
});
