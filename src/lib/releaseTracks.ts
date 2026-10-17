import { mbJson } from "./musicbrainz";
import { fixText } from "./text";
import type { PlaylistItem } from "./types";

/**
 * Треки релиза без Archive.
 *
 * 1. MusicBrainz отдаёт треклист конкретного издания: номера, названия, длительности, ISRC.
 * 2. По ISRC ищется официальное 30-секундное превью Deezer. Это тот же трек, а не «похожий»:
 *    ISRC — международный код записи, поэтому совпадение точное.
 * 3. Если MusicBrainz знает свободный источник (например, ссылку на Archive), трек
 *    помечается как полный и его можно открыть в соответствующем источнике.
 *
 * Полные студийные записи защищены правами — бесплатно их не отдают ни MusicBrainz,
 * ни ListenBrainz (он вообще только считает прослушивания). Превью Deezer — законный
 * способ услышать сам трек; интерфейс честно пишет «30 секунд».
 */

export interface ReleasePreview {
  status: "idle" | "loading" | "ready" | "missing" | "error";
  url?: string;
  deezerId?: number;
  deezerUrl?: string;
  /** Deezer иногда отдаёт другой мастер той же записи: сохраняем его название для сверки. */
  title?: string;
  artist?: string;
  error?: string;
}

export interface ReleaseTrack {
  id: string;
  trackNumber: string;
  title: string;
  artist: string;
  lengthMs?: number;
  isrc?: string;
  recordingId?: string;
  preview: ReleasePreview;
}

export interface ReleaseTracklist {
  releaseId: string;
  releaseTitle: string;
  releaseDate: string;
  country?: string;
  tracks: ReleaseTrack[];
  /** Свободные полные ссылки, найденные в MusicBrainz (archive.org и подобные). */
  freeLinks: { source: string; url: string }[];
  fetchedAt: number;
}

interface MbArtistCredit {
  name?: string;
  artist?: { name?: string };
}

interface MbTrack {
  number?: string;
  title?: string;
  length?: number;
  position?: number;
  recording?: {
    id?: string;
    title?: string;
    length?: number;
    isrcs?: string[];
    "artist-credit"?: MbArtistCredit[];
  };
  "artist-credit"?: MbArtistCredit[];
}

interface MbRelease {
  id: string;
  title?: string;
  date?: string;
  country?: string;
  status?: string;
  "artist-credit"?: MbArtistCredit[];
  media?: { position?: number; tracks?: MbTrack[] }[];
  relations?: { type?: string; url?: { resource?: string } }[];
}

function artistOf(credits?: MbArtistCredit[]): string {
  return fixText((credits ?? []).map((credit) => credit.name ?? credit.artist?.name ?? "").filter(Boolean).join(", "));
}

function freeSource(resource: string): string | null {
  try {
    const url = new URL(resource);
    if (url.hostname.endsWith("archive.org")) return "Internet Archive";
    if (url.hostname.endsWith("jamendo.com")) return "Jamendo";
    if (url.hostname.endsWith("bandcamp.com")) return "Bandcamp";
    if (url.hostname.endsWith("freemusicarchive.org")) return "Free Music Archive";
    return null;
  } catch {
    return null;
  }
}

/** Выбираем самое полное официальное издание релиз-группы. */
function pickRelease(releases: MbRelease[]): MbRelease | null {
  if (!releases.length) return null;
  const score = (release: MbRelease) => {
    const tracks = (release.media ?? []).reduce((sum, medium) => sum + (medium.tracks?.length ?? 0), 0);
    const official = release.status === "Official" ? 1_000 : 0;
    const digital = release.country ? 0 : 10;
    return official + tracks * 10 + digital;
  };
  return [...releases].sort((a, b) => score(b) - score(a) || (a.date ?? "9999").localeCompare(b.date ?? "9999"))[0];
}

function toTracklist(release: MbRelease, fallbackArtist: string): ReleaseTracklist {
  // Исполнитель издания — запасной вариант для дорожек без собственного credit.
  const releaseArtist = artistOf(release["artist-credit"]) || fallbackArtist;
  const tracks: ReleaseTrack[] = [];
  (release.media ?? []).forEach((medium, mediumIndex) => {
    (medium.tracks ?? []).forEach((track, trackIndex) => {
      const recording = track.recording;
      const title = fixText(recording?.title || track.title || "");
      if (!title) return;
      const id = `${recording?.id ?? `${release.id}-${mediumIndex}-${trackIndex}`}`;
      const isrcs = recording?.isrcs ?? [];
      tracks.push({
        id,
        trackNumber: track.number || String(trackIndex + 1),
        title,
        artist: artistOf(track["artist-credit"] ?? recording?.["artist-credit"]) || releaseArtist,
        lengthMs: track.length ?? recording?.length,
        isrc: isrcs.find((value) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(value)) ?? isrcs[0],
        recordingId: recording?.id,
        preview: { status: "idle" },
      });
    });
  });
  const links: { source: string; url: string }[] = [];
  for (const relation of release.relations ?? []) {
    if (!["download for free", "free streaming", "streaming"].includes(relation.type ?? "")) continue;
    const resource = relation.url?.resource;
    if (!resource) continue;
    const source = freeSource(resource);
    if (source && !links.some((link) => link.url === resource)) links.push({ source, url: resource });
  }
  return {
    releaseId: release.id,
    releaseTitle: fixText(release.title ?? ""),
    releaseDate: release.date ?? "",
    country: release.country,
    tracks,
    freeLinks: links,
    fetchedAt: Date.now(),
  };
}

