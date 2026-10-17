import { useCallback, useEffect, useState } from "react";
import { itunes } from "./sources";
import { artistSearchVariants } from "./archive";
import { fixText } from "./text";

/**
 * Источник дискографий: MusicBrainz (открытая база метаданных, охватывает русские и
 * украинские релизы, концерты, саундтреки и EP) с обложками из Cover Art Archive.
 * Если MusicBrainz недоступен, используется Apple Music / iTunes как резервный каталог.
 *
 * Правила источников: не больше одного запроса к MusicBrainz в секунду, повторы при
 * перегрузке, кэш на 7 дней. Ничего не выдумываем: если данных нет — так и сообщаем.
 */

export type ReleaseKind = "album" | "ep" | "single" | "live" | "compilation" | "soundtrack" | "remix" | "other";
export type DiscographySource = "musicbrainz" | "itunes";

export interface DiscographyRelease {
  id: string;
  title: string;
  artist: string;
  /** Дата первого релиза в том виде, как её отдал источник (год или YYYY-MM-DD). */
  date: string;
  year?: number;
  kind: ReleaseKind;
  cover?: string;
  tracks?: number;
  source: DiscographySource;
}

export interface Discography {
  /** Исполнитель, которого нашёл источник (может отличаться написанием от запроса). */
  artist: string;
  artistId: string;
  source: DiscographySource;
  releases: DiscographyRelease[];
  fetchedAt: number;
  /** Резервный источник не ответил: список может быть неполным. */
  partial?: boolean;
}

export const KIND_LABEL: Record<ReleaseKind, string> = {
  album: "Альбом",
  ep: "EP",
  single: "Сингл",
  live: "Концерт",
  compilation: "Сборник",
  soundtrack: "Саундтрек",
  remix: "Ремиксы",
  other: "Прочее",
};

export function kindGroup(kind: ReleaseKind): "albums" | "ep" | "live" | "collections" {
  if (kind === "album") return "albums";
  if (kind === "ep" || kind === "single") return "ep";
  if (kind === "live") return "live";
  return "collections";
}

const CACHE_KEY = "pr.discography.v1";
const CACHE_TTL = 7 * 86_400_000;
const CACHE_LIMIT = 40;
const MB_INTERVAL = 1_100;
const REQUEST_TIMEOUT = 15_000;

interface CacheEntry {
  savedAt: number;
  data: Discography;
}

const memory = new Map<string, Discography>();

