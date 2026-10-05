import type { PlaylistItem } from "./types";
import { fixText } from "./text";

/**
 * Internet Archive (archive.org) — публичная библиотека с открытым API без ключа.
 * Здесь лежат сборники песен, которые можно слушать и скачивать для офлайна.
 * Права на записи принадлежат правообладателям: пользуйтесь тем, что вам разрешено.
 */

const BASE = "https://archive.org";

export interface Album {
  id: string;
  title: string;
  creator: string;
  year: string;
  downloads: number;
  thumb: string;
  /** Why a free-text search returned this item; preset collections leave it unset. */
  match?: AlbumSearchMatch;
  /** Заполняется после быстрой проверки metadata: 1 = одиночная запись, >1 = сборник. */
  trackCount?: number;
  cover?: string;
}

export type AlbumSearchMatch = "artist" | "title" | "subject";
export type AlbumSearchScope = "artist" | "all";

export interface AlbumSearchPage {
  albums: Album[];
  hasMore: boolean;
}

const SEARCH_PAGE_SIZE = 30;
const SEARCH_BATCH_SIZE = 50;
const MAX_SEARCH_BATCHES = 12;

export interface Collection {
  id: string;
  title: string;
  desc: string;
  query: string;
  hue: number;
  glyph: string;
  group: "russian" | "decades" | "world" | "instrumental" | "family";
}

export const COLLECTION_GROUPS = [
  { id: "russian", title: "На русском", desc: "Шансон, барды, эстрада и песни прошлых лет" },
  { id: "decades", title: "Эпохи и десятилетия", desc: "Рок-н-ролл, свинг, диско и музыка 80-х" },
  { id: "world", title: "Музыка мира", desc: "Танго, босса-нова, фламенко и французская песня" },
  { id: "instrumental", title: "Инструментальная", desc: "Классика, пианино, эмбиент и саундтреки" },
  { id: "family", title: "Семья и праздники", desc: "Детские, зимние и военные песни" },
] as const;

