import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Check, ListPlus, Loader2, Pause, Play, Plus, RefreshCw, Rss, Search as SearchIcon, Tags, WifiOff, X } from "lucide-react";
import { searchPodcasts, type Show } from "../../lib/sources";
import { episodeToItem, playEpisodes, searchEpisodes, showEpisodes, type Episode } from "../../lib/podcasts";
import { createPlaylist, refreshFollow, usePlaylists } from "../../lib/playlists";
import { gotoPlaylist, openPicker } from "../../lib/picker";
import { usePlayer } from "../../lib/player";
import { userRegion } from "../../lib/radiobrowser";
import { fmtDuration } from "../../lib/templates";
import { toast } from "../../lib/toast";
import { cn } from "../../utils/cn";
import { Cover, Equalizer, Modal, btnGhost, btnPrimary, inputCls } from "../../components/ui";
import { Seg } from "../settings/parts";

const COUNTRIES: [string, string][] = [
  ["US", "США"],
  ["RU", "Россия"],
  ["GB", "Великобритания"],
  ["DE", "Германия"],
  ["FR", "Франция"],
  ["ES", "Испания"],
  ["IT", "Италия"],
  ["UA", "Украина"],
  ["PL", "Польша"],
  ["BR", "Бразилия"],
];

const TOPICS: Record<string, [string, string][]> = {
  RU: [
    ["Новости", "новости"],
    ["История", "история"],
    ["Технологии", "технологии"],
    ["Наука", "наука"],
    ["Юмор", "юмор"],
    ["Музыка", "музыка"],
    ["Бизнес", "бизнес"],
    ["Книги", "аудиокниги"],
    ["Кино", "кино"],
    ["Психология", "психология"],
  ],
  DEFAULT: [
    ["Новости", "news"],
    ["История", "history"],
    ["Технологии", "technology"],
    ["Наука", "science"],
    ["Комедия", "comedy"],
    ["Музыка", "music"],
    ["Бизнес", "business"],
    ["True crime", "true crime"],
    ["Истории", "storytelling"],
  ],
};

function Art({ show, size }: { show: Pick<Show, "name" | "art">; size: number | "fill" }) {
  const [bad, setBad] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-2" style={size === "fill" ? { width: "100%", aspectRatio: "1" } : { width: size, height: size }}>
      {show.art && !bad ? (
        <img src={show.art} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} className="h-full w-full object-cover" />
      ) : (
        <Cover s={{ name: show.name, kind: "vod", icon: "g:podcast" }} size="fill" className="rounded-xl" />
      )}
    </div>
  );
}

const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric" }) : "");

/* ------------------------------------------ строка серии ------------------------------------------ */

