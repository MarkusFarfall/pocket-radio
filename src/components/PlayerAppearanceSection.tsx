import { useState } from "react";
import { Check, Monitor, Smartphone, RotateCcw, Pause, Play } from "lucide-react";
import { PLAYER_LAYOUTS, PLAYER_MOTIONS, PLAYER_TEMPLATES, DEFAULT_PLAYER_APPEARANCE, applyPlayerTemplate, matchPlayerTemplate, setPlayerAppearance, usePlayerAppearance, type PlayerLayout, type PlayerMotion } from "../lib/playerAppearance";
import { cn } from "../utils/cn";
import { Toggle } from "./ui";
import { PlayerTemplatePreview } from "./PlayerScene";
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
  const current = matchPlayerTemplate(p);
  const skin = PLAYER_TEMPLATES.find((x) => x.id === p.skin)!;
  const [desktop, setDesktop] = useState(false);
  return (
    <div className="space-y-7 player-appearance-settings">
      <section data-row="Шаблоны плеера" aria-labelledby="player-templates-title">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[.2em] text-accent">Коллекция / 06</p>
            <h3 id="player-templates-title" className="font-display text-2xl font-bold tracking-tight">Шаблоны плеера</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">Не палитры, а разные плееры: дека, кассетник, консоль, афиша и киноэкран. Каждый со своей композицией и управлением. Звук остаётся прежним.</p>
          </div>
          <button onClick={() => setPlayerAppearance(DEFAULT_PLAYER_APPEARANCE)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold hover:bg-surface-2"><RotateCcw size={13} /> По умолчанию</button>
        </div>
        <div className="template-showcase mb-5 grid overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-[1.15fr_1fr]">
          <div className="min-w-0 p-3 sm:p-4">
            <PlayerTemplatePreview appearance={p} large desktop={desktop} />
          </div>
          <div className="flex flex-col justify-center gap-3 p-5 lg:pl-2">
            <span className="text-[10px] font-bold uppercase tracking-[.18em] text-muted">Сейчас выбран</span>
            <p className="font-display text-xl font-semibold" aria-live="polite">{skin.name}{!current && <span className="mt-1 block text-xs font-normal text-muted">С вашими настройками</span>}</p>
            <p className="text-sm leading-relaxed text-muted">{skin.desc}</p>
            <div className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full border border-line p-1" role="group" aria-label="Формат предпросмотра">
              <button onClick={() => setDesktop(false)} aria-pressed={!desktop} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold", !desktop && "bg-ink text-bg")}><Smartphone size={14} /> Телефон</button>
              <button onClick={() => setDesktop(true)} aria-pressed={desktop} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold", desktop && "bg-ink text-bg")}><Monitor size={14} /> Компьютер</button>
            </div>
            <p className="text-xs leading-relaxed text-muted">Применяется сразу и сохраняется на этом устройстве. Движение в карточках — при наведении или фокусе.</p>
          </div>
        </div>
        <div className="player-template-gallery grid gap-3">
          {PLAYER_TEMPLATES.map((template, index) => {
            const on = current?.id === template.id;
            return <button key={template.id} aria-label={`Шаблон «${template.name}»`} aria-pressed={on} onClick={() => applyPlayerTemplate(template.id)} className={cn("player-template-card min-w-0 rounded-2xl border p-2 text-left transition", on ? "border-accent ring-2 ring-accent/25" : "border-line hover:border-ink/30")}>
              <PlayerTemplatePreview appearance={template.prefs} />
              <span className="mt-3 flex items-center justify-between gap-1 px-1"><span className="text-[9px] font-bold uppercase tracking-[.12em] text-muted">0{index + 1} / {template.tag}</span>{on && <Check size={14} className="shrink-0 text-accent" />}</span>
              <span className="mt-1 block px-1 text-sm font-semibold">{template.name}</span>
              <span className="mb-1 mt-1 block px-1 text-xs leading-relaxed text-muted">{template.desc}</span>
            </button>;
          })}
        </div>
      </section>
      <div className="border-t border-line pt-6"><h3 className="text-xs font-bold uppercase tracking-[.16em] text-muted">Тонкая настройка</h3><p className="mt-1 text-xs text-muted">Измените выбранный образ под себя. Другие настройки приложения останутся прежними.</p></div>
      {p.skin === "classic" && <div data-row="Макет плеера">
        <h3 className="mb-1 font-display text-lg font-semibold">Макет плеера</h3>
        <p className="mb-3 text-sm text-muted">Выберите композицию большого плеера. Цвета шаблона также применяются к мини-плееру и компьютерному доку.</p>
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
      </div>}

      {p.skin !== "paper" ? <div data-row="Характер движения">
        <h3 className="mb-1 font-display text-lg font-semibold">Характер движения</h3>
        <p className="mb-3 text-sm text-muted">Анимации работают через transform и opacity. Системная настройка «Меньше анимаций» имеет приоритет.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(p.skin === "classic" ? PLAYER_MOTIONS : [
            { id: skin.prefs.motion === "none" ? "calm" as const : skin.prefs.motion, name: "Движение шаблона", desc: "Пластинка, катушки или свет — в характере выбранного плеера." },
            { id: "none" as const, name: "Без движения", desc: "Статичный интерфейс без декоративных анимаций." },
          ]).map((x) => {
            const on = x.id === "none" ? p.motion === "none" : p.skin === "classic" ? p.motion === x.id : p.motion !== "none";
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

      : <p className="text-sm text-muted">«Афиша» — намеренно статичный журнальный макет. Для движения выберите деку, кассетник, консоль или кинотеатр.</p>}

      {p.skin === "classic" && <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <Row title="Цветной свет от обложки" desc="Фон большого плеера получает мягкий оттенок текущей станции или песни.">
          <Toggle checked={p.colorWash} onChange={(v) => setPlayerAppearance({ colorWash: v })} label="Цветной свет от обложки" />
        </Row>
      </div>}
    </div>
  );
}