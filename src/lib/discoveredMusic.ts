import type { PlaylistItem } from "./types";
import type { AlbumSearchScope, ArchiveGenre } from "./archive";

export type DiscoveredMusicProvider = "openverse" | "commons";

/** A direct-play audio result with its original source and license kept for attribution. */
export interface DiscoveredMusicTrack extends PlaylistItem {
  provider: DiscoveredMusicProvider;
  providerName: string;
  creator: string;
  licenseName: string;
  licenseUrl: string;
  landingUrl: string;
  attribution: string;
  filetype: string;
}

export interface DiscoveredMusicPage {
  tracks: DiscoveredMusicTrack[];
  hasMore: boolean;
}

export interface DiscoveredMusicSearch {
  text: string;
  scope: AlbumSearchScope;
  genre?: ArchiveGenre;
  page: number;
  signal?: AbortSignal;
}

const LATIN_ALIAS = /^[\x00-\x7F]+$/;

export function genreSearchTerm(genre: ArchiveGenre): string {
  return genre.aliases.find((alias) => LATIN_ALIAS.test(alias) && /[a-z]/i.test(alias)) ?? genre.label;
}

export function transliterateForOpenCatalog(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return value.replace(/[А-ЯЁа-яё]/g, (letter) => {
    const latin = map[letter.toLowerCase()];
    if (latin === undefined) return letter;
    return letter === letter.toLowerCase() || !latin ? latin : `${latin[0].toUpperCase()}${latin.slice(1)}`;
  });
}

export function normalizeCatalogText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[ё]/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function licenseLabel(code: string, version?: string): string {
  const labels: Record<string, string> = {
    by: "CC BY",
    "by-sa": "CC BY-SA",
    "by-nd": "CC BY-ND",
    "cc0": "CC0",
    pdm: "Public Domain",
    "sampling+": "Sampling+",
    "nc-sampling+": "NonCommercial Sampling+",
  };
  const label = labels[code.toLowerCase()] ?? (code ? `CC ${code.toUpperCase()}` : "Лицензия на странице источника");
  return version && !["cc0", "pdm"].includes(code.toLowerCase()) ? `${label} ${version}` : label;
}

export function licenseNote(fields: {
  providerName: string;
  creator: string;
  title: string;
  licenseName: string;
  licenseUrl?: string;
  landingUrl: string;
  attribution?: string;
}): string {
  const lines = [
    `${fields.title}${fields.creator ? ` — ${fields.creator}` : ""}`,
    `Источник: ${fields.providerName}`,
    `Лицензия: ${fields.licenseName}${fields.licenseUrl ? ` (${fields.licenseUrl})` : ""}`,
    `Оригинал: ${fields.landingUrl}`,
    fields.attribution,
  ].filter(Boolean);
  return lines.join("\n");
}

export function safeHttpsUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
