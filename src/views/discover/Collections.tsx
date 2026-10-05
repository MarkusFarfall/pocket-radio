import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Disc3, Download, FileAudio, ListMusic, ListPlus, Loader2, Pause, Play, Search as SearchIcon, ShieldAlert, Shuffle, WifiOff, X } from "lucide-react";
import type { PlaylistItem } from "../../lib/types";
import type { ViewProps } from "../shared";
import { ARCHIVE_GENRES, COLLECTIONS, COLLECTION_GROUPS, albumTracks, findArchiveGenre, inspectAlbum, searchAlbums, searchTextAlbums, textQuery, type Album, type AlbumSearchScope, type ArchiveGenre } from "../../lib/archive";
import { GLYPHS } from "../../lib/glyphs";
import { createPlaylist, downloadItems, itemStationId, itemToStation } from "../../lib/playlists";
import { gotoPlaylist, openPicker } from "../../lib/picker";
import { player, usePlayer, type PlayerSourceContext } from "../../lib/player";
import { fmtClock } from "../../lib/templates";
import { toast } from "../../lib/toast";
import { cn } from "../../utils/cn";
import { Cover, Equalizer, Modal, btnGhost, btnPrimary, inputCls } from "../../components/ui";

const fmtNum = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const QUICK_OFFLINE_SEARCHES = {
  artist: [
    { query: "a-ha", label: "a-ha" },
    { query: "Кино", label: "Кино" },
    { query: "Михаил Круг", label: "Михаил Круг" },
    { query: "Talk Talk", label: "Talk Talk" },
  ],
  all: [
    { query: "джаз", label: "Джаз" },
    { query: "классика", label: "Классика" },
    { query: "эмбиент", label: "Эмбиент" },
    { query: "рок", label: "Рок" },
  ],
};

function AlbumCover({ album, size }: { album: Pick<Album, "title" | "thumb" | "cover">; size: number }) {
  return <Cover s={{ name: album.title, logo: album.cover, kind: "vod", genre: "Музыка", icon: "g:music" }} size={size} className="rounded-lg" eager fit="cover" />;
}

/** Строка результата сама выясняет, это один трек или настоящий сборник. */
function AlbumRow({ album, onOpen }: { album: Album; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [info, setInfo] = useState<{ count: number; cover?: string } | null>(album.trackCount !== undefined ? { count: album.trackCount, cover: album.cover } : null);

  useEffect(() => {
    if (info !== null) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void inspectAlbum(album.id)
          .then((n) => !cancelled && setInfo(n))
          .catch(() => !cancelled && setInfo({ count: 0 }));
      },
      { rootMargin: "180px" }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [album.id, info]);

  return (
    <button ref={ref} onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2">
      <AlbumCover album={{ ...album, cover: info?.cover }} size={48} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{album.title}</span>
        <span className="block truncate text-xs text-muted">
          {[album.creator, album.year].filter(Boolean).join(" · ") || "Автор не указан"}
          {album.match === "title" && <span className="text-accent"> · совпало в названии</span>}
          {album.match === "subject" && <span className="text-accent"> · совпало в темах</span>}
        </span>
      </span>
      <span className="shrink-0 sm:min-w-[7.5rem]">
        {info === null ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" /> <span className="hidden sm:inline">Смотрим состав</span>
          </span>
        ) : info.count <= 1 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold text-muted">
            <FileAudio size={12} /> <span className="hidden sm:inline">{info.count ? "1 трек" : "нет аудио"}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
            <ListMusic size={12} /> <span className="sm:hidden">{info.count}</span><span className="hidden sm:inline">сборник · {info.count}</span>
          </span>
        )}
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-xs text-muted md:inline-flex">
        <Download size={12} /> {fmtNum(album.downloads)}
      </span>
    </button>
  );
}

function CollectionCard({ c, onClick }: { c: (typeof COLLECTIONS)[number]; onClick: () => void }) {
  const G = GLYPHS[c.glyph]?.icon ?? GLYPHS.music.icon;
  return (
    <button
      onClick={onClick}
      className="motion-card group relative flex min-h-[11.5rem] flex-col overflow-hidden rounded-2xl p-4 text-left text-white transition sm:min-h-[12rem]"
      style={{ background: `linear-gradient(140deg, hsl(${c.hue} 48% 38%), hsl(${(c.hue + 30) % 360} 52% 18%))` }}
    >
      <G size={70} className="pointer-events-none absolute -bottom-4 -right-3 opacity-20 transition group-hover:scale-110" strokeWidth={1.35} />
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25 backdrop-blur">
        <G size={18} />
      </span>
      <span className="relative mt-auto block line-clamp-2 font-display text-[1.05rem] font-semibold leading-[1.15] sm:text-lg">{c.title}</span>
      <span className="relative mt-1 line-clamp-2 block text-xs leading-relaxed text-white/75">{c.desc}</span>
    </button>
  );
}

