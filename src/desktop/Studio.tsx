import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Keyboard, PanelRight, Plus, Search, Wifi, WifiOff } from "lucide-react";
import type { Station } from "../lib/types";
import type { Tab } from "../views/shared";
import { NAV } from "../lib/nav";
import { usePlayer } from "../lib/player";
import { setDesktopPrefs, useDesktopPrefs, useMedia } from "../lib/desktop";
import { cn } from "../utils/cn";
import { Cover, Equalizer } from "../components/ui";
import { Logo } from "../components/Logo";
import { AccountCard } from "../components/AccountUI";
import { DockPlayer } from "../components/PlayerUI";
import { NowPanel } from "./NowPanel";

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  stations: Station[];
  online: boolean;
  onPlay: (s: Station, queue: string[]) => void;
  onAdd: () => void;
  openPalette: () => void;
  openHelp: () => void;
  openAccount: () => void;
  openPlayer: () => void;
  onEdit: (s: Station) => void;
  onQr: (s: Station) => void;
  style?: CSSProperties;
  children: ReactNode;
}

/** Быстрый доступ к избранному и недавним в боковой панели. */
function Library({ stations, onPlay }: { stations: Station[]; onPlay: (s: Station, queue: string[]) => void }) {
  const p = usePlayer();
  const [mode, setMode] = useState<"fav" | "recent">("fav");
  const favs = useMemo(() => stations.filter((s) => s.favorite).sort((a, b) => a.name.localeCompare(b.name, "ru")), [stations]);
  const recent = useMemo(() => stations.filter((s) => s.lastPlayedAt).sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!), [stations]);
  const list = (mode === "fav" ? favs : recent).slice(0, 60);
  const ids = list.map((s) => s.id);
  const playing = p.status === "playing" || p.status === "buffering" || p.status === "loading";

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex shrink-0 items-center gap-1 p-2">
        {(
          [
            ["fav", `Избранное · ${favs.length}`],
            ["recent", "Недавние"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", mode === id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {list.map((s) => {
          const cur = p.station?.id === s.id;
          return (
            <li key={s.id}>
              <button onClick={() => onPlay(s, ids)} className={cn("flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition hover:bg-surface-2", cur && "bg-accent/10")}>
                <Cover s={s} size={38} className="rounded-lg" spin={cur && playing} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-semibold", cur && "text-accent")}>{s.name}</span>
                  <span className="block truncate text-xs text-muted">{s.genre || s.city || "—"}</span>
                </span>
                {cur && <Equalizer active={playing} className="h-3 shrink-0 text-accent" />}
              </button>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="px-4 py-8 text-center text-xs leading-relaxed text-muted">{mode === "fav" ? "Нажмите на сердечко у станции — она появится здесь для быстрого доступа." : "Здесь появится история прослушивания."}</li>
        )}
      </ul>
    </section>
  );
}

/**
 * Компоновка «Студия» для компьютера: слева — разделы и библиотека, в центре — страница,
 * справа — «Сейчас играет», внизу — док-плеер.
 */
export function Studio({ tab, onTab, back, forward, canBack, canForward, stations, online, onPlay, onAdd, openPalette, openHelp, openAccount, openPlayer, onEdit, onQr, style, children }: Props) {
  const dp = useDesktopPrefs();
  const wide = useMedia("(min-width: 1280px)");
  const p = usePlayer();
  const scroller = useRef<HTMLElement>(null);
  const showPanel = dp.panel && wide;

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [tab]);

  const round = "h-9 w-9 rounded-full text-ink transition enabled:hover:bg-surface-2 disabled:opacity-30";

  return (
    <div id="app-shell" className="studio-shell flex h-dvh flex-col overflow-hidden text-ink" style={style}>
      <div className="flex min-h-0 flex-1 gap-3 p-3 pb-0">
        {/* Левая колонка */}
        <aside className="flex w-[17rem] shrink-0 flex-col gap-3 xl:w-72">
          <section className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center gap-2.5 px-1.5 pb-3 pt-1">
              <Logo size={34} />
              <div className="font-display text-[18px] font-bold tracking-tight">Pocket Radio</div>
            </div>
            <nav className="space-y-0.5" aria-label="Разделы">
              {NAV.map((n, i) => {
                const on = tab === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => onTab(n.id)}
                    aria-current={on ? "page" : undefined}
                    className={cn("relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition", on ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2/70 hover:text-ink")}
                  >
                    {on && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-accent" />}
                    <n.icon size={19} className={on ? "text-accent" : ""} />
                    {n.label}
                    <kbd className="ml-auto font-mono text-[10px] opacity-40">{i + 1}</kbd>
                  </button>
                );
              })}
            </nav>
            <button onClick={onAdd} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink shadow-lg shadow-accent/20 transition hover:brightness-110 active:scale-[0.98]">
              <Plus size={18} /> Добавить станцию
            </button>
          </section>

          <Library stations={stations} onPlay={onPlay} />
          <AccountCard onOpenAccount={openAccount} onSettings={() => onTab("settings")} />
        </aside>

        {/* Центр */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-bg">
          <header className="flex h-16 shrink-0 items-center gap-3 px-6">
            <div className="flex items-center gap-1">
              <button onClick={back} disabled={!canBack} className={round} aria-label="Назад" title="Назад (Alt + ←)">
                <ChevronLeft size={21} className="mx-auto" />
              </button>
              <button onClick={forward} disabled={!canForward} className={round} aria-label="Вперёд" title="Вперёд (Alt + →)">
                <ChevronRight size={21} className="mx-auto" />
              </button>
            </div>
            <button onClick={openPalette} className="flex w-full max-w-md items-center gap-3 rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-muted transition hover:border-ink/30 hover:text-ink">
              <Search size={17} />
              <span className="truncate">Поиск станций, жанров, команд…</span>
              <kbd className="ml-auto rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", online ? "bg-ok/15 text-ok" : "bg-amber-500/15 text-amber-600 dark:text-amber-400")}>
                {online ? <Wifi size={13} /> : <WifiOff size={13} />}
                {online ? "Онлайн" : "Офлайн"}
              </span>
              <button onClick={openHelp} className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Горячие клавиши" title="Горячие клавиши (?)">
                <Keyboard size={19} />
              </button>
              {wide && (
                <button
                  onClick={() => setDesktopPrefs({ panel: !dp.panel })}
                  aria-pressed={dp.panel}
                  className={cn("rounded-full p-2 transition hover:bg-surface-2", dp.panel ? "text-accent" : "text-muted hover:text-ink")}
                  aria-label="Панель «Сейчас играет»"
                  title="Панель «Сейчас играет» (P)"
                >
                  <PanelRight size={19} />
                </button>
              )}
            </div>
          </header>
          <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
            <div className="mx-auto max-w-[1360px] pt-1">{children}</div>
          </main>
        </div>

        {/* Правая панель */}
        {showPanel && <NowPanel stations={stations} onEdit={onEdit} onQr={onQr} />}
      </div>

      {/* Док-плеер */}
      <div className="p-3">
        {p.station ? (
          <div className="overflow-hidden rounded-2xl border border-line [&>div]:border-t-0">
            <DockPlayer onOpen={openPlayer} />
          </div>
        ) : (
          <div className="flex h-12 items-center justify-center rounded-2xl border border-dashed border-line text-xs text-muted">Выберите станцию — управление появится здесь</div>
        )}
      </div>
    </div>
  );
}
