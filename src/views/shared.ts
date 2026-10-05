import type { Station } from "../lib/types";
import type { PlayerSourceContext } from "../lib/player";

export interface ViewProps {
  stations: Station[];
  online: boolean;
  cachedIds: Set<string>;
  onPlay: (s: Station, queue: string[], sourceContext?: PlayerSourceContext) => void;
  onMore: (s: Station) => void;
  onAdd: () => void;
  onScan: () => void;
  onDemo: () => void;
  go: (tab: Tab) => void;
}

export type Tab = "home" | "catalog" | "playlists" | "discover" | "stats" | "settings";
