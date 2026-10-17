import { fixText } from "./text";
import { normalizeCatalogText, type DiscoveredMusicPage, type DiscoveredMusicTrack } from "./discoveredMusic";

/**
 * Audius — открытая музыкальная сеть: поиск и прослушивание без ключа и регистрации.
 * API отдаёт CORS для браузера, поток — обычный MP3 с поддержкой диапазонов, поэтому
 * запись играет через тот же движок, что и остальные источники, и может лечь в офлайн,
 * если автор разрешил скачивание.
 */

const API = "https://api.audius.co/v1";
const APP = "PocketRadio";
const PAGE_SIZE = 30;

interface AudiusUser {
  name?: string;
  handle?: string;
}

interface AudiusTrack {
  id: string;
  title?: string;
  duration?: number;
  genre?: string;
  permalink?: string;
  is_streamable?: boolean;
  is_downloadable?: boolean;
  is_unlisted?: boolean;
  is_delete?: boolean;
  is_available?: boolean;
  play_count?: number;
  license?: string;
  user?: AudiusUser;
  artists?: AudiusUser[];
  artwork?: Record<string, string>;
}

interface AudiusResponse {
  data?: AudiusTrack[];
}

function creatorOf(track: AudiusTrack): string {
  const artist = track.artists?.find((item) => item?.name)?.name;
  return fixText(artist || track.user?.name || track.user?.handle || "");
}

function artworkOf(track: AudiusTrack): string | undefined {
  const art = track.artwork ?? {};
  return art["480x480"] || art["1000x1000"] || art["150x150"];
}

function mapTrack(track: AudiusTrack): DiscoveredMusicTrack | null {
  if (!track?.id || !track.title) return null;
  if (track.is_streamable === false || track.is_unlisted === true || track.is_delete === true || track.is_available === false) return null;
  const creator = creatorOf(track);
  const title = fixText(track.title);
  const landingUrl = track.permalink ? `https://audius.co${track.permalink.startsWith("/") ? "" : "/"}${track.permalink}` : "https://audius.co";
  return {
    id: `audius:${track.id}`,
    title,
    subtitle: creator,
    url: `${API}/tracks/${encodeURIComponent(track.id)}/stream?app_name=${APP}`,
    kind: "vod",
    logo: artworkOf(track),
    genre: "Музыка",
    duration: track.duration && track.duration > 0 ? track.duration : undefined,
    note: `${title} — ${creator || "автор не указан"}. Источник: Audius. Права на запись остаются у автора.`,
    addedAt: Date.now(),
    provider: "audius",
    providerName: "Audius",
    creator,
    licenseName: track.license?.trim() || "Права у автора",
    licenseUrl: "",
    landingUrl,
    attribution: `${title} — ${creator || "автор не указан"} (Audius)`,
    filetype: "audio/mpeg",
    // Офлайн-копия — только если автор явно разрешил скачивание.
    canDownload: track.is_downloadable === true,
  };
}

export interface AudiusSearchOptions {
  text: string;
  page: number;
  limit?: number;
  /** Для поиска релиза: названия треков должны пересечься с названием альбома. */
  strict?: { artist: string; title: string };
  signal?: AbortSignal;
}

function scoreTrack(track: DiscoveredMusicTrack, strict: { artist: string; title: string }): number {
  const title = normalizeCatalogText(strict.title);
  const artist = normalizeCatalogText(strict.artist);
  const haystack = normalizeCatalogText(`${track.title} ${track.subtitle ?? ""}`);
  if (!title || !haystack) return 0;
  const titleTokens = title.split(" ").filter((token) => token.length > 2);
  const artistTokens = artist.split(" ").filter((token) => token.length > 2);
  const titleHits = titleTokens.filter((token) => haystack.includes(token)).length;
  const artistHits = artistTokens.filter((token) => haystack.includes(token)).length;
  const phrase = haystack.includes(title) ? 0.5 : 0;
  const titleScore = titleTokens.length ? titleHits / titleTokens.length : 0;
  const artistScore = artistTokens.length ? artistHits / artistTokens.length : 1;
  return Math.min(1, 0.55 * titleScore + 0.3 * artistScore + phrase + (artistScore === 1 ? 0.15 : 0));
}

/** Поиск треков Audius. Без ключа, с ограничением страницы и без «мёртвых» записей. */
export async function searchAudiusTracks(options: AudiusSearchOptions): Promise<DiscoveredMusicPage> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(50, options.limit ?? PAGE_SIZE);
  const query = options.text.trim().slice(0, 200);
  if (!query) return { tracks: [], hasMore: false };

  const params = new URLSearchParams({
    query,
    app_name: APP,
    limit: String(limit),
    offset: String((page - 1) * limit),
    sort_method: "relevant",
  });
  const response = await fetch(`${API}/tracks/search?${params}`, {
    signal: options.signal,
    headers: { Accept: "application/json" },
  });
  if (response.status === 429) throw new Error("Audius временно ограничил частоту запросов. Подождите немного и повторите.");
  if (!response.ok) throw new Error(`Audius ответил ${response.status}`);
  const payload = (await response.json()) as AudiusResponse;

  const seen = new Set<string>();
  let tracks = (payload.data ?? [])
    .map(mapTrack)
    .filter((track): track is DiscoveredMusicTrack => !!track)
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });

  if (options.strict) {
    const strict = options.strict;
    tracks = tracks
      .map((track) => ({ track, score: scoreTrack(track, strict) }))
      .filter((item) => item.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.track);
  }

  return { tracks, hasMore: (payload.data ?? []).length >= limit };
}

/** Поток нельзя скачать, если автор это запретил — проверка нужна и в интерфейсе, и перед загрузкой. */
export function audiusCanDownload(track: DiscoveredMusicTrack): boolean {
  return track.canDownload === true;
}
