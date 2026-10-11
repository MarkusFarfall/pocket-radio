import { itunes } from "./sources";
import { fixText } from "./text";

interface AppleMusicResult {
  wrapperType?: string;
  kind?: string;
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  trackCount?: number;
  releaseDate?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  trackNumber?: number;
  trackName?: string;
  trackTimeMillis?: number;
}

export interface CatalogTrack {
  number: number;
  title: string;
  artist?: string;
  duration?: number;
}

export interface CatalogAlbum {
  cover?: string;
  tracks: CatalogTrack[];
}

const albumCache = new Map<string, Promise<CatalogAlbum | null>>();
const EDITION_WORDS = /\b(?:cd\+?g|compact disc|cd|vinyl|lp|ep|flac|mp3|wav|aac|remaster(?:ed)?|edition|expanded|deluxe|disc|disk|lossless|rip|anniversary)\b/i;

function stripEdition(value: string): string {
  return fixText(value)
    .replace(/\[[^\]]*\]|\([^)]*\)/g, (part) => (EDITION_WORDS.test(part) ? " " : part))
    .replace(/\b(?:cd\+g|cdg)\b/gi, " ");
}

function normalize(value: string): string {
  return stripEdition(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(a.split(" ").filter((word) => word.length > 1));
  const right = new Set(b.split(" ").filter((word) => word.length > 1));
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(left.size, right.size);
}

function storefront(): string {
  if (typeof navigator === "undefined") return "US";
  const region = navigator.language.match(/-([A-Za-z]{2})(?:-|$)/)?.[1];
  return (region || "US").toUpperCase();
}

function higherResolution(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/^http:\/\//i, "https://")
    .replace(/\/\d+x\d+bb\./i, "/600x600bb.");
}

function matchScore(result: AppleMusicResult, artist: string, title: string, year?: string, cueTrackCount?: number): number {
  const wantedArtist = normalize(artist);
  const wantedTitle = normalize(title);
  const resultArtist = normalize(result.artistName ?? "");
  const resultTitle = normalize(result.collectionName ?? "");
  if (!wantedArtist || !wantedTitle || !resultArtist || !resultTitle) return -1;

  const artistMatch = resultArtist === wantedArtist || resultArtist.includes(wantedArtist) || wantedArtist.includes(resultArtist);
  if (!artistMatch) return -1;
  const titleSimilarity = tokenOverlap(wantedTitle, resultTitle);
  const exactTitle = wantedTitle === resultTitle;
  if (!exactTitle && titleSimilarity < 0.66 && !resultTitle.includes(wantedTitle)) return -1;

  let score = exactTitle ? 10 : resultTitle.includes(wantedTitle) ? 7 : 5 + titleSimilarity;
  score += resultArtist === wantedArtist ? 5 : 2;
  const wantedYear = Number(String(year ?? "").slice(0, 4));
  const resultYear = Number(result.releaseDate?.slice(0, 4));
  if (wantedYear && resultYear) {
    const distance = Math.abs(wantedYear - resultYear);
    score += distance <= 1 ? 3 : distance <= 3 ? 1 : -Math.min(4, distance / 5);
  }
  if (cueTrackCount && result.trackCount) {
    score += cueTrackCount === result.trackCount ? 4 : -Math.min(4, Math.abs(cueTrackCount - result.trackCount) / 3);
  }
  return score;
}

async function lookup(artist: string, title: string, year?: string, cueTrackCount?: number): Promise<CatalogAlbum | null> {
  const country = storefront();
  const query = `${artist} ${stripEdition(title)}`.trim();
  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=album&limit=25&country=${country}`;
  const search = await itunes<{ results?: AppleMusicResult[] }>(searchUrl);
  const candidates = (search.results ?? [])
    .filter((result) => result.collectionId && result.wrapperType === "collection")
    .map((result) => ({ result, score: matchScore(result, artist, title, year, cueTrackCount) }))
    .filter((entry) => entry.score >= 9)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0]?.result;
  if (!best?.collectionId) return null;

  const lookupUrl = `https://itunes.apple.com/lookup?id=${best.collectionId}&entity=song&limit=200&country=${country}`;
  const details = await itunes<{ results?: AppleMusicResult[] }>(lookupUrl);
  const tracks = (details.results ?? [])
    .filter((result) => result.wrapperType === "track" && result.trackName && Number(result.trackNumber) > 0)
    .map((result) => ({
      number: Number(result.trackNumber),
      title: fixText(result.trackName ?? ""),
      artist: fixText(result.artistName ?? "") || undefined,
      duration: Number(result.trackTimeMillis) > 0 ? Math.round(Number(result.trackTimeMillis) / 1000) : undefined,
    }))
    .sort((a, b) => a.number - b.number);

  return {
    cover: higherResolution(best.artworkUrl600 || best.artworkUrl100),
    tracks,
  };
}

/** Best-effort metadata only: an unavailable storefront must never hide playable Archive tracks. */
export function lookupArchiveAlbum(artist: string, title: string, year?: string, cueTrackCount?: number): Promise<CatalogAlbum | null> {
  const key = `${normalize(artist)}|${normalize(title)}|${year ?? ""}|${cueTrackCount ?? ""}`;
  if (!key || key === "|||") return Promise.resolve(null);
  let pending = albumCache.get(key);
  if (!pending) {
    pending = lookup(artist, title, year, cueTrackCount).catch((error) => {
      albumCache.delete(key);
      throw error;
    });
    albumCache.set(key, pending);
  }
  return pending;
}

/** Bound remote metadata latency so a slow storefront cannot stall an otherwise playable disc. */
export async function lookupArchiveAlbumBriefly(
  artist: string,
  title: string,
  year?: string,
  cueTrackCount?: number,
  timeoutMs = 3_500,
): Promise<CatalogAlbum | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookupArchiveAlbum(artist, title, year, cueTrackCount),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
