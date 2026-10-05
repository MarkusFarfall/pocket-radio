import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileUp, Keyboard, MoreHorizontal, Plus, Wifi, WifiOff } from "lucide-react";
import type { Draft, Station } from "./lib/types";
import { useOfflineItems, useOnline, useStations } from "./lib/hooks";
import { reconcileOfflineCache } from "./lib/offline";
import { player, usePlayer } from "./lib/player";
import { hueOf, parseShare } from "./lib/templates";
import { toast } from "./lib/toast";
import { getAppPrefs } from "./lib/appPrefs";
import { useUiPrefs } from "./lib/uiStyle";
import { getDesktopPrefs, setDesktopPrefs, useDesktopPrefs, useIsDesktop } from "./lib/desktop";
import { NAV } from "./lib/nav";
import { useTabHistory } from "./lib/useTabHistory";
import { useHotkeys } from "./lib/useHotkeys";
import { useFileDrop } from "./lib/useFileDrop";
import { useAuth } from "./lib/auth/AuthContext";
import { cn } from "./utils/cn";
import { Modal, Toasts } from "./components/ui";
import { DockPlayer, FullPlayer, MiniPlayer } from "./components/PlayerUI";
import { StationForm } from "./components/StationForm";
import { StationMenu } from "./components/StationMenu";
import { QrScanModal, QrShowModal } from "./components/Share";
import { ShortcutsModal } from "./components/Shortcuts";
import { PlaylistPicker } from "./components/PlaylistPicker";
import { OfflineOfferModal, RecoveryOfferModal } from "./components/OfflineOffer";
import { AccountCard, AccountModal, Avatar } from "./components/AccountUI";
import { AccountMenu } from "./components/AccountMenu";
import { Logo } from "./components/Logo";
import { Studio } from "./desktop/Studio";
import { HomeStudio } from "./desktop/HomeStudio";
import { Home } from "./views/Home";
import { Catalog } from "./views/Catalog";
import { Playlists } from "./views/Playlists";
import { Discover } from "./views/Discover";
import { Stats } from "./views/Stats";
import { Settings } from "./views/Settings";
import type { ViewProps } from "./views/shared";

