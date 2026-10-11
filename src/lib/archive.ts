import type { PlaylistItem } from "./types";
import { lookupArchiveAlbumBriefly } from "./albumArt";
import { CDDA_SECTOR_BYTES, CDDA_SECTORS_PER_SECOND, makeCddaTrackUrl, parseCueSheet, type CueAudioTrack } from "./cdda";
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

/** Популярные жанры: русские и английские названия ведут к жанровым темам Archive. */
export interface ArchiveGenre {
  id: string;
  label: string;
  aliases: string[];
  query: string;
}

export const ARCHIVE_GENRES: ArchiveGenre[] = [
  { id: "rock", label: "Рок", aliases: ["рок", "rock", "rock music", "рок-музыка"], query: '(subject:rock OR subject:"rock music" OR subject:rockabilly OR subject:"rock and roll")' },
  { id: "pop", label: "Поп", aliases: ["поп", "поп-музыка", "поп музыка", "pop", "pop music"], query: '(subject:pop OR subject:"pop music" OR subject:electropop)' },
  { id: "jazz", label: "Джаз", aliases: ["джаз", "jazz"], query: "(subject:jazz OR subject:swing OR subject:bebop)" },
  { id: "classical", label: "Классика", aliases: ["классика", "классическая музыка", "classical", "classical music"], query: '(subject:classical OR subject:"classical music" OR subject:symphony OR subject:opera)' },
  { id: "hip-hop", label: "Хип-хоп", aliases: ["хип-хоп", "хип хоп", "рэп", "hip hop", "hip-hop", "rap"], query: '(subject:"hip hop" OR subject:hip-hop OR subject:rap OR subject:hiphop)' },
  { id: "electronic", label: "Электроника", aliases: ["электроника", "электронная музыка", "электронная", "electronic", "electronic music"], query: '(subject:electronic OR subject:"electronic music" OR subject:techno OR subject:house OR subject:trance OR subject:edm)' },
  { id: "blues", label: "Блюз", aliases: ["блюз", "blues"], query: "subject:blues" },
  { id: "metal", label: "Метал", aliases: ["метал", "металл", "тяжёлый металл", "тяжелый металл", "metal", "heavy metal"], query: '(subject:metal OR subject:"heavy metal" OR subject:metalcore)' },
  { id: "country", label: "Кантри", aliases: ["кантри", "country", "country music"], query: '(subject:country OR subject:"country music" OR subject:bluegrass)' },
  { id: "folk", label: "Фолк", aliases: ["фолк", "народная музыка", "folk", "folk music", "folklore"], query: '(subject:folk OR subject:"folk music" OR subject:folklore OR subject:"traditional music")' },
  { id: "ambient", label: "Эмбиент", aliases: ["эмбиент", "эмбиентная музыка", "ambient", "ambient music"], query: '(subject:ambient OR subject:"ambient music" OR subject:soundscape OR subject:drone OR subject:"new age")' },
  { id: "reggae", label: "Регги", aliases: ["регги", "reggae"], query: "(subject:reggae OR subject:ska OR subject:dub)" },
  { id: "disco", label: "Диско", aliases: ["диско", "disco"], query: "(subject:disco OR subject:funk)" },
  { id: "chanson", label: "Шансон", aliases: ["шансон", "русский шансон", "chanson", "russian chanson"], query: '(subject:шансон OR subject:chanson OR subject:"russian chanson")' },
  { id: "soundtrack", label: "Саундтреки", aliases: ["саундтрек", "саундтреки", "музыка из кино", "soundtrack", "film music", "movie soundtrack"], query: '(subject:soundtrack OR subject:"film music" OR subject:"movie soundtrack")' },
  { id: "latin", label: "Латино", aliases: ["латина", "латино", "латиноамериканская музыка", "latin", "latin music", "salsa", "самба"], query: '(subject:"latin music" OR subject:salsa OR subject:samba OR subject:tango)' },
];

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

const SPOKEN_WORD_MARKERS = [
  "audiobook", "audiobooks", "audio book", "audio books", "librivox", "project gutenberg", "spoken word",
  "unabridged", "abridged audiobook", "narrated", "narration", "read by", "read aloud", "book reading",
  "book on tape", "book on cd", "radio drama", "audio drama", "podcast", "popcast", "episode", "lecture", "sermon", "interview",
  "radio show", "radio program", "radio programme", "radio broadcast", "radio transmission", "aircheck",
  "film review", "movie review", "аудиокнига", "аудиокниги", "аудиоспектакль", "радиоспектакль", "радиопостановка",
  "читает", "читают", "чтение вслух", "лекция", "интервью",
].map(normalizeSearchText);

