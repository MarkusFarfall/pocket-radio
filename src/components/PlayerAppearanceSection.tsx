import { Check, Pause, Play } from "lucide-react";
import { PLAYER_LAYOUTS, PLAYER_MOTIONS, setPlayerAppearance, usePlayerAppearance, type PlayerLayout, type PlayerMotion } from "../lib/playerAppearance";
import { cn } from "../utils/cn";
import { Toggle } from "./ui";
import { Row } from "../views/settings/parts";

function LayoutPreview({ id, active }: { id: PlayerLayout; active: boolean }) {
  return (
    <div className={cn("relative h-32 overflow-hidden rounded-xl border border-line bg-bg p-2", id === "compact" && "flex items-center gap-2")}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,color-mix(in_srgb,var(--accent)_25%,transparent),transparent_60%)]" />
      <div className={cn("relative bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_35%,#17181d))]", id === "focus" && "mx-auto h-14 w-14 rounded-xl", id === "vinyl" && "mx-auto h-16 w-16 rounded-full ring-4 ring-black/20", id === "compact" && "h-16 w-16 shrink-0 rounded-lg")}>
        {id === "vinyl" && <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg" />}
      </div>
      <div className={cn("relative", id === "compact" ? "min-w-0 flex-1" : "mt-2 text-center")}>
        <span className={cn("block h-2 rounded bg-ink/80", id === "compact" ? "w-4/5" : "mx-auto w-2/3")} />
        <span className={cn("mt-1 block h-1.5 rounded bg-muted/50", id === "compact" ? "w-1/2" : "mx-auto w-1/3")} />
        <span className={cn("mt-2 flex items-center", id === "compact" ? "justify-start" : "justify-center")}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink">{active ? <Pause size={11} className="fill-current" /> : <Play size={11} className="ml-0.5 fill-current" />}</span>
        </span>
      </div>
    </div>
  );
}

function MotionPreview({ id }: { id: PlayerMotion }) {
  return (
    <span className={cn("player-motion-demo relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-surface-2", `motion-${id}`)}>
      <span className="demo-orb h-6 w-6 rounded-full bg-accent" />
      <span className="demo-ring absolute h-8 w-8 rounded-full border border-accent/50" />
    </span>
  );
}

export function PlayerAppearanceSection() {
  const p = usePlayerAppearance();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 font-display text-lg font-semibold">Макет плеера</h3>
        <p className="mb-3 text-sm text-muted">Выберите, как выглядит большой плеер на телефоне. Компьютерный док остаётся компактным.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLAYER_LAYOUTS.map((x) => {
            const on = p.layout === x.id;
            return (
              <button key={x.id} onClick={() => setPlayerAppearance({ layout: x.id })} aria-pressed={on} className={cn("rounded-2xl border p-2.5 text-left transition", on ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-ink/30")}>
                <LayoutPreview id={x.id} active={on} />
                <span className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
                  <span className="text-sm font-semibold">{x.name}</span>
                  {on && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink"><Check size={13} strokeWidth={3} /></span>}
                </span>
                <span className="mt-0.5 block px-0.5 text-xs leading-snug text-muted">{x.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-1 font-display text-lg font-semibold">Характер движения</h3>
        <p className="mb-3 text-sm text-muted">Анимации работают через transform и opacity. Системная настройка «Меньше анимаций» имеет приоритет.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PLAYER_MOTIONS.map((x) => {
            const on = p.motion === x.id;
            return (
              <button key={x.id} onClick={() => setPlayerAppearance({ motion: x.id })} aria-pressed={on} className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition", on ? "border-accent bg-accent/10" : "border-line hover:border-ink/30")}>
                <MotionPreview id={x.id} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">{x.name}{on && <Check size={14} className="text-accent" />}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{x.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <Row title="Цветной свет от обложки" desc="Фон большого плеера получает мягкий оттенок текущей станции или песни.">
          <Toggle checked={p.colorWash} onChange={(v) => setPlayerAppearance({ colorWash: v })} label="Цветной свет от обложки" />
        </Row>
      </div>
    </div>
  );
}