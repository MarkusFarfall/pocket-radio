import type { Draft } from "./types";
import { guessGenre } from "./genres";
import { parseM3U } from "./m3u";
import { countryName, type Found } from "./radiobrowser";
import { fixText } from "./text";

/* ============================ SomaFM (живой список) ============================ */

interface SomaChannel {
  id: string;
  title: string;
  description: string;
  genre: string;
  image: string;
  largeimage: string;
  listeners: string;
  playlists: { url: string; format: string; quality: string }[];
}

let somaPromise: Promise<Found[]> | null = null;

// Запрос общий для всех вызовов и кэшируется, поэтому сигнал отмены в него не передаётся.
export function somaChannels(): Promise<Found[]> {
  if (!somaPromise) {
    somaPromise = fetch("https://somafm.com/channels.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
        return r.json() as Promise<{ channels: SomaChannel[] }>;
      })
      .then(({ channels }) =>
        channels
          .map((c): Found | null => {
            const mp3 = c.playlists.find((p) => p.format === "mp3");
            if (!mp3) return null;
            const file = mp3.url.split("/").pop()!.replace(/\.pls$/i, "");
            const suffix = file.startsWith(c.id) ? file.slice(c.id.length) : "";
            const br = suffix && /^\d+$/.test(suffix) ? Number(suffix) : 128;
            const tags = c.genre.split("|").map((t) => t.trim().toLowerCase()).filter(Boolean);
            const g = guessGenre(`${tags.join(" ")} ${c.title} ${c.description}`);
            const logo = (c.largeimage || c.image || "").replace(/^http:\/\//i, "https://");
            return {
              id: `sm-${c.id}`,
              name: `SomaFM · ${c.title}`,
              url: `https://ice1.somafm.com/${c.id}-${br}-mp3`,
              kind: "icecast",
              genre: g.genre,
              mood: g.mood,
              city: "Сан-Франциско",
              tags: ["somafm", ...tags].slice(0, 5),
              icon: "",
              logo: /^https:\/\//i.test(logo) ? logo : undefined,
              note: c.description,
              bitrate: br,
              votes: Number(c.listeners) || 0,
              unit: "listeners",
              codec: "MP3",
              countryCode: "US",
              language: "english",
            };
          })
          .filter((x): x is Found => !!x)
          .sort((a, b) => b.votes - a.votes)
      )
      .catch((e) => {
        somaPromise = null;
        throw e;
      });
  }
  return somaPromise;
}

/* =============================== Radio Garden =============================== */

interface GardenHit {
  _source?: { code?: string; page?: { url?: string; type?: string; title?: string; subtitle?: string } };
}

interface GardenSearchResponse {
  hits?: { hits?: GardenHit[] };
  error?: string;
}

/**
 * Radio Garden does not expose its unofficial search API to arbitrary browser origins.
 * Use the same-origin Vercel function (and Vite proxy in development) to avoid CORS.
 */
export async function gardenSearch(q: string, signal?: AbortSignal): Promise<Found[]> {
  const r = await fetch(`/api/radio-garden/search?q=${encodeURIComponent(q.trim())}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    const payload = (await r.json().catch(() => null)) as GardenSearchResponse | null;
    throw new Error(payload?.error || `Radio Garden ответил ${r.status}`);
  }

  const j = (await r.json()) as GardenSearchResponse;
  const hits = j.hits?.hits;
  if (!Array.isArray(hits)) throw new Error("Radio Garden вернул неожиданный формат ответа");

  const out: Found[] = [];
  for (const h of hits) {
    const source = h?._source;
    const p = source?.page;
    if (p?.type !== "channel" || !p.url || !p.title?.trim()) continue;
    const id = p.url.split("/").filter(Boolean).pop();
    if (!id) continue;
    const g = guessGenre(p.title);
    out.push({
      id: `rg-${id}`,
      name: p.title.trim(),
      url: `https://radio.garden/api/ara/content/listen/${encodeURIComponent(id)}/channel.mp3`,
      kind: "http",
      genre: g.genre,
      mood: g.mood,
      city: p.subtitle ?? "",
      tags: [],
      icon: "",
      note: "Из каталога Radio Garden",
      bitrate: 128,
      votes: 0,
      codec: "",
      countryCode: source?.code ?? "",
      language: "",
    });
  }
  return out;
}

/* ============================ Apple Podcasts (iTunes) ============================ */

