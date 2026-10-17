import { currentUserId, getAccessToken, supabaseConfig } from "./auth/supabase";

/**
 * Тонкий слой над REST и Storage Supabase — без SDK.
 *
 * Ошибки размечены кодами, чтобы интерфейс мог отличить «сервер ещё не настроен»
 * от «нет интернета» и от «сессия истекла».
 */

export const CLOUD_BUCKET = "user-media";
const TIMEOUT = 20000;

export type CloudErrorCode = "auth" | "network" | "table" | "bucket" | "size" | "notfound" | "server";

export class CloudError extends Error {
  constructor(message: string, readonly code: CloudErrorCode, readonly status = 0) {
    super(message);
  }
}

export const cloudUserId = () => currentUserId();

function classify(status: number, text: string): CloudError {
  if (status === 401 || status === 403) return new CloudError("Сессия истекла. Войдите снова", "auth", status);
  if (/could not find the table|relation .* does not exist|schema cache/i.test(text)) {
    return new CloudError("На сервере нет таблицы sync_docs — выполните supabase/schema.sql", "table", status);
  }
  if (/bucket not found/i.test(text)) return new CloudError("На сервере нет бакета user-media — выполните supabase/schema.sql", "bucket", status);
  if (status === 413) return new CloudError("Файл больше лимита Supabase Storage", "size", status);
  if (status === 404) return new CloudError("Объект не найден", "notfound", status);
  if (status >= 500) return new CloudError("Сервер облака временно недоступен", "server", status);
  return new CloudError(text || `Ошибка облака (${status})`, "server", status);
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw new CloudError("Войдите в облачный аккаунт", "auth", 401);
  return value;
}

export interface CloudRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Разрешает прочитать ответ как файл (Storage). */
  raw?: boolean;
  timeout?: number;
}

async function request(path: string, init: CloudRequest = {}): Promise<Response> {
  const access = await token();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeout ?? TIMEOUT);
  try {
    const res = await fetch(`${supabaseConfig.url}${path}`, {
      method: init.method ?? "GET",
      body: init.body === undefined ? undefined : typeof init.body === "string" || init.body instanceof Blob ? init.body : JSON.stringify(init.body),
      headers: {
        apikey: supabaseConfig.key,
        Authorization: `Bearer ${access}`,
        ...(init.body !== undefined && typeof init.body === "object" && !(init.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw classify(res.status, text);
    }
    return res;
  } catch (error) {
    if (error instanceof CloudError) throw error;
    if ((error as Error)?.name === "AbortError") throw new CloudError("Облачный запрос превысил лимит времени", "network");
    throw new CloudError("Нет соединения с облаком", "network");
  } finally {
    // Не abort-им успешный запрос: тело ответа читается уже после возврата из request().
    clearTimeout(timer);
  }
}

export async function restJson<T>(path: string, init: CloudRequest = {}): Promise<T> {
  const res = await request(`/rest/v1${path}`, init);
  const text = await res.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CloudError("Облако вернуло некорректные данные", "server");
  }
}

/* --------------------------------- Storage --------------------------------- */

const encoded = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Стабильный путь объекта для пары «пользователь + станция/трек». */
export const audioObjectPath = (userId: string, stationId: string) => `${userId}/audio/${encoded(stationId)}.bin`;

export async function uploadAudioObject(path: string, blob: Blob): Promise<void> {
  await request(`/storage/v1/object/${CLOUD_BUCKET}/${path}`, {
    method: "POST",
    body: blob,
    headers: { "x-upsert": "true", "Content-Type": blob.type || "application/octet-stream" },
    timeout: 120000,
  });
}

export async function downloadAudioObject(path: string): Promise<Blob> {
  const res = await request(`/storage/v1/object/authenticated/${CLOUD_BUCKET}/${path}`, { raw: true, timeout: 120000 });
  return res.blob();
}

export async function deleteAudioObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await request(`/storage/v1/object/${CLOUD_BUCKET}`, {
    method: "DELETE",
    body: { prefixes: paths },
    headers: { "Content-Type": "application/json" },
  });
}

export interface CloudObject {
  name: string;
  metadata?: { size?: number; mimetype?: string } | null;
  updated_at?: string;
}

export async function listAudioObjects(userId: string): Promise<CloudObject[]> {
  const res = await request(`/storage/v1/object/list/${CLOUD_BUCKET}`, {
    method: "POST",
    body: { prefix: `${userId}/audio/`, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } },
  });
  const rows = (await res.json()) as CloudObject[];
  return Array.isArray(rows) ? rows.filter((row) => !!row?.name) : [];
}

/* ------------------------------- готовность ------------------------------- */

export interface CloudReadiness {
  docs: boolean;
  bucket: boolean;
}

export async function probeDocs(): Promise<boolean> {
  try {
    await restJson<unknown[]>("/sync_docs?select=key&limit=1");
    return true;
  } catch (error) {
    if (error instanceof CloudError && error.code === "table") return false;
    throw error;
  }
}

export async function probeBucket(userId: string): Promise<boolean> {
  try {
    await listAudioObjects(userId);
    return true;
  } catch (error) {
    if (error instanceof CloudError && error.code === "bucket") return false;
    // Нет прав на список — бакет всё равно может существовать; проверяем головой объекта.
    if (error instanceof CloudError && error.code === "auth") throw error;
    return false;
  }
}
