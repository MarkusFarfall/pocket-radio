import { useCallback, useEffect, useRef, useState } from "react";
import { Disc3, ExternalLink, Library, Loader2, RefreshCw, SearchX, ShieldAlert } from "lucide-react";
import { searchRelease, type Album } from "../../lib/archive";
import { searchAudiusTracks } from "../../lib/audius";
import { searchOpenverseTracks } from "../../lib/openverse";
import { searchCommonsTracks } from "../../lib/commons";
import type { DiscoveredMusicTrack } from "../../lib/discoveredMusic";
import { Cover, Modal } from "../../components/ui";
import { DiscoveredTrackRow } from "../../components/DiscoveredTrackRow";
import { cn } from "../../utils/cn";

/**
 * Один релиз — все открытые источники сразу.
 *
 * Archive и Audius проверяются при открытии, Openverse и Commons — по нажатию,
 * чтобы не тратить чужие лимиты. Для каждого источника честно показано, есть ли
 * релиз, сколько совпадений и почему их может не быть.
 */

export type ReleaseSource = "archive" | "audius" | "openverse" | "commons";

const SOURCES: { id: ReleaseSource; label: string; short: string }[] = [
  { id: "archive", label: "Internet Archive", short: "Archive" },
  { id: "audius", label: "Audius", short: "Audius" },
  { id: "openverse", label: "Openverse", short: "Openverse" },
  { id: "commons", label: "Wikimedia Commons", short: "Commons" },
];

interface TrackState {
  status: "idle" | "loading" | "ready" | "error";
  tracks: DiscoveredMusicTrack[];
  error?: string;
}

interface ArchiveState {
  status: "idle" | "loading" | "ready" | "error";
  albums: Album[];
  exact: number;
  limited: boolean;
  error?: string;
}

const idleTracks = (): TrackState => ({ status: "idle", tracks: [] });
const idleArchive = (): ArchiveState => ({ status: "idle", albums: [], exact: 0, limited: false });

