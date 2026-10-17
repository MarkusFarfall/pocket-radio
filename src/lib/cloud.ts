import { currentUserId, getAccessToken, supabaseConfig } from "./auth/supabase";

/**
 * Тонкий слой над REST Supabase — без SDK.
 *
 * Ошибки размечены кодами, чтобы интерфейс мог отличить «сервер ещё не настроен»
 * от «нет интернета» и от «сессия истекла».
 */

const TIMEOUT = 20000;

export type CloudErrorCode = "auth" | "network" | "table" | "notfound" | "server";

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
  timeout?: number;
}

async function request(path: string, init: CloudRequest = {}): Promise<Response> {
  const access = await token();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeout ?? TIMEOUT);
  try {
    const res = await fetch(`${supabaseConfig.url}${path}`, {
      method: init.method ?? "GET",
      body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
      headers: {
        apikey: supabaseConfig.key,
        Authorization: `Bearer ${access}`,
        ...(init.body !== undefined && typeof init.body !== "string" ? { "Content-Type": "application/json" } : {}),
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

/* ------------------------------- готовность ------------------------------- */

export interface CloudReadiness {
  docs: boolean;
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
