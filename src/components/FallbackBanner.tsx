import { CloudOff, RefreshCw, Waves } from "lucide-react";
import { usePlayer } from "../lib/player";
import { SCENES } from "../lib/ambient";
import { resilience } from "../lib/resilience";
import { cn } from "../utils/cn";
import { btnGhost } from "./ui";

/** Плашка в плеере: объясняет, почему играет не эфир, и даёт сменить сцену или вернуться. */
export function FallbackBanner() {
  const p = usePlayer();
  const fb = p.fallback;
  if (!fb) return null;
  const orig = fb.original;
  const ambientMode = fb.kind === "ambient";

  const title = fb.manual ? "Фоновый эмбиент" : ambientMode ? "Нет интернета — играет эмбиент" : "Нет интернета — офлайн-режим";
  const text = fb.manual
    ? "Звук генерируется прямо в приложении и работает без сети."
    : ambientMode
      ? `Сгенерирован по жанру станции «${orig?.name ?? ""}». Когда связь вернётся, предложим снова включить трансляцию.`
      : `Вместо «${orig?.name ?? ""}» играет «${fb.title}» — это доступно без интернета.`;

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-3.5" role="status">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">{fb.manual ? <Waves size={18} /> : <CloudOff size={18} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
        </div>
      </div>
      {ambientMode && (
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Сцена эмбиента">
          {SCENES.map((s) => (
            <button
              key={s.id}
              onClick={() => void resilience.switchScene(s.id)}
              aria-pressed={fb.scene === s.id}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition", fb.scene === s.id ? "bg-ink text-bg" : "bg-bg text-ink ring-1 ring-line hover:bg-surface-2")}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
      {!fb.manual && orig && (
        <button onClick={() => void resilience.retryNow()} className={cn(btnGhost, "mt-3 w-full !py-2 text-sm")}>
          <RefreshCw size={15} /> Проверить связь и вернуться к эфиру
        </button>
      )}
    </div>
  );
}
