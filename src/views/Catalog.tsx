import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckSquare,
  Compass,
  FileDown,
  Heart,
  HeartOff,
  Inbox,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  QrCode,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { ViewProps } from "./shared";
import type { Station } from "../lib/types";
import { Chip, btnGhost, btnPrimary, inputCls } from "../components/ui";
import { StationCard, StationLine } from "../components/StationCard";
import { KIND_LABEL } from "../lib/templates";
import { db, deleteStations } from "../lib/db";
import { download, exportM3U } from "../lib/m3u";
import { checkStations } from "../lib/health";
import { installStarter } from "../lib/starter";
import { player, usePlayer } from "../lib/player";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";

type Dim = "genre" | "mood" | "kind" | "city" | "tag";
const DIMS: { id: Dim; label: string }[] = [
  { id: "genre", label: "Жанр" },
  { id: "mood", label: "Настроение" },
  { id: "kind", label: "Тип" },
  { id: "city", label: "Локация" },
  { id: "tag", label: "Теги" },
];

function values(s: Station, d: Dim): string[] {
  if (d === "tag") return s.tags;
  if (d === "kind") return [s.kind];
  const v = s[d];
  return v ? [v] : [];
}

type Sort = "added" | "name" | "listened" | "recent";

function plural(n: number, a: string, b: string, c: string) {
  const m = n % 100;
  if (m > 10 && m < 15) return c;
  const r = n % 10;
  return r === 1 ? a : r > 1 && r < 5 ? b : c;
}

