import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  BookmarkPlus,
  ChevronDown,
  Copy,
  Heart,
  History,
  ListMusic,
  Loader2,
  Maximize2,
  MoonStar,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  RotateCw,
  Share2,
  SkipBack,
  SkipForward,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { player, usePlayer, usePlayerTime, type PlayerState } from "../lib/player";
import { saveToLibrary, saveTrack, toggleFavoriteAny, trackLabel } from "../lib/db";
import { removeFromLibrary } from "../lib/library";
import { fmtClock, fmtBytes, hueOf, KIND_LABEL } from "../lib/templates";
import { useNow, useSavedStation } from "../lib/hooks";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";
import { Cover, Equalizer, Modal, btnGhost } from "./ui";
import { VodCacheButton } from "./VodCache";
import { FallbackBanner } from "./FallbackBanner";
import { AddToPlaylistButton } from "./PlaylistPicker";
import { isPodcastMedia, mediaLabel } from "../lib/media";
import { shareStation } from "./Share";
import type { Station } from "../lib/types";
import { usePlayerAppearance } from "../lib/playerAppearance";

function statusText(p: PlayerState): string {
  switch (p.status) {
    case "loading":
      return "Подключаемся…";
    case "buffering":
      return "Буферизация…";
    case "playing":
      return p.isLive ? "В эфире" : "Играет";
    case "error":
      return "Ошибка";
    case "paused":
      return p.isLive ? "Остановлено" : "Пауза";
    default:
      return "";
  }
}

function PlayIcon({ status, size = 22 }: { status: PlayerState["status"]; size?: number }) {
  if (status === "loading" || status === "buffering") return <Loader2 size={size} className="animate-spin" />;
  if (status === "playing") return <Pause size={size} className="fill-current" />;
  return <Play size={size} className="ml-0.5 fill-current" />;
}

async function favorite(st: Station) {
  const on = await toggleFavoriteAny(st);
  toast(on ? "Добавлено в избранное" : "Убрано из избранного", "info");
}

/** Закрыть плеер (свайп, крестик) с возможностью вернуть. */
function dismissPlayer() {
  const { station, queue } = player.getState();
  player.stop();
  if (station) toast("Плеер закрыт", "info", { label: "Вернуть", run: () => void player.play(station, queue) });
}

/* ------------------------------ свайп для закрытия ------------------------------ */

