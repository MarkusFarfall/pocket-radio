import { Check, Moon, Sun } from "lucide-react";
import { ACCENTS, PALETTES, choosePalette, effective, setThemePrefs, useThemePrefs, type Palette } from "../lib/themes";
import { cn } from "../utils/cn";

function Preview({ p, accent }: { p: Palette; accent: string | null }) {
  const v = p.vars;
  return (
    <div className="relative h-[88px] overflow-hidden rounded-lg" style={{ background: v.bg, border: `1px solid ${v.line}` }}>
      <div className="absolute left-2.5 top-2.5 h-2.5 w-12 rounded" style={{ background: v.ink, opacity: 0.85 }} />
      <div className="absolute left-2.5 top-[26px] h-2 w-[72px] rounded" style={{ background: v.muted, opacity: 0.55 }} />
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-md p-1.5" style={{ background: v.surface, border: `1px solid ${v.line}` }}>
        <span className="h-5 w-5 shrink-0 rounded" style={{ background: accent ?? v.accent }} />
        <span className="flex-1 space-y-1">
          <span className="block h-1.5 w-3/4 rounded" style={{ background: v.ink, opacity: 0.7 }} />
          <span className="block h-1.5 w-1/2 rounded" style={{ background: v["surface-2"] }} />
        </span>
        <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: accent ?? v.accent }} />
      </div>
    </div>
  );
}

function Grid({ list, selected, current, accent }: { list: Palette[]; selected: string; current: string; accent: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-4">
      {list.map((p) => {
        const on = selected === p.id;
        return (
          <button
            key={p.id}
            onClick={() => choosePalette(p)}
            aria-pressed={on}
            className={cn("group rounded-xl border p-2 text-left transition", on ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-ink/30")}
          >
            <Preview p={p} accent={accent} />
            <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-[11px] text-muted">{current === p.id ? "сейчас включена" : p.hint}</span>
              </span>
              {on && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Палитры оформления: 8 светлых, 8 тёмных и свой акцентный цвет. Режим выбирается в блоке «Внешний вид». */
export function PaletteSection() {
  const prefs = useThemePrefs();
  const cur = effective(prefs);
  const light = PALETTES.filter((p) => !p.dark);
  const dark = PALETTES.filter((p) => p.dark);

  return (
    <section className="mb-7 lg:[column-span:all]">
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.15em] text-muted">Палитры и цвета</h2>
      <div className="space-y-6 rounded-2xl border border-line bg-surface p-4 md:p-5">
        <div>
          <div className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
            <Sun size={17} className="text-muted" /> Светлые темы
          </div>
          <Grid list={light} selected={prefs.light} current={cur.palette.id} accent={prefs.accent} />
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
            <Moon size={17} className="text-muted" /> Тёмные темы
          </div>
          <Grid list={dark} selected={prefs.dark} current={cur.palette.id} accent={prefs.accent} />
        </div>
        <div>
          <div className="mb-1 font-display text-base font-semibold">Акцентный цвет</div>
          <p className="mb-3 text-xs text-muted">Кнопки, переключатели и выделения. «Из палитры» — родной цвет выбранной темы.</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setThemePrefs({ accent: null })}
              aria-pressed={!prefs.accent}
              className={cn("flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition", !prefs.accent ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:text-ink")}
            >
              Из палитры
            </button>
            {ACCENTS.map((a) => {
              const on = prefs.accent?.toLowerCase() === a.color;
              return (
                <button
                  key={a.id}
                  onClick={() => setThemePrefs({ accent: a.color })}
                  title={a.name}
                  aria-label={a.name}
                  aria-pressed={on}
                  className={cn("flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition", on ? "ring-2 ring-ink" : "hover:scale-110")}
                  style={{ background: a.color }}
                >
                  {on && <Check size={16} strokeWidth={3} className="text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
