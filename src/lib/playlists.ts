import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, draftToStation, setSetting } from "./db";
import { player } from "./player";
import { connectivity } from "./connectivity";
import { downloadVod, removeVod } from "./offline";
import { episodeToItem, showEpisodes } from "./podcasts";
import { exportM3U } from "./m3u";
import { isLanUrl, uid } from "./templates";
import { toast } from "./toast";
import type { FallbackInfo, Playlist, PlaylistFollow, PlaylistItem, Station } from "./types";
import { snapshotImage } from "./images";
import { fixText } from "./text";

/**
 * Плейлисты: серии подкастов, песни, файлы с устройства и обычные станции в одном списке.
 * Хранятся в таблице настроек аккаунта (ключи «pl:<id>»), поэтому уходят в резервную копию и
 * переносятся при регистрации вместе с остальными данными.
 */

const PL = "pl:";
const PP = "pp:";
const coverMigrations = new Set<string>();

/** Станция плеера, соответствующая треку (префикс отделяет треки плейлистов от каталога). */
export const itemStationId = (itemId: string) => `pli:${itemId}`;
export const localUrl = (itemId: string) => `https://local.pocket-radio.invalid/${encodeURIComponent(itemId)}`;

/* ------------------------------------ хранилище ------------------------------------ */

async function loadAll(): Promise<Playlist[]> {
  const rows = await db.settings.where(":id").startsWith(PL).toArray();
  const lists = rows
    .map((r) => r.value as Playlist)
    .map((p) => ({ ...p, name: fixText(p.name), desc: fixText(p.desc), cover: p.cover || p.follow?.art || p.items?.find((i) => i.logo)?.logo, items: dedupe(p.items ?? []) }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  // Старые плейлисты создавались без поля cover. Мигрируем их один раз в фоне.
  for (const p of lists) {
    if (!p.cover || coverMigrations.has(p.id)) continue;
    const raw = rows.find((r) => r.key === PL + p.id)?.value as Playlist | undefined;
    if (raw?.cover) continue;
    coverMigrations.add(p.id);
    void snapshotImage(p.cover).then((cover) => updatePlaylist(p.id, { cover })).catch(() => undefined);
  }
  return lists;
}

export const listPlaylists = loadAll;

export function usePlaylists(): Playlist[] | undefined {
  return useLiveQuery(loadAll, []);
}

export async function getPlaylist(id: string): Promise<Playlist | undefined> {
  const r = await db.settings.get(PL + id);
  return r ? (r.value as Playlist) : undefined;
}

const save = (p: Playlist) => setSetting(PL + p.id, p);

async function mutate(id: string, fn: (p: Playlist) => void): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    const p = await getPlaylist(id);
    if (!p) return;
    fn(p);
    p.updatedAt = Date.now();
    await save(p);
  });
}

function dedupe(items: PlaylistItem[]): PlaylistItem[] {
  const seen = new Set<string>();
  return items
    .map((i) => ({ ...i, title: fixText(i.title), subtitle: fixText(i.subtitle) || undefined, note: fixText(i.note) || undefined }))
    .filter((i) => !seen.has(i.id) && !!seen.add(i.id));
}

export async function createPlaylist(name: string, items: PlaylistItem[] = [], extra: { desc?: string; follow?: PlaylistFollow; cover?: string } = {}): Promise<Playlist> {
  const now = Date.now();
  const candidate = extra.cover || extra.follow?.art || items.find((i) => i.logo)?.logo;
  const p: Playlist = { id: uid(), name: name.trim().slice(0, 80) || "Новый плейлист", desc: (extra.desc ?? "").trim(), cover: candidate, items: dedupe(items), follow: extra.follow, createdAt: now, updatedAt: now };
  await save(p);
  // Копия изображения остаётся в плейлисте даже после очистки HTTP-кэша.
  if (candidate && !candidate.startsWith("data:")) {
    void snapshotImage(candidate).then((cover) => {
      if (cover !== candidate) void updatePlaylist(p.id, { cover });
    });
  }
  return p;
}

export async function updatePlaylist(id: string, patch: { name?: string; desc?: string; cover?: string | null }): Promise<void> {
  await mutate(id, (p) => {
    if (patch.name !== undefined) p.name = patch.name.trim().slice(0, 80) || p.name;
    if (patch.desc !== undefined) p.desc = patch.desc.trim();
    if (patch.cover !== undefined) p.cover = patch.cover || undefined;
  });
}

/** Добавляет треки; уже имеющиеся пропускает. Возвращает, сколько добавлено. */
export async function addItems(id: string, items: PlaylistItem[]): Promise<number> {
  let added = 0;
  await mutate(id, (p) => {
    const have = new Set(p.items.map((i) => i.id));
    const fresh = dedupe(items).filter((i) => !have.has(i.id));
    added = fresh.length;
    p.items = [...p.items, ...fresh];
    if (!p.cover) p.cover = fresh.find((i) => i.logo)?.logo;
  });
  return added;
}