export interface Show {
  id: number;
  name: string;
  artist: string;
  art: string;
  genre: string;
  episodes: number;
}

function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    const cb = "__it" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const clean = () => {
      clearTimeout(t);
      delete w[cb];
      s.remove();
    };
    const t = setTimeout(() => {
      clean();
      reject(new Error("Нет ответа от сервера"));
    }, 10000);
    w[cb] = (d: T) => {
      clean();
      resolve(d);
    };
    s.onerror = () => {
      clean();
      reject(new Error("Сеть недоступна"));
    };
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
    document.head.appendChild(s);
  });
}

async function itunes<T>(url: string, signal?: AbortSignal): Promise<T> {
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    if (signal?.aborted) throw e;
    return jsonp<T>(url); // запасной путь, если CORS закрыт
  }
}

interface ItResult {
  wrapperType?: string;
  kind?: string;
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  trackCount?: number;
  trackId?: number;
  trackName?: string;
  episodeUrl?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  shortDescription?: string;
}

export async function searchPodcasts(term: string, country: string, signal?: AbortSignal): Promise<Show[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&entity=podcast&limit=30&country=${country}`;
  const j = await itunes<{ results: ItResult[] }>(url, signal);
  return j.results
    .filter((r) => r.collectionId)
    .map((r) => ({
      id: r.collectionId!,
      name: fixText(r.collectionName) || "Без названия",
      artist: fixText(r.artistName),
      art: (r.artworkUrl600 || r.artworkUrl100 || "").replace(/^http:\/\//i, "https://"),
      genre: r.primaryGenreName ?? "",
      episodes: r.trackCount ?? 0,
    }));
}

export interface Episode extends Draft {
  id: string;
  url: string;
  name: string;
  date: string;
  minutes: number;
}

export async function podcastEpisodes(show: Show, country: string, signal?: AbortSignal): Promise<Episode[]> {
  const url = `https://itunes.apple.com/lookup?id=${show.id}&entity=podcastEpisode&limit=40&country=${country}`;
  const j = await itunes<{ results: ItResult[] }>(url, signal);
  const out: Episode[] = [];
  for (const r of j.results) {
    if (r.wrapperType !== "podcastEpisode" || !r.episodeUrl || !r.trackId) continue;
    out.push({
      id: `pc-${r.trackId}`,
      name: r.trackName ?? "Эпизод",
      url: r.episodeUrl.replace(/^http:\/\//i, "https://"),
      kind: "vod",
      genre: "Подкасты",
      mood: "",
      city: show.name,
      tags: [show.genre.toLowerCase()].filter(Boolean),
      icon: "",
      logo: show.art || undefined,
      note: `${show.name} — ${show.artist}. ${r.shortDescription ?? ""}`.trim(),
      bitrate: 96,
      date: r.releaseDate ?? "",
      minutes: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : 0,
    });
  }
  return out;
}

/* ===================== Готовые M3U-плейлисты на GitHub ===================== */

export interface PlaylistInfo {
  type: "country" | "genre" | "top";
  id: string;
  name: string;
  count: number;
  url: string;
}

const INDEX_URL = "https://raw.githubusercontent.com/AlonDrilich/radio-playlists/main/index.json";

export async function loadPlaylistIndex(signal?: AbortSignal): Promise<PlaylistInfo[]> {
  try {
    const raw = localStorage.getItem("pl.index");
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < 3 * 864e5) return data as PlaylistInfo[];
    }
  } catch {
    /* ignore */
  }
  const r = await fetch(INDEX_URL, { signal });
  if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
  const j = (await r.json()) as { playlists: { type: string; id: string; name: string; stations: number; url: string }[] };
  const data: PlaylistInfo[] = j.playlists
    .filter((p) => p.url && p.stations > 0)
    .map((p) => ({
      type: p.type === "country" ? "country" : p.type === "genre" ? "genre" : "top",
      id: p.id,
      name: p.type === "country" ? countryName(p.id.toUpperCase(), p.name) : p.name,
      count: p.stations,
      url: p.url,
    }));
  try {
    localStorage.setItem("pl.index", JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* ignore */
  }
  return data;
}

export { itunes };

export async function fetchPlaylist(url: string, signal?: AbortSignal): Promise<Draft[]> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
  const text = await r.text();
  if (/#EXT-X-(STREAM-INF|TARGETDURATION)/.test(text)) return [{ name: "HLS-поток", url, kind: "hls" }];
  return parseM3U(text);
}
