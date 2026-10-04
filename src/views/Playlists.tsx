import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Disc3, Download, FileDown, FileUp, ListPlus, Loader2, Mic2, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, Rss, Shuffle, Trash2, X } from "lucide-react";
import type { Playlist, PlaylistItem } from "../lib/types";
import type { ViewProps } from "./shared";
import { player, usePlayer } from "../lib/player";
import { addLocalFiles } from "../lib/localFiles";
import { imageFileToDataUrl } from "../lib/images";
import {
  addItems,
  cancelDownloads,
  createPlaylist,
  deletePlaylist,
  downloadItems,
  downloadable,
  exportPlaylistM3U,
  gcLocalFiles,
  itemStationId,
  moveItem,
  playlistSeconds,
  playPlaylist,
  refreshFollow,
  removeItem,
  removeOffline,
  restorePlaylist,
  updatePlaylist,
  useDownloads,
  usePlaylists,
} from "../lib/playlists";
import { useOfflineItems } from "../lib/hooks";
import { download } from "../lib/m3u";
import { fmtClock, fmtDuration } from "../lib/templates";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";
import { Cover, Equalizer, Modal, btnGhost, btnPrimary, inputCls } from "../components/ui";
import { tracksWord } from "../components/PlaylistPicker";
import { PlaylistArtwork } from "../components/PlaylistArtwork";

type PlLike = Pick<Playlist, "name" | "items" | "follow" | "cover">;

const isPodcast = (p: PlLike) => !!p.follow || (p.items.length > 0 && p.items.every((i) => i.genre === "Подкасты"));

/** Обложка плейлиста: мозаика из четырёх обложек или одна. */
function PlCover({ p, size }: { p: PlLike; size: number | "fill" }) {
  return <div className="h-full w-full" style={size === "fill" ? undefined : { width: size, height: size }}><PlaylistArtwork playlist={p} eager /></div>;
}

const isOff = (i: PlaylistItem, off: Set<string>) => !!i.local || off.has(itemStationId(i.id));

/* ------------------------------------ карточка в сетке ------------------------------------ */

function Card({ pl, off, onOpen }: { pl: Playlist; off: Set<string>; onOpen: () => void }) {
  const p = usePlayer();
  const curId = p.station?.id ?? "";
  const here = pl.items.some((i) => itemStationId(i.id) === curId);
  const playing = here && (p.status === "playing" || p.status === "buffering" || p.status === "loading");
  const offCount = pl.items.filter((i) => isOff(i, off)).length;
  const secs = playlistSeconds(pl);

  return (
    <div className="motion-card group overflow-hidden rounded-2xl border border-line bg-surface p-3 transition hover:border-ink/25">
      <div className="relative aspect-[16/11] w-full sm:aspect-square">
        <button onClick={onOpen} className="block h-full w-full" aria-label={`Открыть «${pl.name}»`}>
          <PlCover p={pl} size="fill" />
        </button>
        {pl.follow ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <Rss size={11} /> подписка
          </span>
        ) : (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {isPodcast(pl) ? <Mic2 size={11} /> : <Disc3 size={11} />}
            {isPodcast(pl) ? "подкасты" : "музыка"}
          </span>
        )}
        <button
          onClick={() => (here ? player.toggle() : void playPlaylist(pl))}
          disabled={!pl.items.length}
          className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg transition active:scale-95 disabled:opacity-40 sm:bottom-2 sm:right-2 sm:h-11 sm:w-11 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
          aria-label={playing ? "Пауза" : "Слушать"}
        >
          {playing ? <Pause size={19} className="fill-current" /> : <Play size={19} className="ml-0.5 fill-current" />}
        </button>
      </div>
      <button onClick={onOpen} className="mt-3 block w-full min-w-0 px-0.5 text-left">
        <div className="flex items-center gap-2">
          <span className="line-clamp-2 font-display text-base font-semibold leading-tight">{pl.name}</span>
          {playing && <Equalizer active className="h-3 shrink-0 text-accent" />}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">
          {pl.items.length} {tracksWord(pl.items.length)}
          {secs > 0 && ` · ${fmtDuration(secs, true)}`}
        </div>
        {pl.items.length > 0 && (
          <div className={cn("mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", offCount === pl.items.length ? "bg-ok/15 text-ok" : offCount ? "bg-surface-2 text-muted" : "hidden")}>
            <Download size={11} /> {offCount === pl.items.length ? "всё офлайн" : `офлайн ${offCount}/${pl.items.length}`}
          </div>
        )}
      </button>
    </div>
  );
}