function normalizeArtist(value: string): string {
  return fixText(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cacheKey(artist: string): string {
  return normalizeArtist(artist);
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function fromCache(artist: string): Discography | null {
  const key = cacheKey(artist);
  const hit = memory.get(key);
  if (hit) return hit;
  const stored = readCache()[key];
  if (!stored || Date.now() - stored.savedAt > CACHE_TTL) return null;
  memory.set(key, stored.data);
  return stored.data;
}

function toCache(artist: string, data: Discography) {
  const key = cacheKey(artist);
  memory.set(key, data);
  try {
    const all = readCache();
    all[key] = { savedAt: Date.now(), data };
    const keys = Object.keys(all).sort((a, b) => all[b].savedAt - all[a].savedAt).slice(0, CACHE_LIMIT);
    const trimmed: Record<string, CacheEntry> = {};
    for (const k of keys) trimmed[k] = all[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* переполнение хранилища не должно ломать поиск */
  }
}

/** MusicBrainz не любит частые запросы: выстраиваем их в очередь с интервалом и повторами. */
let mbChain: Promise<unknown> = Promise.resolve();
let mbLastAt = 0;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function timedSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), REQUEST_TIMEOUT);
  const onAbort = () => controller.abort(new DOMException("Aborted", "AbortError"));
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function mbJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const run = async (): Promise<T> => {
    let lastError: unknown = new Error("MusicBrainz не ответил");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const wait = MB_INTERVAL - (Date.now() - mbLastAt);
      if (wait > 0) await sleep(wait, signal);
      mbLastAt = Date.now();
      const gate = timedSignal(signal);
      try {
        const response = await fetch(url, { headers: { Accept: "application/json" }, signal: gate.signal });
        if (response.status === 503 || response.status === 429) {
          lastError = new Error("MusicBrainz перегружен");
          gate.done();
          await sleep(1_200 * (attempt + 1), signal);
          continue;
        }
        if (!response.ok) {
          gate.done();
          throw new Error(`MusicBrainz ответил ${response.status}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        gate.done();
        lastError = error;
        if (signal?.aborted) throw error;
        await sleep(900 * (attempt + 1), signal).catch(() => undefined);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("MusicBrainz недоступен");
  };
  const chained = mbChain.then(run, run);
  mbChain = chained.catch(() => undefined);
  return chained;
}

interface MbArtist {
  id: string;
  name: string;
  score?: number;
  "sort-name"?: string;
  country?: string;
  type?: string;
}

interface MbReleaseGroup {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
}

function releaseKind(primary?: string, secondary: string[] = []): ReleaseKind {
  const lower = new Set(secondary.map((value) => value.toLowerCase()));
  if (lower.has("live")) return "live";
  if (lower.has("compilation") || lower.has("dj-mix")) return "compilation";
  if (lower.has("soundtrack")) return "soundtrack";
  if (lower.has("remix")) return "remix";
  switch ((primary ?? "").toLowerCase()) {
    case "album":
      return "album";
    case "ep":
      return "ep";
    case "single":
      return "single";
    default:
      return "other";
  }
}

function yearOf(date: string): number | undefined {
  const match = date.match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
}

function acceptedArtist(artist: MbArtist, wanted: string[]): boolean {
  const names = [artist.name, artist["sort-name"]].filter(Boolean).map((value) => normalizeArtist(value as string));
  if (!names.length) return false;
  const targets = wanted.map(normalizeArtist).filter(Boolean);
  if (names.some((name) => targets.includes(name))) return true;
  // Высокая оценка поиска и совпадающее первое слово: «Земфира» находит «Земфира», но не «Земфира Вербицкая».
  return (artist.score ?? 0) >= 95 && names.some((name) => targets.some((target) => name.split(" ")[0] === target.split(" ")[0]));

}

function dedupeReleases(releases: DiscographyRelease[]): DiscographyRelease[] {
  const seen = new Set<string>();
  return releases.filter((release) => {
    const key = `${normalizeArtist(release.title)}|${release.year ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortReleases(releases: DiscographyRelease[]): DiscographyRelease[] {
  return [...releases].sort((a, b) => {
    const left = a.date || "9999";
    const right = b.date || "9999";
    if (left === right) return a.title.localeCompare(b.title, "ru");
    return left < right ? -1 : 1;
  });
}

async function musicBrainzDiscography(artist: string, signal?: AbortSignal): Promise<Discography | null> {
  const variants = artistSearchVariants(artist);
  const queries = variants.slice(0, 2);
  let found: MbArtist | null = null;
  for (const query of queries) {
    const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
    const page = await mbJson<{ artists?: MbArtist[] }>(url, signal);
    const candidates = page.artists ?? [];
    const match = candidates.find((candidate) => acceptedArtist(candidate, variants));
    if (match) {
      found = match;
      break;
    }
  }
  if (!found) return null;
  const groupUrl = `https://musicbrainz.org/ws/2/release-group?artist=${found.id}&fmt=json&limit=100`;
  const groups = await mbJson<{ "release-groups"?: MbReleaseGroup[] }>(groupUrl, signal);
  const releases: DiscographyRelease[] = (groups["release-groups"] ?? []).map((group) => {
    const date = group["first-release-date"] ?? "";
    return {
      id: group.id,
      title: fixText(group.title),
      artist: fixText(found.name),
      date,
      year: yearOf(date),
      kind: releaseKind(group["primary-type"], group["secondary-types"]),
      cover: `https://coverartarchive.org/release-group/${group.id}/front-250`,
      source: "musicbrainz" as const,
    };
  });
  return {
    artist: fixText(found.name),
    artistId: found.id,
    source: "musicbrainz",
    releases: sortReleases(dedupeReleases(releases)),
    fetchedAt: Date.now(),
  };
}

interface ItunesArtist {
  wrapperType?: string;
  artistId?: number;
  artistName?: string;
}

interface ItunesCollection {
  wrapperType?: string;
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  releaseDate?: string;
  trackCount?: number;
  artworkUrl100?: string;
  collectionType?: string;
}

function storefront(): string {
  if (typeof navigator === "undefined") return "US";
  const region = navigator.language.match(/-([A-Za-z]{2})(?:-|$)/)?.[1];
  return (region || "US").toUpperCase();
}

async function itunesDiscography(artist: string, signal?: AbortSignal): Promise<Discography | null> {
  const country = storefront();
  const variants = artistSearchVariants(artist);
  const search = await itunes<{ results?: ItunesArtist[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=musicArtist&limit=5&country=${country}`,
    signal
  );
  const target = (search.results ?? []).find((item) => item.artistName && variants.some((variant) => normalizeArtist(variant) === normalizeArtist(item.artistName as string)));
  if (!target?.artistId) return null;
  const lookup = await itunes<{ results?: ItunesCollection[] }>(
    `https://itunes.apple.com/lookup?id=${target.artistId}&entity=album&limit=200&country=${country}`,
    signal
  );
  const releases: DiscographyRelease[] = (lookup.results ?? [])
    .filter((item) => item.wrapperType === "collection" && item.collectionName)
    .map((item) => {
      const date = (item.releaseDate ?? "").slice(0, 10);
      return {
        id: `itunes:${item.collectionId}`,
        title: fixText(item.collectionName as string),
        artist: fixText(item.artistName ?? target.artistName ?? artist),
        date,
        year: yearOf(date),
        kind: "album" as const,
        cover: item.artworkUrl100?.replace(/\/\d+x\d+bb\./i, "/300x300bb."),
        tracks: item.trackCount,
        source: "itunes" as const,
      };
    });
  if (!releases.length) return null;
  return {
    artist: fixText(target.artistName as string),
    artistId: String(target.artistId),
    source: "itunes",
    releases: sortReleases(dedupeReleases(releases)),
    fetchedAt: Date.now(),
  };
}

/** Живой запрос без кэша: MusicBrainz, затем Apple Music как резерв. */
export async function fetchDiscography(artist: string, signal?: AbortSignal): Promise<Discography> {
  const name = artist.trim();
  if (!name) throw new Error("Пустой запрос");
  let partial = false;
  try {
    const result = await musicBrainzDiscography(name, signal);
    if (result) return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    partial = true;
  }
  const fallback = await itunesDiscography(name, signal);
  if (fallback) return { ...fallback, partial };
  if (partial) throw new Error("MusicBrainz недоступен, а Apple Music не нашёл исполнителя");
  throw new Error("Исполнитель не найден в открытых базах");
}

export interface DiscographyState {
  status: "idle" | "loading" | "ready" | "error";
  data: Discography | null;
  error: string | null;
  cached: boolean;
}

/** Загружает дискографию исполнителя с кэшем на 7 дней. */
export function useDiscography(artist: string | null) {
  const [state, setState] = useState<DiscographyState>({ status: "idle", data: null, error: null, cached: false });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!artist || !artist.trim()) {
      setState({ status: "idle", data: null, error: null, cached: false });
      return;
    }
    const cached = fromCache(artist);
    if (cached) {
      setState({ status: "ready", data: cached, error: null, cached: true });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading", data: null, error: null, cached: false });
    void fetchDiscography(artist, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        toCache(artist, data);
        setState({ status: "ready", data, error: null, cached: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", data: null, error: error instanceof Error ? error.message : "Не удалось загрузить дискографию", cached: false });
      });
    return () => controller.abort();
  }, [artist, nonce]);

  const reload = useCallback(() => {
    if (!artist) return;
    memory.delete(cacheKey(artist));
    try {
      const all = readCache();
      delete all[cacheKey(artist)];
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch {
      /* хранилище может быть недоступно — обновление всё равно пойдёт в сеть */
    }
    setNonce((value) => value + 1);
  }, [artist]);

  return { ...state, reload };
}
