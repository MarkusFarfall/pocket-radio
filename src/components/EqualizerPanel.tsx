import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, RotateCcw, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { Modal, Toggle, btnGhost, inputCls } from "./ui";
import { player, usePlayer } from "../lib/player";
import { EQUALIZER_BANDS, EQUALIZER_PRESETS, equalizerPresetName } from "../lib/equalizer";
import { cn } from "../utils/cn";
import { toast } from "../lib/toast";

function Curve({ gainsDb }: { gainsDb: number[] }) {
  const points = useMemo(() => gainsDb.map((gain, index) => `${12 + index * (376 / (gainsDb.length - 1))},${56 - gain * 3.15}`).join(" "), [gainsDb]);
  const area = `M 12 56 L ${points} L 388 56 Z`;
  return (
    <svg viewBox="0 0 400 112" className="h-28 w-full overflow-visible" role="img" aria-label="Кривая настроенного эквалайзера">
      {[18, 37, 56, 75, 94].map((y) => <line key={y} x1="12" x2="388" y1={y} y2={y} stroke="currentColor" strokeOpacity={y === 56 ? 0.28 : 0.1} strokeDasharray={y === 56 ? undefined : "3 5"} />)}
      <path d={area} fill="var(--accent)" fillOpacity="0.12" />
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.split(" ").map((point, index) => {
        const [cx, cy] = point.split(",");
        return <circle key={index} cx={cx} cy={cy} r="3" fill="var(--accent)" />;
      })}
      <text x="12" y="108" fill="currentColor" fillOpacity="0.55" fontSize="9">31 Hz</text>
      <text x="388" y="108" fill="currentColor" fillOpacity="0.55" fontSize="9" textAnchor="end">16 kHz</text>
    </svg>
  );
}

