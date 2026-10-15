import { useAppDesign } from "../lib/appDesign";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const design = useAppDesign();
  const root = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<Sub>(() => {
    const saved = localStorage.getItem("radio.discoverTab");
    if (saved === "online") return "search";
    return TABS.some(([id]) => id === saved) ? (saved as Sub) : "packs";
  });
  const [visitedSubs, setVisitedSubs] = useState<Set<Sub>>(() => new Set([sub]));
  const renderedSubs = new Set(visitedSubs);
  renderedSubs.add(sub);
  const subScrollPositions = useRef(new Map<Sub, number>());
  const currentSub = useRef(sub);
  currentSub.current = sub;
  const have = useMemo(() => new Set(stations.map((s) => s.url)), [stations]);

  useEffect(() => {
    setVisitedSubs((visited) => visited.has(sub) ? visited : new Set(visited).add(sub));
  }, [sub]);

  useEffect(() => {
    const scroller = root.current?.closest("main");
    if (!scroller) return;
    const remember = () => subScrollPositions.current.set(currentSub.current, scroller.scrollTop);
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => scroller.removeEventListener("scroll", remember);
  }, [design]);

  useLayoutEffect(() => {
    const scroller = root.current?.closest("main");
    if (scroller) scroller.scrollTop = subScrollPositions.current.get(sub) ?? 0;
  }, [sub, design]);

  const pick = (s: Sub) => {
    if (s !== sub) window.dispatchEvent(new Event("pr:tabchange"));
    setSub(s);
    localStorage.setItem("radio.discoverTab", s);
  };
  return (
    <div ref={root} className="discover-page space-y-5">
      <div className="design-page-heading">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Обзор</h1>
        <p className="text-sm text-muted">Радиостанции, подкасты, готовые подборки и музыка, которую можно скачать и слушать без интернета</p>
      <label className="discover-mobile-picker relative block md:hidden">
        <span className="sr-only">Раздел обзора</span>
        <select value={sub} onChange={(e) => pick(e.target.value as Sub)} className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/20">
          {TABS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      </div>
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
      <div data-discover-panels>
        {TABS.map(([id]) => renderedSubs.has(id) ? (
          <div key={id} data-discover-panel={id} hidden={id !== sub} aria-hidden={id !== sub}>
            {id === "packs" && <Packs have={have} onPlay={onPlay} />}
            {id === "search" && <Search have={have} online={online} onPlay={onPlay} />}
            {id === "podcasts" && <Podcasts online={online} />}
            {id === "collections" && <Collections online={online} onPlay={onPlay} />}
            {id === "playlists" && <Playlists have={have} online={online} onPlay={onPlay} />}
          </div>
        ) : null)}
      </div>
    </div>
  );
}
