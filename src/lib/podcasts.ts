import type { Draft, PlaylistItem } from "./types";
import { draftToStation } from "./db";
import { player } from "./player";
import { itunes, type Show } from "./sources";
import { fixText } from "./text";

/** Серии подкастов из каталога Apple Podcasts (iTunes Search API, без ключа). */

interface ItRes {
  wrapperType?: string;
  trackId?: number;
  trackName?: string;
  episodeUrl?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  description?: string;
  shortDescription?: string;
  collectionName?: string;
  collectionId?: number;
  artworkUrl600?: string;
  artworkUrl160?: string;
}

export interface Episode extends Draft {
  id: string;
  url: string;
  name: string;
  date: string;
  minutes: number;
  seconds: number;
  description: string;
  showId: number;
  showName: string;
}

const clean = (s?: string) =>
  (s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);

function map(r: ItRes, show?: Show): Episode | null {
  if (r.wrapperType !== "podcastEpisode" || !r.episodeUrl || !r.trackId) return null;
  const showName = fixText(show?.name ?? r.collectionName ?? "");
  const art = (show?.art || r.artworkUrl600 || r.artworkUrl160 || "").replace(/^http:\/\//i, "https://");
  const seconds = r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0;
  const description = clean(r.description || r.shortDescription);
  return {
    id: `pc-${r.trackId}`,
    name: fixText(r.trackName) || "Эпизод",
    url: r.episodeUrl.replace(/^http:\/\//i, "https://"),
    kind: "vod",
    genre: "Подкасты",
    mood: "",
    city: showName,
    tags: [],
    icon: "",
    logo: art || undefined,
    note: description.slice(0, 280),
    bitrate: 96,
    date: r.releaseDate ?? "",
    minutes: Math.round(seconds / 60),
    seconds,
    description,
    showId: show?.id ?? r.collectionId ?? 0,
    showName,
  };
}

/** Все серии подкаста (до 200 за запрос), новые первыми. */
export async function showEpisodes(show: Show, country: string, signal?: AbortSignal, limit = 200): Promise<Episode[]> {
  const url = `https://itunes.apple.com/lookup?id=${show.id}&entity=podcastEpisode&limit=${limit}&country=${country}`;
  const j = await itunes<{ results: ItRes[] }>(url, signal);
  return j.results
    .map((r) => map(r, show))
    .filter((e): e is Episode => !!e)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Поиск по сериям (а не по подкастам целиком). */
export async function searchEpisodes(term: string, country: string, signal?: AbortSignal): Promise<Episode[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&entity=podcastEpisode&limit=40&country=${country}`;
  const j = await itunes<{ results: ItRes[] }>(url, signal);
  return j.results.map((r) => map(r)).filter((e): e is Episode => !!e);
}

export function episodeToItem(e: Episode): PlaylistItem {
  return {
    id: e.id,
    title: e.name,
    subtitle: e.showName || undefined,
    url: e.url,
    kind: "vod",
    logo: e.logo,
    genre: "Подкасты",
    duration: e.seconds || undefined,
    note: e.description.slice(0, 300) || undefined,
    date: e.date || undefined,
    addedAt: Date.now(),
  };
}

/** Включает серию как очередь: после неё сами пойдут следующие из списка. */
export async function playEpisodes(list: Episode[], index: number): Promise<void> {
  const ep = list[index];
  if (!ep) return;
  const cur = player.getState();
  if (cur.station?.id === ep.id && cur.status !== "error" && cur.status !== "idle") {
    player.toggle();
    return;
  }
  const stations = list.map((e) => draftToStation(e));
  player.pin(stations);
  await player.play(stations[index], stations.map((s) => s.id));
}