function SwipeToDismiss({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const st = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null; id: number } | null>(null);
  const moved = useRef(false);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return; // мышью закрываем крестиком
    st.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null, id: e.pointerId };
    moved.current = false;
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      s.axis = Math.abs(ddx) > Math.abs(ddy) * 1.3 ? "x" : "y";
      if (s.axis === "x") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
      }
    }
    if (s.axis === "x") {
      moved.current = true;
      setDx(ddx);
    }
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    st.current = null;
    if (s.axis !== "x") return;
    setDrag(false);
    const ddx = e.clientX - s.x;
    const speed = Math.abs(ddx) / Math.max(1, performance.now() - s.t);
    if (!cancelled && (Math.abs(ddx) > 110 || (Math.abs(ddx) > 40 && speed > 0.5))) {
      setDx(Math.sign(ddx) * window.innerWidth);
      setTimeout(onDismiss, 180);
    } else setDx(0);
  };

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-between rounded-2xl bg-surface-2 px-5 text-muted"
        style={{ opacity: Math.min(1, Math.abs(dx) / 80) }}
      >
        <X size={18} />
        <span className="text-xs font-semibold">Закрыть плеер</span>
        <X size={18} />
      </div>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
        style={{
          transform: `translateX(${dx}px)`,
          opacity: 1 - Math.min(0.6, Math.abs(dx) / (window.innerWidth * 0.9)),
          transition: drag ? "none" : "transform .2s ease, opacity .2s ease",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------- мини-плеер (телефон и планшет) ------------------------- */

export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const p = usePlayer();
  const t = usePlayerTime();
  const st = p.station;
  const saved = useSavedStation(st);
  const has = !!st;

  useEffect(() => {
    if (!has) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    if (localStorage.getItem("pr.swipeHint")) return;
    localStorage.setItem("pr.swipeHint", "1");
    toast("Совет: смахните плеер в сторону, чтобы закрыть", "info");
  }, [has]);

  if (!st) return null;
  const active = p.status === "playing" || p.status === "buffering" || p.status === "loading";
  const pct = !p.isLive && t.duration ? (t.position / t.duration) * 100 : 0;
  const fav = !!saved?.favorite;

  return (
    <SwipeToDismiss onDismiss={dismissPlayer}>
      <div className="anim-sheet pointer-events-auto relative overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        {!p.isLive && <div className="absolute left-0 top-0 h-0.5 bg-accent" style={{ width: `${pct}%` }} />}
        <div className="flex items-center gap-3 p-2 pr-3">
          <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Открыть плеер">
            <Cover s={st} size={46} className="rounded-xl" spin={active} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[15px] font-semibold leading-tight">{p.meta?.title || st.name}</div>
              <div className={cn("flex items-center gap-1.5 truncate text-xs", p.status === "error" ? "text-bad" : "text-muted")}>
                {p.status === "playing" && <Equalizer active className="h-3 text-accent" />}
                <span className="truncate">
                  {p.status === "error" ? p.error : p.meta?.title ? `${p.meta.artist ? p.meta.artist + " · " : ""}${st.name}` : statusText(p)}
                  {saved === null && p.status !== "error" && " · предпросмотр"}
                </span>
              </div>
            </div>
          </button>
          <button onClick={() => favorite(st)} className={cn("hidden rounded-full p-2 transition sm:block", fav ? "text-accent" : "text-muted hover:text-ink")} aria-label="Избранное">
            <Heart size={20} className={fav ? "fill-current" : ""} />
          </button>
          <button onClick={() => player.step(-1)} className="hidden rounded-full p-2 text-muted transition hover:text-ink sm:block" aria-label="Предыдущая">
            <SkipBack size={20} className="fill-current" />
          </button>
          <button
            onClick={() => player.toggle()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-md transition active:scale-95"
            aria-label={p.status === "playing" ? "Пауза" : "Играть"}
          >
            <PlayIcon status={p.status} />
          </button>
          <button onClick={() => player.step(1)} className="hidden rounded-full p-2 text-muted transition hover:text-ink sm:block" aria-label="Следующая">
            <SkipForward size={20} className="fill-current" />
          </button>
          <button onClick={dismissPlayer} className="hidden rounded-full p-2 text-muted transition hover:text-ink sm:block" aria-label="Закрыть плеер" title="Закрыть плеер">
            <X size={18} />
          </button>
        </div>
      </div>
    </SwipeToDismiss>
  );
}

/* ----------------------------------- общие блоки ----------------------------------- */

/** Компактная громкость: в плеере видна только кнопка, ползунок раскрывается поверх интерфейса. */
function VolumePopover({ volume, muted, side = "top" }: { volume: number; muted: boolean; side?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 240 });
  const shown = muted ? 0 : volume;
  const I = shown === 0 ? VolumeX : shown < 0.5 ? Volume1 : Volume2;
  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(240, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.left + r.width / 2 - width / 2));
    const h = popRef.current?.offsetHeight ?? 68;
    const top = side === "top" ? Math.max(12, r.top - h - 8) : Math.min(window.innerHeight - h - 12, r.bottom + 8);
    setPos({ left, top, width });
  };
  useEffect(() => {
    if (!open) return;
    place();
    requestAnimationFrame(place);
    const close = (e: PointerEvent) => !triggerRef.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node) && setOpen(false);
    const reposition = () => place();
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn("flex h-10 items-center justify-center gap-1.5 rounded-full px-3 text-muted transition hover:bg-surface-2 hover:text-ink", open && "bg-surface-2 text-ink")}
        aria-label="Громкость"
        aria-expanded={open}
      >
        <I size={19} />
        <span className="font-mono text-[11px]">{Math.round(shown * 100)}</span>
      </button>
      {open && createPortal(
        <div ref={popRef} className="volume-pop fixed z-[120] rounded-2xl border border-line bg-surface p-3 shadow-2xl" style={{ left: pos.left, top: pos.top, width: pos.width }}>
          <div className="flex items-center gap-2">
            <button onClick={() => player.toggleMute()} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label={muted ? "Включить звук" : "Выключить звук"}><I size={18} /></button>
            <input
              type="range"
              className="slider min-w-0 flex-1"
              min={0}
              max={1}
              step={0.01}
              value={shown}
              style={{ ["--p" as string]: `${shown * 100}%` }}
              onChange={(e) => {
                if (muted) player.toggleMute();
                player.setVolume(Number(e.target.value));
              }}
              aria-label="Громкость"
            />
            <span className="w-8 text-right font-mono text-xs text-muted">{Math.round(shown * 100)}</span>
          </div>
        </div>, document.body
      )}
    </div>
  );
}