export async function removeItem(id: string, itemId: string): Promise<void> {
  await mutate(id, (p) => {
    p.items = p.items.filter((i) => i.id !== itemId);
  });
  setTimeout(() => void gcLocalFiles(), 9000);
}

export async function moveItem(id: string, itemId: string, dir: -1 | 1): Promise<void> {
  await mutate(id, (p) => {
    const i = p.items.findIndex((x) => x.id === itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.items.length) return;
    const next = [...p.items];
    [next[i], next[j]] = [next[j], next[i]];
    p.items = next;
  });
}

/** Удаляет плейлист и возвращает его, чтобы можно было отменить. Файлы с устройства чистятся позже. */
export async function deletePlaylist(id: string): Promise<Playlist | undefined> {
  const p = await getPlaylist(id);
  if (!p) return undefined;
  await db.settings.delete(PL + id);
  setTimeout(() => void gcLocalFiles(), 9000);
  return p;
}

export async function restorePlaylist(p: Playlist): Promise<void> {
  await save(p);
}

/** Убирает из офлайн-хранилища файлы с устройства, которых нет ни в одном плейлисте. */
export async function gcLocalFiles(): Promise<void> {
  try {
    const lists = await loadAll();
    const used = new Set(lists.flatMap((p) => p.items.map((i) => itemStationId(i.id))));
    const off = await db.offline.toArray();
    for (const o of off) {
      if (o.stationId.startsWith("pli:lf-") && !used.has(o.stationId)) {
        await removeVod({ id: o.stationId, url: localUrl(o.stationId.slice(4)) });
      }
    }
  } catch {
    /* хранилище недоступно */
  }
}

/* ---------------------------------- прогресс по трекам ---------------------------------- */

export async function loadProgress(itemIds: string[]): Promise<Map<string, number>> {
  const rows = await db.settings.bulkGet(itemIds.map((id) => PP + itemStationId(id)));
  const m = new Map<string, number>();
  rows.forEach((r, i) => {
    const v = r?.value;
    if (typeof v === "number" && v > 0) m.set(itemIds[i], v);
  });
  return m;
}

// плеер сообщает позицию каждые несколько секунд — запоминаем, чтобы подкаст продолжился с того же места
player.setProgressSink((st, pos) => {
  if (st.id.startsWith("pli:")) void setSetting(PP + st.id, Math.max(0, Math.floor(pos)));
});

/* ------------------------------------ преобразования ------------------------------------ */

export function itemToStation(i: PlaylistItem, pos?: number): Station {
  const s = draftToStation({
    id: itemStationId(i.id),
    name: i.title,
    url: i.url,
    kind: i.kind,
    genre: i.genre ?? (i.kind === "vod" ? "Музыка" : ""),
    city: i.subtitle ?? "",
    tags: [],
    icon: "",
    note: i.note ?? "",
    logo: i.logo,
  });
  if (pos) s.resumePos = pos;
  return s;
}

export function stationToItem(s: Station): PlaylistItem {
  return {
    id: s.id.startsWith("pli:") ? s.id.slice(4) : s.id,
    title: s.name,
    subtitle: [s.genre, s.city].filter(Boolean).join(" · ") || undefined,
    url: s.url,
    kind: s.kind,
    logo: s.logo,
    genre: s.genre || undefined,
    note: s.note || undefined,
    addedAt: Date.now(),
  };
}

/** Можно ли включить трек без интернета. */
export function playableOffline(i: PlaylistItem, off: Set<string>): boolean {
  if (i.local) return true;
  if (i.kind === "vod") return off.has(itemStationId(i.id));
  return i.kind === "lan" || isLanUrl(i.url);
}

export function playlistSeconds(p: Pick<Playlist, "items">): number {
  return p.items.reduce((a, i) => a + (i.duration ?? 0), 0);
}

export function exportPlaylistM3U(p: Playlist): string {
  return exportM3U(p.items.filter((i) => !i.local).map((i) => itemToStation(i)));
}

/* -------------------------------------- воспроизведение -------------------------------------- */

const shuffled = <T,>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

/** Включает плейлист как очередь: треки идут друг за другом, без сети — только скачанные. */
export async function playPlaylist(pl: Playlist, o: { startId?: string; shuffle?: boolean; fallback?: FallbackInfo } = {}): Promise<void> {
  const off = new Set((await db.offline.toArray()).map((x) => x.stationId));
  const online = connectivity.isOnline();
  let items = online ? pl.items : pl.items.filter((i) => playableOffline(i, off));
  if (!items.length) {
    toast(pl.items.length ? "Нет сети, а в плейлисте нет скачанных треков. Скачайте их заранее" : "В плейлисте пока пусто", "info");
    return;
  }
  if (items.length < pl.items.length) toast(`Без сети доступно ${items.length} из ${pl.items.length} треков`, "info");
  if (o.shuffle) items = shuffled(items);
  const prog = await loadProgress(items.map((i) => i.id));
  const stations = items.map((i) => itemToStation(i, prog.get(i.id)));
  const startSid = o.startId ? itemStationId(o.startId) : null;
  const start = (startSid && stations.find((s) => s.id === startSid)) || stations[0];
  player.pin(stations);
  await player.play(start, stations.map((s) => s.id), o.fallback ? { fallback: o.fallback } : undefined);
}

