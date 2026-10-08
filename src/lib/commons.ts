import { fixText } from "./text";
import {
  genreSearchTerm,
  licenseNote,
  normalizeCatalogText,
  safeHttpsUrl,
  transliterateForOpenCatalog,
  type DiscoveredMusicPage,
  type DiscoveredMusicTrack,
  type DiscoveredMusicSearch,
} from "./discoveredMusic";

const API = "https://commons.wikimedia.org/w/api.php";
const PAGE_SIZE = 50;

interface MetaValue { value?: string }
interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  size?: number;
  mime?: string;
  mediatype?: string;
  extmetadata?: Record<string, MetaValue>;
}
interface CommonsPage {
  pageid?: number;
  title?: string;
  imageinfo?: CommonsImageInfo[];
}
interface CommonsResponse {
  continue?: { gsroffset?: number };
  query?: { pages?: Record<string, CommonsPage> };
}

function htmlText(value: string | undefined): string {
  return fixText((value ?? "")
    .replace(/<\/(?:li|p|div)>\s*<(?:li|p|div)[^>]*>/gi, " · ")
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim());
}

function metadataValue(info: CommonsImageInfo, key: string): string {
  return htmlText(info.extmetadata?.[key]?.value);
}

function audioFormat(mime: string): string {
  const value = mime.toLowerCase();
  if (value === "audio/mpeg" || value === "audio/mp3") return "mp3";
  if (value.includes("ogg")) return "ogg";
  if (value.includes("opus")) return "opus";
  if (value.includes("wav")) return "wav";
  if (value.includes("flac")) return "flac";
  if (value.includes("mp4") || value.includes("m4a")) return "m4a";
  if (value.includes("aac")) return "aac";
  return "";
}

function isClearlySpeech(text: string): boolean {
  const value = normalizeCatalogText(text);
  return /\bll q\d+\b/i.test(value) || [
    "audiobook", "audio book", "spoken word", "spoken language", "speech recording", "recorded speech",
    "speech sample", "pronunciation", "language sample", "lingua libre", "radio drama", "audio drama",
    "podcast", "interview", "lecture", "sermon", "read aloud", "voice recording", "voice memo",
    "аудиокнига", "аудиоспектакль", "радиоспектакль", "радиопостановка", "запись речи", "произношение", "интервью", "лекция", "читает",
  ].some((marker) => value.includes(normalizeCatalogText(marker)));
}

function mapPage(page: CommonsPage): DiscoveredMusicTrack | null {
  const info = page.imageinfo?.[0];
  const url = safeHttpsUrl(info?.url);
  if (!info || !url || !page.pageid || info.mediatype !== "AUDIO") return null;
  const filetype = audioFormat(info.mime ?? "");
  if (!filetype) return null;

  const filename = (page.title ?? "").replace(/^File:/i, "");
  const fallbackTitle = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");
  const title = fixText(metadataValue(info, "ObjectName") || fallbackTitle);
  const creator = metadataValue(info, "Artist") || metadataValue(info, "Credit");
  const description = metadataValue(info, "ImageDescription") || metadataValue(info, "Description");
  if (isClearlySpeech(`${filename} ${title} ${creator} ${description}`)) return null;

  const providerName = "Wikimedia Commons";
  const licenseName = metadataValue(info, "LicenseShortName") || metadataValue(info, "UsageTerms");
  if (!licenseName || /^(unknown|not specified|n\/a|none|no license information)$/i.test(licenseName)) return null;
  const licenseUrl = safeHttpsUrl(info.extmetadata?.LicenseUrl?.value);
  const landingUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename.replace(/ /g, "_"))}`;
  const attribution = metadataValue(info, "Credit") || description;

  return {
    id: `commons-${page.pageid}`,
    title,
    subtitle: creator || providerName,
    url,
    kind: "vod",
    logo: safeHttpsUrl(info.thumburl) || undefined,
    genre: "Музыка",
    size: typeof info.size === "number" && info.size > 0 ? info.size : undefined,
    note: licenseNote({ providerName, creator, title, licenseName, licenseUrl, landingUrl, attribution }),
    addedAt: Date.now(),
    provider: "commons",
    providerName,
    creator,
    licenseName,
    licenseUrl,
    landingUrl,
    attribution,
    filetype,
  };
}

/** Search free audio files in Commons; origin=* enables anonymous Action API CORS. */
export async function searchCommonsTracks(options: DiscoveredMusicSearch): Promise<DiscoveredMusicPage> {
  const rawText = options.genre ? genreSearchTerm(options.genre) : options.text.trim();
  const query = transliterateForOpenCatalog(rawText).replace(/["\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  if (!query) return { tracks: [], hasMore: false };

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `filemime:audio "${query}"`,
    gsrnamespace: "6",
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String((Math.max(1, options.page) - 1) * PAGE_SIZE),
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime|mediatype",
    iiurlwidth: "180",
  });
  const response = await fetch(`${API}?${params}`, { signal: options.signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Wikimedia Commons ответил ${response.status}`);
  const payload = (await response.json()) as CommonsResponse;
  const pages = Object.values(payload.query?.pages ?? {});
  const seen = new Set<string>();
  const tracks = pages
    .map(mapPage)
    .filter((track): track is DiscoveredMusicTrack => !!track)
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  return { tracks, hasMore: typeof payload.continue?.gsroffset === "number" };
}
