import { useEffect, useMemo, useRef, useState } from "react";
import { ChartColumn, Compass, CornerDownLeft, Globe2, House, LayoutGrid, ListMusic, Plus, Search, Settings as SettingsIcon, type LucideIcon } from "lucide-react";
import type { Station } from "../lib/types";
import type { Tab } from "../views/shared";
import { cn } from "../utils/cn";
import { Cover } from "./ui";
import { usePlaylists } from "../lib/playlists";
import { gotoPlaylist } from "../lib/picker";

interface Row {
  key: string;
  label: string;
  sub?: string;
  icon?: LucideIcon;
  station?: Station;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  stations: Station[];
  onPlay: (s: Station, queue: string[]) => void;
  go: (t: Tab) => void;
  onAdd: () => void;
  onSearchOnline: (q: string) => void;
}

/** Быстрый поиск по каталогу и командам (Ctrl/⌘ + K или «/»). */
export function SearchPalette({ open, onClose, stations, onPlay, go, onAdd, onSearchOnline }: Props) {
  const playlists = usePlaylists() ?? [];
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const n = q.trim().toLowerCase();
    const done = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const found = (n
      ? stations.filter((s) => [s.name, s.genre, s.mood, s.city, ...s.tags].join(" ").toLowerCase().includes(n))
      : [...stations].filter((s) => s.lastPlayedAt).sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!)
    ).slice(0, 7);
    const ids = found.map((s) => s.id);
    const out: Row[] = found.map((s) => ({
      key: s.id,
      label: s.name,
      sub: [s.genre, s.city].filter(Boolean).join(" · "),
      station: s,
      run: done(() => onPlay(s, ids)),
    }));
    const foundLists = (n ? playlists.filter((p) => `${p.name} ${p.desc} ${p.items.map((i) => i.title).join(" ")}`.toLowerCase().includes(n)) : []).slice(0, 4);
    for (const p of foundLists) {
      out.push({ key: `playlist-${p.id}`, label: p.name, sub: `Плейлист · ${p.items.length} треков`, icon: ListMusic, run: done(() => gotoPlaylist(p.id)) });
    }
    if (n) out.push({ key: "online", label: `Искать «${q.trim()}» в интернете`, sub: "Radio Browser, SomaFM, Radio Garden", icon: Globe2, run: done(() => onSearchOnline(q.trim())) });
    const cmds: [string, string, LucideIcon, () => void][] = [
      ["Добавить станцию", "add", Plus, onAdd],
      ["Главная", "home", House, () => go("home")],
      ["Каталог", "catalog", LayoutGrid, () => go("catalog")],
      ["Плейлисты и офлайн-музыка", "playlists", ListMusic, () => go("playlists")],
      ["Обзор: паки, поиск, подкасты", "discover", Compass, () => go("discover")],
      ["Статистика", "stats", ChartColumn, () => go("stats")],
      ["Настройки", "settings", SettingsIcon, () => go("settings")],
    ];
    for (const [label, key, icon, fn] of cmds) {
      if (!n || label.toLowerCase().includes(n)) out.push({ key: "cmd-" + key, label, icon, run: done(fn) });
    }
    return out;
  }, [q, stations, playlists, onClose, onPlay, onSearchOnline, onAdd, go]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      rows[idx]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[8vh] md:pt-[14vh]" role="dialog" aria-modal="true" aria-label="Быстрый поиск">
      <div className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="anim-pop relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={19} className="shrink-0 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Станция, жанр, город или команда…"
            className="min-w-0 flex-1 bg-transparent py-4 text-base outline-none placeholder:text-muted/70"
            aria-label="Поиск"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">Esc</kbd>
        </div>
        <div ref={list} className="max-h-[56vh] overflow-y-auto p-1.5">
          {!q && rows.some((r) => r.station) && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Недавние</div>}
          {rows.map((r, i) => {
            const I = r.icon;
            const first = r.key.startsWith("cmd-") && !rows[i - 1]?.key.startsWith("cmd-") && i > 0;
            return (
              <div key={r.key}>
                {first && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Разделы и действия</div>}
                <button
                  data-i={i}
                  onClick={r.run}
                  onMouseMove={() => setIdx(i)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition", i === idx ? "bg-surface-2" : "")}
                >
                  {r.station ? (
                    <Cover s={r.station} size={36} className="rounded-lg" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">{I && <I size={17} />}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.label}</span>
                    {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
                  </span>
                  {i === idx && <CornerDownLeft size={15} className="shrink-0 text-muted" />}
                </button>
              </div>
            );
          })}
          {rows.length === 0 && <div className="p-8 text-center text-sm text-muted">Ничего не найдено</div>}
        </div>
      </div>
    </div>
  );
}