function EpisodeRow({
  e,
  showShow,
  selecting,
  selected,
  onToggle,
  onPlay,
}: {
  e: Episode;
  showShow?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onPlay: () => void;
}) {
  const p = usePlayer();
  const cur = p.station?.id === e.id;
  const playing = cur && (p.status === "playing" || p.status === "buffering" || p.status === "loading");
  const meta = [showShow ? e.showName : "", fmtDate(e.date), e.minutes ? `${e.minutes} мин` : ""].filter(Boolean).join(" · ");
  return (
    <li className={cn("flex gap-3 rounded-xl p-2 transition hover:bg-surface-2", cur && "bg-accent/10", selected && "bg-accent/10")}>
      {selecting ? (
        <button onClick={onToggle} aria-pressed={selected} aria-label="Выбрать серию" className={cn("mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition", selected ? "border-accent bg-accent text-accent-ink" : "border-line text-transparent")}>
          <Check size={16} strokeWidth={3} />
        </button>
      ) : (
        <button onClick={onPlay} aria-label={playing ? "Пауза" : `Слушать «${e.name}»`} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition hover:opacity-85 active:scale-95">
          {p.status === "loading" && cur ? <Loader2 size={16} className="animate-spin" /> : playing ? <Pause size={15} className="fill-current" /> : <Play size={15} className="ml-0.5 fill-current" />}
        </button>
      )}
      <button onClick={selecting ? onToggle : onPlay} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className={cn("line-clamp-2 text-sm font-semibold leading-snug", cur && "text-accent")}>{e.name}</span>
          {playing && p.status === "playing" && <Equalizer active className="h-3 shrink-0 text-accent" />}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{meta}</span>
        {e.description && <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted/90">{e.description}</span>}
      </button>
      {!selecting && (
        <button onClick={() => openPicker({ items: [episodeToItem(e)], suggest: e.showName })} className="mt-1 h-9 w-9 shrink-0 rounded-full text-muted transition hover:bg-bg hover:text-ink" aria-label="Добавить в плейлист" title="Добавить в плейлист">
          <ListPlus size={18} className="mx-auto" />
        </button>
      )}
    </li>
  );
}

/* ------------------------------------------- страница подкаста ------------------------------------------- */

function ShowPanel({ show, country, onClose }: { show: Show; country: string; onClose: () => void }) {
  const lists = usePlaylists();
  const [eps, setEps] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<"new" | "old">("new");
  const [q, setQ] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(25);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setErr(null);
    setEps([]);
    showEpisodes(show, country, c.signal)
      .then((r) => {
        if (c.signal.aborted) return;
        setEps(r);
        if (!r.length) setErr("У этого подкаста нет серий с прямой ссылкой на аудио.");
      })
      .catch((e) => !c.signal.aborted && setErr(e instanceof Error ? e.message : "Не удалось загрузить серии"))
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
  }, [show, country]);

  const following = lists?.find((l) => l.follow?.showId === show.id);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const r = n ? eps.filter((e) => e.name.toLowerCase().includes(n) || e.description.toLowerCase().includes(n)) : eps;
    return order === "old" ? [...r].reverse() : r;
  }, [eps, q, order]);

  const subscribe = async () => {
    const take = count === 0 ? eps.length : count;
    const items = eps.slice(0, take).map(episodeToItem);
    const pl = await createPlaylist(show.name, items, {
      desc: show.artist,
      cover: show.art,
      follow: { showId: show.id, country, name: show.name, artist: show.artist, art: show.art, genre: show.genre, checkedAt: Date.now() },
    });
    toast(`Вы подписались: плейлист «${pl.name}», серий — ${items.length}. Новые будут добавляться сами`, "ok", { label: "Открыть", run: () => gotoPlaylist(pl.id) });
  };

  const refresh = async () => {
    if (!following) return;
    setRefreshing(true);
    try {
      const n = await refreshFollow(following);
      toast(n ? `Новых серий: ${n}` : "Новых серий пока нет", n ? "ok" : "info");
    } catch {
      toast("Не удалось проверить: нет связи с каталогом", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const addSelected = () => {
    const items = eps.filter((e) => sel.has(e.id)).map(episodeToItem);
    openPicker({ items, suggest: show.name, cover: show.art });
    setSelecting(false);
    setSel(new Set());
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      mobile="page"
      footer={
        selecting ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm text-muted">Выбрано: {sel.size}</span>
            <button className={btnGhost} onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((e) => e.id)))}>
              {sel.size === list.length ? "Снять всё" : `Выбрать все (${list.length})`}
            </button>
            <button
              className={btnGhost}
              onClick={() => {
                setSelecting(false);
                setSel(new Set());
              }}
            >
              Отмена
            </button>
            <button className={btnPrimary} disabled={!sel.size} onClick={addSelected}>
              <ListPlus size={17} /> В плейлист ({sel.size})
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnPrimary} disabled={!list.length} onClick={() => void playEpisodes(list, 0)}>
              <Play size={17} className="ml-0.5 fill-current" /> Слушать подряд
            </button>
            <button className={btnGhost} disabled={!eps.length} onClick={() => setSelecting(true)}>
              <Check size={16} /> Выбрать серии
            </button>
            <button className={btnGhost} disabled={!eps.length} onClick={() => openPicker({ items: eps.slice(0, 10).map(episodeToItem), suggest: show.name, cover: show.art })}>
              <Plus size={16} /> Последние 10
            </button>
          </div>
        )
      }
    >
      <div className="relative">
        <div className="flex gap-4 bg-surface-2 p-5 pr-14">
          <Art show={show} size={104} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold leading-tight tracking-tight md:text-2xl">{show.name}</h2>
            <p className="mt-1 truncate text-sm text-muted">{show.artist}</p>
            <p className="text-xs text-muted">{[show.genre, show.episodes ? `${show.episodes} серий` : "", eps.length ? `загружено ${eps.length}` : ""].filter(Boolean).join(" · ")}</p>
            {!loading && eps.length > 0 && eps[0].date && <p className="mt-1 text-xs text-muted">Последняя серия: {fmtDate(eps[0].date)}</p>}
          </div>
        </div>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/45 p-2 text-white backdrop-blur transition hover:bg-black/65" aria-label="Закрыть">
          <X size={18} />
        </button>
      </div>

      <div className="border-b border-line p-4">
        {following ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ok/10 p-3 text-sm">
            <Rss size={17} className="shrink-0 text-ok" />
            <span className="min-w-0 flex-1 font-semibold text-ok">Вы подписаны · в плейлисте {following.items.length} серий</span>
            <button className={btnGhost + " !py-1.5 text-sm"} onClick={() => gotoPlaylist(following.id)}>
              Открыть плейлист
            </button>
            <button className={btnGhost + " !py-1.5 text-sm"} disabled={refreshing} onClick={() => void refresh()}>
              {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Новые
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold">Подписаться на подкаст</div>
              <div className="text-xs text-muted">Создадим плейлист и будем сами добавлять в него новые серии.</div>
            </div>
            <Seg
              label="Сколько серий взять"
              value={count}
              options={[
                [10, "10"],
                [25, "25"],
                [50, "50"],
                [0, "Все"],
              ]}
              onChange={setCount}
            />
            <button className={btnPrimary + " !py-2"} disabled={!eps.length} onClick={() => void subscribe()}>
              <Rss size={16} /> Подписаться
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className={cn(inputCls, "!py-2 pl-10")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти серию по названию или описанию" aria-label="Найти серию" />
          </div>
          <button className={btnGhost + " !py-2"} onClick={() => setOrder(order === "new" ? "old" : "new")}>
            <ArrowDownUp size={15} /> {order === "new" ? "Сначала новые" : "Сначала старые"}
          </button>
        </div>
      </div>

      <div className="p-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
            <Loader2 size={18} className="animate-spin" /> Загружаем серии…
          </div>
        )}
        {err && !loading && <div className="m-2 rounded-xl bg-bad/10 p-4 text-sm text-bad">{err}</div>}
        {!loading && !err && list.length === 0 && <div className="py-10 text-center text-sm text-muted">Ничего не найдено.</div>}
        <ul>
          {list.map((e, i) => (
            <EpisodeRow key={e.id} e={e} selecting={selecting} selected={sel.has(e.id)} onToggle={() => toggle(e.id)} onPlay={() => void playEpisodes(list, i)} />
          ))}
        </ul>
        {!loading && list.length > 0 && <p className="px-2 pb-1 pt-3 text-xs text-muted">Показаны {list.length} серий{eps.length >= 200 ? " (каталог отдаёт не больше 200 последних)" : ""}. Общая длительность — {fmtDuration(list.reduce((a, e) => a + e.seconds, 0), true)}.</p>}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------- раздел ----------------------------------------------- */

export function Podcasts({ online }: { online: boolean }) {
  const region = useMemo(() => userRegion(), []);
  const lists = usePlaylists();
  const [country, setCountry] = useState(() => (COUNTRIES.some(([c]) => c === region) ? region : "US"));
  const [mode, setMode] = useState<"shows" | "episodes">("shows");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [shows, setShows] = useState<Show[]>([]);
  const [eps, setEps] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Show | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 450);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!online) return;
    if (mode === "episodes" && !dq) {
      setEps([]);
      return;
    }
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setLoading(true);
    setError(null);
    const run = mode === "shows" ? searchPodcasts(dq || (country === "RU" ? "подкасты" : "podcast"), country, c.signal).then((r) => !c.signal.aborted && setShows(r)) : searchEpisodes(dq, country, c.signal).then((r) => !c.signal.aborted && setEps(r));
    run.catch((e) => !c.signal.aborted && setError(e instanceof Error ? e.message : "Не удалось загрузить")).finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
  }, [dq, country, online, mode]);

  const follows = (lists ?? []).filter((l) => l.follow);
  const topics = TOPICS[country] ?? TOPICS.DEFAULT;

  if (!online)
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center">
        <WifiOff size={32} className="mx-auto text-muted" />
        <p className="mt-3 font-display text-lg font-semibold">Поиск подкастов недоступен без сети</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Скачанные серии и ваши плейлисты работают офлайн — они в разделе «Плейлисты».</p>
      </div>
    );

  return (
    <div className="space-y-5">
      {follows.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 px-1 font-display text-lg font-semibold">
            <Rss size={17} className="text-accent" /> Мои подписки
          </h2>
          <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {follows.map((l) => (
              <li key={l.id} className="shrink-0">
                <button onClick={() => gotoPlaylist(l.id)} className="flex w-60 items-center gap-3 rounded-xl border border-line bg-surface p-2 text-left transition hover:border-ink/30">
                  <Art show={{ name: l.name, art: l.follow!.art }} size={48} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{l.name}</span>
                    <span className="block text-xs text-muted">{l.items.length} серий в плейлисте</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs leading-relaxed text-muted">Каталог Apple Podcasts. Откройте подкаст, чтобы послушать серии подряд, выбрать нужные в плейлист или подписаться: новые серии будут добавляться сами.</p>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative min-w-[200px] flex-1">
            <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input data-search className={cn(inputCls, "pl-10 pr-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "shows" ? "Название подкаста или тема" : "Тема или название серии"} />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить">
                <X size={16} />
              </button>
            )}
          </div>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={cn(inputCls, "w-auto cursor-pointer")} aria-label="Страна магазина">
            {COUNTRIES.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-[auto_minmax(13rem,1fr)]">
          <Seg
            label="Что искать"
            value={mode}
            options={[
              ["shows", "Подкасты"],
              ["episodes", "Серии"],
            ]}
            onChange={setMode}
          />
          <label className="relative block min-w-0">
            <Tags size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <select
              value={topics.some(([, term]) => term === q) ? q : ""}
              onChange={(e) => setQ(e.target.value)}
              className={cn(inputCls, "cursor-pointer !py-2 pl-10")}
              aria-label="Категория подкастов"
            >
              <option value="">Категория: любая</option>
              {topics.map(([label, term]) => (
                <option key={term} value={term}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          </div>
      </div>

      {error && <div className="rounded-xl bg-bad/10 p-4 text-sm text-bad">Не удалось связаться с каталогом: {error}</div>}

      {mode === "shows" ? (
        loading && !shows.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square rounded-xl bg-surface-2" />
                <div className="mt-2 h-3.5 w-3/4 rounded bg-surface-2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {shows.map((s) => {
              const sub = follows.some((l) => l.follow?.showId === s.id);
              return (
                <button key={s.id} onClick={() => setOpen(s)} className="group text-left">
                  <div className="relative transition group-hover:brightness-110">
                    <Art show={s} size="fill" />
                    {sub && (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                        <Rss size={11} /> подписка
                      </span>
                    )}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm font-semibold leading-tight">{s.name}</div>
                  <div className="truncate text-xs text-muted">{s.artist}</div>
                </button>
              );
            })}
            {!loading && !error && shows.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Ничего не найдено. Попробуйте другой запрос или страну.</div>}
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-1.5">
          {!dq && <div className="p-8 text-center text-sm text-muted">Введите тему или название серии — поиск идёт по отдельным выпускам всех подкастов.</div>}
          {loading && <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted"><Loader2 size={17} className="animate-spin" /> Ищем серии…</div>}
          <ul>
            {eps.map((e, i) => (
              <EpisodeRow key={e.id} e={e} showShow onPlay={() => void playEpisodes(eps, i)} />
            ))}
          </ul>
          {dq && !loading && !error && eps.length === 0 && <div className="p-8 text-center text-sm text-muted">Серий не найдено.</div>}
        </div>
      )}

      {open && <ShowPanel show={open} country={country} onClose={() => setOpen(null)} />}
    </div>
  );
}
