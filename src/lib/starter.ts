import type { Draft } from "./types";
import { PACKS, packId } from "./packs";
import { addMany } from "./db";

/** «Быстрый старт»: по две первых станции из основных паков. */
export function starterDrafts(): Draft[] {
  const ids = ["somafm", "chill", "jazz", "classical", "rock", "electronic", "ru", "news", "retro"];
  const seen = new Set<string>();
  const out: Draft[] = [];
  for (const id of ids) {
    const p = PACKS.find((x) => x.id === id);
    if (!p) continue;
    for (const d of p.stations.slice(0, 2)) {
      if (!d.url || seen.has(d.url)) continue;
      seen.add(d.url);
      out.push({ ...d, id: packId(d.url) });
    }
  }
  return out;
}

export function installStarter(): Promise<number> {
  return addMany(starterDrafts());
}
