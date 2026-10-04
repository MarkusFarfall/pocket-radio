import type { Station } from "./types";

/** Отличает подкаст от музыкального файла: оба технически являются VOD, но интерфейс у них разный. */
export function isPodcastMedia(s: Pick<Station, "kind" | "genre" | "tags" | "note" | "city">): boolean {
  if (s.kind !== "vod") return false;
  const text = `${s.genre} ${s.city} ${s.tags.join(" ")} ${s.note}`.toLowerCase();
  return /подкаст|podcast|episode|эпизод|аудиокниг|audiobook/.test(text);
}

export function mediaLabel(s: Station, live: boolean): "Прямой эфир" | "Подкаст" | "Музыка" {
  if (live) return "Прямой эфир";
  return isPodcastMedia(s) ? "Подкаст" : "Музыка";
}