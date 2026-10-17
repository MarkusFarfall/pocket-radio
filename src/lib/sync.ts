import { useSyncExternalStore } from "react";
import { activeDbName, db, exportJSON, importJSON, type ImportJSONResult, type SyncMeta } from "./db";
import { currentUserId, getAccessToken, supabaseConfig } from "./auth/supabase";
import { provider } from "./auth";
import { CloudError, probeDocs, restJson, type CloudReadiness } from "./cloud";
import { applyDocs, buildAllDocs, buildDoc, metaForDoc, type SyncDoc } from "./syncDocs";
import { docKind, hashDoc } from "./syncKeys";
import { markSyncAll, onSyncSignal } from "./syncBus";

/**
 * Полная синхронизация аккаунта.
 *
 * Каждая сущность — отдельный документ в `sync_docs`: станция, плейлист (вместе с
 * пользовательской обложкой), прогресс, сохранённый трек, сессия, событие и настройка
 * оформления. Скачанные аудиофайлы не переносятся: они остаются на своём устройстве,
 * облако хранит только метаданные плейлистов.
 *
 * Почему не одним снимком, как раньше: у REST Supabase ограничение на размер запроса,
 * а снимок со статистикой и обложками легко перерастает его. Документы также позволяют
 * передавать удаления и обмениваться только изменениями.
 *
 * Старые функции pushToCloud/pullFromCloud оставлены как ручная резервная копия в
 * таблице user_data: они нужны для совместимости и как запасной путь.
 */

/* ---------------------------------- состояние ---------------------------------- */

export type SyncPhase = "off" | "idle" | "syncing" | "ready" | "error" | "setup";

export interface SyncState {
  active: boolean;
  userId: string | null;
  auto: boolean;
  phase: SyncPhase;
  error: string | null;
  lastSyncAt: number | null;
  readiness: CloudReadiness | null;
  pushed: number;
  pulled: number;
  pending: number;
}

const AUTO_KEY = "pr.sync.auto";
const PULL_KEY = "pr.sync.pull";
const AT_KEY = "pr.sync.at";
const LEGACY_KEY = "pr.sync.legacy";
const PAGE = 500;
const PUSH_BYTES = 320_000;

const initialPref = (key: string) => {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
};

let state: SyncState = {
  active: false,
  userId: null,
  auto: initialPref(AUTO_KEY),
  phase: "off",
  error: null,
  lastSyncAt: null,
  readiness: null,
  pushed: 0,
  pulled: 0,
  pending: 0,
};

const subscribers = new Set<() => void>();
function emit(patch: Partial<SyncState> = {}) {
  state = { ...state, ...patch };
  subscribers.forEach((notify) => notify());
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => state
  );
}

export const getSyncState = () => state;

function prefOn(key: string) {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function prefSet(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* приватный режим */
  }
}

export const syncAvailable = () => provider.id === "supabase";

export function setAutoSync(value: boolean) {
  prefSet(AUTO_KEY, value);
  emit({ auto: value });
  if (value) void queueCycle("manual");
}

const readPull = (userId: string) => {
  try {
    return localStorage.getItem(`${PULL_KEY}:${userId}`);
  } catch {
    return null;
  }
};

const savePull = (userId: string, value: string) => {
  try {
    localStorage.setItem(`${PULL_KEY}:${userId}`, value);
  } catch {
    /* необязательный чекпоинт */
  }
};

