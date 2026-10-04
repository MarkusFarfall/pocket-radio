import { Check } from "lucide-react";
import { setDesktopPrefs, useDesktopPrefs, type Shell } from "../lib/desktop";
import { cn } from "../utils/cn";
import { Toggle } from "./ui";
import { Row } from "../views/settings/parts";

/** Схема компоновки в миниатюре. */
function Schematic({ kind }: { kind: Shell }) {
  const panel = "rounded-[3px] border border-line bg-surface";
  return kind === "studio" ? (
    <div className="flex h-[72px] flex-col gap-1 rounded-lg bg-surface-2 p-1.5">
      <div className="flex min-h-0 flex-1 gap-1">
        <div className={cn(panel, "w-5")} />
        <div className="flex-1 rounded-[3px] border border-line bg-bg" />
        <div className={cn(panel, "w-6")} />
      </div>
      <div className={cn(panel, "h-3")} />
    </div>
  ) : (
    <div className="flex h-[72px] flex-col overflow-hidden rounded-lg border border-line bg-bg">
      <div className="flex min-h-0 flex-1">
        <div className="w-6 bg-surface-2" />
        <div className="flex-1" />
      </div>
      <div className="h-3 border-t border-line bg-surface" />
    </div>
  );
}

const OPTIONS: { id: Shell; name: string; desc: string }[] = [
  { id: "studio", name: "Студия", desc: "Три панели: разделы и библиотека, страница, «Сейчас играет». Плеер внизу." },
  { id: "classic", name: "Классика", desc: "Меню слева или сверху (см. ниже) и одна колонка с содержимым." },
];

/** Настройки компоновки для компьютера: «Студия» или «Классика» и правая панель. */
export function DesktopRows() {
  const dp = useDesktopPrefs();
  return (
    <>
      <Row title="Компоновка на компьютере" desc="Телефон всегда использует нижнюю панель, а на экране меньше 1024 пикселей — тоже." stack>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const on = dp.shell === o.id;
            return (
              <button key={o.id} onClick={() => setDesktopPrefs({ shell: o.id })} aria-pressed={on} className={cn("rounded-xl border p-2.5 text-left transition", on ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-ink/30")}>
                <Schematic kind={o.id} />
                <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
                  <span className="text-sm font-semibold">{o.name}</span>
                  {on && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink">
                      <Check size={13} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className="mt-0.5 px-0.5 text-xs leading-snug text-muted">{o.desc}</p>
              </button>
            );
          })}
        </div>
      </Row>
      <Row title="Правая панель «Сейчас играет»" desc={dp.shell === "studio" ? "Показывается на экранах шире 1280 пикселей. Быстро скрыть — клавиша P." : "Только в компоновке «Студия»."}>
        <Toggle checked={dp.panel} onChange={(v) => setDesktopPrefs({ panel: v })} label="Правая панель" />
      </Row>
    </>
  );
}