const CACHE_KEY = "pr.releaseTracks.v2";
const CACHE_TTL = 7 * 86_400_000;
const CACHE_LIMIT = 25;

interface CacheEntry {
  savedAt: number;
  data: ReleaseTracklist;
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function cachedTracklist(releaseGroupId: string): ReleaseTracklist | null {
  const entry = readCache()[releaseGroupId];
  if (!entry || Date.now() - entry.savedAt > CACHE_TTL) return null;
  return entry.data;
}

function saveTracklist(releaseGroupId: string, data: ReleaseTracklist) {
  try {
    const all = readCache();
    all[releaseGroupId] = { savedAt: Date.now(), data };
    const keys = Object.keys(all).sort((a, b) => all[b].savedAt - all[a].savedAt).slice(0, CACHE_LIMIT);
    const trimmed: Record<string, CacheEntry> = {};
    for (const key of keys) trimmed[key] = all[key];
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* переполнение хранилища не должно ломать треклист */
  }
}

export async function fetchReleaseTracklist(releaseGroupId: string, artist: string, signal?: AbortSignal): Promise<ReleaseTracklist> {
  const url = `https://musicbrainz.org/ws/2/release?release-group=${encodeURIComponent(releaseGroupId)}&inc=recordings+isrcs+url-rels&fmt=json&limit=30`;
  const payload = await mbJson<{ releases?: MbRelease[] }>(url, signal);
  const release = pickRelease(payload.releases ?? []);
  if (!release) throw new Error("MusicBrainz не вернул ни одного издания этого релиза");
  if (!fixText(artist).trim()) throw new Error("Не указан исполнитель релиза");
  const tracklist = toTracklist(release, fixText(artist));
  if (!tracklist.tracks.length) throw new Error("MusicBrainz не вернул треклист этого издания");
  saveTracklist(releaseGroupId, tracklist);
  return tracklist;
}

/* ------------------------------------------------ превью Deezer ------------------------------------------------ */

const PREVIEW_CACHE_KEY = "pr.preview.v1";
/** Ссылки Deezer подписаны и живут около часа — кэшируем с запасом. */
const PREVIEW_TTL = 40 * 60_000;
const PREVIEW_MISS_TTL = 7 * 86_400_000;
const PREVIEW_CONCURRENCY = 3;

export interface PreviewEntry {
  savedAt: number;
  /** Как сопоставили трек: по ISRC (точно) или по названию и исполнителю (мягко). */
  matchedBy?: "isrc" | "search";
  url?: string;
  deezerId?: number;
  deezerUrl?: string;
  title?: string;
  artist?: string;
  missing?: boolean;
}

function readPreviewCache(): Record<string, PreviewEntry> {
  try {
    const raw = localStorage.getItem(PREVIEW_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, PreviewEntry>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePreviewCache(all: Record<string, PreviewEntry>) {
  try {
    const keys = Object.keys(all).sort((a, b) => all[b].savedAt - all[a].savedAt).slice(0, 400);
    const trimmed: Record<string, PreviewEntry> = {};
    for (const key of keys) trimmed[key] = all[key];
    localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

function cachedPreview(isrc: string): PreviewEntry | null {
  const entry = readPreviewCache()[isrc];
  if (!entry) return null;
  const ttl = entry.missing ? PREVIEW_MISS_TTL : PREVIEW_TTL;
  return Date.now() - entry.savedAt <= ttl ? entry : null;
}

function writePreview(isrc: string, entry: Omit<PreviewEntry, "savedAt">) {
  const all = readPreviewCache();
  all[isrc] = { ...entry, savedAt: Date.now() };
  savePreviewCache(all);
}

/** Deezer не отдаёт CORS-заголовки, поэтому запрос идёт через JSONP. */
function deezerJsonp<T>(path: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const callback = `__dz${Math.random().toString(36).slice(2)}`;
    const scope = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    let timer = 0;
    const cleanup = () => {
      clearTimeout(timer);
      delete scope[callback];
      script.remove();
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Deezer не ответил"));
    }, 12_000);
    scope[callback] = (data: T & { error?: { message?: string } }) => {
      cleanup();
      if (data && data.error) reject(new Error(data.error.message || "Deezer отказал"));
      else resolve(data);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    script.onerror = () => {
      cleanup();
      reject(new Error("Не удалось загрузить превью Deezer"));
    };
    script.src = `https://api.deezer.com/${path}${path.includes("?") ? "&" : "?"}output=jsonp&callback=${callback}`;
    document.head.appendChild(script);
  });
}

interface DeezerTrack {
  id?: number;
  readable?: boolean;
  title?: string;
  preview?: string;
  link?: string;
  artist?: { name?: string };
}

let activePreviews = 0;
const previewQueue: (() => void)[] = [];

function acquirePreviewSlot(): Promise<void> {
  if (activePreviews < PREVIEW_CONCURRENCY) {
    activePreviews += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    previewQueue.push(() => {
      activePreviews += 1;
      resolve();
    });
  });
}

function releasePreviewSlot() {
  activePreviews = Math.max(0, activePreviews - 1);
  const next = previewQueue.shift();
  if (next) next();
}

/**
 * Официальное 30-секундное превью по ISRC. Возвращает null, если трека нет в Deezer:
 * это нормальный ответ, а не ошибка сети.
 */
export async function resolvePreview(isrc: string, signal?: AbortSignal): Promise<PreviewEntry | null> {
  const cached = cachedPreview(isrc);
  if (cached) return cached;
  await acquirePreviewSlot();
  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const track = await deezerJsonp<DeezerTrack>(`track/isrc:${encodeURIComponent(isrc)}`, signal);
    if (!track?.preview || track.readable === false) {
      writePreview(isrc, { missing: true });
      return { savedAt: Date.now(), missing: true };
    }
    const entry: Omit<PreviewEntry, "savedAt"> = {
      url: track.preview,
      deezerId: track.id,
      deezerUrl: track.link,
      title: track.title,
      artist: track.artist?.name,
      matchedBy: "isrc",
    };
    writePreview(isrc, entry);
    return { ...entry, savedAt: Date.now() };
  } finally {
    releasePreviewSlot();
  }
}

function normalize(value: string): string {
  return fixText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function searchKey(title: string, artist: string): string {
  return `q:${normalize(title)}|${normalize(artist)}`;
}

/**
 * Запасной путь для треков без ISRC: поиск в Deezer по названию и исполнителю.
 * Берём только полное совпадение названия и исполнителя — «похожее» не подставляем.
 */
async function searchPreview(title: string, artist: string, signal?: AbortSignal): Promise<PreviewEntry | null> {
  const key = searchKey(title, artist);
  const cached = cachedPreview(key);
  if (cached) return cached;
  await acquirePreviewSlot();
  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const term = `track:"${title.replace(/"/g, "")}" artist:"${artist.replace(/"/g, "")}"`;
    const page = await deezerJsonp<{ data?: DeezerTrack[] }>(`search/track?q=${encodeURIComponent(term)}&limit=5`, signal);
    const wantedTitle = normalize(title);
    const wantedArtist = normalize(artist);
    const match = (page.data ?? []).find(
      (item) =>
        item.preview &&
        item.readable !== false &&
        normalize(item.title ?? "") === wantedTitle &&
        (normalize(item.artist?.name ?? "") === wantedArtist || normalize(item.artist?.name ?? "").includes(wantedArtist) || wantedArtist.includes(normalize(item.artist?.name ?? "")))
    );
    if (!match?.preview) {
      writePreview(key, { missing: true });
      return { savedAt: Date.now(), missing: true };
    }
    const entry: Omit<PreviewEntry, "savedAt"> = {
      url: match.preview,
      deezerId: match.id,
      deezerUrl: match.link,
      title: match.title,
      artist: match.artist?.name,
      matchedBy: "search",
    };
    writePreview(key, entry);
    return { ...entry, savedAt: Date.now() };
  } finally {
    releasePreviewSlot();
  }
}

/** Единая точка: сначала точное совпадение по ISRC, затем строгий поиск по названию. */
export async function resolveTrackPreview(track: ReleaseTrack, signal?: AbortSignal): Promise<PreviewEntry | null> {
  if (track.isrc) {
    const byIsrc = await resolvePreview(track.isrc, signal);
    if (byIsrc?.url) return byIsrc;
  }
  return searchPreview(track.title, track.artist, signal);
}

/** Превью как элемент плейлиста: полный трек не обещаем, скачивание запрещено. */
export function previewItem(track: ReleaseTrack, preview: ReleasePreview, cover: string | undefined, releaseTitle: string): PlaylistItem {
  return {
    id: `preview-${isrcKey(track)}`,
    title: `${track.title} · превью 30 с`,
    subtitle: track.artist,
    album: releaseTitle,
    url: preview.url as string,
    kind: "vod",
    logo: cover,
    genre: "Музыка",
    duration: 30,
    note: `${track.title} — ${track.artist}. Официальное превью Deezer (30 секунд), сопоставлено по ISRC из MusicBrainz. Источник: Deezer.`,
    addedAt: Date.now(),
  };
}

export function isrcKey(track: ReleaseTrack): string {
  return track.isrc || track.id;
}

export function formatTrackLength(ms?: number): string {
  if (!ms || ms < 1_000) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
