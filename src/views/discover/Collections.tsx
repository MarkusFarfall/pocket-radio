import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Disc3, Download, ExternalLink, FileAudio, Library, ListMusic, ListPlus, Loader2, Pause, Play, RefreshCw, Search as SearchIcon, ShieldAlert, Shuffle, WifiOff, X } from "lucide-react";
import type { ViewProps } from "../shared";
import { ARCHIVE_GENRES, COLLECTIONS, COLLECTION_GROUPS, albumTracks, findArchiveGenre, inspectAlbum, searchAlbums, searchTextAlbums, textQuery, type Album, type AlbumSearchScope, type AlbumContents, type AlbumInspection, type ArchiveGenre } from "../../lib/archive";
import { searchOpenverseTracks } from "../../lib/openverse";
import { searchCommonsTracks } from "../../lib/commons";
import { searchAudiusTracks } from "../../lib/audius";
import { genreSearchTerm, type DiscoveredMusicTrack, type DiscoveredMusicProvider } from "../../lib/discoveredMusic";
import { GLYPHS } from "../../lib/glyphs";
import { createPlaylist, downloadItems, itemStationId, itemToStation } from "../../lib/playlists";
import { gotoPlaylist, openPicker } from "../../lib/picker";
import { KIND_LABEL, kindGroup, useDiscography, type DiscographyRelease } from "../../lib/discography";
import type { PlaylistItem } from "../../lib/types";
import { useForwardState } from "../../lib/appHistory";
import { player, usePlayer, type PlayerSourceContext } from "../../lib/player";
import { fmtClock } from "../../lib/templates";
import { toast } from "../../lib/toast";
import { cn } from "../../utils/cn";
import { OfflineMusicLibrary } from "../../components/OfflineMusicLibrary";
import { DiscoveredTrackRow } from "../../components/DiscoveredTrackRow";
import { ReleasePanel } from "./ReleasePanel";
import { Cover, Equalizer, Modal, btnGhost, btnPrimary, inputCls } from "../../components/ui";

const fmtNum = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const QUICK_OFFLINE_SEARCHES = {
  artist: [
    { query: "Кино", label: "Кино" },
    { query: "Михаил Круг", label: "Михаил Круг" },
    { query: "a-ha", label: "a-ha" },
    { query: "Talk Talk", label: "Talk Talk" },
  ],
  all: [
    { query: "джаз", label: "Джаз" },
    { query: "классика", label: "Классика" },
    { query: "эмбиент", label: "Эмбиент" },
    { query: "рок", label: "Рок" },
  ],
};

function AlbumCover({ album, size }: { album: Pick<Album, "title" | "cover">; size: number }) {
  return <Cover s={{ name: album.title, logo: album.cover, kind: "vod", genre: "Музыка", icon: "g:music" }} size={size} className="rounded-lg" eager fit="cover" />;
}

