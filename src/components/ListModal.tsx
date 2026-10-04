import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, CircleCheck, CircleX, ListMusic, Loader2, Play, Plus, Search, ShieldAlert, X } from "lucide-react";
import type { Station } from "../lib/types";
import { addMany } from "../lib/db";
import { pool, probeStream } from "../lib/probe";
import { player } from "../lib/player";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";
import { Modal, Toggle, btnGhost, inputCls } from "./ui";
import { StationItem, type ProbeState } from "./StationItem";

const PAGE = 80;
const pageSecure = () => typeof location !== "undefined" && location.protocol === "https:";
const insecure = (s: Station) => pageSecure() && /^http:\/\//i.test(s.url);

interface Props {
  open: boolean;
  onClose: () => void;
  /** Заголовок; если передан header — не используется */
  title?: string;
  header?: ReactNode;
  items: Station[];
  have: Set<string>;
  onPlay: (s: Station, queue: string[]) => void;
  loading?: boolean;
  error?: string | null;
  sub?: (s: Station) => string;
  canCheck?: boolean;
  empty?: string;
}

/** Универсальное окно со списком станций: слушать, проверять, добавлять по одной или все сразу. */
export function ListModal({ open, onClose, title, header, items, have, onPlay, loading, error, sub, canCheck = true, empty }: Props) {
  const [res, setRes] = useState<Record<string, ProbeState>>({});
  const [running, setRunning] = useState(false);
  const [httpsOnly, setHttpsOnly] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [q, setQ] = useState("");
  const stop = useRef(false);

  const visible = useMemo(() => {
    const safe = httpsOnly ? items.filter((s) => !insecure(s)) : items;
    const n = q.trim().toLowerCase();
    return n ? safe.filter((s) => `${s.name} ${s.genre} ${s.city} ${s.note} ${s.tags.join(" ")}`.toLowerCase().includes(n)) : safe;
  }, [items, httpsOnly, q]);
  const hidden = items.length - visible.length;
  const shown = visible.slice(0, limit);

  useEffect(() => {
    stop.current = true;
    setRes({});
    setRunning(false);
    setLimit(PAGE);
    setQ("");
  }, [items]);
  useEffect(() => {
    if (open) player.setEphemeral(visible);
  }, [open, visible]);

  const fresh = visible.filter((s) => !have.has(s.url));
  const checked = Object.keys(res).length > 0 && !running;
  const good = fresh.filter((s) => res[s.url] === "ok");
  const bad = shown.filter((s) => res[s.url] === "bad").length;

  const runCheck = async () => {
    stop.current = false;
    setRunning(true);
    setRes(Object.fromEntries(shown.map((s) => [s.url, "busy" as ProbeState])));
    await pool(
      shown,
      4,
      async (s) => {
        const r = await probeStream(s.url, s.kind, 8000);
        setRes((prev) => ({ ...prev, [s.url]: r.ok ? "ok" : "bad" }));
      },
      () => stop.current
    );
    setRunning(false);
  };

  const add = async (list: Station[]) => {
    const n = await addMany(list.map((s) => ({ ...s })));
    toast(n ? `Добавлено станций: ${n}` : "Всё уже в каталоге", n ? "ok" : "info");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      mobile="page"
      title={undefined}
    >
      {header && (
        <div className="relative">
          {header}
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/45 p-2 text-white backdrop-blur transition hover:bg-black/65" aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
      )}
      {!header && (
        <div className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 pb-3 pt-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent"><ListMusic size={19} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-bold tracking-tight">{title ?? "Плейлист"}</h2>
              <p className="text-xs text-muted">{items.length} станций · можно слушать до добавления</p>
            </div>
            <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink" aria-label="Закрыть"><X size={18} /></button>
          </div>
          {items.length > 8 && (
            <div className="relative mt-3">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className={inputCls + " !py-2 pl-10 pr-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти станцию внутри плейлиста" />
              {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted" aria-label="Очистить"><X size={14} /></button>}
            </div>
          )}
        </div>
      )}

      <div className="sticky top-0 z-[19] border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-ink shadow-lg shadow-accent/20 disabled:opacity-40"
            disabled={!visible.length}
            onClick={() => visible[0] && onPlay(visible[0], visible.map((x) => x.id))}
          >
            <Play size={17} className="fill-current" /> Слушать
          </button>
          <button className={btnGhost + " h-11 flex-1 rounded-full !px-3"} disabled={!fresh.length} onClick={() => add(fresh)}>
            <Plus size={17} /> {fresh.length ? `Сохранить все · ${fresh.length}` : "Всё сохранено"}
          </button>
          {canCheck && (
            <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40" disabled={running || !shown.length} onClick={runCheck} aria-label="Проверить потоки" title="Проверить потоки">
              {running ? <Loader2 size={17} className="animate-spin" /> : <Activity size={17} />}
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
          <span>{visible.length} доступно{q ? ` по запросу «${q}»` : ""}</span>
          {checked && good.length > 0 && good.length < fresh.length && <button className="font-semibold text-accent" onClick={() => add(good)}>Добавить только рабочие · {good.length}</button>}
        </div>
      </div>

      {pageSecure() && (hidden > 0 || !httpsOnly) && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm">
          <ShieldAlert size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1 leading-snug">
            {httpsOnly ? `Скрыто станций с адресом http: ${hidden}. Браузер не запустит их на https-странице.` : "Показаны и http-станции: многие из них не заиграют."}
          </span>
          <Toggle checked={httpsOnly} onChange={setHttpsOnly} label="Только https" />
        </div>
      )}

      {checked && (
        <div className={cn("mx-4 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium", bad ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-ok/12 text-ok")}>
          {bad ? <CircleX size={16} /> : <CircleCheck size={16} />}
          {bad ? `Отвечают ${shown.length - bad} из ${shown.length}. Нерабочие помечены красным.` : "Все проверенные станции отвечают."}
        </div>
      )}

      <div className="p-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
            <Loader2 size={18} className="animate-spin" /> Загружаем…
          </div>
        )}
        {error && <div className="m-2 rounded-xl bg-bad/10 p-4 text-sm text-bad">{error}</div>}
        {!loading && !error && shown.length === 0 && <div className="py-12 text-center text-sm text-muted">{empty ?? "Здесь пока ничего нет."}</div>}
        {shown.map((s) => (
          <StationItem
            key={s.id}
            st={s}
            sub={sub ? sub(s) : [s.genre, s.mood, s.city].filter(Boolean).join(" · ")}
            inLib={have.has(s.url)}
            status={res[s.url]}
            onPlay={() => onPlay(s, visible.map((x) => x.id))}
            onAdd={() => add([s])}
          />
        ))}
        {visible.length > limit && (
          <div className="py-3 text-center">
            <button className={btnGhost} onClick={() => setLimit((l) => l + PAGE)}>
              Показать ещё ({visible.length - limit})
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