export default function App() {
  const auth = useAuth();
  const ui = useUiPrefs();
  const dp = useDesktopPrefs();
  const isDesktop = useIsDesktop();
  const history = useTabHistory(getAppPrefs().startTab);
  const { tab, go: setTab } = history;
  const stationsRaw = useStations();
  const stations = useMemo(() => stationsRaw ?? [], [stationsRaw]);
  const loaded = stationsRaw !== undefined;
  const online = useOnline();
  const offlineItems = useOfflineItems();
  const cachedIds = useMemo(() => new Set(offlineItems.map((o) => o.stationId)), [offlineItems]);
  const p = usePlayer();
  const dragging = useFileDrop();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [menuStation, setMenuStation] = useState<Station | null>(null);
  const [qrStation, setQrStation] = useState<Station | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [plKey, setPlKey] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const restored = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  const studio = isDesktop && dp.shell === "studio";

  // каталог → движок плеера
  useEffect(() => {
    if (!loaded) return;
    player.setCatalog(stations);
    if (!restored.current) {
      restored.current = true;
      void player.restore().then(() => {
        if (getAppPrefs().autoplay && player.getState().station) void player.resume();
      });
    }
  }, [stations, loaded]);

  // Cache API и IndexedDB вытесняются/очищаются отдельно; при старте убираем ложные «офлайн» метки.
  useEffect(() => {
    if (loaded) void reconcileOfflineCache();
  }, [auth.scope, loaded]);

  const openAdd = useCallback(() => {
    setEditing(null);
    setDraft(null);
    setFormOpen(true);
  }, []);

  const openDraft = useCallback((d: Draft) => {
    setEditing(null);
    setDraft(d);
    setFormOpen(true);
  }, []);

  // ссылки-шеринг и ярлык «Добавить станцию»
  const readHash = useCallback(() => {
    const h = location.hash;
    if (h.startsWith("#add=")) {
      const d = parseShare(h);
      window.history.replaceState(null, "", location.pathname + location.search);
      if (d) {
        openDraft(d);
        toast("Станция из ссылки — проверьте данные и сохраните", "info");
      } else toast("Не удалось прочитать ссылку на станцию", "error");
    } else if (h === "#new") {
      window.history.replaceState(null, "", location.pathname + location.search);
      openAdd();
    }
  }, [openAdd, openDraft]);
  useEffect(() => {
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [readHash]);

  // переход в «Плейлисты» из уведомлений («Открыть») и других мест
  useEffect(() => {
    const onGoto = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) sessionStorage.setItem("pr.openPlaylist", id);
      setPlKey((k) => k + 1);
      setPlayerOpen(false);
      setTab("playlists");
    };
    window.addEventListener("pr:goto", onGoto);
    return () => window.removeEventListener("pr:goto", onGoto);
  }, [setTab]);

  // заголовок вкладки
  useEffect(() => {
    document.title = p.station && p.status === "playing" ? `▶ ${p.meta?.title || p.station.name} — Pocket Radio` : "Pocket Radio — интернет-радио в кармане";
  }, [p.station, p.status, p.meta]);

  useHotkeys({
    openAdd,
    openHelp: () => setHelpOpen(true),
    goTab: setTab,
    back: history.back,
    forward: history.forward,
    togglePanel: () => {
      if (player.getState().station) setDesktopPrefs({ panel: !getDesktopPrefs().panel });
    },
  });

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const openEdit = (s: Station) => {
    setEditing(s);
    setDraft(null);
    setFormOpen(true);
    setPlayerOpen(false);
  };

  const onPlay = useCallback((s: Station, queue: string[]) => {
    const cur = player.getState();
    if (cur.station?.id === s.id && cur.status !== "error" && cur.status !== "idle") player.toggle();
    else void player.play(s, queue);
  }, []);

  const onScanned = useCallback(
    (text: string) => {
      const d = parseShare(text);
      setScanOpen(false);
      if (!d) return toast("В QR-коде нет станции Pocket Radio или адреса потока", "error");
      openDraft(d);
      toast("QR прочитан — проверьте данные", "ok");
    },
    [openDraft]
  );

  const view: ViewProps = {
    stations,
    online,
    cachedIds,
    onPlay,
    onMore: setMenuStation,
    onAdd: openAdd,
    onScan: () => setScanOpen(true),
    onDemo: () => {
      localStorage.setItem("radio.discoverTab", "packs");
      setTab("discover");
    },
    go: setTab,
  };

  const hasPlayer = !!p.station;
  const currentNav = NAV.find((n) => n.id === tab) ?? NAV[0];
  const hue = p.station ? hueOf(p.station.name) : 0;
  const glow = ui.glow && p.station ? { backgroundImage: `radial-gradient(70rem 26rem at 50% -9rem, hsl(${hue} 72% 52% / 0.22), transparent 70%)` } : undefined;

  const content = !loaded ? (
    <div className="py-24 text-center text-sm text-muted">Загрузка…</div>
  ) : tab === "home" ? (
    studio ? (
      <HomeStudio {...view} />
    ) : (
      <Home {...view} />
    )
  ) : tab === "catalog" ? (
    <Catalog {...view} />
  ) : tab === "playlists" ? (
    <Playlists key={plKey} {...view} />
  ) : tab === "discover" ? (
    <Discover {...view} />
  ) : tab === "stats" ? (
    <Stats stations={stations} />
  ) : (
    <Settings stations={stations} online={online} onAccount={() => setAccountOpen(true)} />
  );
  const page = <div key={tab} className="page-motion">{content}</div>;

  const overlays = (
    <>
      <FullPlayer open={playerOpen && hasPlayer} onClose={() => setPlayerOpen(false)} onEdit={openEdit} onQr={setQrStation} />
      <StationMenu station={menuStation} onClose={() => setMenuStation(null)} onPlay={(s) => onPlay(s, stations.map((x) => x.id))} onEdit={openEdit} onQr={setQrStation} />
      <StationForm
        open={formOpen}
        editing={editing}
        draft={draft}
        stations={stations}
        onClose={() => setFormOpen(false)}
        onScan={() => setScanOpen(true)}
        onSaved={(s, play) => {
          setFormOpen(false);
          if (play) void player.play(s, stations.map((x) => x.id));
        }}
      />
      <QrShowModal station={qrStation} onClose={() => setQrStation(null)} />
      <QrScanModal open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScanned} />
      <ShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
      <PlaylistPicker />
      <OfflineOfferModal />
      <RecoveryOfferModal />
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} size="sm" title="Ещё">
        <div className="space-y-1 p-3">
          {NAV.filter((n) => n.id === "stats" || n.id === "settings").map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setMoreOpen(false);
                setTab(n.id);
              }}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition", tab === n.id ? "bg-accent/10 text-accent" : "hover:bg-surface-2")}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2">
                <n.icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{n.label}</span>
                <span className="block text-xs text-muted">{n.id === "stats" ? "Время, сессии и качество потоков" : "Аккаунт, оформление, плеер и данные"}</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </button>
          ))}
          <button
            onClick={() => {
              setMoreOpen(false);
              auth.user ? setAccountOpen(true) : auth.openAuth();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-surface-2"
          >
            <Avatar user={auth.user} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{auth.user?.displayName ?? "Войти в аккаунт"}</span>
              <span className="block truncate text-xs text-muted">{auth.user?.login ?? "Профиль и синхронизация"}</span>
            </span>
            <ChevronRight size={18} className="text-muted" />
          </button>
        </div>
      </Modal>
      <Toasts />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="anim-pop flex flex-col items-center gap-3 rounded-[2rem] border-2 border-dashed border-white/70 bg-white/10 px-10 py-12 text-center text-white">
            <FileUp size={44} />
            <div className="font-display text-2xl font-bold">Отпустите файл для импорта</div>
            <div className="text-sm text-white/75">M3U, M3U8, PLS или JSON-резервная копия</div>
          </div>
        </div>
      )}
    </>
  );

  /* ------------------------- компоновка «Студия» (компьютер) ------------------------- */
  if (studio) {
    return (
      <>
        <Studio
          tab={tab}
          onTab={setTab}
          back={history.back}
          forward={history.forward}
          canBack={history.canBack}
          canForward={history.canForward}
          stations={stations}
          online={online}
          onPlay={onPlay}
          onAdd={openAdd}
          openHelp={() => setHelpOpen(true)}
          openAccount={() => setAccountOpen(true)}
          openPlayer={() => setPlayerOpen(true)}
          onEdit={openEdit}
          onQr={setQrStation}
          style={glow}
        >
          {page}
        </Studio>
        {overlays}
      </>
    );
  }

  /* ----------------------- «Классика» и телефон ----------------------- */
  const layout = ui.nav;

  const Brand = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Logo size={34} />
      <div className="hidden whitespace-nowrap font-display text-[17px] font-bold tracking-tight min-[520px]:block">Pocket Radio</div>
    </div>
  );

  const OnlinePill = (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", online ? "bg-ok/15 text-ok" : "bg-amber-500/15 text-amber-600 dark:text-amber-400")}>
      {online ? <Wifi size={13} /> : <WifiOff size={13} />}
      <span className="hidden min-[500px]:inline">{online ? "Онлайн" : "Офлайн"}</span>
    </span>
  );

  return (
    <div id="app-shell" className="flex h-dvh overflow-hidden bg-bg text-ink">
      {layout === "sidebar" && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface/60 p-5 lg:flex xl:w-72">
          {Brand}
          <nav className="mt-8 space-y-1" aria-label="Разделы">
            {NAV.map((n, i) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                aria-current={tab === n.id ? "page" : undefined}
                className={cn("flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-semibold transition", tab === n.id ? "bg-ink text-bg" : "text-muted hover:bg-surface-2 hover:text-ink")}
              >
                <n.icon size={19} />
                {n.label}
                <kbd className="ml-auto font-mono text-[10px] opacity-40">{i + 1}</kbd>
              </button>
            ))}
          </nav>
          <div className="mt-auto space-y-3">
            <p className="px-1 text-xs text-muted">В каталоге: {stations.length}</p>
            <AccountCard onOpenAccount={() => setAccountOpen(true)} onSettings={() => setTab("settings")} />
          </div>
        </aside>
      )}

      {layout === "rail" && (
        <aside className="hidden w-[76px] shrink-0 flex-col items-center border-r border-line bg-surface/60 py-5 lg:flex">
          <Logo size={42} />
          <nav className="mt-7 flex flex-col items-center gap-1.5" aria-label="Разделы">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                title={n.label}
                aria-label={n.label}
                aria-current={tab === n.id ? "page" : undefined}
                className={cn("flex h-12 w-12 items-center justify-center rounded-xl transition", tab === n.id ? "bg-ink text-bg" : "text-muted hover:bg-surface-2 hover:text-ink")}
              >
                <n.icon size={21} />
              </button>
            ))}
          </nav>
          <div className="mt-auto">
            <AccountMenu placement="side" onOpenAccount={() => setAccountOpen(true)} onSettings={() => setTab("settings")} />
          </div>
        </aside>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col" style={glow}>
        {/* Шапка (телефон): текущий контекст вместо повторения длинного названия приложения */}
        <header className="safe-top flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-xl lg:hidden">
          <button
            onClick={() => setTab("home")}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink transition active:scale-95"
            aria-label="На главную"
          >
            <currentNav.icon size={20} />
            <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface", online ? "bg-ok" : "bg-amber-500")} aria-label={online ? "Онлайн" : "Офлайн"} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg font-bold leading-tight">{currentNav.label}</div>
            <div className="truncate text-[11px] text-muted">
              {tab === "playlists" ? "Музыка и подкасты" : online ? "Pocket Radio" : "Нет интернета · доступен офлайн-режим"}
            </div>
          </div>
          <button onClick={openAdd} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-md transition active:scale-95" aria-label="Добавить станцию">
            <Plus size={21} />
          </button>
        </header>

        {/* Верхняя панель (компьютер, «Классика») */}
        <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-line bg-surface/70 px-8 backdrop-blur-xl lg:flex">
          {layout === "top" && (
            <>
              {Brand}
              <nav className="ml-3 flex items-center gap-1" aria-label="Разделы">
                {NAV.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    title={n.label}
                    aria-current={tab === n.id ? "page" : undefined}
                    className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition", tab === n.id ? "bg-ink text-bg" : "text-muted hover:bg-surface-2 hover:text-ink")}
                  >
                    <n.icon size={17} />
                    <span className="hidden 2xl:inline">{n.label}</span>
                  </button>
                ))}
              </nav>
            </>
          )}
          <div className="ml-auto flex items-center gap-3">
            {OnlinePill}
            <button onClick={() => setHelpOpen(true)} className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Горячие клавиши" title="Горячие клавиши (?)">
              <Keyboard size={19} />
            </button>
            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink shadow-lg shadow-accent/20 transition hover:brightness-110 active:scale-[0.98]">
              <Plus size={18} /> <span className="hidden xl:inline">Добавить станцию</span>
            </button>
            {layout === "top" && <AccountMenu placement="down" onOpenAccount={() => setAccountOpen(true)} onSettings={() => setTab("settings")} />}
          </div>
        </header>

        {!online && (
          <div className="flex items-center gap-2 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 lg:px-8">
            <WifiOff size={14} className="shrink-0" />
            Нет сети: работают интерфейс, каталог, избранное, статистика и скачанные плейлисты.
          </div>
        )}

        <main ref={mainRef} className={cn("min-h-0 flex-1 overflow-y-auto px-4 md:px-8 lg:px-10", hasPlayer ? "pb-44 lg:pb-10" : "pb-28 lg:pb-10")}>
          <div className="mx-auto max-w-[1480px] py-5 md:py-8">{page}</div>
        </main>

        {/* Док-плеер (компьютер) */}
        {hasPlayer && (
          <div className="hidden lg:block">
            <DockPlayer onOpen={() => setPlayerOpen(true)} />
          </div>
        )}

        {/* Мини-плеер (телефон) */}
        {hasPlayer && (
          <div className="pointer-events-none fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
            <div className="mx-auto max-w-3xl">
              <MiniPlayer onOpen={() => setPlayerOpen(true)} />
            </div>
          </div>
        )}

        {/* Нижняя навигация (телефон) */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden" aria-label="Разделы">
          <div className="grid grid-cols-5">
            {NAV.filter((n) => n.id === "home" || n.id === "catalog" || n.id === "playlists" || n.id === "discover").map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                aria-current={tab === n.id ? "page" : undefined}
                className={cn("flex min-w-0 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition", tab === n.id ? "text-accent" : "text-muted")}
              >
                <n.icon size={21} strokeWidth={tab === n.id ? 2.4 : 2} />
                {n.label}
              </button>
            ))}
            <button
              onClick={() => setMoreOpen(true)}
              aria-current={tab === "stats" || tab === "settings" ? "page" : undefined}
              className={cn("flex min-w-0 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition", tab === "stats" || tab === "settings" ? "text-accent" : "text-muted")}
            >
              <MoreHorizontal size={21} strokeWidth={tab === "stats" || tab === "settings" ? 2.4 : 2} />
              Ещё
            </button>
          </div>
        </nav>
      </div>
      {overlays}
    </div>
  );
}