/** Готовые подборки: каждая — поисковый запрос к архиву. */
export const COLLECTIONS: Collection[] = [
  { id: "chanson", group: "russian", title: "Хиты шансона", desc: "Русский шансон и авторская песня", query: '(subject:шансон OR title:шансон OR title:"хиты шансона" OR subject:"русский шансон")', hue: 18, glyph: "mic" },
  { id: "bard", group: "russian", title: "Бардовская песня", desc: "Авторская песня под гитару", query: '(subject:"авторская песня" OR title:"авторская песня" OR title:"бардовская песня" OR subject:"russian bard")', hue: 38, glyph: "guitar" },
  { id: "soviet", group: "russian", title: "Советская эстрада", desc: "Песни СССР, ВИА и эстрада 60–80-х", query: '(title:"советская эстрада" OR title:"песни ссср" OR title:"советские песни" OR subject:"советская эстрада" OR subject:"soviet pop")', hue: 4, glyph: "disc" },
  { id: "romance", group: "russian", title: "Романсы", desc: "Русские и цыганские романсы", query: '(subject:романс OR title:романсы OR title:романс OR subject:"russian romance")', hue: 335, glyph: "music2" },
  { id: "folkru", group: "russian", title: "Народные песни", desc: "Русский фольклор и хоровое пение", query: '(title:"русские народные песни" OR subject:"russian folk music" OR subject:"русские народные песни")', hue: 112, glyph: "music" },

  { id: "jazz", group: "decades", title: "Джаз 20–50-х", desc: "Свинг, биг-бэнды и ранний джаз", query: "(subject:jazz OR subject:swing) AND date:[1920-01-01 TO 1959-12-31]", hue: 210, glyph: "piano" },
  { id: "rock50", group: "decades", title: "Рок-н-ролл 50-х", desc: "Классика рок-н-ролла и рокабилли", query: '(subject:"rock and roll" OR subject:rockabilly) AND date:[1950-01-01 TO 1965-12-31]', hue: 24, glyph: "guitar" },
  { id: "soul60", group: "decades", title: "Соул 60-х", desc: "Винтажный соул, Motown и R&B", query: '(subject:soul OR subject:"rhythm and blues" OR subject:motown) AND date:[1955-01-01 TO 1969-12-31]', hue: 350, glyph: "disc" },
  { id: "disco70", group: "decades", title: "Диско 70-х", desc: "Диско, фанк и танцевальные хиты", query: '(subject:disco OR subject:funk) AND date:[1970-01-01 TO 1982-12-31]', hue: 300, glyph: "sparkles" },
  { id: "eighties", group: "decades", title: "80-е", desc: "Синтипоп, new wave и кассетная эпоха", query: '(subject:"1980s" OR subject:"new wave" OR subject:synthpop OR title:"80s")', hue: 265, glyph: "tape" },
  { id: "blues", group: "decades", title: "Классический блюз", desc: "Блюз и госпел начала века", query: "(subject:blues OR subject:gospel) AND date:[1900-01-01 TO 1969-12-31]", hue: 235, glyph: "music" },

  { id: "bossa", group: "world", title: "Босса-нова", desc: "Бразильская босса-нова и самба", query: '(subject:"bossa nova" OR subject:samba)', hue: 145, glyph: "sun" },
  { id: "tango", group: "world", title: "Танго", desc: "Аргентинское танго и бандонеон", query: '(subject:tango OR title:tango)', hue: 8, glyph: "music" },
  { id: "flamenco", group: "world", title: "Фламенко", desc: "Испанская гитара и канте", query: '(subject:flamenco OR title:flamenco)', hue: 25, glyph: "guitar" },
  { id: "french", group: "world", title: "Французский шансон", desc: "Классическая французская песня", query: '(subject:"french chanson" OR subject:"chanson française" OR title:"french chanson")', hue: 220, glyph: "mic" },
  { id: "latin", group: "world", title: "Латинская музыка", desc: "Сальса, мамбо и кубинские ритмы", query: '(subject:salsa OR subject:mambo OR subject:"latin music" OR subject:cuban)', hue: 42, glyph: "party" },

  { id: "classical", group: "instrumental", title: "Классика", desc: "Оркестры, камерная и фортепианная музыка", query: '(subject:"classical music" OR subject:classical OR subject:symphony)', hue: 280, glyph: "music2" },
  { id: "piano", group: "instrumental", title: "Фортепиано", desc: "Сольные записи и тихая музыка", query: '(subject:piano OR title:piano) AND NOT subject:"piano roll"', hue: 205, glyph: "piano" },
  { id: "ambient", group: "instrumental", title: "Эмбиент", desc: "Дроны, звуковые пейзажи и медитация", query: '(subject:ambient OR subject:"soundscape" OR subject:drone)', hue: 185, glyph: "waves" },
  { id: "soundtrack", group: "instrumental", title: "Музыка из кино", desc: "Саундтреки и музыка к фильмам", query: '(subject:soundtrack OR subject:"film music" OR title:soundtrack)', hue: 30, glyph: "disc" },

  { id: "kids", group: "family", title: "Детские песни", desc: "Песни из мультфильмов и для малышей", query: '(title:"детские песни" OR subject:"детские песни" OR subject:"children\'s songs" OR title:"песни из мультфильмов")', hue: 140, glyph: "baby" },
  { id: "newyear", group: "family", title: "Новогодние песни", desc: "Зимние и новогодние хиты", query: '(title:"новогодние песни" OR subject:"новогодние песни" OR subject:"christmas songs")', hue: 190, glyph: "sparkles" },
  { id: "lullaby", group: "family", title: "Колыбельные", desc: "Тихая музыка и песни для сна", query: '(subject:lullaby OR title:колыбельные OR subject:колыбельные)', hue: 240, glyph: "moon" },
  { id: "war", group: "family", title: "Песни военных лет", desc: "Фронтовые и послевоенные песни", query: '(title:"песни военных лет" OR subject:"военные песни" OR subject:"world war ii songs")', hue: 80, glyph: "landmark" },
];

