import Dexie, { type Table } from "dexie";
import type { Draft, OfflineItem, PlayEvent, Playlist, PlaylistItem, SavedTrack, Session, Station } from "./types";
import { TEMPLATES, guessKind, normalizeUrl, uid, validUrl } from "./templates";
import { fixText } from "./text";

export interface Setting {
  key: string;
  value: unknown;
}

class RadioDB extends Dexie {
  stations!: Table<Station, string>;
  sessions!: Table<Session, number>;
  events!: Table<PlayEvent, number>;
  settings!: Table<Setting, string>;
  offline!: Table<OfflineItem, string>;
  tracks!: Table<SavedTrack, number>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      stations: "id, createdAt, lastPlayedAt, kind, genre",
      sessions: "++id, stationId, startedAt",
      events: "++id, stationId, ts, type",
      settings: "key",
      offline: "stationId",
    });
    this.version(2).stores({
      stations: "id, createdAt, lastPlayedAt, kind, genre",
      sessions: "++id, stationId, startedAt",
      events: "++id, stationId, ts, type",
      settings: "key",
      offline: "stationId",
      tracks: "++id, ts, stationId",
    });
  }
}

/** Гостевая база — та же, что была до появления аккаунтов, поэтому старые данные не теряются. */
export const GUEST_DB = "local-radio";
export const userDbName = (userId: string) => `pocket-radio-u-${userId}`;

let current = new RadioDB(GUEST_DB);
let currentName = GUEST_DB;

/** Подключает базу пользователя (null — гостевая). У каждого аккаунта своя изолированная база. */
export function switchDb(userId: string | null) {
  const name = userId ? userDbName(userId) : GUEST_DB;
  if (name === currentName) return;
  current.close();
  current = new RadioDB(name);
  currentName = name;
}
export const activeDbName = () => currentName;

/** Прокси: весь код продолжает писать `db.stations…`, а реальная база подменяется при смене аккаунта. */
export const db: RadioDB = new Proxy({} as RadioDB, {
  get(_t, prop) {
    const v = Reflect.get(current, prop, current);
    return typeof v === "function" ? v.bind(current) : v;
  },
  set(_t, prop, value) {
    return Reflect.set(current, prop, value, current);
  },
  has(_t, prop) {
    return Reflect.has(current, prop);
  },
});

/** Сколько данных лежит в гостевой базе (для предложения перенести их в новый аккаунт). */
export async function guestSummary(): Promise<{ stations: number; tracks: number }> {
  const g = new RadioDB(GUEST_DB);
  try {
    const [stations, tracks] = await Promise.all([g.stations.count(), g.tracks.count()]);
    return { stations, tracks };
  } catch {
    return { stations: 0, tracks: 0 };
  } finally {
    g.close();
  }
}

/** Копирует всё из гостевой базы в текущую (базу нового аккаунта). */
export async function copyGuestIntoCurrent(): Promise<number> {
  const g = new RadioDB(GUEST_DB);
  const targetName = currentName;
  try {
    const [stations, sessions, events, tracks, settings, offline] = await Promise.all([
      g.stations.toArray(),
      g.sessions.toArray(),
      g.events.toArray(),
      g.tracks.toArray(),
      g.settings.toArray(),
      g.offline.toArray(),
    ]);
    await db.transaction("rw", [db.stations, db.sessions, db.events, db.tracks, db.settings, db.offline], async () => {
      await db.stations.bulkPut(stations);
      await db.sessions.bulkPut(sessions);
      await db.events.bulkPut(events);
      await db.tracks.bulkPut(tracks);
      await db.settings.bulkPut(settings);
      await db.offline.bulkPut(offline);
    });
    // Cache API не входит в IndexedDB-транзакцию: копируем скачанное между областями профилей отдельно.
    try {
      const cache = await caches.open("radio-audio-v1");
      for (const o of offline) {
        const from = `${location.origin}/__pocket_radio_audio__/${encodeURIComponent(GUEST_DB)}/${encodeURIComponent(o.stationId)}`;
        const to = `${location.origin}/__pocket_radio_audio__/${encodeURIComponent(targetName)}/${encodeURIComponent(o.stationId)}`;
        const r = await cache.match(from);
        if (r) await cache.put(to, r.clone());
      }
    } catch {
      /* Cache API недоступен — метаданные всё равно перенесены */
    }
    return stations.length;
  } finally {
    g.close();
  }
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await db.settings.get(key);
  return r ? (r.value as T) : fallback;
}
export function setSetting(key: string, value: unknown) {
  return db.settings.put({ key, value });
}

