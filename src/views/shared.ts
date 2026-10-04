import type { Station } from "../lib/types";

export interface ViewProps {
  stations: Station[];
  online: boolean;
  cachedIds: Set<string>;
  onPlay: (s: Station, queue: string[]) => void;
  onMore: (s: Station) => void;
  onAdd: () => void;
  onScan: () => void;
  onDemo: () => void;
  go: (tab: Tab) => void;
}

export type Tab = "home" | "catalog" | "playlists" | "discover" | "stats" | "settings";
