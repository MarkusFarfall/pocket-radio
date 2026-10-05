import { useMemo } from "react";
import { Clock, Flame, Heart, LayoutGrid, Pause, Play, Shuffle, BookmarkCheck, type LucideIcon } from "lucide-react";
import type { Station } from "../lib/types";
import type { ViewProps } from "../views/shared";
import { Home, MOOD_ICON, PackStrip, SavedTracks, ago, greeting } from "../views/Home";
import { Cover, Equalizer, SectionTitle, btnPrimary } from "../components/ui";
import { Rail } from "../components/Rail";
import { StationRow } from "../components/StationCard";
import { KindBadge } from "../components/kind";
import { player, usePlayer } from "../lib/player";
import { useSavedTracks, useSessions } from "../lib/hooks";
import { streakDays, todaySeconds } from "../lib/stats";
import { fmtClock, fmtDuration, hueOf } from "../lib/templates";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";

function Stat({ icon: I, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <I size={13} /> {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function QuickCard({ s, queue, onPlay }: { s: Station; queue: string[]; onPlay: ViewProps["onPlay"] }) {
  const p = usePlayer();
  const cur = p.station?.id === s.id;
  const playing = cur && (p.status === "playing" || p.status === "buffering" || p.status === "loading");
  return (
    <button onClick={() => onPlay(s, queue)} className={cn("group flex items-center gap-3 overflow-hidden rounded-xl border bg-surface pr-3 text-left transition hover:bg-surface-2", cur ? "border-accent/50" : "border-line")}>
      <Cover s={s} size={60} className="!rounded-none" spin={playing} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{s.name}</span>
        <span className="block truncate text-xs text-muted">{s.genre || s.city || "—"}</span>
      </span>
      {playing ? (
        <Equalizer active={p.status === "playing"} className="h-3.5 shrink-0 text-accent" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink opacity-0 shadow-lg transition group-hover:opacity-100">
          <Play size={16} className="ml-0.5 fill-current" />
        </span>
      )}
    </button>
  );
}

/** Главная для компьютера: большая карточка «Продолжить», сводка за сегодня и сетка быстрого доступа. */
export function HomeStudio(props: ViewProps) {
  const { stations, online, cachedIds, onPlay, go } = props;
  const sessions = useSessions();
  const tracks = useSavedTracks();
  const p = usePlayer();

  const recent = useMemo(() => stations.filter((s) => s.lastPlayedAt).sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!), [stations]);
  const favs = useMemo(() => stations.filter((s) => s.favorite).sort((a, b) => a.name.localeCompare(b.name, "ru")), [stations]);
  const top = useMemo(() => stations.filter((s) => s.totalSeconds >= 10).sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 6), [stations]);
  const moods = useMemo(() => {
    const m = new Map<string, Station[]>();
    stations.forEach((s) => s.mood && m.set(s.mood, [...(m.get(s.mood) ?? []), s]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [stations]);

  // без станций показываем обычное приветствие с быстрым стартом
  if (!stations.length) return <Home {...props} />;

  const last = recent[0];
  const hero = last ?? favs[0] ?? stations[0];
  const hue = hueOf(hero.name);
  const heroQueue = (last ? recent : favs.length ? favs : stations).map((s) => s.id);
  const heroActive = p.station?.id === hero.id && (p.status === "playing" || p.status === "buffering" || p.status === "loading");
  const today = todaySeconds(sessions);
  const streak = streakDays(sessions);
  const quick = (favs.length ? favs : recent.length ? recent : stations).slice(0, 8);
  const quickTitle = favs.length ? "Избранное" : recent.length ? "Недавние" : "Ваши станции";

  const surprise = () => {
    const cur = player.getState().station?.id;
    const pool = stations.filter((s) => s.id !== cur && (online || s.kind === "lan" || cachedIds.has(s.id)));
    if (!pool.length) return toast("Нет станций, доступных прямо сейчас", "info");
    const queue = player.shuffleQueue(pool);
    onPlay(pool.find((s) => s.id === queue[0])!, queue);
  };
  const playMood = (list: Station[]) => {
    const queue = player.shuffleQueue(list);
    onPlay(list.find((s) => s.id === queue[0])!, queue);
  };

  return (
    <div className="space-y-9 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{greeting()}</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">Что послушаем?</h1>
        </div>
        <button onClick={surprise} className={btnPrimary}>
          <Shuffle size={17} /> Случайная станция
        </button>
      </div>

      <div className="home-feature-container">
        <section className="home-feature-grid gap-4" data-home-feature>
          <div data-home-hero className="relative min-w-0 overflow-hidden rounded-3xl p-7 text-white" style={{ background: `linear-gradient(120deg, hsl(${hue} 40% 26%), hsl(${(hue + 40) % 360} 44% 11%))` }}>
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: `hsl(${hue} 80% 60%)` }} />
            <div className="relative flex items-center gap-7">
              <Cover s={hero} size={176} className="rounded-2xl shadow-2xl ring-1 ring-white/20" spin={heroActive} />
              <div data-home-hero-copy className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">{last ? "Продолжить слушать" : favs.length ? "Из избранного" : "Попробуйте"}</div>
                <h2 className="mt-2 truncate font-display text-4xl font-bold tracking-tight">{hero.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/70">
                  <KindBadge kind={hero.kind} className="!bg-white/15 !text-white" />
                  {[hero.genre, hero.city].filter(Boolean).join(" · ")}
                  {hero.kind === "vod" && hero.resumePos ? ` · с ${fmtClock(hero.resumePos)}` : hero.totalSeconds > 60 ? ` · слушали ${fmtDuration(hero.totalSeconds, true)}` : ""}
                </div>
                {hero.note && <p className="mt-3 line-clamp-2 max-w-xl text-sm text-white/70">{hero.note}</p>}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button onClick={() => onPlay(hero, heroQueue)} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-neutral-900 shadow-xl transition hover:scale-[1.03] active:scale-95">
                    {heroActive ? <Pause size={18} className="fill-current" /> : <Play size={18} className="ml-0.5 fill-current" />} {heroActive ? "Пауза" : "Слушать"}
                  </button>
                  <button onClick={() => go("catalog")} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/25">
                    <LayoutGrid size={16} /> Весь каталог
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Сегодня</h3>
              <span className="text-xs text-muted">{new Date().toLocaleDateString("ru", { day: "numeric", month: "long" })}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat icon={Clock} label="Эфир" value={today > 0 ? fmtDuration(today, true) : "0 м"} />
              <Stat icon={Flame} label="Серия" value={`${streak} дн.`} />
              <Stat icon={LayoutGrid} label="Станций" value={String(stations.length)} />
              <Stat icon={BookmarkCheck} label="Треков" value={String(tracks.length)} />
            </div>
            <button onClick={() => go("stats")} className="mt-3 w-full rounded-xl py-2 text-sm font-semibold text-accent transition hover:bg-accent/10">
              Вся статистика
            </button>
          </div>
        </section>
      </div>

      <section>
        <SectionTitle
          action={
            <button onClick={() => go("catalog")} className="text-sm font-semibold text-accent">
              Все станции
            </button>
          }
        >
          <span className="inline-flex items-center gap-2">
            {favs.length > 0 && <Heart size={20} className="fill-accent text-accent" />} {quickTitle}
          </span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
          {quick.map((s) => (
            <QuickCard key={s.id} s={s} queue={quick.map((x) => x.id)} onPlay={onPlay} />
          ))}
        </div>
      </section>

      {moods.length > 0 && (
        <section>
          <SectionTitle>Под настроение</SectionTitle>
          <Rail className="gap-2.5 pb-1">
            {moods.map(([m, list]) => {
              const I = MOOD_ICON[m];
              return (
                <button key={m} onClick={() => playMood(list)} className="group flex shrink-0 items-center gap-3 rounded-xl border border-line bg-surface py-2.5 pl-3 pr-4 text-left transition hover:border-ink/30">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 transition group-hover:bg-accent group-hover:text-accent-ink">{I ? <I size={19} /> : <Play size={17} />}</span>
                  <span>
                    <span className="block font-display text-sm font-semibold leading-tight">{m}</span>
                    <span className="text-xs text-muted">{list.length} ст. · микс</span>
                  </span>
                </button>
              );
            })}
          </Rail>
        </section>
      )}

      <PackStrip go={go} />

      <div className="grid gap-9 2xl:grid-cols-2">
        <section>
          <SectionTitle>Недавние</SectionTitle>
          {recent.length ? (
            <div className="rounded-2xl border border-line bg-surface p-1.5">
              {recent.slice(0, 6).map((s) => (
                <StationRow key={s.id} station={s} queue={recent.map((x) => x.id)} online={online} cached={cachedIds.has(s.id)} onPlay={onPlay} right={<span className="text-xs text-muted">{ago(s.lastPlayedAt!)}</span>} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Здесь появится история прослушивания.</div>
          )}
        </section>
        <section>
          <SectionTitle>Топ станций</SectionTitle>
          {top.length ? (
            <div className="rounded-2xl border border-line bg-surface p-1.5">
              {top.map((s, i) => (
                <StationRow key={s.id} station={s} rank={i + 1} queue={top.map((x) => x.id)} online={online} cached={cachedIds.has(s.id)} onPlay={onPlay} right={<span className="font-mono text-xs text-muted">{fmtDuration(s.totalSeconds, true)}</span>} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Послушайте несколько станций — и здесь появится рейтинг по времени.</div>
          )}
        </section>
      </div>

      <SavedTracks />
    </div>
  );
}
