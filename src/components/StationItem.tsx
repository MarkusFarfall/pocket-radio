import type { ReactNode } from "react";
import { Check, CircleCheck, CircleX, Loader2, Pause, Play, Plus, X } from "lucide-react";
import type { Station } from "../lib/types";
import { usePlayer } from "../lib/player";
import { removeFromLibrary } from "../lib/library";
import { cn } from "../utils/cn";
import { Cover, Equalizer } from "./ui";

export type ProbeState = "ok" | "bad" | "busy";

/** Строка станции для списков «Обзора»: послушать без добавления, затем добавить или убрать из каталога. */
export function StationItem({
  st,
  sub,
  inLib,
  onPlay,
  onAdd,
  extra,
  status,
}: {
  st: Station;
  sub: string;
  inLib: boolean;
  onPlay: () => void;
  onAdd: () => void;
  extra?: ReactNode;
  status?: ProbeState;
}) {
  const p = usePlayer();
  const cur = p.station?.id === st.id;
  const active = cur && (p.status === "playing" || p.status === "buffering" || p.status === "loading");
  return (
    <div className={cn("flex items-center gap-3 rounded-xl p-2 pr-3 transition hover:bg-surface-2", cur && "bg-accent/10")}>
      <button onClick={onPlay} className="relative shrink-0" aria-label={`Послушать ${st.name}`}>
        <Cover s={st} size={46} className="rounded-lg" />
        <span className={cn("absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-white transition", active ? "opacity-100" : "opacity-0 hover:opacity-100")}>
          {p.status === "loading" && cur ? <Loader2 size={18} className="animate-spin" /> : active ? <Pause size={18} className="fill-current" /> : <Play size={18} className="ml-0.5 fill-current" />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{st.name}</span>
          {active && p.status === "playing" && <Equalizer active className="h-3 shrink-0 text-accent" />}
        </div>
        <div className="truncate text-xs text-muted">{sub}</div>
      </div>
      {status === "busy" && <Loader2 size={16} className="shrink-0 animate-spin text-muted" />}
      {status === "ok" && <CircleCheck size={17} className="shrink-0 text-ok" aria-label="Отвечает" />}
      {status === "bad" && <CircleX size={17} className="shrink-0 text-bad" aria-label="Не отвечает" />}
      {extra}
      {inLib ? (
        <button
          onClick={() => void removeFromLibrary({ url: st.url })}
          title="Убрать из каталога"
          aria-label={`Убрать «${st.name}» из каталога`}
          className="group/rm inline-flex shrink-0 items-center gap-1 rounded-lg bg-ok/12 px-2.5 py-1.5 text-xs font-semibold text-ok transition hover:bg-bad/12 hover:text-bad"
        >
          <Check size={14} className="group-hover/rm:hidden" />
          <X size={14} className="hidden group-hover/rm:block" />
          <span className="group-hover/rm:hidden">в каталоге</span>
          <span className="hidden group-hover/rm:inline">убрать</span>
        </button>
      ) : (
        <button onClick={onAdd} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90 active:scale-95">
          <Plus size={14} /> <span className="hidden sm:inline">Добавить</span>
        </button>
      )}
    </div>
  );
}
