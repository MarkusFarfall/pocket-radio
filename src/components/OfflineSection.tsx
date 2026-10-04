import type { ReactNode } from "react";
import { Check, CloudOff, Play, Square, Wifi } from "lucide-react";
import { GLYPHS } from "../lib/glyphs";
import { SCENES } from "../lib/ambient";
import { usePlayer } from "../lib/player";
import { resilience, setResilience, useResilience } from "../lib/resilience";
import { useOnline } from "../lib/hooks";
import { cn } from "../utils/cn";

function Line({ title, desc, children, last }: { title: string; desc?: ReactNode; children?: ReactNode; last?: boolean }) {
  return (
    <div data-row={title} className={cn("flex items-center justify-between gap-4 p-4", !last && "border-b border-line")}>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{title}</div>
        {desc && <div className="mt-0.5 text-xs leading-relaxed text-muted">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/** Поведение без интернета: эмбиент по жанру, офлайн-станции, возврат к эфиру. */
export function OfflineSection() {
  const r = useResilience();
  const online = useOnline();
  const p = usePlayer();
  const playingManual = p.fallback?.manual ? p.fallback.scene : null;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <Line title="Связь сейчас" desc={online ? "Интернет доступен." : "Интернета нет — работают каталог, избранное и скачанные плейлисты."}>
          <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", online ? "bg-ok/15 text-ok" : "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>
            {online ? <Wifi size={14} /> : <CloudOff size={14} />}
            {online ? "Онлайн" : "Офлайн"}
          </span>
        </Line>

        <Line
          title="Что произойдёт при обрыве"
          desc="Если играла трансляция, сначала покажем плейлисты со скачанными треками — вы сами выберете музыку. Если ничего не скачано, включится эмбиент. Когда связь вернётся, предложим вернуться в эфир."
        />

        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[15px] font-semibold">Сцены эмбиента</div>
            <div className="text-xs text-muted">Карточка — основная сцена; ▶ — послушать сейчас</div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              onClick={() => setResilience({ scene: "auto" })}
              aria-pressed={r.scene === "auto"}
              className={cn("rounded-xl border p-3 text-left transition", r.scene === "auto" ? "border-accent bg-accent/10" : "border-line hover:border-ink/30")}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">Авто {r.scene === "auto" && <Check size={15} className="text-accent" />}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">Подбирать по жанру и настроению станции, которая играла.</span>
            </button>
            {SCENES.map((s) => {
              const G = GLYPHS[s.glyph]?.icon ?? GLYPHS.radio.icon;
              const on = r.scene === s.id;
              const playing = playingManual === s.id;
              return (
                <div key={s.id} className={cn("flex items-stretch overflow-hidden rounded-xl border transition", on ? "border-accent bg-accent/10" : "border-line hover:border-ink/30")}>
                  <button onClick={() => setResilience({ scene: s.id })} aria-pressed={on} className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink">
                      <G size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {s.title} {on && <Check size={14} className="text-accent" />}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted">{s.desc}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => (playing ? void resilience.leave(false) : void resilience.startManual(s.id))}
                    aria-label={playing ? `Остановить «${s.title}»` : `Послушать «${s.title}»`}
                    className={cn("flex w-11 shrink-0 items-center justify-center border-l transition", playing ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:bg-surface-2 hover:text-ink")}
                  >
                    {playing ? <Square size={15} className="fill-current" /> : <Play size={16} className="ml-0.5 fill-current" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <Line last title="Громкость эмбиента" desc="Отдельно от громкости эфира.">
          <input
            type="range"
            className="slider !w-40 sm:!w-56"
            min={0.1}
            max={1}
            step={0.05}
            value={r.volume}
            style={{ ["--p" as string]: `${((r.volume - 0.1) / 0.9) * 100}%` }}
            onChange={(e) => setResilience({ volume: Number(e.target.value) })}
            aria-label="Громкость эмбиента"
          />
        </Line>
      </div>
      <p className="px-1 text-xs leading-relaxed text-muted">
        Связь проверяется только когда что-то идёт не так (обрыв, зависший поток) и пока ждём её возвращения: приложение обращается к служебным адресам Google и Cloudflare (generate_204), без передачи ваших данных. На iPhone и в свёрнутой вкладке браузер может приостановить эмбиент.
      </p>
    </div>
  );
}
