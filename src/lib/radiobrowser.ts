import type { Draft } from "./types";
import { guessGenre } from "./genres";

/** Клиент открытого каталога https://www.radio-browser.info (CORS включён, ключ не нужен). */

const SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://all.api.radio-browser.info",
];
let preferred = 0;

async function rb<T>(path: string, signal?: AbortSignal): Promise<T> {
  let last: unknown = new Error("Каталог недоступен");
  for (let i = 0; i < SERVERS.length; i++) {
    const idx = (preferred + i) % SERVERS.length;
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(SERVERS[idx] + path, { signal: ctl.signal });
      if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
      const data = (await r.json()) as T;
      preferred = idx;
      return data;
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw last;
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

export async function searchStations(o: SearchOpts): Promise<Found[]> {
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
  q.set("is_https", "true");
  const list = await rb<RbStation[]>(`/json/stations/search?${q}`, o.signal);
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const s of list) {
    const url = (s.url_resolved || s.url || "").trim();
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(mapStation(s, url));
  }
  return out;
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
  const list = await rb<TagInfo[]>("/json/tags?order=stationcount&reverse=true&limit=80&hidebroken=true");
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
  const list = await rb<{ name: string; iso_3166_1: string; stationcount: number }[]>("/json/countries?order=stationcount&reverse=true&hidebroken=true");
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
  const list = await rb<{ name: string; iso_639: string | null; stationcount: number }[]>("/json/languages?order=stationcount&reverse=true&limit=70&hidebroken=true");
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
  fetch(`${SERVERS[preferred]}/json/url/${id}`, { mode: "cors" }).catch(() => {});
}

function mapStation(s: RbStation, url: string): Found {
  const tagList = (s.tags || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t.length < 24)
    .slice(0, 6);
  const { genre, mood } = guessGenre(tagList.join(" ") + " " + s.name);
  const favicon = (s.favicon || "").trim();
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
    logo: /^https:\/\//i.test(favicon) && !/\.(ico|svg)(\?|$)/i.test(favicon) ? favicon : undefined,
    note: `Из каталога Radio Browser · ${s.codec || "?"}${s.bitrate ? ` ${s.bitrate} кбит/с` : ""}`,
    bitrate: s.bitrate > 0 && s.bitrate <= 512 ? s.bitrate : isHls ? 96 : 128,
    votes: s.votes,
    unit: "votes",
    codec: s.codec,
    countryCode: s.countrycode,
    language: s.language,
  };
}