export function draftToStation(d: Draft, existing?: Station): Station {
  const url = normalizeUrl(d.url ?? existing?.url ?? "");
  const kind = d.kind ?? existing?.kind ?? guessKind(url);
  const id = existing?.id ?? d.id ?? uid();
  const now = Date.now();
  let fallbackName = "Станция";
  try {
    fallbackName = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return {
    id,
    syncId: existing?.syncId ?? d.id ?? id,
    name: fixText(d.name ?? existing?.name ?? "") || fallbackName,
    url,
    kind,
    genre: fixText(d.genre ?? existing?.genre ?? ""),
    mood: fixText(d.mood ?? existing?.mood ?? ""),
    city: fixText(d.city ?? existing?.city ?? ""),
    tags: (d.tags ?? existing?.tags ?? []).map((t) => fixText(t).replace(/^#/, "")).filter(Boolean),
    // иконка — ключ SVG-глифа вида «g:piano»; пусто = подобрать по жанру
    icon: ((d.icon ?? existing?.icon ?? "") as string).startsWith("g:") ? (d.icon ?? existing?.icon ?? "") : "",
    logo: (() => {
      const l = d.logo ?? existing?.logo;
      return l && /^(https:\/\/|data:image\/)/i.test(l) ? l : undefined;
    })(),
    note: fixText(d.note ?? existing?.note ?? ""),
    bitrate: d.bitrate ?? existing?.bitrate ?? TEMPLATES.find((t) => t.kind === kind)?.bitrate ?? 128,
    favorite: existing?.favorite ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastPlayedAt: existing?.lastPlayedAt,
    plays: existing?.plays ?? 0,
    totalSeconds: existing?.totalSeconds ?? 0,
    resumePos: existing?.resumePos,
    resumeUpdatedAt: existing?.resumeUpdatedAt,
    demo: existing?.demo,
    health: existing?.health,
  };
}

export async function saveStation(d: Draft, existing?: Station): Promise<Station> {
  const s = draftToStation(d, existing);
  // при смене адреса прежняя проверка недействительна
  if (existing && existing.url !== s.url) {
    delete s.health;
    delete s.resumePos;
    delete s.resumeUpdatedAt;
  }
  await db.stations.put(s);
  return s;
}

/** Добавить пачку станций, пропуская уже существующие URL. Возвращает число добавленных. */
export async function addMany(drafts: Draft[], demo = false): Promise<number> {
  const all = await db.stations.toArray();
  const have = new Set(all.map((s) => s.url));
  const ids = new Set(all.map((s) => s.id));
  const list: Station[] = [];
  let i = 0;
  for (const d of drafts) {
    if (!d.url) continue;
    const url = normalizeUrl(d.url);
    if (have.has(url)) continue;
    have.add(url);
    const s = draftToStation({ ...d, url });
    if (ids.has(s.id)) s.id = uid();
    ids.add(s.id);
    s.createdAt += i++;
    if (demo) s.demo = true;
    list.push(s);
  }
  if (list.length) await db.stations.bulkAdd(list);
  return list.length;
}

/** Удалить станцию из каталога по адресу потока. Возвращает удалённую станцию (для отмены). */
export async function removeByUrl(url: string): Promise<Station | undefined> {
  const s = await db.stations.filter((x) => x.url === url).first();
  if (!s) return undefined;
  await deleteStations([s.id]);
  return s;
}

export async function restoreStation(s: Station) {
  await db.stations.put(s);
}

export function toggleFavorite(s: Station) {
  return db.stations.update(s.id, { favorite: !s.favorite, updatedAt: Date.now(), syncId: s.syncId ?? s.id });
}

/** Работает и для станций, которых ещё нет в каталоге (предпросмотр из «Обзора»). */
export async function toggleFavoriteAny(s: Station) {
  const ex = (await db.stations.get(s.id)) ?? (await db.stations.filter((x) => x.url === s.url).first());
  if (ex) {
    await db.stations.update(ex.id, { favorite: !ex.favorite, updatedAt: Date.now(), syncId: ex.syncId ?? ex.id });
    return !ex.favorite;
  }
  const now = Date.now();
  await db.stations.put({ ...s, syncId: s.syncId ?? s.id, favorite: true, createdAt: now, updatedAt: now });
  return true;
}

export async function saveToLibrary(s: Station) {
  const urlTaken = await db.stations.where("id").equals(s.id).first();
  if (urlTaken) return false;
  const dup = (await db.stations.toArray()).find((x) => x.url === s.url);
  if (dup) return false;
  const now = Date.now();
  await db.stations.put({ ...s, createdAt: now, updatedAt: now });
  return true;
}

export async function deleteStation(id: string) {
  await deleteStations([id]);
}

export async function deleteStations(ids: string[]) {
  const doomed = (await db.stations.bulkGet(ids)).filter((s): s is Station => !!s);
  const cached = new Set((await db.offline.bulkGet(ids)).filter((o) => !!o).map((o) => o!.stationId));
  await db.transaction("rw", [db.stations, db.offline], async () => {
    await db.stations.bulkDelete(ids);
    await db.offline.bulkDelete(ids);
  });
  try {
    // кэш аудио общий для всех аккаунтов на устройстве — чистим только файлы удалённых станций
    const cache = await caches.open("radio-audio-v1");
    for (const s of doomed)
      if (cached.has(s.id)) {
        await cache.delete(`${location.origin}/__pocket_radio_audio__/${encodeURIComponent(activeDbName())}/${encodeURIComponent(s.id)}`);
        await cache.delete(s.url); // старый формат кэша
      }
  } catch {
    /* Cache API недоступен */
  }
}

export async function clearHistory() {
  await db.transaction("rw", [db.sessions, db.events, db.stations, db.settings], async () => {
    await db.sessions.clear();
    await db.events.clear();
    await db.stations.toCollection().modify((s) => {
      s.plays = 0;
      s.totalSeconds = 0;
      delete s.lastPlayedAt;
      delete s.resumePos;
      delete s.resumeUpdatedAt;
    });
    await db.settings.where(":id").startsWith("pp:").delete();
  });
}

/* ------------------------------- треки ------------------------------- */

export async function saveTrack(t: Omit<SavedTrack, "id" | "ts">): Promise<boolean> {
  const dup = await db.tracks
    .filter((x) => x.title === t.title && (x.artist ?? "") === (t.artist ?? ""))
    .first();
  if (dup) return false;
  await db.tracks.add({ ...t, ts: Date.now() });
  return true;
}

export function removeTrack(id: number) {
  return db.tracks.delete(id);
}

export function trackLabel(t: Pick<SavedTrack, "title" | "artist">) {
  return t.artist ? `${t.artist} — ${t.title}` : t.title;
}

/* ----------------------------- экспорт / импорт ----------------------------- */

export async function exportJSON(withStats: boolean): Promise<string> {
  const stations = await db.stations.toArray();
  const missingSyncIds = stations.filter((station) => !station.syncId);
  if (missingSyncIds.length) await Promise.all(missingSyncIds.map((station) => db.stations.update(station.id, { syncId: station.id })));
  const stableStations = stations.map((station) => ({ ...station, syncId: station.syncId ?? station.id }));
  const out: Record<string, unknown> = { app: "pocket-radio", version: 4, exportedAt: new Date().toISOString(), stations: stableStations };
  out.tracks = await db.tracks.toArray();
  // плейлисты лежат в таблице настроек (ключи «pl:…»)
  out.playlists = (await db.settings.where(":id").startsWith("pl:").toArray()).map((r) => r.value);
  out.playlistProgress = await db.settings.where(":id").startsWith("pp:").toArray();
  if (withStats) {
    out.sessions = await db.sessions.toArray();
    out.events = await db.events.toArray();
  }
  return JSON.stringify(out, null, 2);
}

export interface ImportJSONOptions {
  /** Для облачных снимков применять записи с более новым updatedAt к существующим. */
  updateExisting?: boolean;
}

export interface ImportJSONResult {
  added: number;
  sessions: number;
  events: number;
  tracks: number;
  playlists: number;
  progress: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStreamKind(value: unknown): value is Station["kind"] {
  return ["http", "icecast", "shoutcast", "hls", "lan", "vod"].includes(String(value));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sessionFingerprint(s: Pick<Session, "stationId" | "startedAt" | "endedAt" | "seconds" | "syncId">): string {
  return s.syncId ? `sync:${s.syncId}` : `legacy:${JSON.stringify([s.stationId, s.startedAt, s.endedAt, s.seconds])}`;
}

function eventFingerprint(e: Pick<PlayEvent, "stationId" | "type" | "ts" | "ms" | "message">): string {
  return JSON.stringify([e.stationId, e.type, e.ts, e.ms ?? null, e.message ?? ""]);
}

function progressTimestamp(value: unknown): number {
  if (isRecord(value) && finiteNumber(value.updatedAt)) return value.updatedAt;
  return 0; // legacy progress was stored as a number without a timestamp
}

function safeImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(value)) return value;
  return validUrl(value) ? value : undefined;
}

function importedPlaylist(value: unknown): Playlist | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || !Array.isArray(value.items)) return null;
  const items: PlaylistItem[] = [];
  const indexes = new Map<string, number>();
  for (const entry of value.items) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id || typeof entry.url !== "string" || !validUrl(entry.url)) continue;
    const item: PlaylistItem = {
      id: entry.id,
      title: typeof entry.title === "string" && entry.title.trim() ? fixText(entry.title).slice(0, 240) : "Без названия",
      subtitle: typeof entry.subtitle === "string" ? fixText(entry.subtitle).slice(0, 240) : undefined,
      url: normalizeUrl(entry.url),
      kind: isStreamKind(entry.kind) ? entry.kind : guessKind(entry.url),
      logo: safeImage(entry.logo),
      genre: typeof entry.genre === "string" ? fixText(entry.genre).slice(0, 120) : undefined,
      duration: finiteNumber(entry.duration) && entry.duration >= 0 ? entry.duration : undefined,
      size: finiteNumber(entry.size) && entry.size >= 0 ? entry.size : undefined,
      note: typeof entry.note === "string" ? fixText(entry.note).slice(0, 1000) : undefined,
      local: entry.local === true,
      date: typeof entry.date === "string" ? entry.date.slice(0, 80) : undefined,
      addedAt: finiteNumber(entry.addedAt) ? entry.addedAt : Date.now(),
    };
    const at = indexes.get(item.id);
    if (at === undefined) {
      indexes.set(item.id, items.length);
      items.push(item);
    } else items[at] = item;
  }

  let follow: Playlist["follow"];
  if (isRecord(value.follow) && finiteNumber(value.follow.showId)) {
    follow = {
      showId: value.follow.showId,
      country: typeof value.follow.country === "string" ? value.follow.country : "",
      name: typeof value.follow.name === "string" ? fixText(value.follow.name).slice(0, 240) : "",
      artist: typeof value.follow.artist === "string" ? fixText(value.follow.artist).slice(0, 240) : "",
      art: safeImage(value.follow.art) ?? "",
      genre: typeof value.follow.genre === "string" ? fixText(value.follow.genre).slice(0, 120) : "",
      checkedAt: finiteNumber(value.follow.checkedAt) ? value.follow.checkedAt : 0,
    };
  }

  const now = Date.now();
  return {
    id: value.id,
    name: typeof value.name === "string" ? fixText(value.name).trim().slice(0, 80) || "Плейлист" : "Плейлист",
    desc: typeof value.desc === "string" ? fixText(value.desc).slice(0, 2000) : "",
    cover: safeImage(value.cover),
    items,
    follow,
    createdAt: finiteNumber(value.createdAt) ? value.createdAt : now,
    updatedAt: finiteNumber(value.updatedAt) ? value.updatedAt : finiteNumber(value.createdAt) ? value.createdAt : 0,
  };
}

