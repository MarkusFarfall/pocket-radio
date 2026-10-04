import { activeDbName, db } from "./db";
import type { Station } from "./types";

const CACHE = "radio-audio-v1";

export const cacheSupported = () => typeof caches !== "undefined";

/** Ключ изолирован по аккаунту: один пользователь не удалит загрузку другого. */
export function audioCacheKey(stationId: string): Request {
  const scope = encodeURIComponent(activeDbName());
  return new Request(`${location.origin}/__pocket_radio_audio__/${scope}/${encodeURIComponent(stationId)}`);
}

export function audioCacheKeyFor(dbName: string, stationId: string): Request {
  return new Request(`${location.origin}/__pocket_radio_audio__/${encodeURIComponent(dbName)}/${encodeURIComponent(stationId)}`);
}

/** Удаляет только аудиофайлы указанного профиля. */
export async function clearAudioScope(dbName: string) {
  if (!cacheSupported()) return;
  const cache = await caches.open(CACHE);
  const prefix = `${location.origin}/__pocket_radio_audio__/${encodeURIComponent(dbName)}/`;
  const keys = await cache.keys();
  await Promise.all(keys.filter((k) => k.url.startsWith(prefix)).map((k) => cache.delete(k)));
}

export async function putOfflineBlob(stationId: string, url: string, body: BodyInit, type: string, size: number) {
  const cache = await caches.open(CACHE);
  await cache.put(audioCacheKey(stationId), new Response(body, { headers: { "Content-Type": type, "Content-Length": String(size) } }));
  await db.offline.put({ stationId, size, ts: Date.now() });
  void url; // URL хранится в Station/PlaylistItem, а не дублируется в индексе загрузок
}

export async function downloadVod(station: Station, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal) {
  if (!cacheSupported()) throw new Error("Cache API недоступен в этом браузере");
  const res = await fetch(station.url, { mode: "cors", signal });
  if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const type = res.headers.get("content-type") || "audio/mpeg";
  let size = 0;
  const cache = await caches.open(CACHE);
  if (res.body) {
    // tee(): одна ветка сразу пишется в Cache API, вторая только считает прогресс.
    // Большой альбом больше не собирается целиком в оперативной памяти.
    const [cacheBody, progressBody] = res.body.tee();
    const saving = cache.put(audioCacheKey(station.id), new Response(cacheBody, { headers: { "Content-Type": type, ...(total ? { "Content-Length": String(total) } : {}) } }));
    const reader = progressBody.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      onProgress(size, total);
    }
    await saving;
  } else {
    const blob = await res.blob();
    size = blob.size;
    await cache.put(audioCacheKey(station.id), new Response(blob, { headers: { "Content-Type": type, "Content-Length": String(size) } }));
  }
  await db.offline.put({ stationId: station.id, size, ts: Date.now() });
  return size;
}

export async function removeVod(station: Pick<Station, "id" | "url">) {
  if (cacheSupported()) {
    const cache = await caches.open(CACHE);
    await cache.delete(audioCacheKey(station.id));
    // миграция со старой версии, где ключом был URL
    if (station.url) await cache.delete(station.url);
  }
  await db.offline.delete(station.id);
}

export async function cachedBlobUrl(station: Station): Promise<string | null> {
  if (!cacheSupported()) return null;
  const item = await db.offline.get(station.id);
  if (!item) return null;
  const cache = await caches.open(CACHE);
  let res = await cache.match(audioCacheKey(station.id));
  if (!res) {
    // старые загрузки: переносим на изолированный ключ аккаунта
    const legacy = await cache.match(station.url);
    if (legacy) {
      await cache.put(audioCacheKey(station.id), legacy.clone());
      res = legacy;
    }
  }
  if (!res) return null;
  return URL.createObjectURL(await res.blob());
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