type SearchField = "creator" | "title" | "subject";

function cleanSearchPhrase(text: string): string {
  return text
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/["\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value: string): string {
  return fixText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterateCyrillicToLatin(value: string): string {
  return value.replace(/[А-ЯЁа-яё]/g, (letter) => {
    const lower = letter.toLowerCase();
    const latin = CYRILLIC_TO_LATIN[lower];
    if (latin === undefined) return letter;
    return letter === lower || !latin ? latin : `${latin[0].toUpperCase()}${latin.slice(1)}`;
  });
}

/** Original spelling plus a conservative Cyrillic-to-Latin alias for archive metadata. */
function searchVariants(text: string): string[] {
  const phrase = cleanSearchPhrase(text);
  if (!phrase || !normalizeSearchText(phrase)) return [];

  const candidates = [phrase];
  if (/\p{Script=Cyrillic}/u.test(phrase)) {
    const latin = transliterateCyrillicToLatin(phrase);
    candidates.push(latin, latin.replace(/yo/gi, "e"));
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalized = normalizeSearchText(candidate);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function phraseQuery(variants: string[], fields: SearchField[]): string {
  return `(${variants.flatMap((phrase) => fields.map((field) => `${field}:"${phrase}"`)).join(" OR ")})`;
}

/**
 * Builds exact-phrase queries. Performer mode is smart: the service first checks creator,
 * then can fall back to titles when Archive metadata omits the performer field.
 */
export function textQuery(text: string, scope: AlbumSearchScope = "artist"): string {
  const variants = searchVariants(text);
  if (!variants.length) return "";
  return phraseQuery(variants, scope === "artist" ? ["creator", "title"] : ["creator", "title", "subject"]);
}

interface Doc {
  identifier: string;
  title?: string | string[];
  creator?: string | string[];
  subject?: string | string[];
  collection?: string | string[];
  year?: string | number;
  downloads?: number;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : (v ?? ""));

function toAlbum(d: Doc, match?: AlbumSearchMatch): Album {
  return {
    id: d.identifier,
    title: fixText(one(d.title)) || d.identifier,
    creator: fixText(one(d.creator)),
    year: d.year ? String(d.year) : "",
    downloads: Number(d.downloads) || 0,
    thumb: `${BASE}/services/img/${encodeURIComponent(d.identifier)}`,
    ...(match ? { match } : {}),
  };
}

async function requestAlbumDocs(query: string, page: number, rows: number, signal?: AbortSignal): Promise<{ docs: Doc[]; total: number }> {
  const p = new URLSearchParams();
  p.set("q", `(${query}) AND mediatype:audio`);
  for (const f of ["identifier", "title", "creator", "subject", "collection", "year", "downloads"]) p.append("fl[]", f);
  p.append("sort[]", "downloads desc");
  p.set("rows", String(rows));
  p.set("page", String(page));
  p.set("output", "json");
  const r = await fetch(`${BASE}/advancedsearch.php?${p}`, { signal });
  if (!r.ok) throw new Error(`Архив ответил ${r.status}`);
  const j = (await r.json()) as { response?: { docs?: Doc[]; numFound?: number } };
  const docs = j.response?.docs ?? [];
  return { docs, total: Number(j.response?.numFound) || docs.length };
}

export async function searchAlbums(query: string, page: number, signal?: AbortSignal): Promise<AlbumSearchPage> {
  const { docs, total } = await requestAlbumDocs(query, page, SEARCH_PAGE_SIZE, signal);
  return { albums: docs.map((doc) => toAlbum(doc)), hasMore: page * SEARCH_PAGE_SIZE < total };
}

function hasPhrase(value: string, phrase: string): boolean {
  const field = normalizeSearchText(value);
  return !!field && (` ${field} `).includes(` ${phrase} `);
}

function artistCreatorMatch(value: string, variants: string[]): boolean {
  const chunks = value.split(/[;,|/]+/).map(normalizeSearchText).filter(Boolean);
  if (chunks.length > 3) return false;
  const phrases = variants.map(normalizeSearchText).filter(Boolean);
  return chunks.some((chunk) => phrases.some((phrase) =>
    chunk === phrase || chunk.startsWith(`${phrase} `) || chunk === `the ${phrase}` || chunk.startsWith(`the ${phrase} `),
  ));
}

interface SearchHit {
  doc: Doc;
  match: AlbumSearchMatch;
}

interface SearchQuery {
  query: string;
  match: (doc: Doc) => AlbumSearchMatch | undefined;
}

const MATCH_WEIGHT: Record<AlbumSearchMatch, number> = { artist: 3, title: 2, subject: 1 };
const SMART_ARTIST_FALLBACK_THRESHOLD = 8;

function hasShortArtistToken(variants: string[]): boolean {
  const particles = new Set(["and", "de", "da", "do", "el", "i", "la", "of", "the", "и"]);
  return variants.some((variant) => normalizeSearchText(variant).split(" ").some((token) => token.length <= 2 && !particles.has(token)));
}

function artistCollectionTokens(doc: Doc): string[] {
  return one(doc.collection).toLowerCase().split(/[;,\s]+/).filter(Boolean);
}

function isNoisyArtistSource(doc: Doc): boolean {
  const collections = artistCollectionTokens(doc);
  // These imported sets contain a disproportionate number of covers, spoken-word items, and unrelated matches.
  return collections.some((name) =>
    name === "jamendo-albums" || name.startsWith("podcasts") || name.startsWith("audiobook") || name.startsWith("audioboo"),
  );
}

function artistFieldMatch(doc: Doc, variants: string[]): AlbumSearchMatch | undefined {
  if (isNoisyArtistSource(doc)) return undefined;
  if (artistCreatorMatch(one(doc.creator), variants)) return "artist";
  return undefined;
}

function titleFieldMatch(doc: Doc, variants: string[]): AlbumSearchMatch | undefined {
  if (isNoisyArtistSource(doc)) return undefined;
  return variants.some((variant) => hasPhrase(one(doc.title), normalizeSearchText(variant))) ? "title" : undefined;
}

function anyFieldMatch(doc: Doc, variants: string[]): AlbumSearchMatch | undefined {
  let best: AlbumSearchMatch | undefined;
  for (const variant of variants) {
    const phrase = normalizeSearchText(variant);
    if (hasPhrase(one(doc.creator), phrase)) return "artist";
    if (hasPhrase(one(doc.title), phrase) && (!best || MATCH_WEIGHT.title > MATCH_WEIGHT[best])) best = "title";
    if (hasPhrase(one(doc.subject), phrase) && (!best || MATCH_WEIGHT.subject > MATCH_WEIGHT[best])) best = "subject";
  }
  return best;
}

function sortSearchHits(hits: SearchHit[]): SearchHit[] {
  return hits.sort((a, b) =>
    MATCH_WEIGHT[b.match] - MATCH_WEIGHT[a.match] ||
    (Number(b.doc.downloads) || 0) - (Number(a.doc.downloads) || 0) ||
    one(a.doc.title).localeCompare(one(b.doc.title)),
  );
}

async function collectSearchHits(
  queries: SearchQuery[],
  needed: number,
  signal?: AbortSignal,
  initial: SearchHit[] = [],
): Promise<{ hits: SearchHit[]; exhausted: boolean }> {
  const byId = new Map<string, SearchHit>();
  for (const hit of initial) byId.set(hit.doc.identifier, hit);

  let exhausted = true;
  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    if (byId.size >= needed) {
      exhausted = false;
      break;
    }

    const search = queries[queryIndex];
    let rawPage = 1;
    let queryExhausted = false;

    while (rawPage <= MAX_SEARCH_BATCHES) {
      const result = await requestAlbumDocs(search.query, rawPage, SEARCH_BATCH_SIZE, signal);
      for (const doc of result.docs) {
        const match = search.match(doc);
        if (!match) continue;
        const previous = byId.get(doc.identifier);
        if (!previous || MATCH_WEIGHT[match] > MATCH_WEIGHT[previous.match]) byId.set(doc.identifier, { doc, match });
      }

      const reachedEnd = result.docs.length < SEARCH_BATCH_SIZE || rawPage * SEARCH_BATCH_SIZE >= result.total;
      if (reachedEnd) {
        queryExhausted = true;
        break;
      }
      if (byId.size >= needed) break;
      rawPage += 1;
    }

    if (!queryExhausted) {
      exhausted = false;
      break;
    }
    if (byId.size >= needed) {
      if (queryIndex < queries.length - 1) exhausted = false;
      break;
    }
  }

  return { hits: [...byId.values()], exhausted };
}

/** Exact phrase search: performer first, title fallback for incomplete IA creator metadata. */
export async function searchTextAlbums(text: string, scope: AlbumSearchScope, page: number, signal?: AbortSignal): Promise<AlbumSearchPage> {
  const variants = searchVariants(text);
  if (!variants.length) return { albums: [], hasMore: false };

  const needed = page * SEARCH_PAGE_SIZE + 1;
  let collected: { hits: SearchHit[]; exhausted: boolean };

  if (scope === "artist") {
    const performerQueries = variants.map((variant) => ({
      query: phraseQuery([variant], ["creator"]),
      match: (doc: Doc) => artistFieldMatch(doc, [variant]),
    }));
    const performers = await collectSearchHits(performerQueries, needed, signal);
    collected = performers;

    // Keep creator matches clean (notably for short/ambiguous names such as a-ha). Only broaden
    // when metadata is sparse; title hits stay behind performer hits and are identified in the UI.
    const shortNameAlreadyMatched = performers.hits.length > 0 && hasShortArtistToken(variants);
    if (performers.hits.length < SMART_ARTIST_FALLBACK_THRESHOLD && !shortNameAlreadyMatched) {
      const titleQueries = variants.map((variant) => ({
        query: phraseQuery([variant], ["title"]),
        match: (doc: Doc) => titleFieldMatch(doc, [variant]),
      }));
      const titles = await collectSearchHits(titleQueries, needed, signal, performers.hits);
      collected = { hits: titles.hits, exhausted: performers.exhausted && titles.exhausted };
    }
  } else {
    const allFields: SearchQuery = {
      query: phraseQuery(variants, ["creator", "title", "subject"]),
      match: (doc) => anyFieldMatch(doc, variants),
    };
    collected = await collectSearchHits([allFields], needed, signal);
  }

  const ranked = sortSearchHits(collected.hits);
  const start = (page - 1) * SEARCH_PAGE_SIZE;
  return {
    albums: ranked.slice(start, start + SEARCH_PAGE_SIZE).map(({ doc, match }) => toAlbum(doc, match)),
    hasMore: ranked.length > start + SEARCH_PAGE_SIZE || !collected.exhausted,
  };
}

interface FileRow {
  name: string;
  format?: string;
  title?: string;
  creator?: string;
  length?: string;
  track?: string;
  size?: string;
}

interface MetaData {
  title: string;
  creator: string;
  files: FileRow[];
}

const metaCache = new Map<string, Promise<MetaData>>();

function audioFiles(files: FileRow[]): FileRow[] {
  let pick = files.filter((f) => /mp3/i.test(f.format ?? ""));
  if (!pick.length) pick = files.filter((f) => /ogg|opus/i.test(f.format ?? ""));
  return pick;
}

async function metadata(id: string, signal?: AbortSignal): Promise<MetaData> {
  // Запрос с signal не кэшируем: отмена одного компонента не должна ломать результат для остальных.
  if (signal) {
    const r = await fetch(`${BASE}/metadata/${encodeURIComponent(id)}`, { signal });
    if (!r.ok) throw new Error(`Архив ответил ${r.status}`);
    const j = (await r.json()) as { metadata?: { title?: string | string[]; creator?: string | string[] }; files?: FileRow[] };
    return { title: one(j.metadata?.title) || id, creator: one(j.metadata?.creator), files: j.files ?? [] };
  }
  let p = metaCache.get(id);
  if (!p) {
    p = fetch(`${BASE}/metadata/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Архив ответил ${r.status}`);
        return r.json() as Promise<{ metadata?: { title?: string | string[]; creator?: string | string[] }; files?: FileRow[] }>;
      })
      .then((j) => ({ title: one(j.metadata?.title) || id, creator: one(j.metadata?.creator), files: j.files ?? [] }))
      .catch((e) => {
        metaCache.delete(id);
        throw e;
      });
    metaCache.set(id, p);
  }
  return p;
}

/** Быстрая классификация результата: одна запись или сборник из нескольких треков. */
const isUsefulImage = (f: FileRow) =>
  /\.(jpe?g|png|webp)$/i.test(f.name) &&
  !/(spectrogram|waveform|_thumb|__ia|itemimage|format=|height=|width=|wave\.)/i.test(f.name) &&
  (Number(f.size) || 0) > 20_000;

function imageUrl(id: string, files: FileRow[]): string | undefined {
  const image = files.filter(isUsefulImage).sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))[0];
  return image ? `${BASE}/download/${encodeURIComponent(id)}/${image.name.split("/").map(encodeURIComponent).join("/")}` : undefined;
}