function mergePlaylist(existing: Playlist, incoming: Playlist, preferIncoming: boolean): Playlist {
  const primary = preferIncoming ? incoming : existing;
  const secondary = preferIncoming ? existing : incoming;
  const items = [...primary.items];
  const indexes = new Map(items.map((item, index) => [item.id, index]));
  for (const item of secondary.items) {
    const at = indexes.get(item.id);
    if (at === undefined) {
      indexes.set(item.id, items.length);
      items.push(item);
    }
  }
  return {
    ...secondary,
    ...primary,
    id: existing.id,
    items,
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
  };
}

export async function importJSON(text: string, options: ImportJSONOptions = {}): Promise<ImportJSONResult> {
  const parsed: unknown = JSON.parse(text);
  const data = isRecord(parsed) ? parsed : null;
  const arr: unknown = Array.isArray(parsed) ? parsed : data?.stations;
  if (!Array.isArray(arr)) throw new Error("В файле нет списка станций");

  const existingStations = await db.stations.toArray();
  const have = new Map(existingStations.map((s) => [s.url, s.id]));
  const byStationId = new Map(existingStations.map((s) => [s.id, s]));
  const bySyncId = new Map(existingStations.filter((s) => s.syncId).map((s) => [s.syncId!, s.id]));
  const idMap = new Map<string, string>();
  const list: Station[] = [];
  const incomingStationIds = new Set<string>();

  for (const value of arr) {
    if (!isRecord(value) || typeof value.url !== "string" || !validUrl(value.url)) continue;
    const url = normalizeUrl(value.url);
    const sourceId = typeof value.id === "string" && value.id.trim() ? value.id : undefined;
    const sourceSyncId = typeof value.syncId === "string" && value.syncId.trim() ? value.syncId : sourceId;
    const kind = isStreamKind(value.kind) ? value.kind : guessKind(url);
    const draft: Draft = {
      name: typeof value.name === "string" ? value.name : undefined,
      url,
      kind,
      genre: typeof value.genre === "string" ? value.genre : undefined,
      mood: typeof value.mood === "string" ? value.mood : undefined,
      city: typeof value.city === "string" ? value.city : undefined,
      tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
      icon: typeof value.icon === "string" ? value.icon : undefined,
      logo: typeof value.logo === "string" ? value.logo : undefined,
      note: typeof value.note === "string" ? value.note : undefined,
      bitrate: finiteNumber(value.bitrate) ? value.bitrate : undefined,
    };

    const matchByUrl = have.get(url);
    const existingId = matchByUrl ?? (sourceSyncId ? bySyncId.get(sourceSyncId) : undefined) ?? (sourceId && byStationId.has(sourceId) ? sourceId : undefined);
    if (existingId) {
      const existing = (await db.stations.get(existingId)) ?? byStationId.get(existingId);
      const targetSyncId = options.updateExisting ? sourceSyncId ?? existing?.syncId : existing?.syncId ?? sourceSyncId;
      const metadataIsNewer = !!(existing && options.updateExisting && finiteNumber(value.updatedAt) && value.updatedAt > existing.updatedAt);
      const resumeAt = finiteNumber(value.resumeUpdatedAt) ? value.resumeUpdatedAt : null;
      const resumeIsNewer = !!(existing && existing.url === url && options.updateExisting && resumeAt !== null && resumeAt > (existing.resumeUpdatedAt ?? 0));
      const mergedPlays = existing ? Math.max(existing.plays, finiteNumber(value.plays) ? Math.max(0, value.plays) : 0) : 0;
      const mergedTotalSeconds = existing ? Math.max(existing.totalSeconds, finiteNumber(value.totalSeconds) ? Math.max(0, value.totalSeconds) : 0) : 0;
      const mergedLastPlayedAt = existing ? Math.max(existing.lastPlayedAt ?? 0, finiteNumber(value.lastPlayedAt) ? value.lastPlayedAt : 0) || undefined : undefined;
      if (sourceId) idMap.set(sourceId, existingId);
      if (sourceSyncId) idMap.set(sourceSyncId, existingId);
      if (existing) {
        let merged = existing;
        const patch: Partial<Station> = {};
        if (metadataIsNewer) {
          merged = draftToStation(draft, existing);
          merged.id = existing.id;
          merged.syncId = targetSyncId;
          merged.updatedAt = value.updatedAt as number;
          merged.favorite = typeof value.favorite === "boolean" ? value.favorite : existing.favorite;
          merged.createdAt = Math.min(existing.createdAt, finiteNumber(value.createdAt) ? value.createdAt : existing.createdAt);
          merged.plays = mergedPlays;
          merged.totalSeconds = mergedTotalSeconds;
          merged.lastPlayedAt = mergedLastPlayedAt;
          merged.demo = typeof value.demo === "boolean" ? value.demo : existing.demo;
          merged.health = existing.health; // health is device-local and must not be overwritten by cloud data
          if (existing.url !== url) {
            delete merged.resumePos;
            delete merged.resumeUpdatedAt;
          }
          if (have.get(existing.url) === existingId && existing.url !== url) have.delete(existing.url);
        }
        if (!metadataIsNewer) {
          if (mergedPlays > existing.plays) {
            merged = { ...merged, plays: mergedPlays };
            patch.plays = mergedPlays;
          }
          if (mergedTotalSeconds > existing.totalSeconds) {
            merged = { ...merged, totalSeconds: mergedTotalSeconds };
            patch.totalSeconds = mergedTotalSeconds;
          }
          if (mergedLastPlayedAt !== existing.lastPlayedAt) {
            merged = { ...merged, lastPlayedAt: mergedLastPlayedAt };
            patch.lastPlayedAt = mergedLastPlayedAt;
          }
        }
        if (resumeIsNewer) {
          const resumePos = finiteNumber(value.resumePos) ? Math.max(0, value.resumePos) : merged.resumePos;
          merged = { ...merged, resumePos, resumeUpdatedAt: resumeAt! };
          patch.resumePos = resumePos;
          patch.resumeUpdatedAt = resumeAt!;
        }
        if (!metadataIsNewer && targetSyncId && existing.syncId !== targetSyncId) {
          merged = { ...merged, syncId: targetSyncId };
          patch.syncId = targetSyncId;
        }
        if (metadataIsNewer) await db.stations.put(merged);
        else if (Object.keys(patch).length) await db.stations.update(existingId, patch);
        if (existing.syncId && existing.syncId !== merged.syncId && bySyncId.get(existing.syncId) === existingId) bySyncId.delete(existing.syncId);
        byStationId.set(existingId, merged);
        if (merged.syncId) bySyncId.set(merged.syncId, existingId);
      }
      have.set(url, existingId);
      incomingStationIds.add(existingId);
      continue;
    }

    const station = draftToStation(draft);
    if (sourceId && !byStationId.has(sourceId) && !incomingStationIds.has(sourceId)) station.id = sourceId;
    station.syncId = sourceSyncId ?? station.syncId ?? station.id;
    station.favorite = value.favorite === true;
    station.createdAt = finiteNumber(value.createdAt) ? value.createdAt : station.createdAt;
    station.updatedAt = finiteNumber(value.updatedAt) ? value.updatedAt : station.updatedAt;
    station.plays = finiteNumber(value.plays) ? Math.max(0, value.plays) : 0;
    station.totalSeconds = finiteNumber(value.totalSeconds) ? Math.max(0, value.totalSeconds) : 0;
    station.lastPlayedAt = finiteNumber(value.lastPlayedAt) ? value.lastPlayedAt : undefined;
    station.resumePos = finiteNumber(value.resumePos) ? Math.max(0, value.resumePos) : undefined;
    station.resumeUpdatedAt = finiteNumber(value.resumeUpdatedAt) ? value.resumeUpdatedAt : undefined;
    have.set(url, station.id);
    byStationId.set(station.id, station);
    if (station.syncId) bySyncId.set(station.syncId, station.id);
    incomingStationIds.add(station.id);
    if (sourceId) idMap.set(sourceId, station.id);
    if (sourceSyncId) idMap.set(sourceSyncId, station.id);
    list.push(station);
  }
  if (list.length) await db.stations.bulkAdd(list);

  let sessions = 0;
  let events = 0;
  let tracks = 0;
  let playlists = 0;
  let progressImported = 0;

  if (data && Array.isArray(data.sessions)) {
    const existing = await db.sessions.toArray();
    const known = new Set(existing.map(sessionFingerprint));
    const bySyncId = new Map(existing.filter((s) => s.syncId && s.id !== undefined).map((s) => [s.syncId!, s]));
    const fresh: Session[] = [];
    const updates: { id: number; session: Session }[] = [];
    for (const value of data.sessions) {
      if (!isRecord(value) || typeof value.stationId !== "string" || !value.stationId.trim() || !finiteNumber(value.startedAt) || !finiteNumber(value.endedAt) || !finiteNumber(value.seconds)) continue;
      const stationId = idMap.get(value.stationId) ?? value.stationId;
      const stationName = typeof value.stationName === "string" ? value.stationName : undefined;
      // Сохраняем и записи удалённых станций: они всё ещё важны для истории и агрегированной статистики.
      const session: Session = {
        syncId: typeof value.syncId === "string" ? value.syncId : undefined,
        stationId,
        genre: typeof value.genre === "string" ? value.genre : "",
        mood: typeof value.mood === "string" ? value.mood : "",
        kind: isStreamKind(value.kind) ? value.kind : "http",
        startedAt: value.startedAt,
        endedAt: value.endedAt,
        seconds: Math.max(0, value.seconds),
        stationName,
        stationLogo: typeof value.stationLogo === "string" ? value.stationLogo : undefined,
        city: typeof value.city === "string" ? value.city : undefined,
        bitrate: finiteNumber(value.bitrate) ? value.bitrate : undefined,
        offline: typeof value.offline === "boolean" ? value.offline : undefined,
      };
      const key = sessionFingerprint(session);
      const synced = session.syncId ? bySyncId.get(session.syncId) : undefined;
      if (synced?.id !== undefined) {
        if (session.endedAt > synced.endedAt || session.seconds > synced.seconds) {
          const newer = session.endedAt >= synced.endedAt ? session : synced;
          const merged: Session = {
            ...newer,
            id: synced.id,
            endedAt: Math.max(session.endedAt, synced.endedAt),
            seconds: Math.max(session.seconds, synced.seconds),
          };
          updates.push({ id: synced.id, session: merged });
          bySyncId.set(session.syncId!, merged);
        }
        continue;
      }
      if (!known.has(key)) {
        known.add(key);
        fresh.push(session);
        if (session.syncId) bySyncId.set(session.syncId, session);
      }
    }
    for (const update of updates) {
      const { id, ...session } = update.session;
      await db.sessions.update(update.id, session);
    }
    if (fresh.length) await db.sessions.bulkAdd(fresh);
    sessions = fresh.length + updates.length;
  }

  if (data && Array.isArray(data.events)) {
    const known = new Set((await db.events.toArray()).map(eventFingerprint));
    const fresh: PlayEvent[] = [];
    for (const value of data.events) {
      if (!isRecord(value) || typeof value.stationId !== "string" || !value.stationId.trim() || !finiteNumber(value.ts) || (value.type !== "error" && value.type !== "buffer")) continue;
      const stationId = idMap.get(value.stationId) ?? value.stationId;
      const stationName = typeof value.stationName === "string" ? value.stationName : undefined;
      const event: PlayEvent = {
        stationId,
        type: value.type,
        ts: value.ts,
        ms: finiteNumber(value.ms) ? Math.max(0, value.ms) : undefined,
        message: typeof value.message === "string" ? value.message : undefined,
        stationName,
      };
      const key = eventFingerprint(event);
      if (!known.has(key)) {
        known.add(key);
        fresh.push(event);
      }
    }
    if (fresh.length) await db.events.bulkAdd(fresh);
    events = fresh.length;
  }

  if (data && Array.isArray(data.tracks)) {
    for (const value of data.tracks) {
      if (!isRecord(value) || typeof value.title !== "string") continue;
      const stationId = typeof value.stationId === "string" ? (idMap.get(value.stationId) ?? value.stationId) : "";
      if (await saveTrack({ title: value.title, artist: typeof value.artist === "string" ? value.artist : undefined, station: typeof value.station === "string" ? value.station : "", stationId })) tracks++;
    }
  }

  if (data && Array.isArray(data.playlists)) {
    for (const value of data.playlists) {
      const incoming = importedPlaylist(value);
      if (!incoming) continue;
      const key = `pl:${incoming.id}`;
      const current = await db.settings.get(key);
      const existing = importedPlaylist(current?.value);
      const merged = existing ? mergePlaylist(existing, incoming, !!options.updateExisting && incoming.updatedAt > existing.updatedAt) : incoming;
      if (!existing || JSON.stringify(merged) !== JSON.stringify(existing)) {
        await setSetting(key, merged);
        playlists++;
      }
    }
  }

  if (data && Array.isArray(data.playlistProgress)) {
    for (const value of data.playlistProgress) {
      if (!isRecord(value) || typeof value.key !== "string" || !value.key.startsWith("pp:")) continue;
      const progress = value.value;
      const validProgress = (typeof progress === "number" && Number.isFinite(progress) && progress >= 0) ||
        (isRecord(progress) && finiteNumber(progress.position) && progress.position >= 0 && finiteNumber(progress.updatedAt));
      if (!validProgress) continue;
      const current = await db.settings.get(value.key);
      if (!current || progressTimestamp(progress) > progressTimestamp(current.value)) {
        await setSetting(value.key, progress);
        progressImported++;
      }
    }
  }

  return { added: list.length, sessions, events, tracks, playlists, progress: progressImported };
}