/** Exact genre terms are translated to the Archive's commonly indexed English subjects. */
export function findArchiveGenre(text: string): ArchiveGenre | undefined {
  const normalized = normalizeSearchText(text);
  if (!normalized) return undefined;
  return ARCHIVE_GENRES.find((genre) => genre.aliases.some((alias) => normalizeSearchText(alias) === normalized));
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
  const genre = findArchiveGenre(phrase);
  if (genre) candidates.push(...genre.aliases);
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

function toAlbum(d: Doc, match?: AlbumSearchMatch, verifiedFiles?: Pick<Album, "trackCount" | "cover">): Album {
  return {
    id: d.identifier,
    title: fixText(one(d.title)) || d.identifier,
    creator: fixText(one(d.creator)),
    year: d.year ? String(d.year) : "",
    downloads: Number(d.downloads) || 0,
    ...(verifiedFiles ?? {}),
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
  const start = (Math.max(1, page) - 1) * SEARCH_PAGE_SIZE;
  const needed = start + SEARCH_PAGE_SIZE + 1;
  const docs: Doc[] = [];
  const seen = new Set<string>();

  for (let rawPage = 1; rawPage <= MAX_SEARCH_BATCHES && docs.length < needed; rawPage += 1) {
    const result = await requestAlbumDocs(query, rawPage, SEARCH_BATCH_SIZE, signal);
    for (const doc of result.docs) {
      if (isSpokenWordArchiveItem(doc) || seen.has(doc.identifier)) continue;
      seen.add(doc.identifier);
      docs.push(doc);
    }
    if (result.docs.length < SEARCH_BATCH_SIZE || rawPage * SEARCH_BATCH_SIZE >= result.total) break;
  }

  return {
    albums: docs.slice(start, start + SEARCH_PAGE_SIZE).map((doc) => toAlbum(doc)),
    hasMore: docs.length > start + SEARCH_PAGE_SIZE,
  };
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
  verifiedFiles?: Pick<Album, "trackCount" | "cover">;
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
  return one(doc.collection)
    .toLowerCase()
    .split(/[;,|\s]+/)
    .map((name) => name.replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);
}

function hasSpokenWordCollection(doc: Doc): boolean {
  return artistCollectionTokens(doc).some((name) =>
    name.startsWith("podcast") ||
    name.startsWith("audiobook") ||
    name.startsWith("audioboo") ||
    name.startsWith("librivox") ||
    name.includes("gutenberg") ||
    name.startsWith("openlibrary") ||
    name.includes("internetarchivebooks") ||
    name.startsWith("spokenword"),
  );
}

function hasBroadcastCollection(doc: Doc): boolean {
  return artistCollectionTokens(doc).some((name) => name.startsWith("radio") || name.startsWith("aircheck"));
}

/** Filters book readings, talk recordings and radio programmes that Archive also indexes as mediatype:audio. */
function isSpokenWordArchiveItem(doc: Doc): boolean {
  if (hasSpokenWordCollection(doc)) return true;
  const metadata = ` ${normalizeSearchText(`${one(doc.title)} ${one(doc.subject)} ${one(doc.creator)}`)} `;
  return SPOKEN_WORD_MARKERS.some((marker) => metadata.includes(` ${marker} `));
}

function isNoisyArtistSource(doc: Doc): boolean {
  // Jamendo imports contain many covers; broadcasts and spoken-word collections are not artist-album results.
  return artistCollectionTokens(doc).includes("jamendoalbums") || hasBroadcastCollection(doc) || isSpokenWordArchiveItem(doc);
}

function artistFieldMatch(doc: Doc, variants: string[]): AlbumSearchMatch | undefined {
  if (isNoisyArtistSource(doc)) return undefined;
  if (artistCreatorMatch(one(doc.creator), variants)) return "artist";
  return undefined;
}

function titleFieldMatch(doc: Doc, variants: string[]): AlbumSearchMatch | undefined {
  if (isNoisyArtistSource(doc)) return undefined;
  const title = normalizeSearchText(one(doc.title));
  const artistPrefixMatches = variants.some((variant) => {
    const phrase = normalizeSearchText(variant);
    if (!phrase) return false;
    const creatorMissingForSelfTitle = title === phrase && !one(doc.creator).trim() && hasPhrase(one(doc.subject), phrase);
    return creatorMissingForSelfTitle || title.startsWith(`${phrase} `) || title.startsWith(`the ${phrase} `);
  });
  return artistPrefixMatches ? "title" : undefined;
}

function isNoisyArtistSubjectRecord(doc: Doc): boolean {
  if (isNoisyArtistSource(doc)) return true;
  const context = `${one(doc.title)} ${one(doc.creator)} ${one(doc.subject)} ${one(doc.collection)}`;
  const radioLikeCreator = normalizeSearchText(one(doc.creator)).split(" ").some((token) => token === "radio" || (token.length > 5 && token.endsWith("radio")));
  const numberedEpisode = /\b(?:ep|episode)\.?\s*\d+\b/i.test(`${one(doc.title)} ${doc.identifier}`);
  return radioLikeCreator || numberedEpisode || ["radio", "program", "programme", "programming", "broadcast", "aircheck", "buergerfunk", "film review", "movie review"]
    .some((marker) => hasPhrase(context, marker));
}

function subjectFieldMatch(doc: Doc, variants: string[]): AlbumSearchMatch | undefined {
  if (isNoisyArtistSubjectRecord(doc)) return undefined;
  return variants.some((variant) => hasPhrase(one(doc.subject), normalizeSearchText(variant))) ? "subject" : undefined;
}

function anyFieldMatch(doc: Doc, variants: string[]): AlbumSearchMatch | undefined {
  if (isNoisyArtistSource(doc)) return undefined;
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

async function verifiedSubjectFiles(doc: Doc, variants: string[], signal?: AbortSignal): Promise<Pick<Album, "trackCount" | "cover"> | undefined> {
  try {
    const meta = await metadata(doc.identifier, signal);
    const tracks = audioFiles(meta.files);
    if (!tracks.length) return undefined;
    const albumArtistMatches = variants.some((variant) => hasPhrase(meta.creator, normalizeSearchText(variant)));
    const trackArtistMatches = tracks.map((file) => variants.some((variant) =>
      [file.name, file.title ?? "", file.creator ?? ""].some((value) => hasPhrase(value, normalizeSearchText(variant))),
    ));
    // A subject tag may point to a compilation or a cover. Accept it only if the album metadata
    // names the performer, or every audio track independently does; a single hit in a mix is noise.
    if (!albumArtistMatches && !trackArtistMatches.every(Boolean)) return undefined;
    return { trackCount: tracks.length, cover: imageUrl(doc.identifier, meta.files) };
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}

async function verifySubjectHits(hits: SearchHit[], variants: string[], signal?: AbortSignal): Promise<SearchHit[]> {
  const candidates = hits.filter((hit) => hit.match === "subject");
  const verified: SearchHit[] = [];
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const hit = candidates[next++];
      const files = await verifiedSubjectFiles(hit.doc, variants, signal);
      if (files) verified.push({ ...hit, verifiedFiles: files });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker));
  return [...hits.filter((hit) => hit.match !== "subject"), ...verified];
}

/** Exact phrase search: performer first, then artist-led titles and subject tags when metadata is sparse. */
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

    // Some IA uploads omit both creator and artist-led title metadata but retain the performer as
    // a subject tag. Add those only after better matches, filter radio/talk collections, and keep
    // them visibly labelled as subject matches so they cannot outrank actual artist releases.
    if (!shortNameAlreadyMatched && collected.hits.length < needed && collected.exhausted) {
      const subjectQueries = variants.map((variant) => ({
        query: phraseQuery([variant], ["subject"]),
        match: (doc: Doc) => subjectFieldMatch(doc, [variant]),
      }));
      const subjects = await collectSearchHits(subjectQueries, needed, signal, collected.hits);
      const verified = await verifySubjectHits(subjects.hits, variants, signal);
      collected = { hits: verified, exhausted: collected.exhausted && subjects.exhausted };
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
    albums: ranked.slice(start, start + SEARCH_PAGE_SIZE).map(({ doc, match, verifiedFiles }) => toAlbum(doc, match, verifiedFiles)),
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

interface AudioFormat {
  mime: string;
  priority: number;
}

function audioFormat(file: FileRow): AudioFormat | null {
  const name = file.name.toLowerCase();
  const format = (file.format ?? "").toLowerCase();
  if (/\.(?:mp3|mp2)$/i.test(name) || /\b(?:mp3|mpeg(?: layer)? audio)\b/i.test(format)) return { mime: "audio/mpeg", priority: 0 };
  if (/\.(?:m4a|mp4)$/i.test(name) || /\b(?:m4a|mpeg-?4 audio|aac audio)\b/i.test(format)) return { mime: "audio/mp4", priority: 1 };
  if (/\.aac$/i.test(name) || /\b(?:aac|advanced audio coding)\b/i.test(format)) return { mime: "audio/aac", priority: 2 };
  if (/\.(?:ogg|oga)$/i.test(name) || /\b(?:ogg|vorbis|opus)\b/i.test(format)) return { mime: /opus/i.test(`${name} ${format}`) ? 'audio/ogg; codecs="opus"' : "audio/ogg", priority: 3 };
  if (/\.opus$/i.test(name)) return { mime: 'audio/ogg; codecs="opus"', priority: 3 };
  if (/\.flac$/i.test(name) || /\bflac\b/i.test(format)) return { mime: "audio/flac", priority: 4 };
  if (/\.(?:wav|wave)$/i.test(name) || /\b(?:wave|wav)\b/i.test(format)) return { mime: "audio/wav", priority: 5 };
  if (/\.(?:aif|aiff)$/i.test(name) || /\baiff?\b/i.test(format)) return { mime: "audio/aiff", priority: 6 };
  return null;
}

interface DirectTrackKey {
  folder: string;
  trackNumber?: number;
  names: string[];
}

function directTrackKey(file: FileRow): DirectTrackKey {
  const folder = file.name.includes("/") ? file.name.slice(0, file.name.lastIndexOf("/")) : "";
  const parsedTrack = Number.parseInt(file.track ?? "", 10);
  const filename = (file.name.split("/").pop() || file.name).replace(/\.[^.]+$/, "");
  const normalize = (value: string) => cleanTitle(value)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const names = [...new Set([file.title ? normalize(file.title) : "", normalize(filename)].filter(Boolean))];
  return { folder, trackNumber: Number.isFinite(parsedTrack) ? parsedTrack : undefined, names };
}

function sameDirectTrack(a: DirectTrackKey, b: DirectTrackKey): boolean {
  if (a.folder !== b.folder) return false;
  if (a.trackNumber !== undefined && b.trackNumber !== undefined) return a.trackNumber === b.trackNumber;
  return a.names.some((name) => b.names.includes(name));
}

function audioFiles(files: FileRow[]): FileRow[] {
  const probe = typeof Audio === "undefined" ? null : new Audio();
  const candidates = files.flatMap((file) => {
    const format = audioFormat(file);
    if (!format || (probe && !probe.canPlayType(format.mime))) return [];
    return [{ file, format }];
  }).sort((a, b) => a.format.priority - b.format.priority || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));

  const selected: { file: FileRow; key: DirectTrackKey }[] = [];
  for (const candidate of candidates) {
    const key = directTrackKey(candidate.file);
    if (selected.some((item) => sameDirectTrack(item.key, key))) continue;
    selected.push({ file: candidate.file, key });
  }
  return selected.map((item) => item.file).sort((a, b) => {
    const ta = parseInt(a.track ?? "", 10);
    const tb = parseInt(b.track ?? "", 10);
    if (isFinite(ta) && isFinite(tb) && ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
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

/** Prefer named front artwork; reject Archive-generated waveforms and secondary disc scans. */
const isUsefulImage = (f: FileRow) =>
  /\.(jpe?g|png|webp|avif)$/i.test(f.name) &&
  !/(spectrogram|waveform|_thumb|__ia|itemimage|format=|height=|width=|wave\.|back.?cover|disc.?label|booklet|tray|inlay)/i.test(f.name) &&
  (Number(f.size) || 0) > 4_000;

function imageUrl(id: string, files: FileRow[]): string | undefined {
  const image = files.filter(isUsefulImage).sort((a, b) => {
    const frontA = /(^|[\/_ .-])(?:cover|front|folder|artwork|album)([\/_ .-]|$)/i.test(a.name) ? 1 : 0;
    const frontB = /(^|[\/_ .-])(?:cover|front|folder|artwork|album)([\/_ .-]|$)/i.test(b.name) ? 1 : 0;
    return frontB - frontA || (Number(b.size) || 0) - (Number(a.size) || 0);
  })[0];
  return image ? `${BASE}/download/${encodeURIComponent(id)}/${image.name.split("/").map(encodeURIComponent).join("/")}` : undefined;
}

async function readCueText(response: Response, maxBytes = 512 * 1024): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    if (loaded > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function cueAudioTracks(id: string, files: FileRow[], signal?: AbortSignal): Promise<CueAudioTrack[]> {
  const cueFiles = files.filter((file) => /\.cue$/i.test(file.name) && (!file.size || Number(file.size) <= 512 * 1024));
  for (const cue of cueFiles) {
    const params = new URLSearchParams({ mode: "cue", identifier: id, file: cue.name });
    const response = await fetch(`/api/archive-file?${params.toString()}`, { signal });
    if (!response.ok) continue;
    const text = await readCueText(response);
    if (text === null) continue;
    const tracks = parseCueSheet(text, files);
    if (tracks.length) return tracks;
  }
  return [];
}

export async function inspectAlbum(id: string): Promise<{ count: number; cover?: string; source?: "files" | "cd-image" }> {
  const meta = await metadata(id);
  const direct = audioFiles(meta.files);
  if (direct.length) return { count: direct.length, cover: imageUrl(id, meta.files), source: "files" };
  const discTracks = await cueAudioTracks(id, meta.files);
  return { count: discTracks.length, cover: imageUrl(id, meta.files), source: discTracks.length ? "cd-image" : undefined };
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

export async function albumTracks(
  id: string,
  signal?: AbortSignal,
  hint?: Pick<Album, "title" | "creator" | "year">,
): Promise<{ title: string; creator: string; cover?: string; source: "files" | "cd-image"; tracks: PlaylistItem[] }> {
  const meta = await metadata(id, signal);
  const album = fixText(meta.title) || fixText(hint?.title) || id;
  const creator = fixText(meta.creator) || fixText(hint?.creator);
  const embeddedCover = imageUrl(id, meta.files);
  const direct = audioFiles(meta.files);
  let discTracks: CueAudioTrack[] = [];
  if (!direct.length) discTracks = await cueAudioTracks(id, meta.files, signal);

  const catalog = (!embeddedCover || discTracks.length)
    ? await lookupArchiveAlbumBriefly(creator, album, hint?.year, discTracks.length || undefined)
    : null;
  const cover = embeddedCover || catalog?.cover;
  const tracks: PlaylistItem[] = [];

  if (discTracks.length) {
    for (const [index, track] of discTracks.entries()) {
      const catalogTrack = catalog?.tracks.find((item) => item.number === track.number) ?? catalog?.tracks[index];
      const title = fixText(track.title || catalogTrack?.title || `Трек ${String(track.number).padStart(2, "0")}`);
      const duration = (track.endSector - track.startSector) / CDDA_SECTORS_PER_SECOND;
      const imageUrl = `${BASE}/download/${encodeURIComponent(id)}/${track.file.name.split("/").map(encodeURIComponent).join("/")}`;
      const url = makeCddaTrackUrl(imageUrl, track.number, track.startSector, track.endSector, track.byteOrder);
      tracks.push({
        id: `ia-${hash36(`${id}/cdda/${track.file.name}/${track.number}/${track.startSector}/${track.endSector}`)}`,
        title,
        subtitle: fixText(track.performer || catalogTrack?.artist || creator) || undefined,
        url,
        kind: "vod",
        logo: cover,
        genre: "Музыка",
        duration,
        size: (track.endSector - track.startSector) * CDDA_SECTOR_BYTES + 44,
        note: album,
        addedAt: Date.now(),
      });
    }
    return { title: album, creator, cover, source: "cd-image", tracks };
  }

  const pick = direct;
  pick.sort((a, b) => {
    const ta = parseInt(a.track ?? "", 10);
    const tb = parseInt(b.track ?? "", 10);
    if (isFinite(ta) && isFinite(tb) && ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  const seen: DirectTrackKey[] = [];
  for (const [index, file] of pick.entries()) {
    const key = directTrackKey(file);
    if (seen.some((item) => sameDirectTrack(item, key))) continue;
    seen.push(key);
    const catalogNumber = Number.parseInt(file.track ?? "", 10) || index + 1;
    const catalogTrack = catalog?.tracks.find((item) => item.number === catalogNumber) ?? catalog?.tracks[index];
    const title = fixText(file.title || catalogTrack?.title || cleanTitle(file.name.split("/").pop() || file.name));
    if (!title) continue;
    tracks.push({
      id: `ia-${hash36(`${id}/${file.name}`)}`,
      title,
      subtitle: fixText(file.creator || catalogTrack?.artist || creator) || undefined,
      url: `${BASE}/download/${encodeURIComponent(id)}/${file.name.split("/").map(encodeURIComponent).join("/")}`,
      kind: "vod",
      logo: cover,
      genre: "Музыка",
      duration: seconds(file.length) ?? catalogTrack?.duration,
      size: file.size ? Number(file.size) || undefined : undefined,
      note: album,
      addedAt: Date.now(),
    });
  }
  return { title: album, creator, cover, source: "files", tracks };
}