/* ------------------------------------ скачивание офлайн ------------------------------------ */

export interface DlState {
  running: boolean;
  playlistId: string | null;
  label: string;
  done: number;
  total: number;
  failed: number;
  current: string;
  pct: number;
}

const IDLE: DlState = { running: false, playlistId: null, label: "", done: 0, total: 0, failed: 0, current: "", pct: 0 };
let dl: DlState = IDLE;
let ctl: AbortController | null = null;
const dlSubs = new Set<() => void>();

function setDl(next: DlState) {
  dl = next;
  dlSubs.forEach((f) => f());
}

export function useDownloads(): DlState {
  return useSyncExternalStore(
    (f) => {
      dlSubs.add(f);
      return () => {
        dlSubs.delete(f);
      };
    },
    () => dl
  );
}

export function cancelDownloads() {
  ctl?.abort();
}

/** Сколько треков из списка ещё можно скачать. */
export function downloadable(items: PlaylistItem[], off: Set<string>): PlaylistItem[] {
  return items.filter((i) => !i.local && i.kind === "vod" && !off.has(itemStationId(i.id)));
}

/** Скачивает треки в офлайн-хранилище по одному. Работает в фоне, пока приложение открыто. */
export async function downloadItems(playlistId: string, items: PlaylistItem[], label: string): Promise<void> {
  if (dl.running) {
    toast("Уже идёт скачивание — дождитесь окончания или остановите его", "info");
    return;
  }
  if (!connectivity.isOnline()) {
    toast("Нет интернета: скачать сейчас нельзя", "error");
    return;
  }
  const off = new Set((await db.offline.toArray()).map((o) => o.stationId));
  const todo = downloadable(items, off);
  if (!todo.length) {
    toast("Всё уже скачано", "ok");
    return;
  }
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* необязательно */
  }
  const ac = new AbortController();
  ctl = ac;
  setDl({ running: true, playlistId, label, done: 0, total: todo.length, failed: 0, current: "", pct: 0 });
  let quota = false;
  for (const it of todo) {
    if (ac.signal.aborted) break;
    setDl({ ...dl, current: it.title, pct: 0 });
    try {
      await downloadVod(
        itemToStation(it),
        (loaded, total) => {
          const pct = total ? loaded / total : 0;
          if (Math.abs(pct - dl.pct) >= 0.01) setDl({ ...dl, pct });
        },
        ac.signal
      );
      setDl({ ...dl, done: dl.done + 1, pct: 0 });
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") break;
      if (err.name === "QuotaExceededError") {
        quota = true;
        break;
      }
      setDl({ ...dl, failed: dl.failed + 1 });
    }
  }
  const fin = dl;
  const aborted = ac.signal.aborted;
  ctl = null;
  setDl(IDLE);
  if (quota) toast("Не хватило места на устройстве. Удалите лишнее в Настройки → Данные", "error");
  else if (aborted) toast(`Скачивание остановлено: готово ${fin.done} из ${fin.total}`, "info");
  else if (fin.failed) toast(`Скачано ${fin.done}, не удалось ${fin.failed}: сервер не разрешает скачивание (CORS) — такие треки играют только онлайн`, "error");
  else toast(`Готово: скачано ${fin.done} — теперь это работает без интернета`, "ok");
}

export async function removeOffline(items: PlaylistItem[]): Promise<void> {
  for (const i of items) if (!i.local) await removeVod({ id: itemStationId(i.id), url: i.url });
}

/* ------------------------------------ подписки на подкасты ------------------------------------ */

/** Подтягивает новые серии подписки и кладёт их в начало. Возвращает число новых. */
export async function refreshFollow(p: Playlist): Promise<number> {
  const f = p.follow;
  if (!f) return 0;
  const eps = await showEpisodes({ id: f.showId, name: f.name, artist: f.artist, art: f.art, genre: f.genre, episodes: 0 }, f.country, undefined, 60);
  const have = new Set(p.items.map((i) => i.id));
  const fresh = eps.filter((e) => !have.has(e.id)).map(episodeToItem);
  await mutate(p.id, (pl) => {
    pl.items = [...fresh, ...pl.items];
    if (!pl.cover && f.art) pl.cover = f.art;
    if (pl.follow) pl.follow.checkedAt = Date.now();
  });
  return fresh.length;
}