const readAt = (userId: string) => {
  try {
    const value = Number(localStorage.getItem(`${AT_KEY}:${userId}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

const saveAt = (userId: string, value: number) => {
  try {
    localStorage.setItem(`${AT_KEY}:${userId}`, String(value));
  } catch {
    /* ignore */
  }
};

const legacyDone = (userId: string) => {
  try {
    return localStorage.getItem(`${LEGACY_KEY}:${userId}`) === "1";
  } catch {
    return false;
  }
};

const markLegacyDone = (userId: string) => {
  try {
    localStorage.setItem(`${LEGACY_KEY}:${userId}`, "1");
  } catch {
    /* ignore */
  }
};

/* ---------------------------------- движок ---------------------------------- */

interface Engine {
  userId: string;
  dbName: string;
  stopped: boolean;
  pending: Set<string>;
  lastPull: string | null;
  lastPullCheck: number;
  lastFull: number;
  timers: number[];
  unsubscribe: () => void;
  cleanups: (() => void)[];
}

let engine: Engine | null = null;
let chain: Promise<void> = Promise.resolve();
let cycleQueued = false;
let deferredTimer: number | null = null;
let lastCycleAt = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function startSync(userId: string, force = false): () => void {
  if (!force && !syncAvailable()) return () => undefined;
  if (engine && engine.userId === userId && !engine.stopped) return () => stopSync();
  stopSync();
  const created: Engine = {
    userId,
    dbName: activeDbName(),
    stopped: false,
    pending: new Set(),
    lastPull: readPull(userId),
    lastPullCheck: 0,
    lastFull: 0,
    timers: [],
    unsubscribe: () => undefined,
    cleanups: [],
  };
  engine = created;
  emit({
    active: true,
    userId,
    auto: prefOn(AUTO_KEY),
    phase: "idle",
    error: null,
    lastSyncAt: readAt(userId),
    pushed: 0,
    pulled: 0,
    pending: 0,
  });

  created.unsubscribe = onSyncSignal((keys) => {
    if (!engine || engine.stopped) return;
    keys.forEach((key) => engine!.pending.add(key));
    emit({ pending: created.pending.size });
    void queueCycle("signal");
  });

  const timer = window.setInterval(() => {
    if (!engine || engine.stopped) return;
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (engine.pending.size && prefOn(AUTO_KEY)) void queueCycle("pending");
    else if (now - engine.lastPullCheck > 25_000 && prefOn(AUTO_KEY)) void queueCycle("timer");
  }, 6000);
  created.timers.push(timer);

  const onVisible = () => {
    if (document.visibilityState === "visible") void queueCycle("timer");
  };
  const onOnline = () => void queueCycle("manual");
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  created.cleanups.push(() => document.removeEventListener("visibilitychange", onVisible));
  created.cleanups.push(() => window.removeEventListener("online", onOnline));

  void queueCycle("start");
  return () => stopSync();
}

export function stopSync() {
  if (!engine) return;
  engine.stopped = true;
  engine.timers.forEach((timer) => window.clearInterval(timer));
  engine.cleanups.forEach((cleanup) => cleanup());
  engine.unsubscribe();
  engine = null;
  // Старая цепочка могла остаться «занятой»: иначе первый цикл нового входа не запустится.
  chain = Promise.resolve();
  cycleQueued = false;
  lastCycleAt = 0;
  if (deferredTimer !== null) {
    window.clearTimeout(deferredTimer);
    deferredTimer = null;
  }
  emit({ active: false, userId: null, phase: "off", pending: 0 });
}

function queueCycle(reason: CycleReason): Promise<void> {
  if (!engine || engine.stopped) return Promise.resolve();
  if (cycleQueued && reason !== "manual") return chain;
  // Воспроизведение пишет сессию каждые несколько секунд. Не превращаем это в поток
  // запросов: автоматические циклы идут не чаще раза в 2 секунды.
  if (reason !== "manual" && deferredTimer === null && Date.now() - lastCycleAt < 2000) {
    deferredTimer = window.setTimeout(() => {
      deferredTimer = null;
      void queueCycle(reason);
    }, 2000);
    return chain;
  }
  if (deferredTimer !== null) {
    window.clearTimeout(deferredTimer);
    deferredTimer = null;
  }
  lastCycleAt = Date.now();
  cycleQueued = true;
  chain = chain
    .then(() => runCycle(reason))
    .catch(() => undefined)
    .finally(() => {
      cycleQueued = false;
    });
  return chain;
}

type CycleReason = "start" | "signal" | "pending" | "timer" | "manual";

async function runCycle(reason: CycleReason) {
  const current = engine;
  if (!current || current.stopped) return;
  if (!currentUserId() || currentUserId() !== current.userId) {
    stopSync();
    return;
  }
  if (activeDbName() !== current.dbName) {
    // Пользователь переключил профиль — двигатель перезапустит App.
    stopSync();
    return;
  }
  const manual = reason === "manual" || reason === "start";
  const auto = prefOn(AUTO_KEY);
  if (!auto && !manual) return;

  if (reason !== "timer") emit({ phase: "syncing", error: null });
  try {
    const ready = await ensureReady(current);
    if (!ready) return;
    if (!current.stopped) await migrateLegacy(current);
    // На каждое локальное изменение не нужно тянуть весь список: пуш идёт сразу,
    // а встречная проверка — не чаще раза в 15 секунд.
    const pullDue = manual || reason === "timer" || Date.now() - current.lastPullCheck > 15_000;
    const pulled = pullDue ? await pullDocs(current, manual) : 0;
    const fullScan = manual || Date.now() - current.lastFull > 10 * 60_000;
    if (!current.stopped && (fullScan || current.pending.size)) {
      await pushDocs(current, fullScan);
      if (fullScan) current.lastFull = Date.now();
    }
    if (!current.stopped) {
      const at = Date.now();
      saveAt(current.userId, at);
      emit({ phase: "ready", lastSyncAt: at, pushed: 0, pending: current.pending.size, pulled });
    }
  } catch (error) {
    if (current.stopped) return;
    const message = error instanceof Error ? error.message : "Синхронизация не удалась";
    if (error instanceof CloudError && error.code === "auth") {
      emit({ phase: "error", error: message });
      stopSync();
      return;
    }
    emit({ phase: "error", error: message });
  }
}

async function ensureReady(_current: Engine): Promise<boolean> {
  try {
    if (state.readiness?.docs) return true;
    // Один раз за сеанс отрицательный ответ кешируем: иначе каждая правка упирается в сеть.

    const docs = await probeDocs();
    emit({ readiness: { docs } });
    if (!docs) {
      emit({ phase: "setup", error: "В проекте Supabase ещё нет таблицы sync_docs. Один раз выполните supabase/schema.sql в SQL Editor." });
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof CloudError && error.code === "network") {
      emit({ phase: "idle", error: error.message });
      return false;
    }
    throw error;
  }
}

/** Однократный перенос старого облачного снимка из user_data. */
async function migrateLegacy(current: Engine) {
  if (legacyDone(current.userId)) return;
  try {
    const first = await restJson<Array<{ key?: string }>>("/sync_docs?select=key&limit=1");
    if (Array.isArray(first) && first.length) {
      markLegacyDone(current.userId);
      return;
    }
    const rows = await restJson<Array<{ data?: unknown }>>("/user_data?select=data&limit=1");
    const data = rows?.[0]?.data;
    if (data && typeof data === "object") {
      await importJSON(JSON.stringify(data), { updateExisting: true });
      markSyncAll();
    }
    markLegacyDone(current.userId);
  } catch (error) {
    if (error instanceof CloudError && error.code === "table") return;
    // user_data может отсутствовать в новом проекте — это не ошибка полной синхронизации.
  }
}

/* ----------------------------------- pull ----------------------------------- */

async function pullDocs(current: Engine, initial: boolean): Promise<number> {
  current.lastPullCheck = Date.now();
  const initialPull = initial && !current.lastPull;
  let applied = 0;
  let offset = 0;
  let pages = 0;
  let maxStamp = current.lastPull;

  while (!current.stopped && pages < 40) {
    pages++;
    const filter = current.lastPull ? `&updated_at=gte.${encodeURIComponent(current.lastPull)}` : "";
    const path = `/sync_docs?select=key,data,deleted,updated_at&order=updated_at.asc,key.asc&limit=${PAGE}&offset=${offset}${filter}`;
    const rows = await restJson<SyncDoc[]>(path);
    if (!Array.isArray(rows) || !rows.length) break;

    const prepared = await selectDocsToApply(rows, initialPull);
    if (prepared.docs.length) {
      const outcome = await applyDocs(prepared.docs);
      applied += outcome.keys.length;
      await saveAppliedMeta(outcome.keys, prepared.docs, prepared.at);
      emit({ pulled: state.pulled + outcome.keys.length });
    }
    // Пропущенные документы тоже подтверждаем в журнале, чтобы не сверять их повторно.
    if (prepared.skipped.length) await rememberRemote(prepared.skipped, prepared.at);

    const last = rows[rows.length - 1];
    if (last?.updated_at && (!maxStamp || last.updated_at > maxStamp)) maxStamp = last.updated_at;
    offset += rows.length;
    if (rows.length < PAGE) break;
    await sleep(0);
  }

  if (maxStamp && maxStamp !== current.lastPull) {
    current.lastPull = maxStamp;
    savePull(current.userId, maxStamp);
  }
  return applied;
}

interface PreparedDocs {
  docs: SyncDoc[];
  skipped: SyncDoc[];
  at: number;
}

/**
 * Оставляет только те документы, которые действительно нужно применить.
 * Локально изменённый документ (его отпечаток не совпадает с журналом) не затирается
 * облаком — он уйдёт наверх следующим шагом.
 */
async function selectDocsToApply(rows: SyncDoc[], initialPull: boolean): Promise<PreparedDocs> {
  const keys = rows.map((row) => row.key);
  const metas = await db.syncMeta.bulkGet(keys);
  const docs: SyncDoc[] = [];
  const skipped: SyncDoc[] = [];
  let local: Map<string, { hash: string }> | null = null;
  let at = 0;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!docKind(row.key)) continue;
    const meta = metas[index];
    const remoteHash = row.deleted ? "" : hashDoc(row.data);
    const stamp = row.updated_at ? Date.parse(row.updated_at) : 0;
    if (Number.isFinite(stamp)) at = Math.max(at, stamp);

    if (meta && meta.hash === remoteHash && (meta.deleted === 1) === !!row.deleted) {
      skipped.push(row);
      continue;
    }
    if (row.deleted && !meta && !initialPull) {
      // Надгробие для незнакомого ключа: проверим, есть ли что удалять локально.
      const existing = await buildDoc(row.key);
      if (!existing) {
        skipped.push(row);
        continue;
      }
    }
    if (!meta || meta.deleted === 1) {
      // Первое подключение устройства: облако применяется как есть, но не удаляет
      // локальные записи, которых в облаке ещё нет.
      if (row.deleted) {
        const existing = await buildDoc(row.key);
        if (!existing) {
          skipped.push(row);
          continue;
        }
      }
      docs.push(row);
      continue;
    }
    if (!local) {
      const all = await buildAllDocs();
      local = new Map([...all.values()].map((item) => [item.key, { hash: item.deleted ? "" : hashDoc(item.data) }]));
    }
    const current = local.get(row.key);
    if (current && current.hash !== meta.hash) {
      // Есть неотправленное локальное изменение — оно важнее облачной копии.
      skipped.push(row);
      continue;
    }
    docs.push(row);
  }

  return { docs, skipped, at: at || Date.now() };
}

async function saveAppliedMeta(keys: string[], applied: SyncDoc[], at: number) {
  const incoming = new Map(applied.map((doc) => [doc.key, doc]));
  const metas: SyncMeta[] = [];
  for (const key of new Set(keys)) {
    const doc = incoming.get(key);
    if (doc) metas.push(metaForDoc(doc, at));
  }
  // После применения локальная запись могла нормализоваться — тогда полная сверка
  // досчитает отпечаток и при необходимости отправит её ещё раз.
  if (metas.length) await db.syncMeta.bulkPut(metas);
}

async function rememberRemote(rows: SyncDoc[], at: number) {
  const metas = rows.map((row) => metaForDoc(row, at));
  if (metas.length) await db.syncMeta.bulkPut(metas);
}

/* ----------------------------------- push ----------------------------------- */

async function pushDocs(current: Engine, full: boolean): Promise<void> {
  const pending = [...current.pending];
  current.pending.clear();
  emit({ pending: 0 });
  const needFull = full || pending.includes("*") || pending.length === 0;
  let local: Map<string, { data: unknown | null; deleted?: boolean }> | null = null;

  if (needFull) {
    local = new Map([...(await buildAllDocs()).values()].map((doc) => [doc.key, { data: doc.data, deleted: doc.deleted }]));
  }

  const docs: SyncDoc[] = [];
  const keysToCheck = new Set<string>(pending.filter((key) => key !== "*"));
  if (needFull) {
    const all = local!;
    const metas = await db.syncMeta.toArray();
    for (const key of all.keys()) keysToCheck.add(key);
    for (const meta of metas) {
      if (!all.has(meta.key) && meta.deleted !== 1) keysToCheck.add(meta.key);
    }
  }

  for (const key of keysToCheck) {
    const built = needFull && local!.has(key) ? { key, ...local!.get(key)! } : await buildDoc(key);
    if (!built) {
      // Запись исчезла — это удаление.
      docs.push({ key, data: null, deleted: true });
      continue;
    }
    const meta = await db.syncMeta.get(built.key);
    const hash = built.data === null && built.deleted ? "" : hashDoc(built.data);
    if (meta && meta.hash === hash && (meta.deleted === 1) === !!built.deleted) continue;
    docs.push({ key: built.key, data: built.data, deleted: built.deleted });
  }

  if (!docs.length) return;
  try {
    await pushChunks(current, docs);
  } catch (error) {
    // Не теряем очередь: при следующем цикле эти документы уйдут повторно.
    docs.forEach((doc) => current.pending.add(doc.key));
    emit({ pending: current.pending.size });
    throw error;
  }
}

async function pushChunks(current: Engine, docs: SyncDoc[]) {
  const chunks: SyncDoc[][] = [];
  let size = 2;
  let bucket: SyncDoc[] = [];
  for (const doc of docs) {
    const docSize = JSON.stringify(doc).length + 80;
    if (bucket.length && size + docSize > PUSH_BYTES) {
      chunks.push(bucket);
      bucket = [];
      size = 2;
    }
    bucket.push(doc);
    size += docSize;
  }
  if (bucket.length) chunks.push(bucket);

  for (const chunk of chunks) {
    if (current.stopped) return;
    await pushChunk(current, chunk);
  }
}

async function pushChunk(current: Engine, docs: SyncDoc[]): Promise<void> {
  if (!docs.length) return;
  const body = docs.map((doc) => ({
    user_id: current.userId,
    key: doc.key,
    data: doc.deleted ? null : doc.data,
    deleted: !!doc.deleted,
  }));
  try {
    const written = await restJson<Array<{ key: string; updated_at?: string }>>(
      "/sync_docs?on_conflict=user_id,key&select=key,updated_at",
      { method: "POST", body, headers: { Prefer: "resolution=merge-duplicates,return=representation" } }
    );
    const stamps = new Map((written ?? []).map((row) => [row.key, row.updated_at ? Date.parse(row.updated_at) : Date.now()]));
    const metas: SyncMeta[] = docs.map((doc) => ({
      key: doc.key,
      hash: doc.deleted ? "" : hashDoc(doc.data),
      deleted: doc.deleted ? 1 : 0,
      at: stamps.get(doc.key) ?? Date.now(),
    }));
    await db.syncMeta.bulkPut(metas);
    emit({ pushed: state.pushed + docs.length });
  } catch (error) {
    if (error instanceof CloudError && error.code === "table") {
      emit({ phase: "setup", readiness: { docs: false } });
      return;
    }
    throw error;
  }
}

/** Ручной запуск полной синхронизации из настроек. */
export async function syncNow(): Promise<void> {
  if (!engine) {
    const userId = currentUserId();
    if (!userId || !syncAvailable()) throw new Error("Войдите в облачный аккаунт");
    startSync(userId);
  }
  await queueCycle("manual");
}

export async function checkCloudReadiness(): Promise<CloudReadiness> {
  if (!currentUserId()) throw new Error("Войдите в облачный аккаунт");
  const docs = await probeDocs().catch((error) => {
    if (error instanceof CloudError) return false;
    throw error;
  });
  emit({ readiness: { docs } });
  return { docs };
}

/* ------------------------- старая резервная копия (user_data) ------------------------- */

/**
 * Обмен вручную сохраняет один снимок профиля в public.user_data.
 * Загрузка сливает добавленные/обновлённые записи, сессии и события.
 * Оставлено как резервный путь и для совместимости с прежними версиями.
 */
const LAST_KEY = "pr.lastSync";
const REST_TIMEOUT = 15000;

export const lastSyncAt = (userId: string | null): number | null => {
  if (!userId) return null;
  try {
    const value = Number(localStorage.getItem(`${LAST_KEY}:${userId}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

function saveSyncAt(userId: string, ts: number) {
  try {
    localStorage.setItem(`${LAST_KEY}:${userId}`, String(ts));
  } catch {
    // Облачный обмен уже выполнен; без локального checkpoint следующая отправка потребует загрузки.
  }
}

interface CloudSnapshot {
  data: unknown;
  updated_at: string;
}

class CloudResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Сессия истекла. Войдите снова");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REST_TIMEOUT);
  try {
    const res = await fetch(`${supabaseConfig.url}/rest/v1${path}`, {
      ...init,
      signal: ctl.signal,
      headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new CloudResponseError(res.status === 404 ? "Таблица user_data не найдена — выполните supabase/schema.sql" : text || `Ошибка облака (${res.status})`, res.status);
    }
    const text = await res.text();
    try {
      return (text ? JSON.parse(text) : null) as T;
    } catch {
      throw new CloudResponseError("Облако вернуло некорректные данные", res.status);
    }
  } catch (e) {
    if (e instanceof CloudResponseError) throw e;
    if ((e as Error)?.name === "AbortError") throw new Error("Облачный запрос превысил лимит времени. Попробуйте ещё раз");
    throw new Error("Нет соединения с облаком");
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
}

async function getCloudSnapshot(): Promise<CloudSnapshot | null> {
  const rows = await rest<CloudSnapshot[]>("/user_data?select=data,updated_at&limit=1");
  return rows?.[0] ?? null;
}

export async function pushToCloud(): Promise<void> {
  const userId = currentUserId();
  if (!userId) throw new Error("Войдите в облачный аккаунт");
  const remote = await getCloudSnapshot();
  const previousSync = lastSyncAt(userId);
  if (remote) {
    const remoteAt = Date.parse(remote.updated_at);
    if (!previousSync) throw new Error("В облаке уже есть копия. Сначала загрузите её на устройство, чтобы не потерять данные");
    if (!Number.isFinite(remoteAt) || remoteAt > previousSync) {
      throw new Error("В облаке появилась более новая копия. Сначала нажмите «Из облака», объедините данные и повторите отправку");
    }
  }

  const data = JSON.parse(await exportJSON(true));
  const updatedAtMs = Math.max(Date.now(), (previousSync ?? 0) + 1, (remote ? Date.parse(remote.updated_at) : 0) + 1);
  const updatedAt = new Date(updatedAtMs).toISOString();
  const body = JSON.stringify({ user_id: userId, data, updated_at: updatedAt });
  const path = remote
    ? `/user_data?user_id=eq.${encodeURIComponent(userId)}&updated_at=eq.${encodeURIComponent(remote.updated_at)}`
    : "/user_data";
  let written: unknown;
  try {
    // Compare-and-swap prevents a second device's upload from being overwritten between our read and write.
    written = await rest<unknown[]>(path, {
      method: remote ? "PATCH" : "POST",
      headers: { Prefer: "return=representation" },
      body,
    });
  } catch (error) {
    if (error instanceof CloudResponseError && error.status === 409) {
      throw new Error("Облачная копия изменилась во время отправки. Сначала загрузите её на устройство и повторите попытку");
    }
    throw error;
  }
  if (!Array.isArray(written) || written.length !== 1) {
    throw new Error("Облачная копия изменилась во время отправки. Сначала загрузите её на устройство и повторите попытку");
  }
  saveSyncAt(userId, Date.parse(updatedAt));
}

export async function pullFromCloud(): Promise<ImportJSONResult | null> {
  const userId = currentUserId();
  if (!userId) throw new Error("Войдите в облачный аккаунт");
  const snapshot = await getCloudSnapshot();
  if (!snapshot) return null;
  const result = await importJSON(JSON.stringify(snapshot.data), { updateExisting: true });
  const remoteAt = Date.parse(snapshot.updated_at);
  saveSyncAt(userId, Number.isFinite(remoteAt) ? remoteAt : Date.now());
  return result;
}
