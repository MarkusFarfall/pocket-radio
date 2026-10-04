import { Globe, House, Layers, Podcast, RadioTower, Snowflake } from "lucide-react";
import type { StreamKind } from "../lib/types";
import { KIND_LABEL } from "../lib/templates";
import { cn } from "../utils/cn";

const map = {
  http: Globe,
  icecast: Snowflake,
  shoutcast: RadioTower,
  hls: Layers,
  lan: House,
  vod: Podcast,
};

export function KindIcon({ kind, size = 14, className }: { kind: StreamKind; size?: number; className?: string }) {
  const I = map[kind];
  return <I size={size} className={className} />;
}

export function KindBadge({ kind, className }: { kind: StreamKind; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted",
        className
      )}
    >
      <KindIcon kind={kind} size={11} />
      {KIND_LABEL[kind]}
    </span>
  );
}
