/**
 * Ключи документов облачной синхронизации и стабильные хеши.
 *
 * Модуль намеренно не импортирует базу или UI: его используют и Dexie-слой,
 * и движок синхронизации, поэтому циклов импорта быть не должно.
 */

export const stationDocKey = (syncId: string) => `station:${syncId}`;
export const playlistDocKey = (id: string) => `playlist:${id}`;
/** ключ настройки прогресса целиком, например `pp:pli:abc` */
export const progressDocKey = (settingKey: string) => `progress:${settingKey}`;
export const trackDocKey = (title: string, artist?: string) =>
  `track:${encodeURIComponent(normalizeTrackPart(title))}:${encodeURIComponent(normalizeTrackPart(artist ?? ""))}`;
export const sessionDocKey = (syncId: string) => `session:${syncId}`;
export const eventDocKey = (fingerprint: string) => `event:${hashString(fingerprint)}`;
/** Отпечаток события: одинаковый на любом устройстве, поэтому годится ключом документа. */
export const eventFingerprint = (e: { stationId: string; type: string; ts: number; ms?: number; message?: string }) =>
  JSON.stringify([e.stationId, e.type, e.ts, e.ms ?? null, e.message ?? ""]);
export const prefDocKey = (name: string) => `pref:${name}`;
export const audioDocKey = (stationId: string) => `audio:${stationId}`;

export type DocKind = "station" | "playlist" | "progress" | "track" | "session" | "event" | "pref" | "audio";

export function docKind(key: string): DocKind | null {
  const kind = key.slice(0, key.indexOf(":"));
  return ["station", "playlist", "progress", "track", "session", "event", "pref", "audio"].includes(kind) ? (kind as DocKind) : null;
}

export function docKeyValue(key: string): string {
  const at = key.indexOf(":");
  return at < 0 ? "" : key.slice(at + 1);
}

export function normalizeTrackPart(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Детерминированная строка для сравнения снимков: порядок ключей не влияет. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonical(item));
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (item === undefined) continue;
      out[key] = canonical(item);
    }
    return out;
  }
  return value;
}

/** FNV-1a, 32 бита: достаточно для сравнения снимков, не для безопасности. */
export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const hashDoc = (data: unknown): string => hashString(stableStringify(data));
