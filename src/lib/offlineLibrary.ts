import type { OfflineItem, Playlist, Station } from "./types";
import { itemStationId, itemToStation } from "./playlistModel";
import { fixText } from "./text";

export interface OfflineTrack {
  station: Station;
  local: boolean;
  album: string;
  playlists: { id: string; name: string }[];
  size: number;
  downloadedAt: number;
  duration?: number;
}

export function normalizeMusicSearch(value: string): string {
  return fixText(value).normalize("NFKD").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The offline index, not `local: true`, is the authority on availability. No network search. */
export function offlineLibrary(stations: Station[], playlists: Playlist[], downloads: OfflineItem[]): OfflineTrack[] {
  const cached = new Map(downloads.map(d => [d.stationId, d]));
  const rows = new Map<string, OfflineTrack>();
  for (const pl of playlists) for (const item of pl.items) {
    const saved = cached.get(itemStationId(item.id));
    if (!saved || item.kind !== "vod") continue;
    const existing = rows.get(item.url);
    if (existing) {
      if (!existing.playlists.some(p => p.id === pl.id)) existing.playlists.push({ id: pl.id, name: pl.name });
      continue;
    }
    rows.set(item.url, {
      station: itemToStation({ ...item, logo: item.logo || pl.cover || pl.follow?.art }),
      local: !!item.local, album: item.album || pl.name, playlists: [{ id: pl.id, name: pl.name }],
      size: saved.size, downloadedAt: saved.ts, duration: item.duration,
    });
  }
  for (const station of stations) {
    const saved = cached.get(station.id);
    if (!saved || station.kind !== "vod" || rows.has(station.url)) continue;
    rows.set(station.url, { station, local: false, album: "", playlists: [], size: saved.size, downloadedAt: saved.ts });
  }
  return [...rows.values()];
}

export type OfflineFilter = "all" | "downloaded" | "local";
export type OfflineSort = "recent" | "title" | "artist";
export function findOfflineTracks(rows: OfflineTrack[], query: string, filter: OfflineFilter = "all", sort: OfflineSort = "recent"): OfflineTrack[] {
  const q = normalizeMusicSearch(query), words = q.split(" ").filter(Boolean);
  return rows.filter(row => {
    if (filter === "local" && !row.local || filter === "downloaded" && row.local) return false;
    const text = normalizeMusicSearch([row.station.name, row.station.city, row.station.genre, row.album, ...row.playlists.map(p => p.name)].join(" "));
    return words.every(word => text.includes(word));
  }).sort((a, b) => {
    if (q) {
      const score = (row: OfflineTrack) => { const title = normalizeMusicSearch(row.station.name); return title === q ? 3 : title.startsWith(q) ? 2 : title.includes(q) ? 1 : 0; };
      const relevance = score(b) - score(a);
      if (relevance) return relevance;
    }
    if (sort === "recent") return b.downloadedAt - a.downloadedAt || a.station.name.localeCompare(b.station.name, "ru");
    if (sort === "artist") return a.station.city.localeCompare(b.station.city, "ru") || a.station.name.localeCompare(b.station.name, "ru");
    return a.station.name.localeCompare(b.station.name, "ru");
  });
}