export function Catalog({ stations, online, cachedIds, onPlay, onMore, onAdd, onScan, onDemo }: ViewProps) {
  const p = usePlayer();
  const [q, setQ] = useState("");
  const [dim, setDim] = useState<Dim>("genre");
  const [filters, setFilters] = useState<Partial<Record<Dim, string>>>({});
  const [favOnly, setFavOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<Sort>("added");
  const [view, setView] = useState<"grid" | "list">(() => (localStorage.getItem("radio.view") as "grid" | "list") || "grid");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    // выбранные станции, которых больше нет, из выбора убираем
    setSelected((prev) => {
      const ids = new Set(stations.map((s) => s.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [stations]);

  const options = useMemo(() => {
    const m = new Map<string, number>();
    stations.forEach((s) => values(s, dim).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  }, [stations, dim]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = stations.filter((s) => {
      if (favOnly && !s.favorite) return false;
      for (const d of DIMS) {
        const f = filters[d.id];
        if (f && !values(s, d.id).includes(f)) return false;
      }
      if (!needle) return true;
      return [s.name, s.genre, s.mood, s.city, s.note, ...s.tags].join(" ").toLowerCase().includes(needle);
    });
    r = [...r].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ru");
      if (sort === "listened") return b.totalSeconds - a.totalSeconds;
      if (sort === "recent") return (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0);
      return b.createdAt - a.createdAt;
    });
    return r;
  }, [stations, q, filters, favOnly, sort]);

  const active = DIMS.filter((d) => filters[d.id]);
  const activeCount = active.length + (favOnly ? 1 : 0);
  const queue = list.map((s) => s.id);
  const chosen = stations.filter((s) => selected.has(s.id));

  const setViewMode = (v: "grid" | "list") => {
    setView(v);
    localStorage.setItem("radio.view", v);
  };
  const toggleSel = (s: Station) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(s.id)) n.delete(s.id);
      else n.add(s.id);
      return n;
    });
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
    setConfirmDel(false);
  };
  const resetFilters = () => {
    setFilters({});
    setFavOnly(false);
  };

  const bulkFav = async (v: boolean) => {
    await db.stations.bulkUpdate(chosen.map((s) => ({ key: s.id, changes: { favorite: v } })));
    toast(v ? `В избранное: ${chosen.length}` : `Убрано из избранного: ${chosen.length}`, "ok");
  };
  const bulkDelete = async () => {
    const ids = chosen.map((s) => s.id);
    if (player.getState().station && ids.includes(player.getState().station!.id)) player.stop();
    await deleteStations(ids);
    toast(`Удалено станций: ${ids.length}`, "info");
    exitSelect();
  };
  const bulkCheck = async () => {
    stop.current = false;
    setChecking({ done: 0, total: chosen.length });
    const r = await checkStations(chosen, (pr) => setChecking({ done: pr.done, total: pr.total }), () => stop.current);
    setChecking(null);
    toast(r.bad ? `Проверено ${r.done}: не отвечают ${r.bad}` : `Проверено ${r.done}: все отвечают`, r.bad ? "error" : "ok");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Каталог</h1>
          <p className="text-sm text-muted">
            {stations.length} {plural(stations.length, "станция", "станции", "станций")}
            {list.length !== stations.length && ` · показано ${list.length}`}
          </p>
        </div>
        <div className="flex gap-2">
          {stations.length > 0 && (
            <button className={cn(btnGhost, selectMode && "!border-accent !text-accent")} onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}>
              <CheckSquare size={16} /> <span className="hidden sm:inline">{selectMode ? "Готово" : "Выбрать"}</span>
            </button>
          )}
          <button className={btnGhost} onClick={onScan} aria-label="Сканировать QR">
            <QrCode size={16} /> <span className="hidden sm:inline">QR</span>
          </button>
          <button className={btnPrimary} onClick={onAdd}>
            <Plus size={18} /> Добавить
          </button>
        </div>
      </div>

      {stations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <Inbox size={36} className="mx-auto text-muted" />
          <p className="mt-3 font-display text-lg font-semibold">Каталог пуст</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Начните с быстрого старта, выберите готовые подборки, найдите станцию в интернете или добавьте свою.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              className={btnPrimary}
              onClick={async () => {
                const n = await installStarter();
                toast(n ? `Добавлено станций: ${n}` : "Стартовый набор уже установлен", n ? "ok" : "info");
              }}
            >
              <Sparkles size={17} /> Быстрый старт
            </button>
            <button className={btnGhost} onClick={onDemo}>
              <Compass size={16} /> Обзор
            </button>
            <button className={btnGhost} onClick={onAdd}>
              <Plus size={16} /> Добавить
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-4 bg-bg/90 px-4 pb-2 pt-2 backdrop-blur-xl md:-mx-8 md:px-8">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input data-search className={cn(inputCls, "pl-10")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по каталогу" />
                {q && (
                  <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить">
                    <X size={16} />
                  </button>
                )}
              </div>
              <button onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} className={cn(btnGhost, "relative !px-3.5", filtersOpen && "!border-accent !text-accent")}>
                <SlidersHorizontal size={17} />
                <span className="hidden sm:inline">Фильтры</span>
                {activeCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-ink">{activeCount}</span>}
              </button>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={cn(inputCls, "w-auto cursor-pointer pr-8")} aria-label="Сортировка">
                <option value="added">Новые</option>
                <option value="name">А–Я</option>
                <option value="listened">По времени</option>
                <option value="recent">Недавние</option>
              </select>
              <div className="hidden shrink-0 overflow-hidden rounded-xl border border-line bg-bg sm:flex">
                {(
                  [
                    ["grid", LayoutGrid, "Плитка"],
                    ["list", List, "Список"],
                  ] as const
                ).map(([v, I, label]) => (
                  <button key={v} onClick={() => setViewMode(v)} aria-label={label} title={label} className={cn("px-3 transition", view === v ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
                    <I size={18} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filtersOpen && (
            <div className="anim-fade space-y-3 rounded-2xl border border-line bg-surface p-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip active={favOnly} onClick={() => setFavOnly(!favOnly)} className="inline-flex items-center gap-1.5">
                  <Heart size={14} className={favOnly ? "fill-current" : ""} /> Избранные
                </Chip>
                <span className="mx-1 h-5 w-px bg-line" />
                {DIMS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDim(d.id)}
                    className={cn("relative rounded-full px-3 py-1.5 text-sm font-semibold transition", dim === d.id ? "bg-accent/15 text-accent" : "text-muted hover:text-ink")}
                  >
                    {d.label}
                    {filters[d.id] && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
                  </button>
                ))}
              </div>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {options.length === 0 && <span className="py-1.5 text-sm text-muted">Пока нет значений — заполните это поле у станций</span>}
                {options.map(([v, n]) => (
                  <Chip key={v} active={filters[dim] === v} onClick={() => setFilters({ ...filters, [dim]: filters[dim] === v ? undefined : v })}>
                    {dim === "kind" ? KIND_LABEL[v as Station["kind"]] : dim === "tag" ? `#${v}` : v} <span className="ml-1 opacity-60">{n}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {activeCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {favOnly && (
                <button onClick={() => setFavOnly(false)} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 font-semibold text-accent">
                  Избранные <X size={12} />
                </button>
              )}
              {active.map((d) => (
                <button key={d.id} onClick={() => setFilters({ ...filters, [d.id]: undefined })} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 font-semibold text-accent">
                  {d.label}: {d.id === "kind" ? KIND_LABEL[filters[d.id] as Station["kind"]] : filters[d.id]} <X size={12} />
                </button>
              ))}
              <button onClick={resetFilters} className="ml-1 font-semibold text-muted underline underline-offset-2">
                сбросить всё
              </button>
            </div>
          )}

          {selectMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-sm">
              <span className="font-semibold">Выбрано: {selected.size}</span>
              <button className="font-semibold text-accent underline underline-offset-2" onClick={() => setSelected(new Set(list.map((s) => s.id)))}>
                все ({list.length})
              </button>
              {selected.size > 0 && (
                <button className="font-semibold text-muted underline underline-offset-2" onClick={() => setSelected(new Set())}>
                  снять
                </button>
              )}
            </div>
          )}

          {list.length ? (
            view === "grid" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-4 2xl:grid-cols-6">
                {list.map((s) => (
                  <StationCard key={s.id} station={s} queue={queue} online={online} cached={cachedIds.has(s.id)} onPlay={onPlay} onMore={onMore} selectMode={selectMode} selected={selected.has(s.id)} onToggleSelect={toggleSel} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {list.map((s) => (
                  <StationLine key={s.id} station={s} queue={queue} online={online} cached={cachedIds.has(s.id)} onPlay={onPlay} onMore={onMore} selectMode={selectMode} selected={selected.has(s.id)} onToggleSelect={toggleSel} />
                ))}
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
              Ничего не найдено.{" "}
              {activeCount > 0 && (
                <button onClick={resetFilters} className="font-semibold text-accent underline underline-offset-2">
                  Сбросить фильтры
                </button>
              )}
            </div>
          )}
        </>
      )}

      {selectMode && (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-3 z-40 lg:left-[17rem] lg:right-6",
            p.station ? "bottom-[calc(9rem+env(safe-area-inset-bottom))] lg:bottom-[5.75rem]" : "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-5"
          )}
        >
          <div className="anim-sheet pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2.5 shadow-2xl">
            <span className="px-2 text-sm font-bold">{selected.size}</span>
            {checking ? (
              <>
                <span className="flex flex-1 items-center gap-2 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Проверяем {checking.done}/{checking.total}
                </span>
                <button className={btnGhost + " !py-2"} onClick={() => (stop.current = true)}>
                  Стоп
                </button>
              </>
            ) : confirmDel ? (
              <>
                <span className="flex-1 text-sm font-semibold text-bad">Удалить {selected.size} станций?</span>
                <button className={btnGhost + " !py-2"} onClick={() => setConfirmDel(false)}>
                  Нет
                </button>
                <button className="rounded-xl bg-bad px-4 py-2 text-sm font-semibold text-white" onClick={bulkDelete}>
                  Удалить
                </button>
              </>
            ) : (
              <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
                <button className={btnGhost + " !px-3 !py-2"} disabled={!selected.size} onClick={() => bulkFav(true)} title="В избранное">
                  <Heart size={16} /> <span className="hidden sm:inline">В избранное</span>
                </button>
                <button className={btnGhost + " !px-3 !py-2"} disabled={!selected.size} onClick={() => bulkFav(false)} title="Убрать из избранного" aria-label="Убрать из избранного">
                  <HeartOff size={16} />
                </button>
                <button className={btnGhost + " !px-3 !py-2"} disabled={!selected.size || !online} onClick={bulkCheck} title="Проверить доступность">
                  <Activity size={16} /> <span className="hidden sm:inline">Проверить</span>
                </button>
                <button className={btnGhost + " !px-3 !py-2"} disabled={!selected.size} onClick={() => download("pocket-radio-selected.m3u", exportM3U(chosen), "audio/x-mpegurl")} title="Экспорт M3U" aria-label="Экспорт M3U">
                  <FileDown size={16} />
                </button>
                <button className={cn(btnGhost, "!px-3 !py-2 !text-bad")} disabled={!selected.size} onClick={() => setConfirmDel(true)} title="Удалить" aria-label="Удалить">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
