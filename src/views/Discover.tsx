import { useEffect, useMemo, useRef, useState } from "react";
import { Disc3, FileText, Globe2, Mic2, Package, type LucideIcon } from "lucide-react";
import type { ViewProps } from "./shared";
import { cn } from "../utils/cn";
import { Packs } from "./discover/Packs";
import { Search } from "./discover/Search";
import { Podcasts } from "./discover/Podcasts";
import { Collections } from "./discover/Collections";
import { Playlists } from "./discover/Playlists";

type Sub = "packs" | "search" | "podcasts" | "collections" | "playlists";
const TABS: [Sub, string, LucideIcon][] = [
  ["packs", "Паки", Package],
  ["search", "Поиск станций", Globe2],
  ["podcasts", "Подкасты", Mic2],
  ["collections", "Музыка офлайн", Disc3],
  ["playlists", "Каталоги M3U", FileText],
];

export function Discover({ stations, online, onPlay }: ViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<Sub>(() => {
    const saved = localStorage.getItem("radio.discoverTab");
    if (saved === "online") return "search";
    return TABS.some(([id]) => id === saved) ? (saved as Sub) : "packs";
  });
  const have = useMemo(() => new Set(stations.map((s) => s.url)), [stations]);
  const pick = (s: Sub) => {
    setSub(s);
    localStorage.setItem("radio.discoverTab", s);
  };
  // У разделов разная высота. Не сохраняем прежнюю позицию прокрутки, иначе заголовок
  // нового раздела оказывается за верхней панелью (особенно заметно на телефоне).
  useEffect(() => {
    root.current?.closest("main")?.scrollTo({ top: 0, behavior: "auto" });
  }, [sub]);
  return (
    <div ref={root} className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Обзор</h1>
        <p className="text-sm text-muted">Радиостанции, подкасты, готовые подборки и музыка, которую можно скачать и слушать без интернета</p>
      </div>
      <label className="relative block md:hidden">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Раздел обзора</span>
        <select value={sub} onChange={(e) => pick(e.target.value as Sub)} className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/20">
          {TABS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="discover-tabs hidden w-full min-w-0 overflow-x-auto pb-1 md:block" data-discover-tabs role="region" aria-label="Разделы обзора">
        <div className="flex w-max gap-1 rounded-xl bg-surface-2 p-1">
          {TABS.map(([id, label, I]) => (
            <button
              key={id}
              onClick={() => pick(id)}
              aria-pressed={sub === id}
              className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition", sub === id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              <I size={16} /> {label}
            </button>
          ))}
        </div>
      </div>
      {sub === "packs" && <Packs have={have} onPlay={onPlay} />}
      {sub === "search" && <Search have={have} online={online} onPlay={onPlay} />}
      {sub === "podcasts" && <Podcasts online={online} />}
      {sub === "collections" && <Collections online={online} />}
      {sub === "playlists" && <Playlists have={have} online={online} onPlay={onPlay} />}
    </div>
  );
}