export async function inspectAlbum(id: string): Promise<{ count: number; cover?: string }> {
  const meta = await metadata(id);
  return { count: audioFiles(meta.files).length, cover: imageUrl(id, meta.files) };
}

function hash36(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function seconds(v?: string): number | undefined {
  if (!v) return undefined;
  if (v.includes(":")) {
    const parts = v.split(":").map(Number);
    if (parts.some((n) => !isFinite(n))) return undefined;
    return Math.round(parts.reduce((a, n) => a * 60 + n, 0));
  }
  const n = parseFloat(v);
  return isFinite(n) ? Math.round(n) : undefined;
}

const cleanTitle = (s: string) =>
  s
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/^\s*\d{1,3}\s*[-._)]\s*/, "")
    .replace(/_/g, " ")
    .trim();

export async function albumTracks(id: string, signal?: AbortSignal): Promise<{ title: string; creator: string; cover?: string; tracks: PlaylistItem[] }> {
  const meta = await metadata(id, signal);
  const pick = audioFiles(meta.files);
  const album = fixText(meta.title);
  const creator = fixText(meta.creator);
  const cover = imageUrl(id, meta.files);

  pick.sort((a, b) => {
    const ta = parseInt(a.track ?? "", 10);
    const tb = parseInt(b.track ?? "", 10);
    if (isFinite(ta) && isFinite(tb) && ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  const seen = new Set<string>();
  const tracks: PlaylistItem[] = [];
  for (const f of pick) {
    const title = fixText(cleanTitle(f.title || f.name.split("/").pop() || f.name));
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue; // один и тот же трек в разных битрейтах берём один раз
    seen.add(key);
    tracks.push({
      id: `ia-${hash36(`${id}/${f.name}`)}`,
      title,
      subtitle: fixText(f.creator || creator) || undefined,
      url: `${BASE}/download/${encodeURIComponent(id)}/${f.name.split("/").map(encodeURIComponent).join("/")}`,
      kind: "vod",
      logo: cover,
      genre: "Музыка",
      duration: seconds(f.length),
      size: f.size ? Number(f.size) || undefined : undefined,
      note: album,
      addedAt: Date.now(),
    });
  }
  return { title: album, creator, cover, tracks };
}