/* ------------------------------------ внутри плейлиста ------------------------------------ */

function Detail({ pl, off, online, onBack, onEdit }: { pl: Playlist; off: Set<string>; online: boolean; onBack: () => void; onEdit: () => void }) {
  const p = usePlayer();
  const dl = useDownloads();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reorder, setReorder] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"files" | "refresh" | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(160);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const curId = p.station?.id ?? "";
  const inList = pl.items.some((i) => itemStationId(i.id) === curId);
  const active = inList && (p.status === "playing" || p.status === "buffering" || p.status === "loading");
  const todo = downloadable(pl.items, off);
  const dlTotal = pl.items.filter((i) => !i.local && i.kind === "vod").length;
  const dlDone = pl.items.filter((i) => !i.local && i.kind === "vod" && off.has(itemStationId(i.id))).length;
  const offCount = pl.items.filter((i) => isOff(i, off)).length;
  const mine = dl.running && dl.playlistId === pl.id;
  const secs = playlistSeconds(pl);
  const index = useMemo(() => new Map(pl.items.map((it, n) => [it.id, n])), [pl.items]);
  const allShown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? pl.items.filter((i) => `${i.title} ${i.subtitle ?? ""}`.toLowerCase().includes(n)) : pl.items;
  }, [pl.items, q]);
  const shown = allShown.slice(0, visibleCount);

  useEffect(() => setVisibleCount(160), [pl.id, q]);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || visibleCount >= allShown.length) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisibleCount((n) => Math.min(allShown.length, n + 160)), { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, allShown.length]);

  const playFrom = (i: PlaylistItem) => {
    if (curId === itemStationId(i.id)) player.toggle();
    else void playPlaylist(pl, { startId: i.id });
  };

  const addFiles = async (files: File[]) => {
    setBusy("files");
    try {
      const { items, skipped } = await addLocalFiles(files);
      if (!items.length) return;
      await addItems(pl.id, items);
      toast(`Добавлено песен: ${items.length}${skipped ? `, пропущено: ${skipped}` : ""}`, "ok");
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const n = await refreshFollow(pl);
      toast(n ? `Новых серий: ${n}` : "Новых серий пока нет", n ? "ok" : "info");
    } catch {
      toast("Не удалось проверить подписку: нет связи с каталогом", "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const copy = await deletePlaylist(pl.id);
    onBack();
    if (copy) toast(`Плейлист «${copy.name}» удалён`, "info", { label: "Вернуть", run: () => void restorePlaylist(copy) });
  };

  const sec = "inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold transition hover:bg-surface-2 disabled:opacity-50";

  return (
    <div>
      <button onClick={onBack} className="-ml-2 mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted transition hover:text-ink">
        <ArrowLeft size={17} /> Все плейлисты
      </button>

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="mx-auto aspect-square w-48 shrink-0 sm:mx-0 sm:w-52 lg:w-60">
          <PlCover p={pl} size="fill" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted">
            {pl.follow ? (
              <>
                <Rss size={13} /> Подписка на подкаст
              </>
            ) : isPodcast(pl) ? (
              <>
                <Mic2 size={13} /> Подкасты
              </>
            ) : (
              <>
                <Disc3 size={13} /> Плейлист
              </>
            )}
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold leading-tight tracking-tight md:text-4xl">{pl.name}</h1>
          {pl.desc && <p className="mt-1.5 text-sm leading-relaxed text-muted">{pl.desc}</p>}
          <p className="mt-2 text-sm text-muted">
            {pl.items.length} {tracksWord(pl.items.length)}
            {secs > 0 && ` · ${fmtDuration(secs, true)}`}
            {pl.items.length > 0 && ` · офлайн ${offCount}/${pl.items.length}`}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={!pl.items.length} onClick={() => (inList ? player.toggle() : void playPlaylist(pl))}>
              {active ? <Pause size={18} className="fill-current" /> : <Play size={18} className="ml-0.5 fill-current" />} {active ? "Пауза" : inList ? "Продолжить" : "Слушать"}
            </button>
            <button className={sec} disabled={pl.items.length < 2} onClick={() => void playPlaylist(pl, { shuffle: true })}>
              <Shuffle size={16} /> Вперемешку
            </button>
            {dlTotal > 0 && (
              <button className={sec} disabled={!todo.length || !online || dl.running} onClick={() => void downloadItems(pl.id, pl.items, pl.name)} title={!online ? "Нужен интернет" : undefined}>
                {dlDone === dlTotal ? <Check size={16} className="text-ok" /> : <Download size={16} />} {dlDone === dlTotal ? "Всё скачано" : `Скачать офлайн (${todo.length})`}
              </button>
            )}
            {pl.follow && (
              <button className={sec} disabled={busy === "refresh" || !online} onClick={() => void refresh()}>
                {busy === "refresh" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Новые серии
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.flac,.wav"
              className="hidden"
              onChange={(e) => {
                const f = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (f.length) void addFiles(f);
              }}
            />
            <button className={sec} disabled={busy === "files"} onClick={() => fileRef.current?.click()}>
              {busy === "files" ? <Loader2 size={16} className="animate-spin" /> : <ListPlus size={16} />} Добавить треки
            </button>
            <button className={sec} onClick={() => setActionsOpen(true)}>
              <MoreHorizontal size={17} /> Ещё
            </button>
          </div>
        </div>
      </div>

      {mine && (
        <div className="mt-6 rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 size={17} className="shrink-0 animate-spin text-accent" />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">
                Скачиваем {dl.done + 1} из {dl.total}
              </span>
              <span className="block truncate text-xs text-muted">{dl.current}</span>
            </span>
            <button className={btnGhost + " !py-1.5 text-sm"} onClick={cancelDownloads}>
              Остановить
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${((dl.done + dl.pct) / Math.max(1, dl.total)) * 100}%` }} />
          </div>
        </div>
      )}

      {pl.items.length > 12 && (
        <div className="relative mt-6">
          <input className={cn(inputCls, "pr-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти в плейлисте" aria-label="Найти в плейлисте" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить">
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {pl.items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-8 text-center text-sm leading-relaxed text-muted">
          Плейлист пока пуст. Добавляйте серии подкастов и песни из «Обзора» (кнопка «В плейлист»), станции из каталога или свои файлы кнопкой «Добавить свои песни».
        </div>
      ) : (
        <ul className="mt-4">
          {shown.map((i) => {
            const n = index.get(i.id) ?? 0;
            const sid = itemStationId(i.id);
            const cur = curId === sid;
            const playing = cur && (p.status === "playing" || p.status === "buffering" || p.status === "loading");
            const offline = isOff(i, off);
            const canDl = !i.local && i.kind === "vod" && !offline;
            return (
              <li key={i.id} className={cn("group flex items-center gap-2 rounded-xl p-1.5 pr-2 transition hover:bg-surface-2", cur && "bg-accent/10")}>
                <button onClick={() => playFrom(i)} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-muted" aria-label={`Включить «${i.title}»`}>
                  <span className={cn("group-hover:opacity-0", cur && "text-accent")}>{playing ? <Equalizer active className="h-3.5" /> : n + 1}</span>
                  <span className="absolute inset-0 flex items-center justify-center text-ink opacity-0 group-hover:opacity-100">{playing ? <Pause size={17} className="fill-current" /> : <Play size={17} className="ml-0.5 fill-current" />}</span>
                </button>
                <Cover s={{ name: i.title, logo: i.logo, kind: "vod", icon: pl.follow ? "g:podcast" : "g:music" }} size={40} className="rounded-lg" />
                <button onClick={() => playFrom(i)} className="min-w-0 flex-1 px-1 text-left">
                  <span className={cn("block truncate text-sm font-semibold", cur && "text-accent")}>{i.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {[i.subtitle, i.date ? new Date(i.date).toLocaleDateString("ru", { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · ") || "—"}
                  </span>
                </button>
                {offline && <Download size={14} className="shrink-0 text-ok" aria-label={i.local ? "Файл на устройстве" : "Скачано"} />}
                {i.duration ? <span className="hidden w-12 shrink-0 text-right font-mono text-xs text-muted sm:block">{fmtClock(i.duration)}</span> : null}
                {canDl && online && (
                  <button onClick={() => void downloadItems(pl.id, [i], i.title)} disabled={dl.running} className="shrink-0 rounded-lg p-2 text-muted transition hover:text-ink disabled:opacity-40" aria-label="Скачать для офлайна" title="Скачать для офлайна">
                    <Download size={16} />
                  </button>
                )}
                {reorder && (
                  <>
                    <button onClick={() => void moveItem(pl.id, i.id, -1)} disabled={n === 0} className="shrink-0 rounded-lg p-2 text-muted transition hover:text-ink disabled:opacity-30" aria-label="Выше">
                      <ArrowUp size={16} />
                    </button>
                    <button onClick={() => void moveItem(pl.id, i.id, 1)} disabled={n === pl.items.length - 1} className="shrink-0 rounded-lg p-2 text-muted transition hover:text-ink disabled:opacity-30" aria-label="Ниже">
                      <ArrowDown size={16} />
                    </button>
                  </>
                )}
                <button onClick={() => void removeItem(pl.id, i.id)} className="shrink-0 rounded-lg p-2 text-muted transition hover:text-bad" aria-label={`Убрать «${i.title}» из плейлиста`} title="Убрать из плейлиста">
                  <X size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {visibleCount < allShown.length && (
        <div ref={loadMoreRef} className="py-4 text-center">
          <button className={btnGhost + " !py-2"} onClick={() => setVisibleCount((n) => Math.min(allShown.length, n + 160))}>
            Показать ещё 160 · сейчас {shown.length} из {allShown.length}
          </button>
        </div>
      )}
      <Modal open={actionsOpen} onClose={() => setActionsOpen(false)} size="sm" title="Действия с плейлистом">
        <div className="space-y-1 p-3">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-surface-2" onClick={() => (setActionsOpen(false), onEdit())}>
            <Pencil size={18} className="text-muted" /> Изменить название и обложку
          </button>
          {pl.items.length > 1 && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-surface-2" onClick={() => (setActionsOpen(false), setReorder((r) => !r))}>
              <ArrowDown size={18} className="text-muted" /> {reorder ? "Закончить менять порядок" : "Изменить порядок треков"}
            </button>
          )}
          <button disabled={!pl.items.some((i) => !i.local)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-40" onClick={() => (setActionsOpen(false), download(`${pl.name}.m3u`, exportPlaylistM3U(pl), "audio/x-mpegurl"))}>
            <FileDown size={18} className="text-muted" /> Экспортировать M3U
          </button>
          {dlDone > 0 && (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-surface-2" onClick={() => (setActionsOpen(false), void removeOffline(pl.items).then(() => toast("Загрузки удалены, плейлист остался", "info")))}>
              <Trash2 size={18} className="text-muted" /> Удалить скачанные файлы
            </button>
          )}
          <div className="my-1 h-px bg-line" />
          {confirmDel ? (
            <div className="rounded-xl bg-bad/10 p-3">
              <p className="text-sm text-bad">Удалить плейлист? Скачанные файлы, которые больше нигде не используются, тоже будут очищены.</p>
              <div className="mt-3 flex gap-2">
                <button className={btnGhost} onClick={() => setConfirmDel(false)}>Отмена</button>
                <button className="rounded-xl bg-bad px-4 py-2 text-sm font-semibold text-white" onClick={() => void remove()}>Удалить</button>
              </div>
            </div>
          ) : (
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-bad hover:bg-bad/10" onClick={() => setConfirmDel(true)}>
              <Trash2 size={18} /> Удалить плейлист
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------ раздел ------------------------------------------ */

type Filter = "all" | "music" | "podcast" | "offline" | "follow";

const FILTERS: [Filter, string][] = [
  ["all", "Все плейлисты"],
  ["music", "Музыка"],
  ["podcast", "Подкасты"],
  ["offline", "Есть офлайн"],
  ["follow", "Подписки"],
];

export function Playlists({ online, go }: ViewProps) {
  const lists = usePlaylists();
  const offline = useOfflineItems();
  const off = useMemo(() => new Set(offline.map((o) => o.stationId)), [offline]);
  const [openId, setOpenId] = useState<string | null>(() => sessionStorage.getItem("pr.openPlaylist"));
  const [editor, setEditor] = useState<{ id?: string; name: string; desc: string; cover?: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = lists !== undefined;

  useEffect(() => {
    sessionStorage.removeItem("pr.openPlaylist");
    void gcLocalFiles();
  }, []);

  // подписки: тихо проверяем новые серии не чаще раза в 6 часов
  useEffect(() => {
    if (!online || !lists) return;
    const due = lists.filter((l) => l.follow && Date.now() - l.follow.checkedAt > 6 * 36e5);
    if (!due.length) return;
    void (async () => {
      let n = 0;
      for (const l of due) {
        try {
          n += await refreshFollow(l);
        } catch {
          /* нет связи с каталогом — попробуем в следующий раз */
        }
      }
      if (n) toast(`Новых серий в подписках: ${n}`, "ok");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, loaded]);

  const current = lists?.find((l) => l.id === openId);

  const visible = useMemo(() => {
    const all = lists ?? [];
    if (filter === "follow") return all.filter((l) => l.follow);
    if (filter === "offline") return all.filter((l) => l.items.some((i) => isOff(i, off)));
    if (filter === "podcast") return all.filter(isPodcast);
    if (filter === "music") return all.filter((l) => !isPodcast(l));
    return all;
  }, [lists, filter, off]);

  const importSongs = async (files: File[]) => {
    setBusy(true);
    try {
      const { items, skipped } = await addLocalFiles(files);
      if (!items.length) return;
      const existing = lists?.find((l) => l.name === "Мои песни");
      const pl = existing ?? (await createPlaylist("Мои песни", [], { desc: "Файлы с вашего устройства: играют без интернета" }));
      await addItems(pl.id, items);
      toast(`Добавлено песен: ${items.length}${skipped ? `, пропущено: ${skipped}` : ""}`, "ok", { label: "Открыть", run: () => setOpenId(pl.id) });
    } finally {
      setBusy(false);
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    if (editor.id) await updatePlaylist(editor.id, { name: editor.name, desc: editor.desc, cover: editor.cover || null });
    else {
      const p = await createPlaylist(editor.name, [], { desc: editor.desc, cover: editor.cover });
      setOpenId(p.id);
    }
    setEditor(null);
  };

  const editorModal = (
    <Modal
      open={!!editor}
      onClose={() => setEditor(null)}
      size="sm"
      title={editor?.id ? "Изменить плейлист" : "Новый плейлист"}
      footer={
        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={() => setEditor(null)}>
            Отмена
          </button>
          <button className={btnPrimary} disabled={!editor?.name.trim()} onClick={() => void saveEditor()}>
            {editor?.id ? "Сохранить" : "Создать"}
          </button>
        </div>
      }
    >
      {editor && (
        <div className="space-y-4 p-5">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Обложка</span>
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 shrink-0">
                <PlCover p={{ name: editor.name || "Плейлист", items: editor.id ? lists?.find((l) => l.id === editor.id)?.items ?? [] : [], follow: editor.id ? lists?.find((l) => l.id === editor.id)?.follow : undefined, cover: editor.cover }} size="fill" />
              </div>
              <div className="flex flex-wrap gap-2">
                <label className={btnGhost + " cursor-pointer !py-2"}>
                  <FileUp size={15} /> Выбрать фото
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        setEditor({ ...editor, cover: await imageFileToDataUrl(f) });
                      } catch (err) {
                        toast(err instanceof Error ? err.message : "Не удалось прочитать изображение", "error");
                      }
                    }}
                  />
                </label>
                {editor.cover && (
                  <button className={btnGhost + " !py-2 !text-bad"} onClick={() => setEditor({ ...editor, cover: undefined })}>
                    <X size={15} /> Убрать
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Картинка обрезается до квадрата и сохраняется внутри плейлиста, поэтому не пропадёт без интернета.</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Название</span>
            <input className={inputCls} value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && editor.name.trim() && void saveEditor()} maxLength={80} autoFocus placeholder="Хиты шансона" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Описание</span>
            <textarea className={cn(inputCls, "min-h-[80px] resize-y")} value={editor.desc} onChange={(e) => setEditor({ ...editor, desc: e.target.value })} placeholder="Необязательно" />
          </label>
        </div>
      )}
    </Modal>
  );

  if (current)
    return (
      <>
        <Detail pl={current} off={off} online={online} onBack={() => setOpenId(null)} onEdit={() => setEditor({ id: current.id, name: current.name, desc: current.desc, cover: current.cover })} />
        {editorModal}
      </>
    );

  const toDiscover = (tab: string) => {
    localStorage.setItem("radio.discoverTab", tab);
    go("discover");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Плейлисты</h1>
          <p className="text-sm text-muted">
            Подкасты, песни и свои файлы. {lists?.length ?? 0} {lists?.length === 1 ? "плейлист" : "плейлистов"}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.flac,.wav"
            className="hidden"
            onChange={(e) => {
              const f = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (f.length) void importSongs(f);
            }}
          />
          <button className={btnPrimary} onClick={() => setEditor({ name: "", desc: "" })}>
            <Plus size={18} /> Новый плейлист
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
        <button disabled={busy} onClick={() => fileRef.current?.click()} className="group rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-ink/30 sm:p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-ink transition group-hover:bg-accent group-hover:text-accent-ink">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <FileUp size={18} />}
          </span>
          <span className="mt-2 block text-sm font-semibold">Свои песни</span>
          <span className="mt-0.5 hidden text-xs leading-snug text-muted sm:block">Файлы с устройства, сразу офлайн</span>
        </button>
        <button onClick={() => toDiscover("podcasts")} className="group rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-ink/30 sm:p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-ink transition group-hover:bg-accent group-hover:text-accent-ink"><Mic2 size={18} /></span>
          <span className="mt-2 block text-sm font-semibold">Подкасты</span>
          <span className="mt-0.5 hidden text-xs leading-snug text-muted sm:block">Серии и автоматические подписки</span>
        </button>
        <button onClick={() => toDiscover("collections")} className="group rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-ink/30 sm:p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-ink transition group-hover:bg-accent group-hover:text-accent-ink"><Download size={18} /></span>
          <span className="mt-2 block text-sm font-semibold">Музыка офлайн</span>
          <span className="mt-0.5 hidden text-xs leading-snug text-muted sm:block">Шансон, джаз, эстрада и другое</span>
        </button>
      </div>

      {(lists?.length ?? 0) > 1 && (
        <div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className={cn(inputCls, "w-full cursor-pointer sm:hidden")} aria-label="Фильтр плейлистов">
            {FILTERS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <div className="hidden flex-wrap gap-1.5 sm:flex">
          {FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium transition", filter === id ? "bg-ink text-bg" : "bg-surface text-ink ring-1 ring-line hover:bg-surface-2")}>
              {label}
            </button>
          ))}
          </div>
        </div>
      )}

      {loaded && (lists?.length ?? 0) === 0 ? (
        <div className="rounded-3xl border border-dashed border-line p-8 text-center md:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
            <Disc3 size={28} />
          </span>
          <p className="mt-4 font-display text-xl font-semibold">Здесь будут ваши плейлисты</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">Соберите серии любимых подкастов, подпишитесь на новые выпуски или скачайте сборник песен — например, хиты шансона — и слушайте без интернета.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button className={btnPrimary} onClick={() => toDiscover("collections")}>
              <Disc3 size={17} /> Музыка для офлайна
            </button>
            <button className={btnGhost} onClick={() => toDiscover("podcasts")}>
              <Mic2 size={16} /> Найти подкасты
            </button>
            <button className={btnGhost} onClick={() => fileRef.current?.click()}>
              <FileUp size={16} /> Свои песни
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((l) => (
            <Card key={l.id} pl={l} off={off} onOpen={() => setOpenId(l.id)} />
          ))}
          {loaded && visible.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">В этом фильтре пока ничего нет.</div>}
        </div>
      )}

      {(lists?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line p-4 text-sm">
          <span className="text-muted">Больше музыки и подкастов — в «Обзоре»: подкасты по сериям, коллекции песен для офлайна.</span>
          <span className="flex gap-2">
            <button className={btnGhost + " !py-2"} onClick={() => toDiscover("collections")}>
              Музыка офлайн
            </button>
            <button className={btnGhost + " !py-2"} onClick={() => toDiscover("podcasts")}>
              Подкасты
            </button>
          </span>
        </div>
      )}
      {editorModal}
    </div>
  );
}
