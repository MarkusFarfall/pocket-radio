import { db, deleteStations, importJSON, setSetting, type Setting, type SyncMeta } from "./db";
import { removeVod } from "./offline";
import { applyPrefDoc, buildPrefDoc, buildPrefDocs } from "./syncPrefs";
import {
  audioDocKey,
  docKeyValue,
  docKind,
  eventDocKey,
  eventFingerprint,
  hashDoc,
  hashString,
  playlistDocKey,
  prefDocKey,
  progressDocKey,
  sessionDocKey,
  stationDocKey,
  trackDocKey,
} from "./syncKeys";
import type { PlayEvent, Playlist, SavedTrack, Session, Station } from "./types";

/** Документ синхронизации: одна запись облака. Надгробие — deleted: true без data. */
export interface SyncDoc {
  key: string;
  data: unknown | null;
  deleted?: boolean;
  updated_at?: string;
}

export interface BuiltDoc {
  key: string;
  data: unknown | null;
  deleted?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Копия без undefined — так документ одинаково выглядит на всех устройствах. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stationDoc(station: Station): Record<string, unknown> {
  // health — результат проверки с этого устройства, его нельзя переносить.
  const { health: _health, ...rest } = station;
  return plain(rest);
}

function sessionDoc(session: Session): Record<string, unknown> {
  const { id: _id, ...rest } = session;
  return plain(rest);
}

function eventDoc(event: PlayEvent): Record<string, unknown> {
  const { id: _id, ...rest } = event;
  return plain(rest);
}

function trackDoc(track: SavedTrack): Record<string, unknown> {
  return plain({ title: track.title, artist: track.artist, station: track.station, stationId: track.stationId, logo: track.logo, ts: track.ts });
}

function progressDoc(setting: Setting): unknown {
  return plain(setting.value);
}

const legacySessionId = (session: Session) => `s-${hashString(`${session.stationId}|${session.startedAt}|${session.endedAt}|${session.seconds}`)}`;

/**
 * Собирает полный набор документов из локальной базы.
 * Используется при первой синхронизации и при периодической сверке — она же
 * замечает удаления: ключи, которые были в журнале, но пропали из базы.
 */
export async function buildAllDocs(): Promise<Map<string, BuiltDoc>> {
  const [stations, settings, tracks, sessions, events, downloads] = await Promise.all([
    db.stations.toArray(),
    db.settings.toArray(),
    db.tracks.toArray(),
    db.sessions.toArray(),
    db.events.toArray(),
    db.offline.toArray(),
  ]);
  const docs = new Map<string, BuiltDoc>();
  const put = (key: string, data: unknown) => docs.set(key, { key, data });

  for (const station of stations) {
    let syncId = station.syncId;
    if (!syncId) {
      syncId = station.id;
      await db.stations.update(station.id, { syncId });
    }
    put(stationDocKey(syncId), stationDoc(station));
  }

  for (const row of settings) {
    const playlist = row.value as Playlist;
    if (row.key.startsWith("pl:") && playlist && typeof playlist.id === "string") put(playlistDocKey(playlist.id), plain(playlist));
    else if (row.key.startsWith("pp:")) put(progressDocKey(row.key), progressDoc(row));
  }

  for (const track of tracks) put(trackDocKey(track.title, track.artist), trackDoc(track));

  for (const session of sessions) {
    let syncId = session.syncId;
    if (!syncId) {
      syncId = legacySessionId(session);
      if (session.id !== undefined) await db.sessions.update(session.id, { syncId });
    }
    put(sessionDocKey(syncId), sessionDoc(session));
  }

  for (const event of events) put(eventDocKey(eventFingerprint(event)), eventDoc(event));

  for (const pref of buildPrefDocs()) put(prefDocKey(pref.name), plain(pref.data));

  for (const item of downloads) put(audioDocKey(item.stationId), { stationId: item.stationId, size: item.size, ts: item.ts });

  return docs;
}

/**
 * Собирает один документ по ключу — быстрый путь для изменений во время игры.
 * Для станции допускается локальный id вместо syncId.
 */
export async function buildDoc(key: string): Promise<BuiltDoc | null> {
  const kind = docKind(key);
  const value = docKeyValue(key);
  if (!kind) return null;

  if (kind === "station") {
    const bySync = (await db.stations.where("syncId").equals(value).first()) ?? (await db.stations.get(value));
    if (!bySync) return null;
    const actual = stationDocKey(bySync.syncId ?? bySync.id);
    return { key: actual, data: stationDoc(bySync) };
  }
  if (kind === "playlist") {
    const row = await db.settings.get(`pl:${value}`);
    return row ? { key, data: plain(row.value) } : null;
  }
  if (kind === "progress") {
    const row = await db.settings.get(value);
    return row ? { key, data: progressDoc(row) } : null;
  }
  if (kind === "track") {
    const track = (await db.tracks.toArray()).find((item) => trackDocKey(item.title, item.artist) === key);
    return track ? { key, data: trackDoc(track) } : null;
  }
  if (kind === "session") {
    const session = await db.sessions.where("syncId").equals(value).first();
    return session ? { key, data: sessionDoc(session) } : null;
  }
  if (kind === "event") {
    const event = (await db.events.toArray()).find((item) => eventDocKey(eventFingerprint(item)) === key);
    return event ? { key, data: eventDoc(event) } : null;
  }
  if (kind === "pref") {
    const data = buildPrefDoc(value);
    return data === undefined ? null : { key, data: plain(data) };
  }
  if (kind === "audio") {
    const item = await db.offline.get(value);
    return item ? { key, data: { stationId: item.stationId, size: item.size, ts: item.ts } } : null;
  }
  return null;
}

/* ------------------------------- применение ------------------------------- */

export interface ApplyOutcome {
  keys: string[];
  /** станции, для которых пришёл манифест скачанного аудио */
  audioDownload: string[];
  /** станции, аудио которых удалено в облаке */
  audioDelete: string[];
  prefs: string[];
}

function validateSession(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.stationId === "string" && typeof value.startedAt === "number" && typeof value.endedAt === "number" && typeof value.seconds === "number";
}

function validateEvent(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.stationId === "string" && typeof value.ts === "number" && (value.type === "error" || value.type === "buffer");
}

/**
 * Применяет документы из облака. Удаления обрабатываются точечно, всё остальное
 * проходит через проверенный импорт JSON (он умеет сопоставлять станции по syncId/URL,
 * объединять сессии и не терять записи удалённых станций).
 */
export async function applyDocs(docs: SyncDoc[]): Promise<ApplyOutcome> {
  const keys: string[] = [];
  const audioDownload: string[] = [];
  const audioDelete: string[] = [];
  const prefs: string[] = [];
  const tombstones: SyncDoc[] = [];
  const stations: unknown[] = [];
  const playlists: unknown[] = [];
  const sessions: unknown[] = [];
  const events: unknown[] = [];
  const tracks: unknown[] = [];
  const progresses: SyncDoc[] = [];

  // Оформление применяем в предсказуемом порядке: выбранный интерфейс задаёт шаблон,
  // затем его уточняют тема, стиль и плеер.
  const prefOrder = ["design", "theme", "ui", "player", "app", "desktop", "resilience", "equalizer"];
  docs = [...docs].sort((a, b) => {
    const ai = a.key.startsWith("pref:") ? prefOrder.indexOf(docKeyValue(a.key)) : -1;
    const bi = b.key.startsWith("pref:") ? prefOrder.indexOf(docKeyValue(b.key)) : -1;
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  for (const doc of docs) {
    const kind = docKind(doc.key);
    if (!kind) continue;
    if (doc.deleted) {
      tombstones.push(doc);
      continue;
    }
    if (kind === "station" && isRecord(doc.data) && typeof doc.data.url === "string") stations.push(doc.data);
    else if (kind === "playlist" && isRecord(doc.data)) playlists.push(doc.data);
    else if (kind === "session" && validateSession(doc.data)) sessions.push(doc.data);
    else if (kind === "event" && validateEvent(doc.data)) events.push(doc.data);
    else if (kind === "track" && isRecord(doc.data) && typeof doc.data.title === "string") tracks.push(doc.data);
    else if (kind === "progress" && doc.data !== null) progresses.push(doc);
    else if (kind === "pref") {
      // Неизвестный формат (другая версия приложения) не считаем применённым.
      if (applyPrefDoc(docKeyValue(doc.key), doc.data)) {
        prefs.push(doc.key);
        keys.push(doc.key);
      }
      continue;
    } else if (kind === "audio" && isRecord(doc.data) && typeof doc.data.stationId === "string") audioDownload.push(doc.data.stationId);
    keys.push(doc.key);
  }

  if (stations.length || playlists.length || sessions.length || events.length || tracks.length) {
    await importJSON(JSON.stringify({ stations, playlists, sessions, events, tracks }), { updateExisting: true, replacePlaylists: true });
  }

  for (const doc of progresses) {
    const incoming = doc.data as { position?: unknown; updatedAt?: unknown } | number;
    const at = isRecord(incoming) && typeof incoming.updatedAt === "number" ? incoming.updatedAt : 0;
    const current = await db.settings.get(docKeyValue(doc.key));
    const currentAt = isRecord(current?.value) && typeof (current!.value as { updatedAt?: unknown }).updatedAt === "number" ? (current!.value as { updatedAt: number }).updatedAt : 0;
    if (!current || at >= currentAt) await setSetting(docKeyValue(doc.key), incoming);
  }

  for (const doc of tombstones) {
    const kind = docKind(doc.key);
    const value = docKeyValue(doc.key);
    if (kind === "station") {
      const station = (await db.stations.where("syncId").equals(value).first()) ?? (await db.stations.get(value));
      if (station) await deleteStations([station.id]);
    } else if (kind === "playlist") {
      await db.settings.delete(`pl:${value}`);
    } else if (kind === "progress") {
      await db.settings.delete(value);
    } else if (kind === "track") {
      const track = (await db.tracks.toArray()).find((item) => trackDocKey(item.title, item.artist) === doc.key);
      if (track?.id !== undefined) await db.tracks.delete(track.id);
    } else if (kind === "session") {
      await db.sessions.where("syncId").equals(value).delete();
    } else if (kind === "event") {
      const event = (await db.events.toArray()).find((item) => eventDocKey(eventFingerprint(item)) === doc.key);
      if (event?.id !== undefined) await db.events.delete(event.id);
    } else if (kind === "audio") {
      audioDelete.push(value);
      await removeVod({ id: value, url: "" });
    }
    keys.push(doc.key);
  }

  return { keys, audioDownload, audioDelete, prefs };
}

export const metaForDoc = (doc: SyncDoc, at: number): SyncMeta => ({
  key: doc.key,
  hash: doc.deleted ? "" : hashDoc(doc.data),
  deleted: doc.deleted ? 1 : 0,
  at,
});