/** Строка результата сама выясняет, это один трек или настоящий сборник. */
function AlbumRow({ album, onOpen }: { album: Album; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [info, setInfo] = useState<(AlbumInspection & { failed?: boolean }) | null>(album.trackCount !== undefined ? { count: album.trackCount, cover: album.cover } : null);

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
          .catch(() => !cancelled && setInfo({ count: 0, failed: true }));
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
    <button ref={ref} onClick={onOpen} data-archive-album={album.id} className="archive-album-row flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2">
      <AlbumCover album={{ ...album, cover: info?.cover || album.cover }} size={48} />
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
        ) : info.source === "cd-image" && info.count > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
            <Disc3 size={12} /> <span className="hidden sm:inline">CD-образ · {info.count}</span><span className="sm:hidden">CD · {info.count}</span>
          </span>
        ) : info.count <= 1 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold text-muted">
            <FileAudio size={12} /> <span>{info.count ? "1 трек" : info.failed ? "Не проверено" : info.issue?.label || "Нет аудио"}</span>
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
  const [data, setData] = useState<AlbumContents | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(180);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setErr(null);
    albumTracks(album.id, c.signal, album)
      .then((d) => {
        if (c.signal.aborted) return;
        setData(d);
        setSel(new Set());

      })
      .catch((e) => !c.signal.aborted && setErr(e instanceof Error ? e.message : "Не удалось загрузить сборник"));
    return () => c.abort();
  }, [album.id, retry]);

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
        <div className="album-summary">
        <div className="album-art">
          <Cover s={{ name: data?.title || album.title, logo: data?.cover || album.cover, kind: "vod", icon: "g:music" }} size="fill" className="rounded-2xl shadow-2xl" eager fit="cover" />
        </div>
        <div className="album-copy">
          <h2 className="font-display font-bold leading-tight tracking-tight">{data?.title ?? album.title}</h2>
          <p className="mt-1 line-clamp-1 text-sm text-muted">{data?.creator || album.creator || "Исполнитель не указан"}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1 rounded-md bg-surface/80 px-2 py-1 font-semibold text-ink backdrop-blur">
              {tracks.length === 1 ? <FileAudio size={12} /> : <ListMusic size={12} />}
              {tracks.length === 1 ? "1 запись" : tracks.length ? `${tracks.length} треков` : err ? "Ошибка загрузки" : data ? data.issue?.label || "Нет аудио" : "Загружаем"}
            </span>
            {[album.year, `${fmtNum(album.downloads)} скачиваний`].filter(Boolean).join(" · ")}
          </p>
        </div>
        </div>
          {tracks.length > 0 && <div className="album-actions mt-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => play(0)} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-ink shadow-lg shadow-accent/20"><Play size={17} className="fill-current" /> Слушать</button>
              <button onClick={addAll} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line"><ListPlus size={17} /> Добавить альбом</button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => play(Math.floor(Math.random() * tracks.length))} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-muted transition hover:bg-surface hover:text-ink"><Shuffle size={15} /> Перемешать</button>
              <button onClick={() => setSelecting(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-muted transition hover:bg-surface hover:text-ink"><Check size={15} /> Выбрать треки</button>
            </div>
          </div>}
      </section>

      {data?.source === "cd-image" && <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-accent/8 p-3 text-xs leading-relaxed text-muted">
        <Disc3 size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>Этот релиз хранится как аудио CD-образ. Читаю только дорожки, отмеченные в .cue как AUDIO, и запрашиваю нужный фрагмент — весь образ скачивать не нужно. Дополнительная CD+G-графика не отображается.</span>
      </div>}

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
        {err && <div role="alert" className="album-availability m-2 rounded-xl bg-bad/10 p-4 text-sm">
          <h3 className="font-semibold text-bad">Не удалось загрузить релиз</h3>
          <p className="mt-2 text-muted">{err}</p>
          <button className={btnGhost + " mt-3"} onClick={() => setRetry((n) => n + 1)}>Повторить загрузку</button>
        </div>}
        {data?.issue && <section className="album-availability m-2 rounded-xl border border-line bg-surface p-4 text-sm" aria-label="Доступность релиза">
          <h3 className="font-semibold">{data.issue.title}</h3>
          <p className="mt-2 leading-relaxed text-muted">{data.issue.detail}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className={btnPrimary} href={`https://archive.org/details/${encodeURIComponent(album.id)}`} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Открыть источник</a>
            <button className={btnGhost} onClick={onClose}>К результатам</button>
          </div>
        </section>}
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

type MusicSource = "archive" | DiscoveredMusicProvider;

interface Active {
  title: string;
  query: string;
  text?: string;
  scope?: AlbumSearchScope;
  genre?: ArchiveGenre;
  provider?: MusicSource;
}

/* ---------------------------------------- дискография исполнителя ---------------------------------------- */

function ReleaseCover({ release, size }: { release: DiscographyRelease; size: number }) {
  return <Cover s={{ name: release.title, logo: release.cover, kind: "vod", genre: "Музыка", icon: "g:music" }} size={size} className="rounded-lg" fit="cover" />;
}

const DISCOGRAPHY_GROUPS: { id: ReturnType<typeof kindGroup>; title: string }[] = [
  { id: "albums", title: "Студийные альбомы" },
  { id: "live", title: "Концерты и живые записи" },
  { id: "ep", title: "Синглы и EP" },
  { id: "collections", title: "Сборники и саундтреки" },
];

/**
 * Полная дискография из открытой базы MusicBrainz (резерв — Apple Music).
 * Каждый релиз можно сразу поискать в каталоге Internet Archive: там он либо есть, либо нет.
 */
function DiscographyPanel({
  artist,
  online,
  lookups,
  onSelect,
}: {
  artist: string;
  online: boolean;
  lookups: Record<string, { count: number; limited: boolean }>;
  onSelect: (release: DiscographyRelease, artistName: string) => void;
}) {
  const { status, data, error, cached, reload } = useDiscography(online ? artist : null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [openPanel, setOpenPanel] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches);

  if (!online) {
    return (
      <section className="discography-panel rounded-2xl border border-line bg-surface p-4 text-sm text-muted" aria-label="Дискография исполнителя">
        Дискография требует интернета: база MusicBrainz недоступна офлайн.
      </section>
    );
  }

  const releases = data?.releases ?? [];
  const groups = DISCOGRAPHY_GROUPS.map((group) => ({ ...group, items: releases.filter((release) => kindGroup(release.kind) === group.id) })).filter((group) => group.items.length);

  return (
    <section className="discography-panel rounded-2xl border border-line bg-surface" aria-label="Дискография исполнителя">
      <div className={cn("flex flex-wrap items-center gap-2 px-4 py-3", openPanel && "border-b border-line")}>
        <button
          type="button"
          onClick={() => setOpenPanel((value) => !value)}
          aria-expanded={openPanel}
          aria-label={`Дискография: ${data?.artist ?? artist}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Library size={17} className="shrink-0 text-accent" />
          <h3 className="line-clamp-2 min-w-0 flex-1 font-display text-base font-semibold tracking-tight">
            Дискография: {data?.artist ?? artist}
            {data ? <span className="ml-2 text-xs font-semibold text-muted">{releases.length} релизов</span> : null}
          </h3>
          <ChevronRight size={16} className={cn("shrink-0 text-muted transition", openPanel && "rotate-90")} />
        </button>
        {data && (
          <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold text-muted" data-discography-source>
            {data.source === "musicbrainz" ? "MusicBrainz" : "Apple Music"}
            {cached ? " · кэш" : ""}
          </span>
        )}
        <button
          type="button"
          onClick={reload}
          disabled={status === "loading"}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-50"
          aria-label="Обновить дискографию"
        >
          <RefreshCw size={14} className={status === "loading" ? "animate-spin" : undefined} /> <span className="hidden min-[420px]:inline">Обновить</span>
        </button>
      </div>

      {!openPanel && (
        <p className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-muted">
          {status === "loading" && !data
            ? "Загружаем список релизов из MusicBrainz…"
            : status === "error"
              ? `Не удалось получить дискографию: ${error}`
              : data?.source === "itunes"
                ? "Показан резервный каталог Apple Music. Нажмите, чтобы раскрыть список."
                : "Полный список релизов: нажмите на заголовок. Каждый релиз можно сразу найти в Internet Archive."}
        </p>
      )}

      {openPanel && status === "loading" && !data && (
        <div className="space-y-2 p-4" role="status" aria-live="polite">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-surface-2" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-surface-2" />
                <div className="h-3 w-1/3 rounded bg-surface-2" />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">Запрашиваем MusicBrainz (не больше одного запроса в секунду)…</p>
        </div>
      )}

      {openPanel && status === "error" && (
        <div className="flex flex-wrap items-center gap-3 p-4 text-sm text-bad">
          <span className="min-w-0 flex-1">Не удалось получить дискографию: {error}</span>
          <button type="button" onClick={reload} className="shrink-0 font-semibold underline">
            Повторить
          </button>
        </div>
      )}

      {openPanel && status === "ready" && !releases.length && (
        <p className="p-4 text-sm text-muted">{data?.artist ?? artist}: в открытой базе нет ни одного релиза. Дискография остаётся неполной.</p>
      )}

      {openPanel && !!releases.length && (
        <>
          <div className="space-y-3 p-3">
            {groups.map((group) => {
              const open = expanded.includes(group.id);
              const items = open ? group.items : group.items.slice(0, 5);
              return (
                <div key={group.id} className="discography-group">
                  <div className="flex items-center justify-between gap-2 px-1 pb-1">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted">{group.title}</h4>
                    <span className="text-xs text-muted">{group.items.length}</span>
                  </div>
                  <ul className="divide-y divide-line/60">
                    {items.map((release) => {
                      const lookup = lookups[release.id];
                      return (
                        <li key={release.id}>
                          <button
                            type="button"
                            onClick={() => onSelect(release, data?.artist ?? artist)}
                            className="discography-release flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-2"
                            aria-label={`Где слушать: ${release.title}`}
                          >
                            <ReleaseCover release={release} size={44} />
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-sm font-semibold leading-snug">{release.title}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted">
                                {[release.date.slice(0, 4), KIND_LABEL[release.kind], release.tracks ? `${release.tracks} трек.` : ""].filter(Boolean).join(" · ")}
                              </span>
                              {lookup && (
                                <span className={cn("mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold", lookup.count ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted")}>
                                  {lookup.count ? `В открытых источниках: ${lookup.count}${lookup.limited ? "+" : ""}` : "В открытых источниках не нашлось"}
                                </span>
                              )}
                            </span>
                            <ChevronRight size={16} className="shrink-0 text-muted" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {group.items.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => (open ? prev.filter((id) => id !== group.id) : [...prev, group.id]))}
                      className="mt-1 px-2 text-xs font-semibold text-accent underline underline-offset-2"
                    >
                      {open ? "Свернуть" : `Показать ещё ${group.items.length - 5}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-muted">
            Источник: MusicBrainz — открытая база метаданных{data?.source === "itunes" ? " (резерв: Apple Music)" : ", обложки — Cover Art Archive"}. База полнее Archive.org, но и она не гарантирует
            «всю дискографию»: переиздания, региональные релизы и бутлеги могут отсутствовать. Нажмите релиз, чтобы проверить его наличие в Internet Archive.
            {data?.partial ? " MusicBrainz не ответил — показан резервный каталог." : ""}
          </p>
        </>
      )}
    </section>
  );
}

function MusicDiscovery({ online, onPlay }: { online: boolean; onPlay: ViewProps["onPlay"] }) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState<AlbumSearchScope>("artist");
  const [provider, setProvider] = useState<MusicSource>("archive");
  const [active, setActive, closeActive] = useForwardState<Active | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [externalTracks, setExternalTracks] = useState<DiscoveredMusicTrack[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [limited, setLimited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Album | null>(null);
  const [lookups, setLookups] = useState<Record<string, { count: number; limited: boolean }>>({});
  const [release, setRelease] = useState<{ release: DiscographyRelease; artist: string } | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const retryPage = useRef(1);

  const load = useCallback(async (a: Active, pg: number) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    retryPage.current = pg;
    setLoading(true);
    setError(null);
    setLimited(false);
    try {
      const selectedProvider = a.provider ?? "archive";
      if (selectedProvider !== "archive") {
        const options = { text: a.text ?? a.query, scope: a.scope ?? "artist", genre: a.genre, page: pg, signal: c.signal };
        const result = selectedProvider === "audius"
          ? await searchAudiusTracks({ text: a.text ?? a.query, page: pg, signal: c.signal })
          : selectedProvider === "openverse"
            ? await searchOpenverseTracks(options)
            : await searchCommonsTracks(options);
        if (c.signal.aborted) return;
        setExternalTracks((prev) => pg === 1 ? result.tracks : [...prev, ...result.tracks.filter((track) => !prev.some((item) => item.id === track.id))]);
        setAlbums([]);
        setMore(result.hasMore);
      } else {
        const result = a.genre
          ? await searchAlbums(a.genre.query, pg, c.signal)
          : a.text !== undefined && a.scope
            ? await searchTextAlbums(a.text, a.scope, pg, c.signal)
            : await searchAlbums(a.query, pg, c.signal);
        if (c.signal.aborted) return;
        setAlbums((prev) => (pg === 1 ? result.albums : [...prev, ...result.albums.filter((album) => !prev.some((item) => item.id === album.id))]));
        setExternalTracks([]);
        setMore(result.hasMore);
        setLimited(!!result.limited);
      }
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
    setExternalTracks([]);
    setMore(false);
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
        provider,
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

  const switchProvider = (nextProvider: MusicSource) => {
    ctl.current?.abort();
    setLoading(false);
    setProvider(nextProvider);
    setActive(active?.text ? { ...active, provider: nextProvider } : null);
    setAlbums([]);
    setExternalTracks([]);
    setError(null);
    setMore(false);
  };

  const clearSearch = () => {
    ctl.current?.abort();
    setLoading(false);
    setText("");
    setScope("artist");
    closeActive(null);
    setAlbums([]);
    setExternalTracks([]);
    setError(null);
    setMore(false);
  };

  const playDiscoveredTrack = (track: DiscoveredMusicTrack) => {
    const stations = externalTracks.map((item) => itemToStation(item));
    const current = stations.find((station) => station.id === itemStationId(track.id));
    if (!current) return;
    player.pin(stations);
    onPlay(current, stations.map((station) => station.id), { kind: "collection", title: active?.title ?? track.providerName });
  };

  const playReleaseTracks = (tracks: DiscoveredMusicTrack[], track: DiscoveredMusicTrack) => {
    const stations = tracks.map((item) => itemToStation(item));
    const current = stations.find((station) => station.id === itemStationId(track.id));
    if (!current) return;
    player.pin(stations);
    onPlay(current, stations.map((station) => station.id), { kind: "collection", title: release ? `${release.artist} — ${release.release.title}` : track.providerName });
  };

  const playPlaylistItems = (items: PlaylistItem[], current: PlaylistItem) => {
    const stations = items.map((item) => itemToStation(item));
    const active = stations.find((station) => station.id === itemStationId(current.id));
    if (!active) return;
    player.pin(stations);
    // Превью слушают, листая список: полноэкранный плеер здесь только мешает.
    onPlay(active, stations.map((station) => station.id));
  };

  const addDiscoveredTrack = (track: DiscoveredMusicTrack, downloadAfterAdd: boolean) => {
    const allowed = track.canDownload !== false;
    if (downloadAfterAdd && !allowed) toast("Автор запретил скачивание этой записи — добавлено без офлайн-копии", "info");
    openPicker({ items: [track], suggest: track.title.slice(0, 70) || track.providerName, cover: track.logo, downloadAfterAdd: downloadAfterAdd && allowed });
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
    <div className="music-query-controls space-y-2.5">
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
            type="text"
            role="searchbox"
            aria-label="Запрос для поиска офлайн-музыки"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={100}
            className={cn(inputCls, "offline-search-field pl-10 pr-10 focus-visible:outline-none")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={scope === "artist" ? "Например: Кино, Михаил Круг, a-ha" : "Название альбома, песни или жанр"}
          />
          {text && (
            <button type="button" onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить запрос">
              <X size={16} />
            </button>
          )}
        </div>
        <button type="submit" aria-label="Найти" className={btnPrimary + " music-search-submit"} disabled={!textQuery(text, scope)}>
          <SearchIcon size={18} /> <span>Найти</span>
        </button>
      </form>
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
      <p className="music-search-explanation text-xs leading-relaxed text-muted">
        {scope === "artist"
          ? "Сначала ищем по исполнителю, затем по названию и тематическим меткам. Совпадения в метках подписаны; жанр можно написать по-русски или выбрать ниже."
          : "Ищем точную фразу в исполнителях, названиях и жанровых темах. Русские названия жанров тоже понимаем."}
      </p>
      <div role="group" className="flex min-w-0 items-center gap-1.5" aria-label="Популярные запросы">
        <span className="shrink-0 text-xs font-medium text-muted">{scope === "artist" ? "Быстро:" : "Жанры:"}</span>
        <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar">
          <div className="flex w-max items-center gap-1.5 py-0.5">
            {QUICK_OFFLINE_SEARCHES[scope].map((suggestion) => (
              <button
                key={suggestion.query}
                type="button"
                aria-label={`Быстрый поиск: ${suggestion.label}`}
                onClick={() => {
                  setText(suggestion.query);
                  submit(suggestion.query, scope, scope === "artist");
                }}
                className="min-h-9 shrink-0 whitespace-nowrap rounded-full border border-line bg-bg/80 px-1 py-2 text-[11px] font-semibold text-muted transition hover:border-accent/40 hover:bg-accent/5 hover:text-accent sm:px-3 sm:text-xs"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
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
          className="min-h-9 max-w-[6.5rem] shrink-0 rounded-full border border-line bg-bg px-1.5 py-1 text-[11px] font-semibold text-accent outline-none transition focus:border-accent/40 sm:max-w-[9rem] sm:px-2.5 sm:py-1 sm:text-xs"
        >
          <option value="">{scope === "artist" ? "Жанр…" : "Ещё жанры…"}</option>
          {ARCHIVE_GENRES.map((genre) => <option key={genre.id} value={genre.id}>{genre.label}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <div className="music-discovery space-y-5">
      <div className="music-search-card space-y-3 rounded-2xl border border-line bg-surface p-4">
        {search}
        <div className="music-source-heading">
          <p className="min-w-0 flex-1 text-sm leading-relaxed">
            <b>{provider === "archive" ? "Песни и альбомы." : "Отдельные аудиотреки."}</b> {provider === "archive" ? "Ищите в коллекциях Internet Archive." : provider === "audius" ? "Полные треки из независимой сети Audius — без ключа и регистрации." : "Ищите по исполнителю, названию или жанру."} Офлайн-загрузка зависит от лицензии и доступа к файлу.
          </p>
          <select
            aria-label="Источник музыки"
            value={provider}
            onChange={(event) => switchProvider(event.target.value as MusicSource)}
            className={cn(inputCls, "music-provider-select shrink-0 text-xs font-semibold")}
          >
            <option value="archive">Archive.org</option>
            <option value="audius">Audius</option>
            <option value="openverse">Openverse</option>
            <option value="commons">Commons</option>
          </select>
        <details className="music-search-rights text-xs leading-relaxed text-muted">
          <summary>О каталоге</summary>
          <p className="flex items-start gap-2 mt-2"><ShieldAlert size={15} className="mt-0.5 shrink-0" />
          {provider === "archive"
            ? "Internet Archive — открытая библиотека: права на записи остаются у правообладателей. Сохраняйте только то, что вам разрешено."
            : provider === "audius"
              ? "Audius — независимая музыкальная сеть: каталог авторских и электронных релизов. Слушать можно всё, офлайн-копия доступна там, где автор разрешил скачивание."
            : provider === "openverse"
              ? "Openverse агрегирует музыку из Jamendo, Wikimedia Commons и Freesound. Проверяйте лицензию, атрибуцию и страницу оригинала перед использованием или скачиванием."
              : "Wikimedia Commons: условия лицензии и возможность скачивания различаются для каждого файла. Проверьте страницу оригинала."}
          </p>
        </details>
        </div>

      </div>

      {!active ? (
        provider === "archive" ? (
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
          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">Популярные жанры</h2>
              <p className="mt-0.5 text-xs text-muted">Здесь — отдельные треки, не альбомы. Условия и возможность скачивания зависят от файла.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ARCHIVE_GENRES.slice(0, 8).map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => {
                    setScope("all");
                    setText(genre.label);
                    setActive({ title: `Жанр: ${genre.label}`, query: genreSearchTerm(genre), text: genre.label, scope: "all", genre, provider });
                  }}
                  className="rounded-xl border border-line bg-bg px-3 py-3 text-left text-sm font-semibold text-ink transition hover:border-accent/40 hover:bg-accent/5"
                >
                  {genre.label}
                </button>
              ))}
            </div>
          </section>
        )
      ) : (
        <>
          <div className="music-results-heading flex items-center gap-3">
            <button
              onClick={clearSearch}
              aria-label="Коллекции"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted transition hover:text-ink"
            >
              <ArrowLeft size={17} /> <span className="hidden sm:inline">Коллекции</span>
            </button>
            <h2 className="min-w-0 truncate font-display text-xl font-semibold tracking-tight">{active.title}</h2>
          <p role="status" aria-live="polite" className="music-results-count text-xs text-muted">
            {loading
              ? provider === "archive" ? "Ищем и отсекаем аудиокниги…" : provider === "audius" ? "Ищем полные треки в Audius…" : "Ищем аудиотреки…"
              : `Найдено ${provider === "archive" ? "релизов" : "треков"}: ${provider === "archive" ? albums.length : externalTracks.length}${more ? "+" : ""}`}
          </p>
          </div>

          {provider === "archive" && active.scope === "artist" && !!active.text && !active.genre && (
            <DiscographyPanel artist={active.text} online={online} lookups={lookups} onSelect={(item, artistName) => setRelease({ release: item, artist: artistName })} />
          )}

          {limited && <p role="status" className="text-xs text-muted">Достигнут предел проверки большого каталога. Уточните название или исполнителя, чтобы найти остальные записи.</p>}
          {error && (
            <div className="flex items-center gap-3 rounded-xl bg-bad/10 p-4 text-sm text-bad">
              <span className="flex-1">Не удалось связаться с {provider === "archive" ? "Internet Archive" : provider === "audius" ? "Audius" : provider === "openverse" ? "Openverse" : "Wikimedia Commons"}: {error}</span>
              <button className="shrink-0 font-semibold underline" onClick={() => void load(active, retryPage.current)}>
                Повторить
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-surface p-1.5">
            {provider === "archive" ? (
              <>
                {loading && !albums.length && Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex animate-pulse items-center gap-3 p-2">
                    <div className="h-[46px] w-[46px] rounded-lg bg-surface-2" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-2/3 rounded bg-surface-2" />
                      <div className="h-3 w-1/3 rounded bg-surface-2" />
                    </div>
                  </div>
                ))}
                {albums.map((album) => <AlbumRow key={album.id} album={album} onOpen={() => setOpen(album)} />)}
                {!loading && !error && albums.length === 0 && (
                  <div className="p-10 text-center text-sm text-muted">
                    {active.genre ? (
                      <p>В жанре «{active.genre.label}» пока ничего не найдено. Выберите другой жанр или измените запрос выше.</p>
                    ) : active.text && active.scope === "artist" ? (
                      <>
                        <p>Исполнителя не нашли. Проверьте написание или попробуйте режим «По названию / жанру».</p>
                        <button className="mt-2 font-semibold text-accent underline underline-offset-2" onClick={broadenSearch}>Искать везде</button>
                      </>
                    ) : active.text ? (
                      <p>Ничего не найдено по запросу «{active.text}». Попробуйте другой жанр или поменяйте слова.</p>
                    ) : (
                      "Ничего не найдено. Попробуйте другую коллекцию."
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {loading && !externalTracks.length && Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex animate-pulse items-center gap-3 p-2">
                    <div className="h-[46px] w-[46px] rounded-lg bg-surface-2" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-2/3 rounded bg-surface-2" />
                      <div className="h-3 w-1/3 rounded bg-surface-2" />
                    </div>
                  </div>
                ))}
                {externalTracks.map((track) => (
                  <DiscoveredTrackRow
                    key={track.id}
                    track={track}
                    onPlay={() => playDiscoveredTrack(track)}
                    onAdd={(download) => addDiscoveredTrack(track, download)}
                  />
                ))}
                {!loading && !error && externalTracks.length === 0 && (
                  <div className="p-10 text-center text-sm text-muted">
                    {active.genre ? (
                      <p>По жанру «{active.genre.label}» не нашлось треков с указанной лицензией. Попробуйте другой жанр.</p>
                    ) : active.text && active.scope === "artist" ? (
                      <>
                        <p>В открытом каталоге не нашёл точных совпадений по исполнителю. Можно попробовать поиск по всем полям.</p>
                        <button className="mt-2 font-semibold text-accent underline underline-offset-2" onClick={broadenSearch}>Искать везде</button>
                      </>
                    ) : provider === "audius" ? (
                      <>
                        <p>В Audius ничего не нашлось. Это независимая сеть — крупных релизов там мало.</p>
                        <button className="mt-2 font-semibold text-accent underline underline-offset-2" onClick={() => switchProvider("archive")}>Проверить Internet Archive</button>
                      </>
                    ) : (
                      <p>Не нашлось треков по запросу «{active.text}». Попробуйте другие слова или переключите источник.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {more && (
            <div className="text-center">
              <button className={btnGhost} disabled={loading} onClick={() => void load(active, page + 1)}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null} Показать ещё
              </button>
            </div>
          )}
          {!loading && !error && active.scope === "artist" && !more && <details className="music-catalog-note text-xs leading-relaxed text-muted">
            <summary>Почему здесь не вся дискография?</summary><p>
            {provider === "archive" ? "Это релизы из Archive.org, не полная дискография. В одном релизе может быть несколько песен; архивы RAR/ZIP нельзя включить напрямую." : provider === "audius" ? "Audius — независимый каталог: полные треки есть, но крупные лейблы там не представлены. Переключите источник, запрос сохранится." : "Это результаты открытого каталога, не полная дискография исполнителя. Можно переключить источник, сохранив запрос."}
          </p></details>}
        </>
      )}

      {release && (
        <ReleasePanel
          artist={release.artist}
          title={release.release.title}
          year={release.release.date.slice(0, 4)}
          releaseId={release.release.id}
          cover={release.release.cover}
          online={online}
          onClose={() => setRelease(null)}
          onOpenAlbum={(album) => setOpen(album)}
          onPlayTracks={playReleaseTracks}
          onAddTrack={addDiscoveredTrack}
          onPlayItems={playPlaylistItems}
          onAddItems={(items) => openPicker({ items, suggest: items[0]?.album || items[0]?.title?.slice(0, 70) || "Треки релиза", cover: items[0]?.logo })}
          onArchiveCount={(count) => setLookups((prev) => ({ ...prev, [release.release.id]: { count, limited: false } }))}
        />
      )}
      {open && <AlbumPanel album={open} onClose={() => setOpen(null)} onPlay={onPlay} />}
    </div>
  );
}


/** Keep the two tasks explicit: discovering downloads needs a network, the library does not. */
export function Collections({ online, onPlay }: { online: boolean; onPlay: ViewProps["onPlay"] }) {
  const [section, setSection] = useState<"find" | "device">(() => !online || localStorage.getItem("pr.music.section") === "device" ? "device" : "find");
  const [visitedDevice, setVisitedDevice] = useState(section === "device");
  const choose = (next: "find" | "device") => {
    setSection(next);
    if (next === "device") setVisitedDevice(true);
    localStorage.setItem("pr.music.section", next);
  };
  useEffect(() => { if (!online) { setSection("device"); setVisitedDevice(true); } }, [online]);
  return <div className="music-workspace space-y-5">
    <div className="music-workspace-tabs" role="group" aria-label="Где искать музыку">
      <button aria-pressed={section === "find"} onClick={() => choose("find")}><SearchIcon size={18}/><span>Найти музыку<small>Источники для скачивания</small></span></button>
      <button aria-pressed={section === "device"} onClick={() => choose("device")}><Download size={18}/><span>На устройстве<small>Скачанное и свои файлы</small></span></button>
    </div>
    <div hidden={section !== "find"}><MusicDiscovery online={online} onPlay={onPlay}/></div>
    {(visitedDevice || section === "device") && <div hidden={section !== "device"}><OfflineMusicLibrary onDiscover={() => choose("find")}/></div>}
  </div>;
}