/* ------------------------------------------- страница альбома ------------------------------------------- */

function AlbumPanel({ album, onClose, onPlay }: { album: Album; onClose: () => void; onPlay: ViewProps["onPlay"] }) {
  const p = usePlayer();
  const [data, setData] = useState<{ title: string; creator: string; cover?: string; tracks: PlaylistItem[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(180);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setErr(null);
    albumTracks(album.id, c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        setData(d);
        setSel(new Set());
        if (!d.tracks.length) setErr("В этом сборнике нет аудиофайлов, которые можно воспроизвести.");
      })
      .catch((e) => !c.signal.aborted && setErr(e instanceof Error ? e.message : "Не удалось загрузить сборник"));
    return () => c.abort();
  }, [album.id]);

  useEffect(() => () => player.clearSourceContext({ kind: "album", title: album.title }), [album.id, album.title]);

  const tracks = data?.tracks ?? [];
  const visibleTracks = tracks.slice(0, visibleCount);
  const chosen = tracks.filter((t) => sel.has(t.id));
  const allOn = tracks.length > 0 && sel.size === tracks.length;
  useEffect(() => setVisibleCount(180), [album.id]);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || visibleCount >= tracks.length) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisibleCount((n) => Math.min(tracks.length, n + 180)), { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, tracks.length]);

  const bytes = chosen.reduce((a, t) => a + (t.size ?? 0), 0);

  const play = (idx: number) => {
    const t = tracks[idx];
    if (!t) return;
    const st = tracks.map((x) => itemToStation(x));
    const queue = st.map((s) => s.id);
    const sourceContext: PlayerSourceContext = { kind: "album", title: album.title };
    player.pin(st);
    onPlay(st[idx], queue, sourceContext);
  };

  const addAll = () => openPicker({ items: tracks, suggest: data?.title || album.title, cover: data?.cover });

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const saveOffline = async () => {
    const pl = await createPlaylist(data?.title || album.title, chosen, { desc: data?.creator || album.creator, cover: data?.cover });
    toast(`Плейлист «${pl.name}» создан. Треки скачиваются в фоне`, "ok", { label: "Открыть", run: () => gotoPlaylist(pl.id) });
    void downloadItems(pl.id, chosen, pl.name);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      mobile="page"
      footer={
        selecting ? <div className="w-full">
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span>Выбрано: {sel.size}</span>
            {bytes > 0 && <span>≈ {(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} МБ</span>}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button className={btnPrimary + " w-full"} disabled={!chosen.length} onClick={() => openPicker({ items: chosen, suggest: data?.title || album.title, cover: data?.cover })}>
            <ListPlus size={17} /> Добавить в плейлист
          </button>
          <button className={btnGhost + " w-full"} disabled={!chosen.length} onClick={() => void saveOffline()}>
            <Download size={17} /> Создать и скачать
          </button>
          </div>
        </div> : undefined
      }
    >
      <section className="album-hero relative overflow-hidden border-b border-line px-5 pb-6 pt-4 md:px-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,color-mix(in_srgb,var(--accent)_24%,transparent),transparent_55%)]" />
        <div className="relative flex items-center justify-between">
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/75 text-ink shadow-sm backdrop-blur" aria-label="Назад"><ArrowLeft size={20} /></button>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Альбом</span>
          <span className="h-10 w-10" />
        </div>
        <div className="relative mx-auto mt-4 aspect-square w-[min(48vw,180px)] md:ml-0 md:mr-0 md:w-48">
          <Cover s={{ name: data?.title || album.title, logo: data ? data.cover : album.thumb, kind: "vod", icon: "g:music" }} size="fill" className="rounded-2xl shadow-2xl" eager fit="cover" />
        </div>
        <div className="relative mt-5 md:absolute md:bottom-7 md:left-[15rem] md:right-8 md:mt-0">
          <h2 className="line-clamp-2 font-display text-2xl font-bold leading-[1.1] tracking-tight md:text-3xl">{data?.title ?? album.title}</h2>
          <p className="mt-1 line-clamp-1 text-sm text-muted">{data?.creator || album.creator || "Исполнитель не указан"}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1 rounded-md bg-surface/80 px-2 py-1 font-semibold text-ink backdrop-blur">
              {tracks.length === 1 ? <FileAudio size={12} /> : <ListMusic size={12} />}
              {tracks.length === 1 ? "1 запись" : tracks.length ? `${tracks.length} треков` : "Загружаем"}
            </span>
            {[album.year, `${fmtNum(album.downloads)} скачиваний`].filter(Boolean).join(" · ")}
          </p>
          {tracks.length > 0 && <div className="mt-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => play(0)} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-ink shadow-lg shadow-accent/20"><Play size={17} className="fill-current" /> Слушать</button>
              <button onClick={addAll} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line"><ListPlus size={17} /> Добавить альбом</button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => play(Math.floor(Math.random() * tracks.length))} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-muted transition hover:bg-surface hover:text-ink"><Shuffle size={15} /> Перемешать</button>
              <button onClick={() => setSelecting(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-muted transition hover:bg-surface hover:text-ink"><Check size={15} /> Выбрать треки</button>
            </div>
          </div>}
        </div>
      </section>

      {selecting && tracks.length > 0 && <div className="sticky top-0 z-[9] flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 text-sm backdrop-blur-xl">
        <button className="font-semibold text-accent" onClick={() => setSel(allOn ? new Set() : new Set(tracks.map((t) => t.id)))}>{allOn ? "Снять всё" : "Выбрать всё"}</button>
        <button className="font-semibold text-muted" onClick={() => { setSelecting(false); setSel(new Set()); }}>Готово</button>
      </div>}

      <div className="p-2">
        {!data && !err && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
            <Loader2 size={18} className="animate-spin" /> Загружаем список треков…
          </div>
        )}
        {err && <div className="m-2 rounded-xl bg-bad/10 p-4 text-sm text-bad">{err}</div>}
        <ul>
          {visibleTracks.map((t, i) => {
            const cur = p.station?.id === itemStationId(t.id);
            const playing = cur && (p.status === "playing" || p.status === "buffering" || p.status === "loading");
            const on = sel.has(t.id);
            return (
              <li key={t.id} className={cn("group flex items-center gap-2 rounded-xl p-1.5 pr-3 transition hover:bg-surface-2", cur && "bg-accent/10")}>
                {selecting ? <button onClick={() => toggle(t.id)} aria-pressed={on} aria-label="Выбрать трек" className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-accent bg-accent text-accent-ink" : "border-line text-transparent")}><Check size={13} strokeWidth={3} /></button> : <span className="w-6 shrink-0 text-center font-mono text-xs text-muted">{i + 1}</span>}
                <button onClick={() => play(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Включить «${t.title}»`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-bg">{playing ? <Pause size={14} className="fill-current" /> : <Play size={14} className="ml-0.5 fill-current" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("flex items-center gap-2 truncate text-sm font-semibold", cur && "text-accent")}>
                      <span className="truncate">{t.title}</span>
                      {playing && p.status === "playing" && <Equalizer active className="h-3 shrink-0 text-accent" />}
                    </span>
                    {t.subtitle && <span className="block truncate text-xs text-muted">{t.subtitle}</span>}
                  </span>
                </button>
                {t.duration ? <span className="shrink-0 font-mono text-xs text-muted">{fmtClock(t.duration)}</span> : null}
              </li>
            );
          })}
        </ul>
        {visibleCount < tracks.length && (
          <div ref={moreRef} className="py-3 text-center">
            <button className={btnGhost + " !py-2"} onClick={() => setVisibleCount((n) => Math.min(tracks.length, n + 180))}>
              Показать ещё · {visibleTracks.length} из {tracks.length}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------- раздел ----------------------------------------------- */

interface Active {
  title: string;
  query: string;
  text?: string;
  scope?: AlbumSearchScope;
  genre?: ArchiveGenre;
}

export function Collections({ online, onPlay }: { online: boolean; onPlay: ViewProps["onPlay"] }) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState<AlbumSearchScope>("artist");
  const [active, setActive] = useState<Active | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Album | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const load = useCallback(async (a: Active, pg: number) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setLoading(true);
    setError(null);
    try {
      const r = a.genre
        ? await searchAlbums(a.genre.query, pg, c.signal)
        : a.text !== undefined && a.scope
          ? await searchTextAlbums(a.text, a.scope, pg, c.signal)
          : await searchAlbums(a.query, pg, c.signal);
      if (c.signal.aborted) return;
      setAlbums((prev) => (pg === 1 ? r.albums : [...prev, ...r.albums.filter((x) => !prev.some((p) => p.id === x.id))]));
      setMore(r.hasMore);
      setPage(pg);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить");
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active || !online) return;
    setAlbums([]);
    void load(active, 1);
    return () => ctl.current?.abort();
  }, [active, online, load]);

  const submit = (rawText = text, requestedScope = scope, exactScope = false) => {
    const value = rawText.trim();
    const genre = exactScope ? undefined : findArchiveGenre(value);
    const searchScope: AlbumSearchScope = genre ? "all" : requestedScope;
    const query = genre?.query ?? textQuery(value, searchScope);
    if (query) {
      if (genre) setScope("all");
      setActive({
        title: genre ? `Жанр: ${genre.label}` : `«${value}»`,
        query,
        text: value,
        scope: searchScope,
        genre,
      });
    }
  };

  const broadenSearch = () => {
    if (!active?.text) return;
    const genre = findArchiveGenre(active.text);
    const query = genre?.query ?? textQuery(active.text, "all");
    setScope("all");
    setActive({ ...active, title: genre ? `Жанр: ${genre.label}` : active.title, query, scope: "all", genre });
  };

  const switchScope = (nextScope: AlbumSearchScope) => {
    setScope(nextScope);
    if (active?.text) submit(text.trim() || active.text, nextScope, nextScope === "artist");
  };

  const clearSearch = () => {
    setText("");
    setScope("artist");
    setActive(null);
    setAlbums([]);
    setError(null);
    setMore(false);
  };

  if (!online)
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center">
        <WifiOff size={32} className="mx-auto text-muted" />
        <p className="mt-3 font-display text-lg font-semibold">Каталог музыки недоступен без сети</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Уже скачанные песни и свои файлы лежат в разделе «Плейлисты» и играют офлайн.</p>
      </div>
    );

  const search = (
    <div className="space-y-2.5">
      <div role="group" aria-label="Тип поиска" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        <button
          type="button"
          aria-pressed={scope === "artist"}
          onClick={() => switchScope("artist")}
          className={cn("min-h-9 rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:text-sm", scope === "artist" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
        >
          По исполнителю
        </button>
        <button
          type="button"
          aria-pressed={scope === "all"}
          onClick={() => switchScope("all")}
          className={cn("min-h-9 rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:text-sm", scope === "all" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
        >
          По названию / жанру
        </button>
      </div>
      <form
        role="search"
        aria-label="Поиск музыки офлайн"
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            data-search
            type="search"
            aria-label="Запрос для поиска офлайн-музыки"
            autoComplete="off"
            list="offline-music-search-suggestions"
            maxLength={100}
            className={cn(inputCls, "pl-10 pr-9")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={scope === "artist" ? "Например: Кино, Михаил Круг, a-ha" : "Название альбома, песни или жанр"}
          />
          {text && (
            <button type="button" onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить запрос">
              <X size={16} />
            </button>
          )}
          <datalist id="offline-music-search-suggestions">
            {[...QUICK_OFFLINE_SEARCHES[scope], ...(scope === "artist" ? ARCHIVE_GENRES.map((genre) => ({ query: genre.label, label: genre.label })) : [])].map((suggestion) => (
              <option key={suggestion.query} value={suggestion.query} />
            ))}
          </datalist>
        </div>
        <button type="submit" className={btnPrimary} disabled={!textQuery(text, scope)}>
          <SearchIcon size={16} /> Найти
        </button>
      </form>
      <p className="text-xs leading-relaxed text-muted">
        {scope === "artist"
          ? "Ищем исполнителя; если данных мало — проверяем названия. Жанр можно написать по-русски или выбрать ниже."
          : "Ищем точную фразу в исполнителях, названиях и жанровых темах. Русские названия жанров тоже понимаем."}
      </p>
      <div role="group" className="flex flex-wrap items-center gap-1.5" aria-label="Популярные запросы">
        <span className="mr-0.5 text-xs text-muted">{scope === "artist" ? "Исполнители:" : "Жанры:"}</span>
        {QUICK_OFFLINE_SEARCHES[scope].map((suggestion) => (
          <button
            key={suggestion.query}
            type="button"
            aria-label={`Быстрый поиск: ${suggestion.label}`}
            onClick={() => {
              setText(suggestion.query);
              submit(suggestion.query, scope, scope === "artist");
            }}
            className="rounded-full border border-line bg-bg px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-accent/40 hover:text-accent"
          >
            {suggestion.label}
          </button>
        ))}
        <select
          aria-label="Выбрать жанр"
          defaultValue=""
          onChange={(event) => {
            const genre = ARCHIVE_GENRES.find((item) => item.id === event.currentTarget.value);
            if (!genre) return;
            setScope("all");
            setText(genre.label);
            submit(genre.label, "all");
            event.currentTarget.value = "";
          }}
          className="max-w-[9rem] rounded-full border border-line bg-bg px-2.5 py-1 text-xs font-semibold text-accent outline-none transition focus:border-accent/40"
        >
          <option value="">{scope === "artist" ? "Выбрать жанр…" : "Ещё жанры…"}</option>
          {ARCHIVE_GENRES.map((genre) => <option key={genre.id} value={genre.id}>{genre.label}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm leading-relaxed">
          <b>Песни для прослушивания без интернета.</b> Найдите сборник в Internet Archive, послушайте и нажмите «Скачать для офлайна»: песни сохранятся на устройстве в плейлист и будут играть без сети.
        </p>
        {search}
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          Internet Archive — открытая библиотека, записи загружают пользователи. Права на музыку принадлежат правообладателям: сохраняйте то, что вам разрешено. Среди результатов могут попадаться записи 18+.
        </p>
      </div>

      {!active ? (
        <>
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">Коллекции</h2>
              <p className="mt-0.5 text-xs text-muted">Откройте карточку — внутри могут быть один трек или целый сборник. Тип станет виден в результатах.</p>
            </div>
            <span className="hidden items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold text-muted sm:inline-flex">
              <Disc3 size={13} /> {COLLECTIONS.length} тем
            </span>
          </div>
          {COLLECTION_GROUPS.map((group) => {
            const cards = COLLECTIONS.filter((c) => c.group === group.id);
            return (
              <section key={group.id} className="space-y-3">
                <div className="px-1">
                  <h3 className="font-display text-lg font-semibold">{group.title}</h3>
                  <p className="text-xs text-muted">{group.desc}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  {cards.map((c) => (
                    <CollectionCard key={c.id} c={c} onClick={() => setActive({ title: c.title, query: c.query })} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={clearSearch}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted transition hover:text-ink"
            >
              <ArrowLeft size={17} /> Коллекции
            </button>
            <h2 className="min-w-0 truncate font-display text-xl font-semibold tracking-tight">{active.title}</h2>
          </div>
          <p role="status" aria-live="polite" className="px-1 text-xs text-muted">
            {loading ? "Ищем в Internet Archive…" : `Показано записей: ${albums.length}${more ? "+" : ""}`}
          </p>

          {error && (
            <div className="flex items-center gap-3 rounded-xl bg-bad/10 p-4 text-sm text-bad">
              <span className="flex-1">Не удалось связаться с архивом: {error}</span>
              <button className="shrink-0 font-semibold underline" onClick={() => void load(active, 1)}>
                Повторить
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-surface p-1.5">
            {loading &&
              !albums.length &&
              Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 p-2">
                  <div className="h-[46px] w-[46px] rounded-lg bg-surface-2" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 rounded bg-surface-2" />
                    <div className="h-3 w-1/3 rounded bg-surface-2" />
                  </div>
                </div>
              ))}
            {albums.map((a) => (
              <AlbumRow key={a.id} album={a} onOpen={() => setOpen(a)} />
            ))}
            {!loading && !error && albums.length === 0 && (
              <div className="p-10 text-center text-sm text-muted">
                {active.genre ? (
                  <p>В жанре «{active.genre.label}» пока ничего не найдено. Выберите другой жанр или измените запрос выше.</p>
                ) : active.text && active.scope === "artist" ? (
                  <>
                    <p>Исполнителя не нашли. Проверьте написание или попробуйте режим «По названию / жанру».</p>
                    <button className="mt-2 font-semibold text-accent underline underline-offset-2" onClick={broadenSearch}>
                      Искать везде
                    </button>
                  </>
                ) : active.text ? (
                  <p>Ничего не найдено по запросу «{active.text}». Попробуйте другой жанр или поменяйте слова.</p>
                ) : (
                  "Ничего не найдено. Попробуйте другую коллекцию."
                )}
              </div>
            )}
          </div>

          {more && albums.length > 0 && (
            <div className="text-center">
              <button className={btnGhost} disabled={loading} onClick={() => void load(active, page + 1)}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null} Показать ещё
              </button>
            </div>
          )}
        </>
      )}

      {open && <AlbumPanel album={open} onClose={() => setOpen(null)} onPlay={onPlay} />}
    </div>
  );
}
