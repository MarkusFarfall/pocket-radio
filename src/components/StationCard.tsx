import { Check, Download, EllipsisVertical, Heart, Loader2, Pause, Play, TriangleAlert, WifiOff } from "lucide-react";
import type { Station } from "../lib/types";
import { fmtDuration, isLanUrl } from "../lib/templates";
import { cn } from "../utils/cn";
import { Cover, Equalizer } from "./ui";
import { KindBadge } from "./kind";
import { usePlayer } from "../lib/player";
import { toggleFavorite } from "../lib/db";

interface Props {
  station: Station;
  queue: string[];
  online: boolean;
  cached: boolean;
  onPlay: (s: Station, queue: string[]) => void;
  onMore: (s: Station) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (s: Station) => void;
}

function usePlaying(station: Station) {
  const p = usePlayer();
  const current = p.station?.id === station.id;
  return {
    current,
    active: current && (p.status === "playing" || p.status === "buffering" || p.status === "loading"),
    loading: current && (p.status === "loading" || p.status === "buffering"),
    error: current && p.status === "error",
  };
}

function unreachable(station: Station, online: boolean, cached: boolean) {
  return !online && !(station.kind === "lan" || isLanUrl(station.url) || cached);
}

function HealthBadge({ s }: { s: Station }) {
  if (!s.health || s.health.ok) return null;
  return (
    <span title={s.health.msg} className="inline-flex items-center gap-1 rounded-md bg-bad/12 px-1.5 py-0.5 text-[11px] font-semibold text-bad">
      <TriangleAlert size={11} /> не отвечает
    </span>
  );
}

