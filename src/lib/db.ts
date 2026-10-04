import Dexie, { type Table } from "dexie";
import type { Draft, OfflineItem, PlayEvent, SavedTrack, Session, Station } from "./types";
import { TEMPLATES, guessKind, normalizeUrl, uid } from "./templates";
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
  const now = Date.now();
  let fallbackName = "Станция";
  try {
    fallbackName = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return {
    id: existing?.id ?? d.id ?? uid(),
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
    demo: existing?.demo,
    health: existing?.health,
  };
}

export async function saveStation(d: Draft, existing?: Station): Promise<Station> {
  const s = draftToStation(d, existing);
  // при смене адреса прежняя проверка недействительна
  if (existing && existing.url !== s.url) delete s.health;
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
  return db.stations.update(s.id, { favorite: !s.favorite });
}

/** Работает и для станций, которых ещё нет в каталоге (предпросмотр из «Обзора»). */
export async function toggleFavoriteAny(s: Station) {
  const ex = (await db.stations.get(s.id)) ?? (await db.stations.filter((x) => x.url === s.url).first());
  if (ex) {
    await db.stations.update(ex.id, { favorite: !ex.favorite });
    return !ex.favorite;
  }
  const now = Date.now();
  await db.stations.put({ ...s, favorite: true, createdAt: now, updatedAt: now });
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
  const out: Record<string, unknown> = { app: "pocket-radio", version: 3, exportedAt: new Date().toISOString(), stations };
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

export async function importJSON(text: string): Promise<{ added: number; sessions: number; tracks: number }> {
  const data = JSON.parse(text);
  const arr: Partial<Station>[] = Array.isArray(data) ? data : data.stations;
  if (!Array.isArray(arr)) throw new Error("В файле нет списка станций");
  const have = new Map((await db.stations.toArray()).map((s) => [s.url, s.id]));
  const idMap = new Map<string, string>();
  const list: Station[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw.url !== "string") continue;
    const url = normalizeUrl(raw.url);
    if (have.has(url)) {
      if (raw.id) idMap.set(raw.id, have.get(url)!);
      continue;
    }
    const s = draftToStation({ ...raw, url, id: undefined } as Draft);
    if (raw.id && !(await db.stations.get(raw.id)) && !list.some((x) => x.id === raw.id)) s.id = raw.id;
    s.favorite = !!raw.favorite;
    s.createdAt = raw.createdAt ?? s.createdAt;
    s.plays = raw.plays ?? 0;
    s.totalSeconds = raw.totalSeconds ?? 0;
    s.lastPlayedAt = raw.lastPlayedAt;
    have.set(url, s.id);
    if (raw.id) idMap.set(raw.id, s.id);
    list.push(s);
  }
  if (list.length) await db.stations.bulkAdd(list);
  let sessions = 0;
  let tracks = 0;
  if (!Array.isArray(data)) {
    if (Array.isArray(data.sessions)) {
      const ss: Session[] = [];
      for (const x of data.sessions as Session[]) {
        const sid = idMap.get(x.stationId) ?? x.stationId;
        // Сессии плейлистов и удалённых станций сохраняют снимок названия, им запись в stations не нужна.
        if (!(await db.stations.get(sid)) && !x.stationName && !sid.startsWith("pli:")) continue;
        ss.push({ ...x, id: undefined, stationId: sid });
      }
      if (ss.length) await db.sessions.bulkAdd(ss);
      sessions = ss.length;
    }
    if (Array.isArray(data.tracks)) {
      for (const t of data.tracks as SavedTrack[]) {
        if (t?.title && (await saveTrack({ title: t.title, artist: t.artist, station: t.station ?? "", stationId: idMap.get(t.stationId) ?? t.stationId }))) tracks++;
      }
    }
  }
  if (!Array.isArray(data) && Array.isArray(data.playlists)) {
    for (const p of data.playlists as { id?: string; items?: unknown[] }[]) {
      if (p && typeof p.id === "string" && Array.isArray(p.items)) await setSetting(`pl:${p.id}`, p);
    }
  }
  if (!Array.isArray(data) && Array.isArray(data.playlistProgress)) {
    const rows = (data.playlistProgress as Setting[]).filter((r) => r && typeof r.key === "string" && r.key.startsWith("pp:") && typeof r.value === "number");
    if (rows.length) await db.settings.bulkPut(rows);
  }
  return { added: list.length, sessions, tracks };
}
