import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { activeDbName, db, setSetting } from "./db";
import { itemStationId, itemToStation, loadProgress } from "./playlistModel";
export { itemStationId, itemToStation, loadProgress } from "./playlistModel";
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

export const localUrl = (itemId: string) => `https://local.pocket-radio.invalid/${encodeURIComponent(itemId)}`;

/* ------------------------------------ хранилище ------------------------------------ */

async function loadAll(): Promise<Playlist[]> {
  const rows = await db.settings.where(":id").startsWith(PL).toArray();
  const lists = rows
    .map((r) => r.value as Playlist)
    .map((p) => ({ ...p, name: fixText(p.name), desc: fixText(p.desc), cover: p.cover || p.follow?.art || p.items?.find((i) => i.logo)?.logo, items: dedupe(p.items ?? []) }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  // Старые плейлисты получают одну главную обложку с первого трека и пытаются сохранить её локально.
  for (const p of lists) {
    if (!p.cover || coverMigrations.has(p.id)) continue;
    const raw = rows.find((r) => r.key === PL + p.id)?.value as Playlist | undefined;
    if (raw?.cover) continue;
    coverMigrations.add(p.id);
    const candidate = p.cover;
    const scope = activeDbName();
    // loadAll может вызываться внутри Dexie liveQuery; откладываем запись до закрытия read-транзакции.
    setTimeout(() => {
      if (scope !== activeDbName()) {
        coverMigrations.delete(p.id);
        return;
      }
      void mutate(p.id, (current) => {
        if (!current.cover) current.cover = candidate;
      })
        .then(() => snapshotPlaylistCover(p.id, candidate))
        .catch(() => coverMigrations.delete(p.id));
    }, 0);
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

/** Сохраняет сетевую обложку в playlist data, но не перезаписывает выбор пользователя. */
function snapshotPlaylistCover(id: string, source: string): void {
  if (!source || source.startsWith("data:")) return;
  void snapshotImage(source)
    .then(async (cover) => {
      if (cover === source) return;
      const current = await getPlaylist(id);
      if (current?.cover === source) await updatePlaylist(id, { cover });
    })
    .catch(() => undefined);
}

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
  // Берём одну обложку альбома/подписки/первого трека и сразу пытаемся сохранить её внутри плейлиста.
  if (candidate) snapshotPlaylistCover(p.id, candidate);
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
  let coverCandidate: string | undefined;
  await mutate(id, (p) => {
    const have = new Set(p.items.map((i) => i.id));
    const fresh = dedupe(items).filter((i) => !have.has(i.id));
    added = fresh.length;
    p.items = [...p.items, ...fresh];
    if (!p.cover) {
      coverCandidate = fresh.find((i) => i.logo)?.logo;
      if (coverCandidate) p.cover = coverCandidate;
    }
  });
  if (coverCandidate) snapshotPlaylistCover(id, coverCandidate);
  return added;
}

export async function removeItem(id: string, itemId: string): Promise<void> {
  const removed = (await getPlaylist(id))?.items.find((item) => item.id === itemId);
  await mutate(id, (p) => {
    p.items = p.items.filter((i) => i.id !== itemId);
  });
  setTimeout(() => void gcUnusedPlaylistAudio(removed ? [removed] : []), 9000);
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

/** Удаляет плейлист и возвращает его, чтобы можно было отменить; неиспользуемые загрузки очищаются позже. */
export async function deletePlaylist(id: string): Promise<Playlist | undefined> {
  const p = await getPlaylist(id);
  if (!p) return undefined;
  await db.settings.delete(PL + id);
  // Оставляем время на «Отменить»; общие с другими плейлистами загрузки GC сохранит.
  setTimeout(() => void gcUnusedPlaylistAudio(p.items), 9000);
  return p;
}

export async function restorePlaylist(p: Playlist): Promise<void> {
  await save(p);
}

/** Удаляет из кэша аудио всех треков «pli:», которые больше не используются ни одним плейлистом. */
export async function gcUnusedPlaylistAudio(extraItems: PlaylistItem[] = []): Promise<void> {
  const scope = activeDbName();
  try {
    const [lists, offline] = await Promise.all([loadAll(), db.offline.toArray()]);
    if (scope !== activeDbName()) return;
    const used = new Set(lists.flatMap((p) => p.items.map((i) => itemStationId(i.id))));
    const urls = new Map(lists.flatMap((p) => p.items.map((i) => [itemStationId(i.id), i.url] as const)));
    for (const item of extraItems) urls.set(itemStationId(item.id), item.url);
    for (const item of offline) {
      if (scope !== activeDbName()) return;
      if (item.stationId.startsWith("pli:") && !used.has(item.stationId)) {
        // Удаляем и новый изолированный ключ, и legacy URL-ключ, если он сохранился.
        await removeVod({ id: item.stationId, url: urls.get(item.stationId) ?? "" });
      }
    }
  } catch {
    /* хранилище недоступно */
  }
}

/* ---------------------------------- прогресс по трекам ---------------------------------- */

// Современный формат хранит время изменения для безопасного объединения прогресса между устройствами.
// Старые числовые значения по-прежнему читаются в loadProgress и импортируются как legacy.
player.setProgressSink((st, pos) => {
  if (st.id.startsWith("pli:")) void setSetting(PP + st.id, { position: Math.max(0, Math.floor(pos)), updatedAt: Date.now() });
});

/* ------------------------------------ преобразования ------------------------------------ */

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
  // И свои файлы, и скачанные эпизоды лежат в Cache API; признак local сам по себе кэша не гарантирует.
  if (i.local || i.kind === "vod") return off.has(itemStationId(i.id));
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
  await player.play(start, stations.map((s) => s.id), { fallback: o.fallback, sourcePlaylistId: pl.id, sourceContext: { kind: "playlist", title: pl.name } });
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
  // Скачивание могло завершиться уже после удаления трека/плейлиста.
  await gcUnusedPlaylistAudio(todo);
  if (quota) toast("Не хватило места на устройстве. Удалите лишнее в Настройки → Данные", "error");
  else if (aborted) toast(`Скачивание остановлено: готово ${fin.done} из ${fin.total}`, "info");
  else if (fin.failed) toast(`Скачано ${fin.done}, не удалось ${fin.failed}: сервер не разрешает скачивание (CORS) — такие треки играют только онлайн`, "error");
  else toast(`Готово: скачано ${fin.done} — теперь это работает без интернета`, "ok");
}

/** Удаляет загрузки этого плейлиста, сохраняя файл, если тот же трек нужен другому плейлисту. */
export async function removeOffline(items: PlaylistItem[], playlistId: string): Promise<number> {
  const lists = await listPlaylists();
  const usedElsewhere = new Set(
    lists.filter((playlist) => playlist.id !== playlistId).flatMap((playlist) => playlist.items.map((item) => itemStationId(item.id)))
  );
  let removed = 0;
  for (const item of items) {
    if (item.local) continue;
    const id = itemStationId(item.id);
    if (usedElsewhere.has(id)) continue;
    await removeVod({ id, url: item.url });
    removed++;
  }
  return removed;
}

/* ------------------------------------ подписки на подкасты ------------------------------------ */

/** Подтягивает новые серии подписки и кладёт их в начало. Возвращает число новых. */
export async function refreshFollow(p: Playlist): Promise<number> {
  const f = p.follow;
  if (!f) return 0;
  const eps = await showEpisodes({ id: f.showId, name: f.name, artist: f.artist, art: f.art, genre: f.genre, episodes: 0 }, f.country, undefined, 60);
  const have = new Set(p.items.map((i) => i.id));
  const fresh = eps.filter((e) => !have.has(e.id)).map(episodeToItem);
  let coverCandidate: string | undefined;
  await mutate(p.id, (pl) => {
    pl.items = [...fresh, ...pl.items];
    if (!pl.cover && f.art) {
      pl.cover = f.art;
      coverCandidate = f.art;
    }
    if (pl.follow) pl.follow.checkedAt = Date.now();
  });
  if (coverCandidate) snapshotPlaylistCover(p.id, coverCandidate);
  return fresh.length;
}
