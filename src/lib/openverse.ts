import { fixText } from "./text";
import {
  genreSearchTerm,
  licenseLabel,
  licenseNote,
  normalizeCatalogText,
  safeHttpsUrl,
  transliterateForOpenCatalog,
  type DiscoveredMusicPage,
  type DiscoveredMusicTrack,
  type DiscoveredMusicSearch,
} from "./discoveredMusic";

const API = "https://api.openverse.org/v1/audio/";
const PAGE_SIZE = 20;
const SUPPORTED_FORMATS = new Set(["mp3", "mp31", "mp32", "mpeg", "ogg", "oga", "opus", "wav", "flac", "m4a", "aac"]);

interface OpenverseAudio {
  id?: string;
  title?: string;
  creator?: string;
  creator_url?: string;
  url?: string;
  foreign_landing_url?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  source?: string;
  category?: string | null;
  filetype?: string | null;
  filesize?: number | null;
  duration?: number | null;
  thumbnail?: string | null;
  audio_set?: { title?: string; url?: string | null } | null;
  attribution?: string | null;
}

interface OpenverseResponse {
  page_count?: number;
  results?: OpenverseAudio[];
}

function providerLabel(source: string | undefined): string {
  const labels: Record<string, string> = {
    jamendo: "Jamendo · Openverse",
    freesound: "Freesound · Openverse",
    wikimedia_audio: "Wikimedia Commons · Openverse",
  };
  return labels[source ?? ""] ?? (source ? `${source} · Openverse` : "Openverse");
}

function supportedFormat(audio: OpenverseAudio, url: string): string {
  const fromApi = (audio.filetype ?? "").toLowerCase().replace(/^audio\//, "");
  if (fromApi && SUPPORTED_FORMATS.has(fromApi)) return fromApi;
  try {
    const path = new URL(url).pathname;
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return SUPPORTED_FORMATS.has(ext) ? ext : "";
  } catch {
    return "";
  }
}

function mapResult(audio: OpenverseAudio): DiscoveredMusicTrack | null {
  const url = safeHttpsUrl(audio.url);
  const landingUrl = safeHttpsUrl(audio.foreign_landing_url);
  if (!url || !landingUrl || !audio.id || !audio.title || !audio.license?.trim()) return null;
  if (audio.category && audio.category !== "music") return null;
  const filetype = supportedFormat(audio, url);
  if (!filetype) return null;

  const title = fixText(audio.title);
  const creator = fixText(audio.creator ?? "").trim();
  const sourceName = providerLabel(audio.source);
  const license = (audio.license ?? "").toLowerCase().trim();
  if (["unknown", "none", "n/a", "no-license"].includes(license)) return null;
  const licenseName = licenseLabel(license, audio.license_version);
  const licenseUrl = safeHttpsUrl(audio.license_url);
  const attribution = fixText(audio.attribution ?? "").trim();
  const logo = safeHttpsUrl(audio.thumbnail) || undefined;

  return {
    id: `openverse-${audio.id}`,
    title,
    subtitle: creator || sourceName,
    url,
    kind: "vod",
    logo,
    genre: "Музыка",
    duration: typeof audio.duration === "number" && audio.duration > 0 ? Math.round(audio.duration / 1000) : undefined,
    size: typeof audio.filesize === "number" && audio.filesize > 0 ? audio.filesize : undefined,
    note: licenseNote({ providerName: sourceName, creator, title, licenseName, licenseUrl, landingUrl, attribution }),
    addedAt: Date.now(),
    provider: "openverse",
    providerName: sourceName,
    creator,
    licenseName,
    licenseUrl,
    landingUrl,
    attribution,
    filetype,
  };
}

function creatorMatches(creator: string, wanted: string): boolean {
  const field = normalizeCatalogText(creator);
  const query = normalizeCatalogText(wanted);
  if (!field || !query) return false;
  return field === query || (` ${field} `).includes(` ${query} `) || field.startsWith(`${query} `);
}

/** Search the openly licensed music index without a client key. */
export async function searchOpenverseTracks(options: DiscoveredMusicSearch): Promise<DiscoveredMusicPage> {
  const params = new URLSearchParams({
    category: "music",
    license_type: "commercial",
    filter_dead: "true",
    mature: "false",
    page_size: String(PAGE_SIZE),
    page: String(Math.max(1, options.page)),
  });
  const rawText = options.genre ? genreSearchTerm(options.genre) : options.text.trim();
  const query = transliterateForOpenCatalog(rawText).slice(0, 200);
  if (!query) return { tracks: [], hasMore: false };
  if (options.scope === "artist" && !options.genre) params.set("creator", query);
  else params.set("q", query);

  const response = await fetch(`${API}?${params}`, { signal: options.signal, headers: { Accept: "application/json" } });
  if (response.status === 429) throw new Error("Openverse временно ограничил частоту поиска. Подождите немного и повторите.");
  if (!response.ok) throw new Error(`Openverse ответил ${response.status}`);
  const payload = (await response.json()) as OpenverseResponse;
  const seen = new Set<string>();
  const tracks = (payload.results ?? [])
    .map(mapResult)
    .filter((track): track is DiscoveredMusicTrack => !!track)
    .filter((track) => {
      if (options.scope === "artist" && !options.genre && !creatorMatches(track.creator, query)) return false;
      const key = track.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { tracks, hasMore: options.page < (payload.page_count ?? 0) };
}
