import { db, draftToStation } from "./db";
import type { PlaylistItem, Station } from "./types";

const PP = "pp:";

/** Префикс отделяет треки плейлистов от станций каталога. */
export const itemStationId = (itemId: string) => `pli:${itemId}`;

export async function loadProgress(itemIds: string[]): Promise<Map<string, number>> {
  const rows = await db.settings.bulkGet(itemIds.map((id) => PP + itemStationId(id)));
  const progress = new Map<string, number>();
  rows.forEach((row, index) => {
    const value = row?.value;
    const position = typeof value === "number" ? value : (value as { position?: number } | null)?.position;
    if (typeof position === "number" && Number.isFinite(position) && position > 0) progress.set(itemIds[index], position);
  });
  return progress;
}

export function itemToStation(item: PlaylistItem, position?: number): Station {
  const station = draftToStation({
    id: itemStationId(item.id),
    name: item.title,
    url: item.url,
    kind: item.kind,
    genre: item.genre ?? (item.kind === "vod" ? "Музыка" : ""),
    city: item.subtitle ?? "",
    tags: [],
    icon: "",
    note: item.note ?? "",
    logo: item.logo,
  });
  if (position) station.resumePos = position;
  return station;
}
