import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, FolderPlus, HardDrive, Loader2, Pause, Play, Search, Shuffle, X } from "lucide-react";
import { useOfflineItems, useStations } from "../lib/hooks";
import { createPlaylist, useDownloads, usePlaylists } from "../lib/playlists";
import { reconcileOfflineCache } from "../lib/offline";
import { addLocalFiles } from "../lib/localFiles";
import { findOfflineTracks, offlineLibrary, type OfflineFilter, type OfflineSort, type OfflineTrack } from "../lib/offlineLibrary";
import { player, usePlayer } from "../lib/player";
import { gotoPlaylist } from "../lib/picker";
import { fmtBytes, fmtClock } from "../lib/templates";
import { toast } from "../lib/toast";
import { Cover, btnGhost, btnPrimary, inputCls } from "./ui";

export function OfflineMusicLibrary({ onDiscover }: { onDiscover: () => void }) {
  const stations = useStations(), playlists = usePlaylists(), downloads = useOfflineItems(), transfer = useDownloads();
  const p = usePlayer();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OfflineFilter>("all");
  const [sort, setSort] = useState<OfflineSort>("recent");
  const [checked, setChecked] = useState(false);
  const [importing, setImporting] = useState(false);
  const [limit, setLimit] = useState(80);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let disposed = false;
    void reconcileOfflineCache().finally(() => { if (!disposed) setChecked(true); });
    const verify = () => { if (!document.hidden) void reconcileOfflineCache(); };
    document.addEventListener("visibilitychange", verify);
    return () => { disposed = true; document.removeEventListener("visibilitychange", verify); };
  }, []);
  const library = useMemo(() => offlineLibrary(stations ?? [], playlists ?? [], downloads), [stations, playlists, downloads]);
  const rows = useMemo(() => findOfflineTracks(library, query, filter, sort), [library, query, filter, sort]);
  useEffect(() => setLimit(80), [query, filter, sort]);
  const loading = !checked || !stations || !playlists;
  const play = (row: OfflineTrack, shuffle = false) => {
    const queueStations = rows.map(r => r.station);
    player.pin(queueStations);
    const queue = shuffle ? player.shuffleQueue(queueStations) : queueStations.map(s => s.id);
    const first = shuffle ? queueStations.find(s => s.id === queue[0])! : row.station;
    void player.play(first, queue, { sourceContext: { kind: "collection", title: "Музыка на устройстве" } });
  };
  const importFiles = async (files: File[]) => {
    if (!files.length || importing) return;
    setImporting(true);
    try {
      const { items, skipped } = await addLocalFiles(files);
      if (items.length) {
        const playlist = await createPlaylist("Файлы с устройства", items);
        toast(`Добавлено файлов: ${items.length}${skipped ? ` · пропущено: ${skipped}` : ""}`, "ok", { label: "Открыть", run: () => gotoPlaylist(playlist.id) });
      }
    } catch { toast("Не удалось сохранить файлы. Проверьте свободное место", "error"); }
    finally { setImporting(false); }
  };
  return <section className="offline-library space-y-4" aria-label="Музыка на устройстве">
    <header className="offline-library-heading">
      <div><span className="offline-library-eyebrow"><HardDrive size={15}/> Без интернета</span><h2>Ваша офлайн-фонотека</h2><p>Скачанные треки и импортированные файлы из всех плейлистов. Поиск по названию, исполнителю, альбому и плейлисту.</p></div>
      <button className={btnGhost} disabled={importing} onClick={() => input.current?.click()}>{importing ? <Loader2 className="animate-spin" size={17}/> : <FolderPlus size={17}/>} {importing ? "Читаем файлы…" : "Добавить файлы"}</button>
      <input ref={input} type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.flac,.wav,.weba" hidden aria-label="Аудиофайлы с устройства" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void importFiles(files); }}/>
    </header>
    {transfer.running && <div className="offline-download-status" role="status"><Download size={17}/><span>Скачивается: {transfer.current || transfer.label}<small>{transfer.done} из {transfer.total} · {Math.round(transfer.pct * 100)}%</small></span>{transfer.playlistId && <button onClick={() => gotoPlaylist(transfer.playlistId!)}>Открыть</button>}</div>}
    <div className="offline-search-panel">
      <label className="offline-library-query"><Search size={18}/><input type="search" value={query} maxLength={200} onChange={e => setQuery(e.target.value)} placeholder="Трек, исполнитель, альбом…" aria-label="Поиск по музыке на устройстве" autoComplete="off"/>{query && <button onClick={() => setQuery("")} aria-label="Очистить поиск на устройстве"><X size={18}/></button>}</label>
      <div className="offline-library-options"><div role="group" aria-label="Тип файлов">{([["all", "Всё"], ["downloaded", "Скачанное"], ["local", "Свои файлы"]] as const).map(([id, name]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{name}</button>)}</div><select aria-label="Порядок офлайн-треков" className={inputCls} value={sort} onChange={e => setSort(e.target.value as OfflineSort)}><option value="recent">Сначала новые</option><option value="title">По названию</option><option value="artist">По исполнителю</option></select></div>
    </div>
    <div className="offline-library-summary"><p role="status" aria-live="polite">{loading ? "Проверяем файлы на устройстве…" : `Найдено: ${rows.length} из ${library.length} · ${fmtBytes(rows.reduce((n,r) => n+r.size,0))}`}</p>{!!rows.length && !loading && <div><button className={btnPrimary} onClick={() => play(rows[0])}><Play size={15}/> Слушать найденное</button><button className={btnGhost} aria-label="Перемешать найденные треки" onClick={() => play(rows[0],true)}><Shuffle size={17}/></button></div>}</div>
    {!loading && !rows.length ? <div className="offline-library-empty"><HardDrive size={32}/><h3>{library.length ? "Нет совпадений" : "Здесь будет ваша музыка"}</h3><p>{library.length ? "Попробуйте отдельные слова из названия, имя исполнителя или снимите фильтр." : "Добавьте аудиофайлы с устройства или найдите музыку и скачайте её. Недоступные и удалённые из кэша файлы сюда не попадают."}</p>{library.length ? <button className={btnGhost} onClick={() => { setQuery(""); setFilter("all"); }}>Сбросить поиск и фильтр</button> : <button className={btnPrimary} onClick={onDiscover}>Найти музыку для скачивания</button>}</div> : <ol className="offline-library-list">{(loading ? [] : rows).slice(0,limit).map(row => {
      const current = p.station?.id === row.station.id, playing = current && p.status === "playing";
      return <li key={row.station.id} data-offline-track={row.station.id} aria-current={current ? "true" : undefined}>
        <button className="offline-track-play" aria-label={`${playing ? "Пауза" : "Слушать"}: ${row.station.name}`} onClick={() => current ? player.toggle() : play(row)}><Cover s={row.station} size={48}/><span>{playing ? <Pause size={18}/> : <Play size={18}/>}</span></button>
        <div className="offline-track-copy"><strong>{row.station.name}</strong><small>{[row.station.city, row.album].filter(Boolean).join(" · ") || "Без исполнителя"}</small><span>{row.local ? "Свой файл" : "Скачано"} · {fmtBytes(row.size)}{row.duration ? ` · ${fmtClock(row.duration)}` : ""}</span></div>
        {!!row.playlists.length && <button className="offline-track-source" onClick={() => gotoPlaylist(row.playlists[0].id)} aria-label={`Открыть плейлист «${row.playlists[0].name}» для «${row.station.name}»`} title={row.playlists.map(pl => pl.name).join(", ")}><span>{row.playlists[0].name}</span><ArrowUpRight size={18}/></button>}
      </li>;
    })}</ol>}
    {rows.length > limit && <button className={btnGhost} onClick={() => setLimit(n => n+80)}>Показать ещё · {limit} из {rows.length}</button>}
  </section>;
}