function Seek({ className }: { className?: string }) {
  const t = usePlayerTime();
  const pct = t.duration ? (t.position / t.duration) * 100 : 0;
  return (
    <div className={className}>
      <input
        type="range"
        className="slider"
        min={0}
        max={t.duration || 1}
        step={1}
        value={Math.min(t.position, t.duration || 1)}
        style={{ ["--p" as string]: `${pct}%` }}
        onChange={(e) => player.seek(Number(e.target.value))}
        aria-label="Перемотка"
      />
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>{fmtClock(t.position)}</span>
        <span>{t.duration ? `−${fmtClock(Math.max(0, t.duration - t.position))}` : "--:--"}</span>
      </div>
    </div>
  );
}

/* ----------------------------- док-панель (компьютер) ----------------------------- */

export function DockPlayer({ onOpen }: { onOpen: () => void }) {
  const p = usePlayer();
  const st = p.station;
  const saved = useSavedStation(st);
  if (!st) return null;
  const active = p.status === "playing" || p.status === "buffering" || p.status === "loading";
  const fav = !!saved?.favorite;
  const ctl = "rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink";

  return (
    <div className="grid h-[84px] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-6 border-t border-line bg-surface px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onOpen} className="group flex min-w-0 items-center gap-3 text-left" aria-label="Открыть плеер на весь экран">
          <Cover s={st} size={56} className="rounded-lg" spin={active} />
          <span className="min-w-0">
            <span className="block truncate font-display text-[15px] font-semibold leading-tight group-hover:underline">{p.meta?.title || st.name}</span>
            <span className={cn("flex items-center gap-1.5 truncate text-xs", p.status === "error" ? "text-bad" : "text-muted")}>
              {p.status === "playing" && <Equalizer active className="h-3 text-accent" />}
              <span className="truncate">
                {p.status === "error" ? p.error : p.meta?.title ? `${p.meta.artist ? p.meta.artist + " · " : ""}${st.name}` : [statusText(p), saved === null ? "предпросмотр" : ""].filter(Boolean).join(" · ")}
              </span>
            </span>
          </span>
        </button>
        <button onClick={() => favorite(st)} className={cn("shrink-0 rounded-full p-2 transition", fav ? "text-accent" : "text-muted hover:text-ink")} aria-label="Избранное" title="Избранное (F)">
          <Heart size={19} className={fav ? "fill-current" : ""} />
        </button>
      </div>

      <div className="flex min-w-0 flex-col items-center gap-0.5">
        <div className="flex items-center gap-3">
          {p.isLive ? (
            <button onClick={() => player.step(-1)} className={ctl} aria-label="Предыдущая станция" title="Предыдущая станция (←)">
              <SkipBack size={20} className="fill-current" />
            </button>
          ) : (
            <button onClick={() => player.skip(-15)} className={ctl} aria-label="Назад 15 секунд" title="−15 с (←)">
              <RotateCcw size={20} />
            </button>
          )}
          <button
            onClick={() => player.toggle()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink shadow-md transition hover:brightness-110 active:scale-95"
            aria-label={p.status === "playing" ? "Пауза" : "Играть"}
            title="Играть / пауза (пробел)"
          >
            <PlayIcon status={p.status} />
          </button>
          {p.isLive ? (
            <button onClick={() => player.step(1)} className={ctl} aria-label="Следующая станция" title="Следующая станция (→)">
              <SkipForward size={20} className="fill-current" />
            </button>
          ) : (
            <button onClick={() => player.skip(30)} className={ctl} aria-label="Вперёд 30 секунд" title="+30 с (→)">
              <RotateCw size={20} />
            </button>
          )}
        </div>
        {p.isLive ? <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{p.status === "playing" ? "Прямой эфир" : statusText(p)}</span> : <Seek className="w-full max-w-md" />}
      </div>

      <div className="flex items-center justify-end gap-1">
        <VolumePopover volume={p.volume} muted={p.muted} side="top" />
        <button onClick={onOpen} className={ctl} aria-label="Развернуть плеер" title="Развернуть">
          <Maximize2 size={18} />
        </button>
        <button onClick={dismissPlayer} className={ctl} aria-label="Закрыть плеер" title="Закрыть плеер">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- таймер сна, история -------------------------------- */

const SLEEP = [15, 30, 45, 60, 90];
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

function SleepTimer({ sleepAt }: { sleepAt: number | null }) {
  const [open, setOpen] = useState(false);
  const now = useNow(!!sleepAt);
  const left = sleepAt ? Math.max(0, Math.ceil((sleepAt - now) / 1000)) : 0;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition", sleepAt ? "bg-accent/15 text-accent" : "bg-surface-2 text-ink hover:brightness-95")}
      >
        <MoonStar size={17} />
        {sleepAt ? `Таймер сна · ${fmtClock(left)}` : "Таймер сна"}
        <ChevronDown size={16} className={cn("ml-auto transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="anim-fade mt-2 flex flex-wrap gap-1.5">
          {SLEEP.map((m) => (
            <button
              key={m}
              onClick={() => {
                player.setSleep(m);
                setOpen(false);
                toast(`Остановим через ${m} мин`, "info");
              }}
              className="rounded-full bg-bg px-3.5 py-1.5 text-sm font-medium ring-1 ring-line transition hover:bg-surface-2"
            >
              {m} мин
            </button>
          ))}
          {sleepAt && (
            <button
              onClick={() => {
                player.setSleep(null);
                setOpen(false);
              }}
              className="rounded-full bg-bad/10 px-3.5 py-1.5 text-sm font-medium text-bad"
            >
              Отключить
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TrackHistory({ st }: { st: Station }) {
  const p = usePlayer();
  const [open, setOpen] = useState(false);
  const list = p.history;
  if (!list.length) return null;
  const time = (ts: number) => new Date(ts).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="rounded-2xl bg-surface-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold">
        <History size={16} /> Недавние треки · {list.length}
        <ChevronDown size={16} className={cn("ml-auto transition", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="anim-fade max-h-56 divide-y divide-line overflow-y-auto px-2 pb-2">
          {list.map((t, i) => (
            <li key={t.ts + "-" + i} className="flex items-center gap-2 px-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.title}</div>
                <div className="truncate text-xs text-muted">
                  {t.artist ? `${t.artist} · ` : ""}
                  {time(t.ts)}
                  {t.stationId !== st.id && ` · ${t.stationName}`}
                </div>
              </div>
              <button
                onClick={async () => toast((await saveTrack({ title: t.title, artist: t.artist, station: t.stationName, stationId: t.stationId })) ? "Трек сохранён" : "Уже в сохранённых", "ok")}
                className="rounded-lg p-2 text-muted hover:text-accent"
                aria-label="Сохранить трек"
              >
                <BookmarkPlus size={16} />
              </button>
              <button onClick={() => navigator.clipboard.writeText(trackLabel(t)).then(() => toast("Скопировано", "ok"))} className="rounded-lg p-2 text-muted hover:text-ink" aria-label="Копировать">
                <Copy size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------- полноэкранный плеер ----------------------------- */

export function FullPlayer({
  open,
  onClose,
  onEdit,
  onQr,
}: {
  open: boolean;
  onClose: () => void;
  onEdit: (s: Station) => void;
  onQr: (s: Station) => void;
}) {
  const p = usePlayer();
  const st = p.station;
  const saved = useSavedStation(st);
  const appearance = usePlayerAppearance();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setConfirmRemove(false), [st?.id, open]);

  if (!st) return <Modal open={false} onClose={onClose} children={null} />;
  const active = p.status === "playing" || p.status === "buffering" || p.status === "loading";
  const perHour = (st.bitrate * 3600 * 1000) / 8;
  const hue = hueOf(st.name);
  const fav = !!saved?.favorite;
  const podcast = isPodcastMedia(st);
  const upcoming = player.queueItems().filter((s) => s.id !== st.id).slice(0, 3);

  const remove = async () => {
    if (!saved) return;
    const url = saved.url;
    onClose();
    player.stop();
    await removeFromLibrary({ url });
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" mobile="page">
      {/* Телефон: компактный плеер, главные действия в первом экране */}
      <div className={cn("player-mobile relative px-5 pb-5 pt-1 md:hidden", `player-layout-${appearance.layout}`, `player-motion-${appearance.motion}`, active && "is-playing")} data-color-wash={appearance.colorWash ? "on" : "off"} style={{ ["--player-hue" as string]: hue }}>
        <div className="player-aurora pointer-events-none absolute inset-0 opacity-0" />
        {appearance.colorWash && <div className="player-wash pointer-events-none absolute inset-x-0 top-0 h-56 opacity-35 blur-3xl" style={{ background: `radial-gradient(circle at 50% 18%, hsl(${hue} 78% 56%), transparent 70%)` }} />}
        <div className="relative">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink" aria-label="Свернуть">
              <ChevronDown size={21} />
            </button>
            <span className="text-sm font-semibold text-muted">Сейчас играет</span>
            {saved ? (
              <button onClick={() => onEdit(saved)} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink" aria-label="Редактировать">
                <Pencil size={18} />
              </button>
            ) : (
              <span className="h-10 w-10" />
            )}
          </div>

          <div className="player-main-grid">
          <div className="player-art-wrap relative mx-auto mt-3 aspect-square w-[min(48vw,176px)]">
            <span className="player-wave player-wave-1 absolute inset-[-8%] rounded-full border border-accent/35 opacity-0" />
            <span className="player-wave player-wave-2 absolute inset-[-16%] rounded-full border border-accent/20 opacity-0" />
            <Cover s={st} size="fill" className="player-art rounded-2xl shadow-xl ring-1 ring-black/10" spin={active && appearance.motion === "calm"} eager fit={p.isLive ? "contain" : "cover"} />
          </div>

          <div className="player-copy mt-4 text-center">
            <div className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
              {p.status === "playing" && <Equalizer active className="h-3 text-accent" />}
              <span className={p.status === "error" ? "text-bad" : ""}>{statusText(p)}</span>
              {p.fromCache && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ok">офлайн</span>}
            </div>
            <h2 className="mx-auto mt-1.5 line-clamp-2 max-w-sm break-words font-display text-[1.45rem] font-bold leading-[1.12] tracking-tight [overflow-wrap:anywhere]">{p.meta?.title || st.name}</h2>
            <p className="mx-auto mt-1 line-clamp-1 max-w-sm text-sm text-muted">{p.meta?.title ? [p.meta.artist, st.name].filter(Boolean).join(" · ") : [st.genre, st.city].filter(Boolean).join(" · ") || mediaLabel(st, p.isLive)}</p>
          </div>
          </div>

          {p.fallback && <div className="mt-3"><FallbackBanner /></div>}
          {p.status === "error" && p.error && (
            <div className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad">
              {p.error} <button onClick={() => void player.resume()} className="font-semibold underline underline-offset-2">Повторить</button>
            </div>
          )}

          {!p.isLive && <Seek className="mt-3" />}

          <div className="mt-3 flex items-center justify-center gap-7">
            <button onClick={() => (podcast && !p.isLive ? player.skip(-15) : player.step(-1))} className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition active:scale-90" aria-label={podcast && !p.isLive ? "Назад 15 секунд" : "Предыдущий трек"}>
              {podcast && !p.isLive ? <RotateCcw size={23} /> : <SkipBack size={24} className="fill-current" />}
            </button>
            <button onClick={() => player.toggle()} className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg shadow-accent/25 transition active:scale-95" aria-label={p.status === "playing" ? "Пауза" : "Играть"}>
              <PlayIcon status={p.status} size={27} />
            </button>
            <button onClick={() => (podcast && !p.isLive ? player.skip(30) : player.step(1))} className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition active:scale-90" aria-label={podcast && !p.isLive ? "Вперёд 30 секунд" : "Следующий трек"}>
              {podcast && !p.isLive ? <RotateCw size={23} /> : <SkipForward size={24} className="fill-current" />}
            </button>
          </div>

          {podcast && !p.isLive && (
            <div className="no-scrollbar mt-2 flex justify-center gap-1 overflow-x-auto pb-1">
              {RATES.map((r) => (
                <button key={r} onClick={() => player.setRate(r)} className={cn("shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-semibold transition", p.rate === r ? "bg-ink text-bg" : "bg-surface-2 text-muted")}>{r}×</button>
              ))}
            </div>
          )}

          <div className="mt-2 flex justify-center"><VolumePopover volume={p.volume} muted={p.muted} side="top" /></div>

          {saved === null && (
            <button onClick={async () => toast((await saveToLibrary(st)) ? "Добавлено в каталог" : "Такой адрес уже в каталоге", "ok")} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-ink">
              <Plus size={17} /> Добавить в каталог
            </button>
          )}

          <div className="mt-3 grid grid-cols-3 gap-1">
            <button onClick={() => void favorite(st)} className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition", fav ? "text-accent" : "text-muted")}>
              <Heart size={19} className={fav ? "fill-current" : ""} /> {fav ? "Сохранено" : "Избранное"}
            </button>
            <AddToPlaylistButton station={st} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold text-muted transition" label="Плейлист" size={19} />
            <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold text-muted"><MoreHorizontal size={20} /> Ещё</button>
          </div>

          {st.kind === "vod" && saved && <div className="mt-2"><VodCacheButton station={st} /></div>}

          <section className="player-more mt-3 overflow-hidden rounded-2xl bg-surface/75 backdrop-blur">
            <div className="flex items-center justify-between px-3.5 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><ListMusic size={16} /> Далее</span>
              <span className="text-xs text-muted">{upcoming.length ? `${upcoming.length} впереди` : mediaLabel(st, p.isLive)}</span>
            </div>
            {upcoming.length ? (
              <ul className="border-t border-line/70 px-1.5 py-1">
                {upcoming.map((s) => <li key={s.id}><button onClick={() => void player.play(s)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2"><Cover s={s} size={38} className="rounded-lg" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{s.name}</span><span className="block truncate text-xs text-muted">{s.genre || s.city || mediaLabel(s, s.kind !== "vod")}</span></span><Play size={14} className="shrink-0 fill-current text-muted" /></button></li>)}
              </ul>
            ) : <p className="border-t border-line/70 px-3.5 py-3 text-xs leading-relaxed text-muted">В очереди больше ничего нет. Добавьте трек в плейлист или выберите другую станцию.</p>}
          </section>
        </div>
      </div>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} size="sm" title="Действия">
        <div className="space-y-1 p-3">
          <button onClick={() => { setMoreOpen(false); void shareStation(st); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-surface-2"><Share2 size={18} className="text-muted" /> Поделиться ссылкой</button>
          <button onClick={() => { setMoreOpen(false); onQr(st); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-surface-2"><QrCode size={18} className="text-muted" /> Показать QR-код</button>
          <div className="p-1"><SleepTimer sleepAt={p.sleepAt} /></div>
          <TrackHistory st={st} />
          {(st.note || st.tags.length > 0) && <div className="rounded-xl bg-surface-2 p-3"><div className="flex flex-wrap gap-1.5">{st.tags.map((t) => <span key={t} className="rounded-full bg-bg px-2.5 py-1 text-xs text-muted">#{t}</span>)}</div>{st.note && <p className="mt-2 text-sm leading-relaxed text-muted">{st.note}</p>}</div>}
          {saved && <><div className="my-1 h-px bg-line" />{confirmRemove ? <div className="rounded-xl bg-bad/10 p-3"><p className="text-sm text-bad">Убрать «{saved.name}» из каталога?</p><div className="mt-3 flex gap-2"><button className={btnGhost} onClick={() => setConfirmRemove(false)}>Отмена</button><button className="rounded-xl bg-bad px-4 py-2 text-sm font-semibold text-white" onClick={() => void remove()}>Убрать</button></div></div> : <button onClick={() => setConfirmRemove(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-bad hover:bg-bad/10"><Trash2 size={18} /> Убрать из каталога</button>}</>}
        </div>
      </Modal>

      {/* Планшет и компьютер: двухколоночная версия */}
      <div className="relative hidden md:block">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-50 blur-3xl transition-all duration-700 dark:opacity-40"
          style={{ background: `radial-gradient(circle at 50% 30%, hsl(${hue} 80% 55%), transparent 70%)` }}
        />
        <div className="relative px-6 pb-6 pt-4 md:px-9 md:pb-9 md:pt-6">
          <div className="mb-4 flex items-center justify-between md:mb-6">
            <button onClick={onClose} className="rounded-full bg-surface-2/80 p-2 text-ink backdrop-blur transition hover:brightness-95" aria-label="Свернуть">
              <ChevronDown size={22} />
            </button>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{mediaLabel(st, p.isLive)}</span>
            {saved ? (
              <button onClick={() => onEdit(saved)} className="rounded-full bg-surface-2/80 p-2 text-ink backdrop-blur transition hover:brightness-95" aria-label="Редактировать">
                <Pencil size={20} />
              </button>
            ) : (
              <span className="w-9" />
            )}
          </div>

          <div className="md:grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-10">
            {/* левая колонка: обложка и управление */}
            <div className="min-w-0">
              <div className="mx-auto aspect-square w-[min(54vw,210px)] md:w-full md:max-w-[320px]">
                <Cover
                  s={st}
                  size="fill"
                  className={cn("rounded-3xl shadow-2xl ring-1 ring-black/10 transition-transform duration-500", active ? "scale-100" : "scale-95")}
                  spin={active}
                  eager
                  fit={p.isLive ? "contain" : "cover"}
                />
              </div>

              <div className="mt-6 text-center">
                <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  {p.status === "playing" && <Equalizer active className="text-accent" />}
                  <span className={p.status === "error" ? "text-bad" : ""}>{statusText(p)}</span>
                  {p.fromCache && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ok">из кэша</span>}
                </div>
                <h2 className="mt-1.5 break-words font-display text-2xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{p.meta?.title || st.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {p.meta?.title ? [p.meta.artist, st.name].filter(Boolean).join(" · ") : [st.genre, st.city].filter(Boolean).join(" · ") || KIND_LABEL[st.kind]}
                </p>
                {p.meta?.title && !p.fallback && (
                  <button
                    onClick={async () =>
                      toast((await saveTrack({ title: p.meta!.title!, artist: p.meta!.artist, station: st.name, stationId: st.id })) ? "Трек сохранён в «Главной»" : "Этот трек уже сохранён", "ok")
                    }
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-2/90 px-3.5 py-1.5 text-xs font-semibold transition hover:brightness-95"
                  >
                    <BookmarkPlus size={14} /> Сохранить трек
                  </button>
                )}
              </div>

              {p.fallback && (
                <div className="mt-4">
                  <FallbackBanner />
                </div>
              )}

              {p.status === "error" && p.error && (
                <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-bad/10 p-3.5 text-sm text-bad">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    {p.error}
                    <div className="mt-2 flex gap-4">
                      <button onClick={() => player.resume()} className="font-semibold underline underline-offset-2">
                        Повторить
                      </button>
                      {p.queue.length > 1 && (
                        <button onClick={() => player.step(1)} className="font-semibold underline underline-offset-2">
                          Следующая станция
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!p.isLive && (
                <div className="mt-5">
                  <Seek />
                  {podcast && <div className="mt-2 flex flex-wrap justify-center gap-1">
                    {RATES.map((r) => (
                      <button
                        key={r}
                        onClick={() => player.setRate(r)}
                        className={cn("rounded-full px-2.5 py-1 font-mono text-xs font-semibold transition", p.rate === r ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink")}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>}
                </div>
              )}

              <div className="mt-5 flex items-center justify-center gap-5">
                {!p.isLive && podcast ? (
                  <button onClick={() => player.skip(-15)} className="rounded-full p-3 text-ink transition hover:bg-surface-2" aria-label="Назад 15 секунд">
                    <RotateCcw size={24} />
                  </button>
                ) : (
                  <button onClick={() => player.step(-1)} className="rounded-full p-3 text-ink transition hover:bg-surface-2" aria-label="Предыдущая станция">
                    <SkipBack size={26} className="fill-current" />
                  </button>
                )}
                <button
                  onClick={() => player.toggle()}
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-xl shadow-accent/30 transition active:scale-95"
                  aria-label={p.status === "playing" ? "Пауза" : "Играть"}
                >
                  <PlayIcon status={p.status} size={30} />
                </button>
                {!p.isLive && podcast ? (
                  <button onClick={() => player.skip(30)} className="rounded-full p-3 text-ink transition hover:bg-surface-2" aria-label="Вперёд 30 секунд">
                    <RotateCw size={24} />
                  </button>
                ) : (
                  <button onClick={() => player.step(1)} className="rounded-full p-3 text-ink transition hover:bg-surface-2" aria-label="Следующая станция">
                    <SkipForward size={26} className="fill-current" />
                  </button>
                )}
              </div>

              <div className="mt-5 flex justify-center"><VolumePopover volume={p.volume} muted={p.muted} side="top" /></div>
            </div>

            {/* правая колонка: действия и сведения */}
            <div className="mt-5 min-w-0 space-y-3 md:mt-0 md:pt-2">
              {saved === null && (
                <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-semibold">Предпросмотр</div>
                    <div className="text-xs text-muted">Станции нет в вашем каталоге</div>
                  </div>
                  <button
                    onClick={async () => toast((await saveToLibrary(st)) ? "Добавлено в каталог" : "Такой адрес уже в каталоге", "ok")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink"
                  >
                    <Plus size={16} /> В каталог
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => favorite(st)} className={cn(btnGhost, "flex-col gap-1 py-3 text-xs", fav && "!border-accent/50 !text-accent")}>
                  <Heart size={20} className={fav ? "fill-current" : ""} />
                  {fav ? "В избранном" : "Избранное"}
                </button>
                <button onClick={() => shareStation(st)} className={cn(btnGhost, "flex-col gap-1 py-3 text-xs")}>
                  <Share2 size={20} /> Ссылка
                </button>
                <button onClick={() => onQr(st)} className={cn(btnGhost, "flex-col gap-1 py-3 text-xs")}>
                  <QrCode size={20} /> QR
                </button>
              </div>

              <AddToPlaylistButton station={st} className={cn(btnGhost, "w-full")} label="Добавить в плейлист" />
              <SleepTimer sleepAt={p.sleepAt} />
              {st.kind === "vod" && saved && <VodCacheButton station={st} />}
              <TrackHistory st={st} />

              <div className="space-y-3 rounded-2xl bg-surface-2 p-4 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold">{p.isLive ? KIND_LABEL[st.kind] : mediaLabel(st, false)}</span>
                  {st.mood && <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold">{st.mood}</span>}
                  {st.tags.map((t) => (
                    <span key={t} className="rounded-full bg-bg px-2.5 py-1 text-xs text-muted">
                      #{t}
                    </span>
                  ))}
                </div>
                {st.note && <p className="leading-relaxed text-muted">{st.note}</p>}
                <div className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span className="min-w-0 flex-1 truncate font-mono">{st.url}</span>
                  <button onClick={() => navigator.clipboard.writeText(st.url).then(() => toast("Адрес скопирован", "ok"))} className="shrink-0 rounded-lg p-1.5 hover:text-ink" aria-label="Копировать адрес">
                    <Copy size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Zap size={14} className={p.dataSaver ? "text-ok" : ""} />
                  {p.dataSaver ? "Экономия трафика включена" : "Экономия трафика выключена"} · ≈ {fmtBytes(perHour)}/час
                </div>
              </div>

              {saved && (
                <div className="rounded-2xl border border-line p-4">
                  {!confirmRemove ? (
                    <button onClick={() => setConfirmRemove(true)} className="flex w-full items-center gap-2 text-sm font-semibold text-bad">
                      <Trash2 size={16} /> Убрать станцию из каталога
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm">
                        Убрать «{saved.name}» из каталога? Сразу после удаления её можно вернуть.
                      </p>
                      <div className="flex gap-2">
                        <button className={btnGhost} onClick={() => setConfirmRemove(false)}>
                          Отмена
                        </button>
                        <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-bad px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110" onClick={remove}>
                          <Trash2 size={16} /> Убрать
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// используются правой панелью «Сейчас играет» в компоновке для компьютера
export { SleepTimer, statusText };
