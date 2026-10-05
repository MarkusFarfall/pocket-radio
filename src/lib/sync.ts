import { exportJSON, importJSON } from "./db";
import { currentUserId, getAccessToken, supabaseConfig } from "./auth/supabase";
import { provider } from "./auth";

/**
 * ЗАГОТОВКА облачной синхронизации (Supabase).
 *
 * Сейчас — «снимок»: весь профиль одним JSON в таблице public.user_data (одна строка на пользователя,
 * защищена RLS). Кнопки «В облако» / «Из облака» — в Настройках.
 *
 * Что доделать для полноценной синхронизации:
 *  - отдельные таблицы stations / sessions / tracks (черновик схемы в supabase/schema.sql);
 *  - инкрементальный обмен по updated_at и «надгробия» для удалённых строк;
 *  - автосинхронизация: подписка на изменения Dexie + Supabase Realtime;
 *  - разрешение конфликтов (сейчас последнее слово за тем, кто писал позже).
 */

const LAST_KEY = "pr.lastSync";

export const syncAvailable = () => provider.id === "supabase";
export const lastSyncAt = (): number | null => Number(localStorage.getItem(LAST_KEY)) || null;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Сессия истекла. Войдите снова");
  let res: Response;
  try {
    res = await fetch(`${supabaseConfig.url}/rest/v1${path}`, {
      ...init,
      headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new Error("Нет соединения с облаком");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(res.status === 404 ? "Таблица user_data не найдена — выполните supabase/schema.sql" : t || `Ошибка облака (${res.status})`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function pushToCloud(): Promise<void> {
  const uid = currentUserId();
  if (!uid) throw new Error("Войдите в облачный аккаунт");
  const data = JSON.parse(await exportJSON(true));
  await rest("/user_data?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: uid, data, updated_at: new Date().toISOString() }),
  });
  localStorage.setItem(LAST_KEY, String(Date.now()));
}

export async function pullFromCloud(): Promise<{ added: number; sessions: number; tracks: number } | null> {
  const rows = await rest<{ data: unknown; updated_at: string }[]>("/user_data?select=data,updated_at&limit=1");
  if (!rows?.length) return null;
  const r = await importJSON(JSON.stringify(rows[0].data));
  localStorage.setItem(LAST_KEY, String(Date.now()));
  return r;
}
