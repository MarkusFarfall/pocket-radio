import { exportJSON, importJSON, type ImportJSONResult } from "./db";
import { currentUserId, getAccessToken, supabaseConfig } from "./auth/supabase";
import { provider } from "./auth";

/**
 * Обмен вручную сохраняет один снимок профиля в public.user_data.
 * Загрузка сливает добавленные/обновлённые записи, сессии и события; удаления между устройствами
 * пока не переносятся. Перед отправкой проверяем, не появилась ли в облаке более новая копия.
 */
const LAST_KEY = "pr.lastSync";
const REST_TIMEOUT = 15000;

export const syncAvailable = () => provider.id === "supabase";
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
  // Сохраняем монотонный timestamp даже если часы устройства отстают или cloud вернул время вперед.
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
