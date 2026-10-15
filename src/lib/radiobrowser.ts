import type { Draft } from "./types";
import { guessGenre } from "./genres";

/** Клиент открытого каталога https://www.radio-browser.info через same-origin proxy. */

const RADIO_BROWSER_API = "/api/radio-browser";
const REQUEST_TIMEOUT_MS = 12_000;

async function rb<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException("Запрос отменён", "AbortError");
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${RADIO_BROWSER_API}${path}`, { signal: ctl.signal });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
      const message = typeof payload?.error === "string" ? payload.error : `Каталог Radio Browser временно недоступен (HTTP ${response.status})`;
      throw new Error(message);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (ctl.signal.aborted) throw new Error("Каталог Radio Browser не ответил вовремя");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

interface RbStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  state: string;
  language: string;
  votes: number;
  codec: string;
  bitrate: number;
  hls: number;
  clickcount: number;
}

/** Результат поиска из любого источника. */
export interface Found extends Draft {
  id: string;
  url: string;
  name: string;
  /** голоса (Radio Browser) или слушатели (SomaFM) */
  votes: number;
  unit?: "votes" | "listeners";
  codec: string;
  countryCode: string;
  language: string;
}

export type Order = "clickcount" | "votes" | "clicktrend" | "random" | "changetimestamp";

export interface SearchOpts {
  name?: string;
  tag?: string;
  country?: string;
  language?: string;
  codec?: string;
  bitrateMin?: number;
  order?: Order;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export interface StationSearchPage { items: Found[]; nextOffset: number; hasMore: boolean }

async function searchOnce(o: SearchOpts): Promise<StationSearchPage> {
  const q = new URLSearchParams();
  if (o.name) q.set("name", o.name);
  if (o.tag) q.set("tag", o.tag);
  if (o.country) q.set("countrycode", o.country);
  if (o.language) q.set("language", o.language);
  if (o.codec) q.set("codec", o.codec);
  if (o.bitrateMin) q.set("bitrateMin", String(o.bitrateMin));
  q.set("order", o.order ?? "clickcount");
  if (o.order !== "random") q.set("reverse", "true");
  q.set("limit", String(o.limit ?? 30));
  q.set("offset", String(o.offset ?? 0));
  q.set("hidebroken", "true");
  // NB: намеренно НЕ фильтруем по is_https. Radio Browser хранит много популярных станций
  // (в т.ч. крупные российские, напр. «Ретро ФМ») только с http-потоком, и этот фильтр
  // вырезал их из выдачи (для «ретро фм»: 16 -> 3 результата, без флагмана). Проигрывание
  // http-потоков на https-странице обеспечивает апгрейд в плеере (см. player.ts).
  const list = await rb<RbStation[]>(`/search?${q}`, o.signal);
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const s of list) {
    let url: string;
    try {
      const parsed = new URL((s.url_resolved || s.url || "").trim());
      if (!["http:", "https:"].includes(parsed.protocol)) continue;
      url = parsed.href;
    } catch { continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(mapStation(s, url));
  }
  return { items: out, nextOffset: (o.offset ?? 0) + (o.limit ?? 30), hasMore: list.length >= (o.limit ?? 30) };
}

/* ——— Транслитерация: фолбэк-поиск по второму алфавиту ———
   Названия станций в Radio Browser записаны то кириллицей («Ретро ФМ»), то латиницей
   («Retro FM»), а серверный поиск `name=` сопоставляет подстроку «как есть». Поэтому
   кириллический запрос не находит латинскую карточку и наоборот. Добираем второй
   вариант транслитерацией и склеиваем выдачи: сначала точные совпадения, затем —
   найденные через транслит (без дублей по адресу). */

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};
// Латинские digraphs -> кириллица (жадный разбор: сначала многобуквенные).
const LAT_TO_CYR: [string, string][] = [
  ["sch", "щ"], ["zh", "ж"], ["ch", "ч"], ["sh", "ш"], ["ts", "ц"], ["yu", "ю"],
  ["ya", "я"], ["jo", "ё"], ["je", "э"], ["ih", "й"], ["kh", "х"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"],
  ["i", "и"], ["j", "й"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"],
  ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"], ["h", "х"],
  ["c", "к"], ["w", "в"], ["x", "кс"], ["y", "й"], ["q", "к"],
];

function toLatin(s: string): string {
  let out = "";
  for (const ch of s.toLowerCase()) out += CYR_TO_LAT[ch] ?? ch;
  return out.replace(/\s+/g, " ").trim();
}

function toCyrillic(s: string): string {
  let out = "";
  let i = 0;
  const low = s.toLowerCase();
  while (i < low.length) {
    let matched = false;
    for (const [lat, cyr] of LAT_TO_CYR) {
      if (low.startsWith(lat, i)) {
        out += cyr;
        i += lat.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += low[i];
      i++;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

const hasCyr = (s: string) => /[а-яё]/i.test(s);
const hasLat = (s: string) => /[a-z]/i.test(s);

/** Варианты запроса в другом алфавите (пусто, если транслитерация не меняет строку). */
function translitVariants(name: string): string[] {
  const out: string[] = [];
  if (hasCyr(name)) out.push(toLatin(name));
  if (hasLat(name)) out.push(toCyrillic(name));
  return [...new Set(out.filter((v) => v && v.length > 1 && v !== name))];
}

/** Склеивает выдачи: порядок групп = приоритет, дубли по адресу отбрасываются. */
function mergeFound(groups: Found[][]): Found[] {
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const g of groups) {
    for (const s of g) {
      const key = new URL(s.url).href;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/** Offsets belong to each upstream query, not to the merged/deduplicated display list. */
export async function searchStationsPage(o: SearchOpts): Promise<StationSearchPage> {
  const primary = await searchOnce(o);
  if (!o.name) return primary;
  const extra = await Promise.all(translitVariants(o.name).map(v =>
    searchOnce({ ...o, name: v }).catch(error => {
      if (o.signal?.aborted) throw error;
      return { items: [], nextOffset: primary.nextOffset, hasMore: false };
    })
  ));
  if (o.signal?.aborted) throw new DOMException("Запрос отменён", "AbortError");
  return { items: mergeFound([primary.items, ...extra.map(p => p.items)]), nextOffset: primary.nextOffset, hasMore: primary.hasMore || extra.some(p => p.hasMore) };
}

export async function searchStations(o: SearchOpts): Promise<Found[]> {
  return (await searchStationsPage(o)).items;
}

export interface TagInfo {
  name: string;
  stationcount: number;
}
export interface CountryInfo {
  code: string;
  name: string;
  count: number;
}
export interface LangInfo {
  value: string;
  label: string;
  count: number;
}

function cached<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return Date.now() - ts < ttlMs ? (data as T) : null;
  } catch {
    return null;
  }
}
function remember(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* переполнено */
  }
}

export async function loadTags(): Promise<TagInfo[]> {
  const c = cached<TagInfo[]>("rb.tags", 7 * 864e5);
  if (c) return c;
  const list = await rb<TagInfo[]>("/tags?order=stationcount&reverse=true&limit=80&hidebroken=true");
  const data = list.filter((t) => t.name && t.name.length < 24 && !/^[\d\W]/.test(t.name)).map((t) => ({ name: t.name, stationcount: t.stationcount }));
  remember("rb.tags", data);
  return data;
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["ru"], { type: "region" });
  } catch {
    return null;
  }
})();
const langNames = (() => {
  try {
    return new Intl.DisplayNames(["ru"], { type: "language" });
  } catch {
    return null;
  }
})();

export function countryName(code: string, fallback = ""): string {
  try {
    return regionNames?.of(code.toUpperCase()) || fallback || code;
  } catch {
    return fallback || code;
  }
}

/** Код страны пользователя из языка браузера (ru-RU → RU). */
export function userRegion(): string {
  const l = navigator.languages?.[0] ?? navigator.language ?? "";
  const m = l.match(/[-_]([A-Za-z]{2})$/);
  return m ? m[1].toUpperCase() : "";
}

export async function loadCountries(): Promise<CountryInfo[]> {
  const c = cached<CountryInfo[]>("rb.countries", 7 * 864e5);
  if (c) return c;
  const list = await rb<{ name: string; iso_3166_1: string; stationcount: number }[]>("/countries?order=stationcount&reverse=true&hidebroken=true");
  const data = list
    .filter((x) => x.iso_3166_1 && x.stationcount >= 5)
    .slice(0, 140)
    .map((x) => ({ code: x.iso_3166_1, name: countryName(x.iso_3166_1, x.name), count: x.stationcount }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  remember("rb.countries", data);
  return data;
}

export async function loadLanguages(): Promise<LangInfo[]> {
  const c = cached<LangInfo[]>("rb.langs", 7 * 864e5);
  if (c) return c;
  const list = await rb<{ name: string; iso_639: string | null; stationcount: number }[]>("/languages?order=stationcount&reverse=true&limit=70&hidebroken=true");
  const data = list
    .filter((x) => x.name && x.stationcount >= 15 && !/[#,]/.test(x.name))
    .map((x) => {
      let label = x.name;
      try {
        if (x.iso_639) label = langNames?.of(x.iso_639) || x.name;
      } catch {
        /* ignore */
      }
      label = label.charAt(0).toUpperCase() + label.slice(1);
      return { value: x.name, label, count: x.stationcount };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  remember("rb.langs", data);
  return data;
}

/** Вежливо сообщаем каталогу о прослушивании (учитывается в рейтинге). */
export function registerClick(uuid: string) {
  const id = uuid.replace(/^rb-/, "");
  if (!/^[0-9a-f-]{20,}$/i.test(id)) return;
  fetch(`${RADIO_BROWSER_API}/click?uuid=${encodeURIComponent(id)}`).catch(() => {});
}

function mapStation(s: RbStation, url: string): Found {
  const tagList = (s.tags || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t.length < 24)
    .slice(0, 6);
  const { genre, mood } = guessGenre(tagList.join(" ") + " " + s.name);
  const favicon = (s.favicon || "").trim();
  // Берём http/https-фавикон (http апгрейдим в https — хосты фавиконов почти всегда
  // отдают по обоим протоколам). .ico/.svg тоже принимаем: слишком мелкие/битые отсечёт
  // Cover по ошибке декодирования и покажет генерируемую обложку. Пустой favicon -> undefined.
  const logoUrl = /^https?:\/\//i.test(favicon) ? favicon.replace(/^http:\/\//i, "https://") : undefined;
  const isHls = s.hls === 1 || /\.m3u8(\?|$)/i.test(url);
  const place = [s.state, countryName(s.countrycode, s.country)].filter(Boolean);
  return {
    id: `rb-${s.stationuuid}`,
    name: s.name.replace(/\s+/g, " ").trim().slice(0, 70) || "Без названия",
    url,
    kind: isHls ? "hls" : "http",
    genre,
    mood,
    city: place.slice(0, 2).join(", "),
    tags: tagList.slice(0, 4),
    icon: "",
    logo: logoUrl,
    note: `Из каталога Radio Browser · ${s.codec || "?"}${s.bitrate ? ` ${s.bitrate} кбит/с` : ""}`,
    bitrate: s.bitrate > 0 && s.bitrate <= 512 ? s.bitrate : isHls ? 96 : 128,
    votes: s.votes,
    unit: "votes",
    codec: s.codec,
    countryCode: s.countrycode,
    language: s.language,
  };
}
