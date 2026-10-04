import { useMemo, useState } from "react";
import {
  BookmarkCheck,
  ChartColumn,
  Clock,
  Cloud,
  Compass,
  Copy,
  Disc3,
  Download,
  Flame,
  Heart,
  House,
  MoonStar,
  Moon,
  PartyPopper,
  Play,
  Plus,
  Radio,
  Search,
  Shuffle,
  Sparkles,
  Sunrise,
  Brain,
  Trash2,
  Zap,
  Leaf,
  Music,
  type LucideIcon,
} from "lucide-react";
import type { Station } from "../lib/types";
import type { ViewProps } from "./shared";
import { Cover, Equalizer, SectionTitle, btnGhost, btnPrimary } from "../components/ui";
import { StationRow } from "../components/StationCard";
import { KindBadge } from "../components/kind";
import { Photo } from "../components/Photo";
import { Rail } from "../components/Rail";
import { installStarter } from "../lib/starter";
import { PACKS } from "../lib/packs";
import { fmtClock, fmtDuration, hueOf } from "../lib/templates";
import { player, usePlayer } from "../lib/player";
import { removeTrack, trackLabel } from "../lib/db";
import { useSavedTracks, useSessions } from "../lib/hooks";
import { streakDays, todaySeconds } from "../lib/stats";
import { toast } from "../lib/toast";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

const MOOD_ICON: Record<string, LucideIcon> = {
  Бодрое: Sunrise,
  Спокойное: Leaf,
  Фокус: Brain,
  Ночное: Moon,
  Энергия: Zap,
  Ностальгия: Disc3,
  Грусть: Cloud,
  Весёлое: PartyPopper,
};

function Tile({ s, queue, onPlay }: { s: Station; queue: string[]; onPlay: ViewProps["onPlay"] }) {
  const p = usePlayer();
  const cur = p.station?.id === s.id;
  return (
    <button onClick={() => onPlay(s, queue)} className="group w-32 shrink-0 text-left sm:w-36">
      <div className="relative aspect-square">
        <Cover s={s} size="fill" className="rounded-xl transition group-hover:brightness-110" spin={cur && p.status === "playing"} />
        {cur && (
          <span className="absolute left-2 top-2 rounded-full bg-white px-2 py-1 text-accent shadow">
            <Equalizer active={p.status === "playing"} />
          </span>
        )}
        <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink opacity-0 shadow-lg transition group-hover:opacity-100">
          <Play size={16} className="ml-0.5 fill-current" />
        </span>
      </div>
      <div className="mt-2 truncate text-sm font-semibold">{s.name}</div>
      <div className="truncate text-xs text-muted">{s.genre || s.city || "—"}</div>
    </button>
  );
}

function SavedTracks() {
  const tracks = useSavedTracks();
  const [all, setAll] = useState(false);
  if (!tracks.length) return null;
  const list = all ? tracks : tracks.slice(0, 5);
  return (
    <section>
      <SectionTitle
        action={
          <button
            onClick={() => navigator.clipboard.writeText(tracks.map(trackLabel).join("\n")).then(() => toast("Список треков скопирован", "ok"))}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
          >
            <Copy size={14} /> Скопировать всё
          </button>
        }
      >
        <span className="inline-flex items-center gap-2">
          <BookmarkCheck size={20} className="text-accent" /> Сохранённые треки
        </span>
      </SectionTitle>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {list.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{t.title}</div>
              <div className="truncate text-xs text-muted">
                {t.artist ? `${t.artist} · ` : ""}
                {t.station}
              </div>
            </div>
            <a
              className="rounded-lg p-2 text-muted transition hover:text-accent"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(trackLabel(t))}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Найти на YouTube"
              title="Найти на YouTube"
            >
              <Search size={16} />
            </a>
            <button onClick={() => navigator.clipboard.writeText(trackLabel(t)).then(() => toast("Скопировано", "ok"))} className="rounded-lg p-2 text-muted hover:text-ink" aria-label="Копировать">
              <Copy size={16} />
            </button>
            <button onClick={() => removeTrack(t.id!)} className="rounded-lg p-2 text-muted hover:text-bad" aria-label="Удалить">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      {tracks.length > 5 && (
        <button onClick={() => setAll(!all)} className="mt-2 text-sm font-semibold text-accent">
          {all ? "Свернуть" : `Показать все (${tracks.length})`}
        </button>
      )}
    </section>
  );
}