export function StationCard({ station, queue, online, cached, onPlay, onMore, selectMode, selected, onToggleSelect }: Props) {
  const st = usePlaying(station);
  const off = unreachable(station, online, cached);
  const click = () => (selectMode ? onToggleSelect?.(station) : onPlay(station, queue));
  return (
    <div
      className={cn(
        "motion-card group relative flex flex-col gap-3 rounded-2xl border bg-surface p-2.5 pb-3 transition",
        selected ? "border-accent ring-2 ring-accent/30" : st.current ? "border-accent/50" : "border-line hover:border-ink/25"
      )}
    >
      <div className="relative aspect-square w-full">
        <button onClick={click} className="block h-full w-full" aria-label={selectMode ? `Выбрать ${station.name}` : `Играть ${station.name}`}>
          <Cover s={station} size="fill" className={cn("rounded-xl", off && "opacity-50 grayscale")} spin={st.active} />
        </button>
        {selectMode ? (
          <span
            className={cn(
              "pointer-events-none absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow",
              selected ? "bg-accent text-accent-ink" : "bg-black/35 text-transparent"
            )}
          >
            <Check size={14} strokeWidth={3} />
          </span>
        ) : (
          <>
            <button
              onClick={() => toggleFavorite(station)}
              className={cn(
                "absolute right-2 top-2 rounded-full p-1.5 backdrop-blur transition",
                station.favorite ? "bg-white text-accent" : "bg-black/35 text-white opacity-90 hover:bg-black/55 md:opacity-0 md:group-hover:opacity-100"
              )}
              aria-label={station.favorite ? "Убрать из избранного" : "В избранное"}
            >
              <Heart size={15} className={station.favorite ? "fill-current" : ""} />
            </button>
            {st.current && (
              <span className="absolute left-2 top-2 rounded-full bg-white px-2 py-1 text-accent shadow">
                <Equalizer active={st.active} />
              </span>
            )}
            <button
              onClick={() => onPlay(station, queue)}
              className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg transition active:scale-95 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
              aria-label={st.active ? "Пауза" : "Играть"}
            >
              {st.loading ? <Loader2 size={18} className="animate-spin" /> : st.active ? <Pause size={18} className="fill-current" /> : <Play size={18} className="ml-0.5 fill-current" />}
            </button>
          </>
        )}
        {off && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-1 text-[11px] font-semibold text-white">
            <WifiOff size={11} /> нужна сеть
          </span>
        )}
      </div>
      <div className="flex items-start gap-1 px-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight">{station.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted">{[station.genre, station.city].filter(Boolean).join(" · ") || "Без категории"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <KindBadge kind={station.kind} />
            {cached && (
              <span className="inline-flex items-center gap-1 rounded-md bg-ok/15 px-1.5 py-0.5 text-[11px] font-semibold text-ok">
                <Download size={11} /> офлайн
              </span>
            )}
            <HealthBadge s={station} />
          </div>
        </div>
        {!selectMode && (
          <button onClick={() => onMore(station)} className="-mr-1 rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Действия">
            <EllipsisVertical size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Компактная строка станции для режима «список». */
export function StationLine({ station, queue, online, cached, onPlay, onMore, selectMode, selected, onToggleSelect }: Props) {
  const st = usePlaying(station);
  const off = unreachable(station, online, cached);
  const click = () => (selectMode ? onToggleSelect?.(station) : onPlay(station, queue));
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-surface p-2 pr-3 transition hover:bg-surface-2",
        selected ? "border-accent ring-2 ring-accent/25" : st.current ? "border-accent/50" : "border-line"
      )}
    >
      {selectMode && (
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-accent bg-accent text-accent-ink" : "border-line text-transparent"
          )}
        >
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      <button onClick={click} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Cover s={station} size={46} className={cn("rounded-lg", off && "opacity-50 grayscale")} spin={st.active} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{station.name}</span>
            {st.current && <Equalizer active={st.active} className="h-3 shrink-0 text-accent" />}
          </div>
          <div className="truncate text-xs text-muted">
            {[station.genre, station.mood, station.city].filter(Boolean).join(" · ") || "Без категории"}
            {station.tags.length > 0 && ` · ${station.tags.slice(0, 3).map((t) => "#" + t).join(" ")}`}
          </div>
        </div>
      </button>
      <div className="hidden w-36 shrink-0 truncate text-sm text-muted xl:block">{station.genre || "—"}</div>
      <div className="hidden w-36 shrink-0 truncate text-sm text-muted xl:block">{station.city || "—"}</div>
      <div className="hidden w-20 shrink-0 text-right font-mono text-xs text-muted xl:block">{station.totalSeconds >= 60 ? fmtDuration(station.totalSeconds, true) : "—"}</div>
      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        <KindBadge kind={station.kind} />
        {cached && <Download size={14} className="text-ok" />}
        <HealthBadge s={station} />
      </div>
      {!selectMode && (
        <>
          <button
            onClick={() => toggleFavorite(station)}
            className={cn("rounded-full p-2 transition", station.favorite ? "text-accent" : "text-muted hover:text-ink")}
            aria-label="Избранное"
          >
            <Heart size={18} className={station.favorite ? "fill-current" : ""} />
          </button>
          <button onClick={() => onMore(station)} className="rounded-full p-1.5 text-muted transition hover:bg-bg hover:text-ink" aria-label="Действия">
            <EllipsisVertical size={18} />
          </button>
        </>
      )}
    </div>
  );
}

export function StationRow({
  station,
  queue,
  online,
  cached,
  onPlay,
  right,
  rank,
}: {
  station: Station;
  queue: string[];
  online: boolean;
  cached: boolean;
  onPlay: (s: Station, queue: string[]) => void;
  right?: React.ReactNode;
  rank?: number;
}) {
  const st = usePlaying(station);
  const off = unreachable(station, online, cached);
  return (
    <button
      onClick={() => onPlay(station, queue)}
      className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2", st.current && "bg-accent/10")}
    >
      {rank !== undefined && <span className="w-5 text-center font-mono text-sm font-semibold text-muted">{rank}</span>}
      <Cover s={station} size={44} className={cn("rounded-lg", off && "opacity-50 grayscale")} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{station.name}</div>
        <div className="truncate text-xs text-muted">{[station.genre, station.city].filter(Boolean).join(" · ") || "Без категории"}</div>
      </div>
      {st.current && <Equalizer active={st.active} className="text-accent" />}
      {right}
    </button>
  );
}