export function EqualizerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePlayer();
  const eq = p.equalizer;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setName("");
    }
  }, [open]);

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    if (!player.saveEqualizerPreset(name)) return;
    toast(`Профиль «${name.trim()}» сохранён`, "ok");
    setName("");
    setSaving(false);
  };

  const supportMessage = p.equalizerAvailability === "unavailable"
    ? "Этот поток не разрешает обработку звука. Он продолжает играть как обычно; эквалайзер попробует включиться на следующем источнике."
    : p.equalizerAvailability === "unsupported"
      ? "В этом браузере недоступен Web Audio. Воспроизведение останется без изменений."
      : p.equalizerAvailability === "checking"
        ? "Проверяем, разрешает ли источник обработку звука…"
        : p.equalizerAvailability === "available"
          ? "Эквалайзер применяется к текущему источнику. Кривая обновляется без перезапуска трека."
          : p.equalizer.enabled && p.equalizerAvailability === "idle"
          ? "Профиль сохранён и применится к следующему совместимому источнику."
          : "Для потоков без поддержки обработки звук продолжит играть без изменений.";

  return (
    <Modal open={open} onClose={onClose} size="lg" mobile="page" title={<span className="flex items-center gap-2"><SlidersHorizontal size={19} className="text-accent" /> Эквалайзер</span>}>
      <div className="space-y-5 p-4 sm:p-6">
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-bg p-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Обработка звука</div>
            <div className="mt-0.5 text-xs text-muted">Сейчас: {equalizerPresetName(eq)}</div>
          </div>
          <Toggle checked={eq.enabled} onChange={(enabled) => player.updateEqualizer({ ...eq, enabled })} label="Включить эквалайзер" />
        </section>

        <p role="status" aria-live="polite" className={cn("rounded-xl px-3.5 py-3 text-xs leading-relaxed", p.equalizerAvailability === "unavailable" || p.equalizerAvailability === "unsupported" ? "bg-accent/10 text-ink" : "bg-surface-2 text-muted")}>
          {supportMessage}
        </p>

        <section aria-label="Готовые профили">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Готовые профили</h3>
            <button type="button" onClick={() => player.selectEqualizerPreset("flat")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Сбросить эквалайзер">
              <RotateCcw size={13} /> Ровный
            </button>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {EQUALIZER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => player.selectEqualizerPreset(preset.id)}
                aria-pressed={eq.presetId === preset.id}
                title={preset.description}
                className={cn("min-h-11 shrink-0 rounded-xl border px-3.5 text-sm font-semibold transition", eq.presetId === preset.id ? "border-accent bg-accent/10 text-ink" : "border-line bg-bg text-muted hover:text-ink")}
              >
                {preset.name}
              </button>
            ))}
            {eq.savedPresets.map((preset) => (
              <div key={preset.id} className="flex shrink-0 overflow-hidden rounded-xl border border-line bg-bg">
                <button type="button" onClick={() => player.selectEqualizerPreset(preset.id)} aria-pressed={eq.presetId === preset.id} className={cn("min-h-11 max-w-36 truncate px-3.5 text-sm font-semibold transition", eq.presetId === preset.id ? "bg-accent/10 text-ink" : "text-muted hover:text-ink")}>
                  {preset.name}
                </button>
                <button type="button" onClick={() => player.deleteEqualizerPreset(preset.id)} className="flex min-h-11 w-10 items-center justify-center border-l border-line text-muted transition hover:bg-bad/10 hover:text-bad" aria-label={`Удалить профиль ${preset.name}`} title="Удалить профиль">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{EQUALIZER_PRESETS.find((preset) => preset.id === eq.presetId)?.description ?? "Сохранённая или настроенная вручную кривая"}</p>
        </section>

        <section className="rounded-2xl border border-line bg-bg px-3 pt-2 sm:px-5">
          <Curve gainsDb={eq.gainsDb} />
          <div className="flex items-center justify-between gap-3 border-t border-line/70 py-2.5">
            <span className="text-xs text-muted">Сравните обработку с оригиналом</span>
            <button
              type="button"
              onClick={() => player.setEqualizerBypass(!p.equalizerBypass)}
              disabled={!eq.enabled || p.equalizerAvailability !== "available"}
              aria-pressed={p.equalizerBypass}
              className="min-h-10 shrink-0 rounded-xl bg-surface-2 px-3 text-xs font-semibold text-ink transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {p.equalizerBypass ? "Вернуть EQ" : "Сравнить без EQ"}
            </button>
          </div>
        </section>

        <section aria-label="Полосы эквалайзера" className="rounded-2xl border border-line bg-bg px-3 py-2 sm:px-5">
          {EQUALIZER_BANDS.map((band, index) => {
            const gain = eq.gainsDb[index] ?? 0;
            const pct = ((gain + 12) / 24) * 100;
            return (
              <label key={band.hz} className="grid min-h-11 grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 border-b border-line/70 last:border-0 sm:grid-cols-[5.5rem_minmax(0,1fr)_4rem] sm:gap-4">
                <span className="font-mono text-xs font-semibold text-muted">{band.label} <span className="font-sans font-normal">Гц</span></span>
                <input
                  className="slider"
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={gain}
                  aria-label={`Полоса ${band.hz} Гц`}
                  aria-valuetext={`${band.hz} герц, ${gain > 0 ? "плюс " : gain < 0 ? "минус " : ""}${Math.abs(gain)} децибел`}
                  style={{ ["--p" as string]: `${pct}%` }}
                  onChange={(event) => player.setEqualizerBand(index, Number(event.target.value))}
                />
                <output className="text-right font-mono text-xs tabular-nums text-ink">{gain > 0 ? "+" : ""}{gain.toFixed(gain % 1 === 0 ? 0 : 1)} дБ</output>
              </label>
            );
          })}
        </section>

        <details className="group rounded-2xl border border-line bg-bg">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:hidden">Дополнительные настройки</summary>
          <div className="space-y-3 border-t border-line px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Запас от перегруза</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">Автоматически снижает предусиление при подъёме полос, чтобы уменьшить риск клиппинга.</p>
              </div>
              <Toggle checked={eq.autoHeadroom} onChange={(autoHeadroom) => player.updateEqualizer({ ...eq, autoHeadroom, presetId: "custom" })} label="Автоматический запас от перегруза" />
            </div>
            <label className="block">
              <span className="flex items-center justify-between text-xs font-semibold text-muted"><span>Предусиление</span><output>{eq.preampDb > 0 ? "+" : ""}{eq.preampDb.toFixed(eq.preampDb % 1 === 0 ? 0 : 1)} дБ</output></span>
              <input className="slider mt-2" type="range" min={-12} max={6} step={0.5} value={eq.preampDb} aria-label="Предусиление эквалайзера" onChange={(event) => player.setEqualizerPreamp(Number(event.target.value))} />
            </label>
          </div>
        </details>

        {saving ? (
          <form onSubmit={saveProfile} className="flex flex-col gap-2 rounded-2xl border border-line bg-bg p-3 sm:flex-row">
            <input autoFocus maxLength={32} value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: мои наушники" aria-label="Название профиля эквалайзера" className={cn(inputCls, "min-w-0 flex-1")} />
            <button type="submit" disabled={!name.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"><Check size={16} /> Сохранить</button>
            <button type="button" onClick={() => { setSaving(false); setName(""); }} className={btnGhost}>Отмена</button>
          </form>
        ) : (
          <button type="button" onClick={() => setSaving(true)} className={cn(btnGhost, "min-h-11 w-full justify-center")}>
            <Save size={16} /> Сохранить как свой профиль
          </button>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-muted">Настройка хранится на этом устройстве.</p>
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink">Готово</button>
        </div>
      </div>
    </Modal>
  );
}