function PackStrip({ go }: { go: ViewProps["go"] }) {
  const open = (id: string) => {
    localStorage.setItem("radio.discoverTab", "packs");
    localStorage.setItem("radio.openPack", id);
    go("discover");
  };
  return (
    <section>
      <SectionTitle
        action={
          <button onClick={() => go("discover")} className="text-sm font-semibold text-accent">
            Все подборки
          </button>
        }
      >
        Подборки
      </SectionTitle>
      <Rail className="-mx-4 gap-3 px-4 pb-1 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
        {PACKS.slice(0, 12).map((p) => (
          <button key={p.id} onClick={() => open(p.id)} className="group relative aspect-[4/3] w-44 shrink-0 overflow-hidden rounded-xl text-left sm:w-52 xl:w-60">
            <Photo pack={p} w={420} h={320} className="absolute inset-0" />
            <span className="absolute inset-x-0 bottom-0 p-3 font-display text-[15px] font-semibold leading-tight text-white">{p.title}</span>
          </button>
        ))}
      </Rail>
    </section>
  );
}

export function Home({ stations, online, cachedIds, onPlay, onAdd, onScan, onDemo, go }: ViewProps) {
  const sessions = useSessions();
  const recent = useMemo(() => stations.filter((s) => s.lastPlayedAt).sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!), [stations]);
  const favs = useMemo(() => stations.filter((s) => s.favorite).sort((a, b) => a.name.localeCompare(b.name, "ru")), [stations]);
  const top = useMemo(() => stations.filter((s) => s.totalSeconds >= 10).sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 5), [stations]);
  const moods = useMemo(() => {
    const m = new Map<string, Station[]>();
    stations.forEach((s) => s.mood && m.set(s.mood, [...(m.get(s.mood) ?? []), s]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [stations]);
  const last = recent[0];
  const today = todaySeconds(sessions);
  const streak = streakDays(sessions);

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

  if (!stations.length)
    return (
      <div className="mx-auto max-w-3xl py-4 md:py-12">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="relative h-44 md:h-56">
            <Photo pack={PACKS[1]} w={1000} h={440} className="absolute inset-0" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-8">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md ring-1 ring-white/25">
                <Radio size={22} />
              </div>
              <h1 className="font-display text-3xl font-bold leading-tight tracking-tight md:text-4xl">Ваше радио — только ваши потоки</h1>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <p className="max-w-xl text-[15px] leading-relaxed text-muted">
              «Быстрый старт» добавит около двадцати станций из разных жанров. Дальше можно установить готовые подборки, найти станцию среди десятков тысяч, подкаст или добавить свой поток, в том числе из домашней сети. Всё хранится на устройстве и работает офлайн.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button
                className={btnPrimary}
                onClick={async () => {
                  const n = await installStarter();
                  toast(n ? `Готово: добавлено ${n} станций. Нажмите на любую, чтобы послушать` : "Стартовый набор уже установлен", n ? "ok" : "info");
                }}
              >
                <Sparkles size={18} /> Быстрый старт
              </button>
              <button className={btnGhost} onClick={onDemo}>
                <Compass size={16} /> Выбрать подборки
              </button>
              <button className={btnGhost} onClick={onAdd}>
                <Plus size={16} /> Добавить свою
              </button>
              <button className={btnGhost} onClick={onScan}>
                Сканировать QR
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              [House, "Музыка без интернета", "Скачанные плейлисты и свои песни всегда под рукой"],
              [ChartColumn, "Статистика", "Часы, серии дней, топ станций и ошибки"],
              [MoonStar, "Таймер сна", "Плавно затихает и останавливает эфир"],
            ] as [LucideIcon, string, string][]
          ).map(([I, t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-surface p-4">
              <I size={20} className="text-accent" />
              <div className="mt-2 font-display font-semibold">{t}</div>
              <div className="text-xs leading-relaxed text-muted">{d}</div>
            </div>
          ))}
        </div>
      </div>
    );

  const hue = last ? hueOf(last.name) : 20;

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{greeting()}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Что послушаем?</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {today > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line">
              <Clock size={14} className="text-accent" /> сегодня {fmtDuration(today, true)}
            </span>
          )}
          {streak >= 2 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line">
              <Flame size={14} className="text-accent" /> {streak} дн. подряд
            </span>
          )}
          <button onClick={surprise} className={btnPrimary + " !py-2"}>
            <Shuffle size={17} /> Случайная станция
          </button>
        </div>
      </div>

      {last && (
        <section
          className="relative overflow-hidden rounded-2xl p-5 text-white md:p-6"
          style={{ background: `linear-gradient(120deg, hsl(${hue} 38% 24%), hsl(${(hue + 40) % 360} 42% 12%))` }}
        >
          <div className="relative flex items-center gap-4 md:gap-6">
            <Cover s={last} size={92} className="rounded-2xl shadow-2xl ring-1 ring-white/20" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Продолжить слушать</div>
              <div className="mt-1 truncate font-display text-2xl font-bold md:text-3xl">{last.name}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-white/70">
                <KindBadge kind={last.kind} className="!bg-white/15 !text-white" />
                {last.kind === "vod" && last.resumePos ? <span>с {fmtClock(last.resumePos)}</span> : last.totalSeconds > 60 ? <span>слушали {fmtDuration(last.totalSeconds, true)}</span> : null}
              </div>
            </div>
            <button
              onClick={() => onPlay(last, recent.map((s) => s.id))}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900 shadow-xl transition hover:scale-105 active:scale-95"
              aria-label="Продолжить"
            >
              <Play size={24} className="ml-1 fill-current" />
            </button>
          </div>
        </section>
      )}

      {moods.length > 0 && (
        <section>
          <SectionTitle>Под настроение</SectionTitle>
          <Rail className="-mx-4 gap-2.5 px-4 pb-1 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
            {moods.map(([m, list]) => {
              const I = MOOD_ICON[m] ?? Music;
              return (
                <button
                  key={m}
                  onClick={() => playMood(list)}
                  className="group flex shrink-0 items-center gap-3 rounded-xl border border-line bg-surface py-2.5 pl-3 pr-4 text-left transition hover:border-ink/30"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink transition group-hover:bg-accent group-hover:text-accent-ink">
                    <I size={19} />
                  </span>
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

      <section>
        <SectionTitle
          action={
            favs.length > 0 && (
              <button onClick={() => go("catalog")} className="text-sm font-semibold text-accent">
                Все станции
              </button>
            )
          }
        >
          <span className="inline-flex items-center gap-2">
            <Heart size={20} className="fill-accent text-accent" /> Избранное
          </span>
        </SectionTitle>
        {favs.length ? (
          <Rail className="-mx-4 gap-4 px-4 pb-1 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
            {favs.map((s) => (
              <Tile key={s.id} s={s} queue={favs.map((x) => x.id)} onPlay={onPlay} />
            ))}
          </Rail>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Нажмите на сердечко у станции — она появится здесь и будет доступна офлайн.</div>
        )}
      </section>

      <PackStrip go={go} />

      <div className="grid gap-9 lg:grid-cols-2">
        <section>
          <SectionTitle>Недавние</SectionTitle>
          {recent.length ? (
            <div className="rounded-2xl border border-line bg-surface p-1.5">
              {recent.slice(0, 5).map((s) => (
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

      {cachedIds.size > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Download size={14} /> Офлайн доступно эпизодов: {cachedIds.size}
        </p>
      )}
    </div>
  );
}

// блоки главной используются и компоновкой «Студия» для компьютера
export { SavedTracks, PackStrip, MOOD_ICON, greeting, ago };

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  return d === 1 ? "вчера" : `${d} дн назад`;
}
