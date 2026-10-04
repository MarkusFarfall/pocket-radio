import { Check, RotateCcw } from "lucide-react";
import { DEFAULT_UI, UI_OPTIONS, UI_PRESETS, fontStack, matchPreset, radiusPx, resetUi, setUiPrefs, useUiPrefs, type UiPrefs, type UiPreset } from "../lib/uiStyle";
import { cn } from "../utils/cn";
import { Toggle, btnGhost } from "./ui";
import { Row, Seg } from "../views/settings/parts";
import { DesktopRows } from "./DesktopRows";

type Look = Omit<UiPrefs, "reduceMotion">;

/** Схематичный предпросмотр стиля: расположение меню, карточки, обложки, шрифт. */
function Mini({ look }: { look: Look }) {
  const r = radiusPx(look.radius, 10);
  const card: React.CSSProperties = { borderRadius: r };
  if (look.surface === "outline") Object.assign(card, { background: "var(--surface)", border: "1px solid var(--line)" });
  if (look.surface === "soft") Object.assign(card, { background: "var(--surface)", boxShadow: "0 6px 14px -6px rgba(0,0,0,.28)" });
  if (look.surface === "flat") Object.assign(card, { background: "var(--surface-2)" });
  if (look.surface === "glass") Object.assign(card, { background: "color-mix(in srgb, var(--surface) 55%, transparent)", border: "1px solid color-mix(in srgb, var(--ink) 14%, transparent)", backdropFilter: "blur(6px)" });
  if (look.surface === "bold") Object.assign(card, { background: "var(--surface)", border: "2px solid var(--ink)", boxShadow: "3px 3px 0 var(--ink)" });
  const cover = look.cover === "circle" ? 999 : look.cover === "square" ? 0 : Math.max(3, r * 0.6);
  const bg = look.surface === "glass" ? "linear-gradient(135deg, color-mix(in srgb, var(--accent) 35%, var(--bg)), var(--bg) 70%)" : "var(--bg)";
  return (
    <div className="relative flex h-[104px] overflow-hidden" style={{ background: bg, borderRadius: Math.min(r + 2, 16), border: "1px solid var(--line)" }}>
      {look.nav === "sidebar" && <div className="w-9 shrink-0 space-y-1.5 p-1.5" style={{ background: "var(--surface-2)" }}>{[0, 1, 2].map((i) => <div key={i} className="h-1.5 rounded-sm" style={{ background: i === 0 ? "var(--accent)" : "var(--muted)", opacity: i === 0 ? 1 : 0.5 }} />)}</div>}
      {look.nav === "rail" && <div className="flex w-4 shrink-0 flex-col items-center gap-1.5 py-2" style={{ background: "var(--surface-2)" }}>{[0, 1, 2].map((i) => <div key={i} className="h-2 w-2 rounded-sm" style={{ background: i === 0 ? "var(--accent)" : "var(--muted)", opacity: i === 0 ? 1 : 0.5 }} />)}</div>}
      <div className="flex min-w-0 flex-1 flex-col">
        {look.nav === "top" && <div className="flex h-4 shrink-0 items-center gap-1.5 px-2" style={{ background: "var(--surface-2)" }}>{[0, 1, 2].map((i) => <div key={i} className="h-1.5 w-5 rounded-sm" style={{ background: i === 0 ? "var(--accent)" : "var(--muted)", opacity: i === 0 ? 1 : 0.5 }} />)}</div>}
        <div className="flex flex-1 flex-col justify-center gap-1.5 p-2">
          <div className="text-[13px] font-bold leading-none" style={{ fontFamily: fontStack(look.font).display, color: "var(--ink)" }}>
            Pocket Radio
          </div>
          <div className="flex gap-1.5">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-1 items-center gap-1.5 p-1.5" style={card}>
                <span className="block h-5 w-5 shrink-0" style={{ background: "var(--accent)", borderRadius: cover }} />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block h-1.5 w-full rounded-sm" style={{ background: "var(--ink)", opacity: 0.75 }} />
                  <span className="block h-1 w-2/3 rounded-sm" style={{ background: "var(--muted)", opacity: 0.6 }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PresetCard({ p, on }: { p: UiPreset; on: boolean }) {
  return (
    <button onClick={() => setUiPrefs({ ...p.prefs })} aria-pressed={on} className={cn("rounded-xl border p-2 text-left transition", on ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-ink/30")}>
      <Mini look={p.prefs} />
      <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{p.name}</span>
          <span className="line-clamp-2 text-[11px] leading-snug text-muted">{p.desc}</span>
        </span>
        {on && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Check size={13} strokeWidth={3} />
          </span>
        )}
      </div>
    </button>
  );
}

/** Стили интерфейса: готовые образы и тонкая настройка формы, плотности, шрифта, карточек и расположения меню. */
export function StyleSection() {
  const ui = useUiPrefs();
  const cur = matchPreset(ui);
  const changed = JSON.stringify(ui) !== JSON.stringify(DEFAULT_UI);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Стиль меняет форму интерфейса: скругления, плотность, шрифт, вид карточек, обложек и меню.{!cur && " Сейчас — ваши собственные настройки."}</p>
        {changed && (
          <button className={btnGhost + " !py-1.5 text-sm"} onClick={resetUi}>
            <RotateCcw size={14} /> Сбросить
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {UI_PRESETS.map((p) => (
          <PresetCard key={p.id} p={p} on={cur?.id === p.id} />
        ))}
      </div>

      <h3 className="mb-2 mt-8 px-1 text-xs font-bold uppercase tracking-[0.15em] text-muted">Тонкая настройка</h3>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        <Row title="Скругления" stack>
          <Seg label="Скругления" value={ui.radius} options={UI_OPTIONS.radius} onChange={(v) => setUiPrefs({ radius: v })} />
        </Row>
        <Row title="Плотность" desc="Расстояния между элементами." stack>
          <Seg label="Плотность" value={ui.density} options={UI_OPTIONS.density} onChange={(v) => setUiPrefs({ density: v })} />
        </Row>
        <Row title="Размер интерфейса" desc="Масштабирует весь текст и элементы." stack>
          <Seg label="Размер интерфейса" value={ui.scale} options={UI_OPTIONS.scale} onChange={(v) => setUiPrefs({ scale: v })} />
        </Row>
        <Row title="Шрифт" desc="Используются шрифты вашей системы: вид может отличаться на разных устройствах." stack>
          <Seg label="Шрифт" value={ui.font} options={UI_OPTIONS.font} onChange={(v) => setUiPrefs({ font: v })} />
        </Row>
        <Row title="Карточки и панели" stack>
          <Seg label="Карточки и панели" value={ui.surface} options={UI_OPTIONS.surface} onChange={(v) => setUiPrefs({ surface: v })} />
        </Row>
        <Row title="Форма обложек" stack>
          <Seg label="Форма обложек" value={ui.cover} options={UI_OPTIONS.cover} onChange={(v) => setUiPrefs({ cover: v })} />
        </Row>
        <DesktopRows />
        <Row title="Меню на компьютере" desc="Только в компоновке «Классика». На телефоне всегда нижняя панель." stack>
          <Seg label="Меню на компьютере" value={ui.nav} options={UI_OPTIONS.nav} onChange={(v) => setUiPrefs({ nav: v })} />
        </Row>
        <Row title="Свечение под станцию" desc="Фон слегка окрашивается в цвет играющей станции.">
          <Toggle checked={ui.glow} onChange={(v) => setUiPrefs({ glow: v })} label="Свечение под станцию" />
        </Row>
        <Row title="Меньше анимаций" desc="Отключает движение: эквалайзер, переходы, вращение обложек. Экономит батарею.">
          <Toggle checked={ui.reduceMotion} onChange={(v) => setUiPrefs({ reduceMotion: v })} label="Меньше анимаций" />
        </Row>
      </div>
    </div>
  );
}