export function ReleasePanel({
  artist,
  title,
  year,
  releaseId,
  cover,
  online,
  onClose,
  onOpenAlbum,
  onPlayTracks,
  onAddTrack,
  onArchiveCount,
}: {
  artist: string;
  title: string;
  year?: string;
  releaseId?: string;
  cover?: string;
  online: boolean;
  onClose: () => void;
  onOpenAlbum: (album: Album) => void;
  onPlayTracks: (tracks: DiscoveredMusicTrack[], track: DiscoveredMusicTrack) => void;
  onAddTrack: (track: DiscoveredMusicTrack, download: boolean) => void;
  onArchiveCount: (count: number) => void;
}) {
  const [tab, setTab] = useState<ReleaseSource>("archive");
  const [archive, setArchive] = useState<ArchiveState>(idleArchive);
  const [audius, setAudius] = useState<TrackState>(idleTracks);
  const [openverse, setOpenverse] = useState<TrackState>(idleTracks);
  const [commons, setCommons] = useState<TrackState>(idleTracks);
  const archiveRef = useRef<AbortController | null>(null);
  // Колбэк из родителя пересоздаётся на каждом рендере; держим его в ref,
  // иначе эффект загрузки срабатывает бесконечно.
  const countRef = useRef(onArchiveCount);
  countRef.current = onArchiveCount;
  const tracksRef = useRef<Record<string, AbortController | null>>({});

  const query = `${artist} ${title}`.trim();
  const strict = { artist, title };

  const loadArchive = useCallback(async () => {
    archiveRef.current?.abort();
    const controller = new AbortController();
    archiveRef.current = controller;
    setArchive((prev) => ({ ...prev, status: "loading", error: undefined }));
    try {
      const result = await searchRelease(artist, title, controller.signal);
      if (controller.signal.aborted) return;
      setArchive({ status: "ready", albums: result.albums, exact: result.exact, limited: result.limited });
      countRef.current(result.albums.length);
    } catch (error) {
      if (controller.signal.aborted) return;
      setArchive({ status: "error", albums: [], exact: 0, limited: false, error: error instanceof Error ? error.message : "Не удалось проверить Archive" });
    }
  }, [artist, title]);

  const loadTracks = useCallback(async (source: Exclude<ReleaseSource, "archive">) => {
    tracksRef.current[source]?.abort();
    const controller = new AbortController();
    tracksRef.current[source] = controller;
    const setter = source === "audius" ? setAudius : source === "openverse" ? setOpenverse : setCommons;
    setter((prev) => ({ ...prev, status: "loading", error: undefined }));
    try {
      const page = source === "audius"
        ? await searchAudiusTracks({ text: query, page: 1, strict, signal: controller.signal })
        : source === "openverse"
          ? await searchOpenverseTracks({ text: query, scope: "all", page: 1, signal: controller.signal })
          : await searchCommonsTracks({ text: query, scope: "all", page: 1, signal: controller.signal });
      if (controller.signal.aborted) return;
      setter({ status: "ready", tracks: page.tracks });
    } catch (error) {
      if (controller.signal.aborted) return;
      setter({ status: "error", tracks: [], error: error instanceof Error ? error.message : "Источник не ответил" });
    }
  }, [query, artist, title]);

  // Archive и Audius проверяются сразу: это два основных бесплатных каталога.
  useEffect(() => {
    if (!online) return;
    void loadArchive();
    void loadTracks("audius");
    return () => {
      archiveRef.current?.abort();
      tracksRef.current.audius?.abort();
    };
  }, [online, loadArchive, loadTracks]);

  useEffect(() => {
    if (!online) return;
    if (tab === "openverse" && openverse.status === "idle") void loadTracks("openverse");
    if (tab === "commons" && commons.status === "idle") void loadTracks("commons");
  }, [tab, online, openverse.status, commons.status, loadTracks]);

  useEffect(() => () => {
    archiveRef.current?.abort();
    for (const controller of Object.values(tracksRef.current)) controller?.abort();
  }, []);

  const stateOf = (source: ReleaseSource): TrackState | ArchiveState =>
    source === "archive" ? archive : source === "audius" ? audius : source === "openverse" ? openverse : commons;

  const countOf = (source: ReleaseSource): number | null => {
    const state = stateOf(source);
    if (state.status !== "ready") return null;
    return source === "archive" ? (state as ArchiveState).albums.length : (state as TrackState).tracks.length;
  };

  const tracksForPlay = [...audius.tracks, ...openverse.tracks, ...commons.tracks];
  const checked = SOURCES.filter((source) => stateOf(source.id).status === "ready");
  const allEmpty = checked.length === SOURCES.length && SOURCES.every((source) => countOf(source.id) === 0);

  const brainz = releaseId
    ? `https://musicbrainz.org/release-group/${encodeURIComponent(releaseId)}`
    : `https://musicbrainz.org/search?query=${encodeURIComponent(query)}&type=release_group&method=indexed`;

  const retry = () => {
    if (tab === "archive") void loadArchive();
    else void loadTracks(tab);
  };

  return (
    <Modal open onClose={onClose} title="Где слушать" size="lg" mobile="page">
      <div className="release-sources">
        <header className="release-sources-head">
          <Cover s={{ name: title, logo: cover, kind: "vod", genre: "Музыка", icon: "g:music" }} size={72} className="shrink-0 rounded-xl" fit="cover" />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 font-display text-lg font-semibold leading-tight">{title}</h3>
            <p className="mt-0.5 text-sm text-muted">{[artist, year].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Проверяем открытые каталоги. Это не магазин: наличие зависит от того, что разрешили авторы и загрузили слушатели.
            </p>
          </div>
        </header>

        <div role="tablist" aria-label="Источники релиза" className="release-sources-tabs">
          {SOURCES.map((source) => {
            const count = countOf(source.id);
            const state = stateOf(source.id);
            return (
              <button
                key={source.id}
                role="tab"
                type="button"
                aria-selected={tab === source.id}
                aria-controls={`release-panel-${source.id}`}
                onClick={() => setTab(source.id)}
                className={cn("release-source-tab", tab === source.id && "is-active")}
              >
                <span className="hidden sm:inline">{source.label}</span>
                <span className="sm:hidden">{source.short}</span>
                {state.status === "loading" && <Loader2 size={12} className="animate-spin" />}
                {count !== null && <span className="release-source-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {!online && (
          <div className="p-5 text-sm text-muted">Открытые каталоги недоступны без интернета. Скачанное играет в разделе «Плейлисты».</div>
        )}

        {online && (
          <div id={`release-panel-${tab}`} role="tabpanel" aria-label={SOURCES.find((source) => source.id === tab)?.label} className="release-sources-body">
            {(stateOf(tab).status === "loading" || stateOf(tab).status === "idle") && (
              <div className="flex items-center gap-2 p-5 text-sm text-muted" role="status" aria-live="polite">
                <Loader2 size={16} className="animate-spin" />
                {tab === "archive" ? "Ищем релиз в Internet Archive…" : tab === "audius" ? "Ищем треки в Audius…" : "Проверяем источник…"}
              </div>
            )}

            {stateOf(tab).status === "error" && (
              <div className="flex flex-wrap items-center gap-3 p-4 text-sm text-bad">
                <span className="min-w-0 flex-1">Не удалось проверить источник: {(stateOf(tab) as TrackState | ArchiveState).error}</span>
                <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold underline">
                  <RefreshCw size={13} /> Повторить
                </button>
              </div>
            )}

            {tab === "archive" && archive.status === "ready" && (
              archive.albums.length ? (
                <>
                  <div className="flex items-center justify-between gap-2 px-1 pb-1">
                    <p className="text-xs text-muted">
                      {archive.exact > 0
                        ? `Точных совпадений: ${archive.exact}${archive.albums.length > archive.exact ? ` · ещё похожих: ${archive.albums.length - archive.exact}` : ""}`
                        : "Точного совпадения нет — ниже похожие записи"}
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">
                      <Disc3 size={12} /> {archive.albums.length}
                    </span>
                  </div>
                  <ul className="release-archive-list">
                    {archive.albums.map((album) => (
                      <li key={album.id}>
                        <button type="button" onClick={() => onOpenAlbum(album)} className="release-archive-row">
                          <Cover s={{ name: album.title, logo: album.cover, kind: "vod", genre: "Музыка", icon: "g:music" }} size={44} className="shrink-0 rounded-lg" fit="cover" />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-sm font-semibold leading-snug">{album.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted">{[album.creator || "Автор не указан", album.year].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold",
                              album.exact ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted",
                            )}
                          >
                            {album.exact ? "Точное совпадение" : "Похоже"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {archive.limited && <p className="px-2 pb-2 text-[11px] text-muted">Archive вернул не всё: список ограничен размером выдачи.</p>}
                </>
              ) : (
                <ReleaseEmpty source="archive" brainz={brainz} />
              )
            )}

            {tab !== "archive" && (stateOf(tab) as TrackState).status === "ready" && (
              (stateOf(tab) as TrackState).tracks.length ? (
                <ul className="divide-y divide-line/60">
                  {(stateOf(tab) as TrackState).tracks.map((track) => (
                    <li key={track.id}>
                      <DiscoveredTrackRow
                        track={track}
                        onPlay={() => onPlayTracks(tracksForPlay, track)}
                        onAdd={(download: boolean) => onAddTrack(track, download)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <ReleaseEmpty source={tab} brainz={brainz} />
              )
            )}

            {allEmpty && (
              <div className="release-sources-summary">
                <SearchX size={20} className="shrink-0" />
                <div className="min-w-0">
                  <strong className="block text-sm">Ни в одном открытом источнике релиза нет</strong>
                  <p className="mt-1 text-xs leading-relaxed">
                    Это не ошибка поиска. Archive и Audius хранят только то, что загрузили пользователи и авторы; студийные альбомы многих исполнителей
                    там отсутствуют по условиям прав. Посмотреть метаданные и ссылки можно в MusicBrainz.
                  </p>
                  <a href={brainz} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent underline underline-offset-2">
                    Открыть релиз в MusicBrainz <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        <footer className="release-sources-foot">
          <p className="flex items-start gap-1.5">
            <ShieldAlert size={13} className="mt-0.5 shrink-0" />
            Права на записи остаются у правообладателей. Audius — независимая сеть: слушать можно всё, офлайн-копия — только если автор разрешил скачивание.
          </p>
          <p className="flex items-start gap-1.5">
            <Library size={13} className="mt-0.5 shrink-0" />
            Если релиз не нашёлся, попробуйте поиск по отдельной песне: в Archive часто лежат сборники и концерты, а не альбомы целиком.
          </p>
        </footer>
      </div>
    </Modal>
  );
}

function ReleaseEmpty({ source, brainz }: { source: ReleaseSource; brainz: string }) {
  const text: Record<ReleaseSource, { title: string; body: string }> = {
    archive: {
      title: "В Internet Archive этого релиза нет",
      body: "Archive — библиотека загруженных файлов, а не каталог лейблов: студийных альбомов многих исполнителей там просто нет. Поиск не ошибается — проверять дальше можно в других источниках.",
    },
    audius: {
      title: "В Audius не нашлось",
      body: "Audius — независимая сеть, там в основном авторская и электронная музыка. Полные альбомы крупных исполнителей встречаются редко.",
    },
    openverse: {
      title: "Нет треков с открытой лицензией",
      body: "Openverse индексирует только музыку со свободными лицензиями (Jamendo, Freesound, Commons), поэтому коммерческие релизы там не появляются.",
    },
    commons: {
      title: "В Wikimedia Commons пусто",
      body: "Commons хранит свободные файлы для иллюстраций статей — целых альбомов там почти не бывает.",
    },
  };
  return (
    <div className="p-5">
      <strong className="block text-sm">{text[source].title}</strong>
      <p className="mt-1 text-xs leading-relaxed text-muted">{text[source].body}</p>
      <a href={brainz} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent underline underline-offset-2">
        Открыть релиз в MusicBrainz <ExternalLink size={11} />
      </a>
    </div>
  );
}
