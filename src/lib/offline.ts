import { activeDbName, db } from "./db";
import type { OfflineItem, Station } from "./types";

const CACHE = "radio-audio-v1";

export const cacheSupported = () => typeof caches !== "undefined";

/** Ключ изолирован по аккаунту: один пользователь не удалит загрузку другого. */
export function audioCacheKey(stationId: string): Request {
  return audioCacheKeyFor(activeDbName(), stationId);
}

export function audioCacheKeyFor(dbName: string, stationId: string): Request {
  return new Request(`${location.origin}/__pocket_radio_audio__/${encodeURIComponent(dbName)}/${encodeURIComponent(stationId)}`);
}

/**
 * Сверяет метаданные загрузок в IndexedDB с Cache API.
 * Кэш может быть очищен/вытеснен браузером отдельно от базы; такие записи нельзя показывать как офлайн.
 * Старый формат с URL-ключом мигрируем, если исходный адрес ещё есть в библиотеке или плейлисте.
 */
export async function reconcileOfflineCache(): Promise<void> {
  const scope = activeDbName();
  if (!cacheSupported()) {
    try {
      if (scope === activeDbName()) await db.offline.clear();
    } catch {
      /* база тоже может быть недоступна */
    }
    return;
  }

  let cache: Cache;
  let rows: OfflineItem[];
  try {
    [cache, rows] = await Promise.all([caches.open(CACHE), db.offline.toArray()]);
  } catch {
    // Не стираем данные при временной ошибке доступа к хранилищу.
    return;
  }
  if (scope !== activeDbName() || !rows.length) return;

  const legacyUrls = new Map<string, string>();
  try {
    const [stations, playlists] = await Promise.all([
      db.stations.bulkGet(rows.map((row) => row.stationId)),
      db.settings.where(":id").startsWith("pl:").toArray(),
    ]);
    if (scope !== activeDbName()) return;
    stations.forEach((station, i) => {
      if (station?.url) legacyUrls.set(rows[i].stationId, station.url);
    });
    for (const row of playlists) {
      const playlist = row.value as { items?: { id?: string; url?: string }[] };
      for (const item of playlist.items ?? []) {
        if (item?.id && item.url) legacyUrls.set(`pli:${item.id}`, item.url);
      }
    }
  } catch {
    // Новые ключи всё равно можно проверить без таблицы источников.
  }

  for (const row of rows) {
    if (scope !== activeDbName()) return;
    try {
      const key = audioCacheKeyFor(scope, row.stationId);
      if (await cache.match(key)) continue;
      const legacyUrl = legacyUrls.get(row.stationId);
      const legacy = legacyUrl ? await cache.match(legacyUrl) : undefined;
      if (legacy) {
        // Если миграция не удалась из-за квоты, старая запись остаётся воспроизводимой.
        try {
          await cache.put(key, legacy.clone());
        } catch {
          /* используем legacy-ключ до следующей сверки */
        }
        continue;
      }
      await db.offline.delete(row.stationId);
    } catch {
      // Сбой отдельного cache.match — неизвестность, а не доказательство потери файла.
    }
  }

  // Завершившийся Cache.put без записи IndexedDB может оставить неучтённый файл.
  try {
    const prefix = `${location.origin}/__pocket_radio_audio__/${encodeURIComponent(scope)}/`;
    const known = new Set(rows.map((row) => row.stationId));
    for (const key of await cache.keys()) {
      if (!key.url.startsWith(prefix)) continue;
      const encodedId = key.url.slice(prefix.length);
      let id = encodedId;
      try {
        id = decodeURIComponent(encodedId);
      } catch {
        /* malformed cache key: remove it as unindexed */
      }
      if (!known.has(id)) await cache.delete(key);
    }
  } catch {
    /* Cache API мог временно стать недоступен */
  }
}

async function cachedResponse(station: Pick<Station, "id" | "url">): Promise<Response | null> {
  if (!cacheSupported()) return null;
  const scope = activeDbName();
  let item: OfflineItem | undefined;
  try {
    item = await db.offline.get(station.id);
  } catch {
    return null;
  }
  if (!item || scope !== activeDbName()) return null;

  try {
    const cache = await caches.open(CACHE);
    const key = audioCacheKeyFor(scope, station.id);
    let response = await cache.match(key);
    if (!response && station.url) {
      // Миграция со старой версии, где ключом был URL.
      const legacy = await cache.match(station.url);
      if (legacy) {
        try {
          await cache.put(key, legacy.clone());
        } catch {
          /* исходная запись всё ещё пригодна для этого воспроизведения */
        }
        response = legacy;
      }
    }
    if (!response) {
      // Не оставляем «скачано» в интерфейсе, если соответствующего файла уже нет.
      if (scope === activeDbName()) await db.offline.delete(station.id);
      return null;
    }
    return response;
  } catch {
    // Временная ошибка Cache API не должна превращаться в удаление метаданных.
    return null;
  }
}

/** Проверяет наличие аудио, а при достоверно отсутствующем файле удаляет stale-метаданные. */
export async function hasCachedAudio(station: Pick<Station, "id" | "url">): Promise<boolean> {
  return !!(await cachedResponse(station));
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
    let saveError: unknown;
    // Поглощаем ошибку здесь: при отмене чтения иначе может остаться unhandled rejection.
    const saving = cache
      .put(audioCacheKey(station.id), new Response(cacheBody, { headers: { "Content-Type": type, ...(total ? { "Content-Length": String(total) } : {}) } }))
      .catch((e) => {
        saveError = e;
      });
    const reader = progressBody.getReader();
    try {
      for (;;) {
        if (saveError) throw saveError;
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        onProgress(size, total);
      }
    } catch (e) {
      await reader.cancel().catch(() => undefined);
      await saving;
      throw e;
    }
    await saving;
    if (saveError) throw saveError;
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
  const res = await cachedResponse(station);
  if (!res) return null;
  try {
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
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
