import { AuthError, type AuthProvider, type AuthUser } from "./types";

/**
 * Supabase Auth через открытый REST (GoTrue), без SDK.
 *
 * Production использует стандартный Pocket Radio Supabase проект; переменные VITE_SUPABASE_*
 * перекрывают значения по умолчанию. В dev поставщик по умолчанию локальный (см. auth/index.ts).
 *
 * Данные (станции, статистика) лежат локально; синхронизация с облаком — в ../sync.ts.
 */

const DEFAULT_URL = "https://zcohgsqefkygwvyzrico.supabase.co";
const DEFAULT_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjb2hnc3FlZmt5Z3d2eXpyaWNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjYwMzMsImV4cCI6MjEwNjcwMjAzM30.WlbQlR8Ud1XxwfThW-M6VxTnh_ROetUbU-n8iV36WCw";

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
const hasOverrides = !!(envUrl || envKey);
const URL_ = (hasOverrides ? envUrl : DEFAULT_URL).replace(/\/+$/, "");
const KEY_ = hasOverrides ? envKey : DEFAULT_ANON;

function validEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const isHttps = url.protocol === "https:";
    const isLocalHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    return !!url.hostname && (isHttps || isLocalHttp);
  } catch {
    return false;
  }
}

const hasPlaceholder = (value: string) => /(?:xxxx|your[-_ ]?(?:project|url|key)|eyJ\.\.\.)/i.test(value);
export const supabaseConfigured =
  validEndpoint(URL_) && KEY_.length > 20 && !hasPlaceholder(URL_) && !hasPlaceholder(KEY_);
export const supabaseConfig = { url: URL_, key: KEY_ };

interface SbUser {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
  user_metadata?: { display_name?: string; hue?: number };
}
interface SbSession {
  access_token: string;
  refresh_token: string;
  /** секунды Unix */
  expires_at: number;
  user: SbUser;
}

const SKEY = "pr.sb";

function load(): SbSession | null {
  try {
    const raw = localStorage.getItem(SKEY) ?? sessionStorage.getItem(SKEY);
    return raw ? (JSON.parse(raw) as SbSession) : null;
  } catch {
    return null;
  }
}
function save(s: SbSession | null, remember = true) {
  localStorage.removeItem(SKEY);
  sessionStorage.removeItem(SKEY);
  if (s) (remember ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(s));
}

function mapError(status: number, data: unknown): AuthError {
  const d = (data ?? {}) as { msg?: string; message?: string; error_description?: string; error_code?: string };
  const raw = d.msg || d.error_description || d.message || "";
  const code = d.error_code || "";
  if (/invalid login credentials/i.test(raw)) return new AuthError("credentials", "Неверный email или пароль");
  if (/email not confirmed/i.test(raw) || code === "email_not_confirmed") return new AuthError("confirm", "Подтвердите email — мы отправили вам письмо со ссылкой");
  if (/already registered|already been registered/i.test(raw) || code === "user_already_exists") return new AuthError("exists", "Этот email уже зарегистрирован");
  if (/password should be|weak_password/i.test(raw) || code === "weak_password") return new AuthError("validation", "Пароль не прошёл проверку сервера: сделайте его длиннее и сложнее");
  if (status === 429 || /rate limit/i.test(raw)) return new AuthError("locked", "Слишком много запросов. Подождите немного и повторите");
  if (status === 401 || status === 403) return new AuthError("credentials", "Сессия недействительна. Войдите снова");
  return new AuthError("unknown", raw || `Ошибка сервера (${status})`);
}

async function call<T>(path: string, o: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${URL_}${path}`, {
      method: o.method ?? "GET",
      headers: { apikey: KEY_, "Content-Type": "application/json", ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
  } catch {
    throw new AuthError("network", "Нет соединения с сервером аккаунтов");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* не JSON */
  }
  if (!res.ok) throw mapError(res.status, data);
  return data as T;
}

function normalizeSession(raw: Record<string, unknown>): SbSession {
  const expiresIn = Number(raw.expires_in) || 3600;
  return {
    access_token: String(raw.access_token),
    refresh_token: String(raw.refresh_token),
    expires_at: Number(raw.expires_at) || Math.floor(Date.now() / 1000) + expiresIn,
    user: raw.user as SbUser,
  };
}

const toUser = (u: SbUser): AuthUser => ({
  id: u.id,
  login: u.email ?? "",
  displayName: u.user_metadata?.display_name || (u.email ?? "").split("@")[0] || "Пользователь",
  hue: typeof u.user_metadata?.hue === "number" ? u.user_metadata.hue : 20,
  createdAt: u.created_at ? Date.parse(u.created_at) : Date.now(),
  lastLoginAt: u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : undefined,
  provider: "supabase",
});

async function refresh(s: SbSession): Promise<SbSession> {
  const raw = await call<Record<string, unknown>>("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } });
  const next = normalizeSession(raw);
  save(next, !!localStorage.getItem(SKEY));
  return next;
}

/** Действующий access-token (при необходимости обновляется). Нужен для запросов к REST API. */
export async function getAccessToken(): Promise<string | null> {
  const s = load();
  if (!s) return null;
  if (s.expires_at - Math.floor(Date.now() / 1000) > 60) return s.access_token;
  try {
    return (await refresh(s)).access_token;
  } catch {
    return null;
  }
}
export function currentUserId(): string | null {
  return load()?.user.id ?? null;
}

export const supabaseProvider: AuthProvider = {
  id: "supabase",
  label: "Облачный аккаунт (Supabase)",
  loginKind: "email",
  capabilities: { recoveryCode: false, emailReset: true, changePassword: true, deleteAccount: true, cloudSync: true },

  async restore() {
    const s = load();
    if (!s) return null;
    try {
      const fresh = s.expires_at - Math.floor(Date.now() / 1000) > 60 ? s : await refresh(s);
      return toUser(fresh.user);
    } catch (e) {
      // без сети остаёмся в аккаунте по сохранённой сессии — приложение должно работать офлайн
      if (e instanceof AuthError && e.code === "network") return toUser(s.user);
      save(null);
      return null;
    }
  },

  async signUp({ login, password, displayName, remember }) {
    const hue = Math.floor(Math.random() * 360);
    const raw = await call<Record<string, unknown>>("/auth/v1/signup", {
      method: "POST",
      body: { email: login.trim(), password, data: { display_name: displayName?.trim() || login.split("@")[0], hue } },
    });
    if (!raw.access_token) return { user: null }; // включено подтверждение email
    const s = normalizeSession(raw);
    save(s, remember);
    return { user: toUser(s.user) };
  },

  async signIn({ login, password, remember }) {
    const raw = await call<Record<string, unknown>>("/auth/v1/token?grant_type=password", { method: "POST", body: { email: login.trim(), password } });
    const s = normalizeSession(raw);
    save(s, remember);
    return toUser(s.user);
  },

  async signOut() {
    const s = load();
    save(null);
    if (s) {
      try {
        await call("/auth/v1/logout", { method: "POST", token: s.access_token });
      } catch {
        /* локально мы уже вышли */
      }
    }
  },

  async updateProfile(_userId, patch) {
    const token = await getAccessToken();
    if (!token) throw new AuthError("credentials", "Сессия истекла. Войдите снова");
    const data: Record<string, unknown> = {};
    if (patch.displayName !== undefined) data.display_name = patch.displayName.trim().slice(0, 40);
    if (patch.hue !== undefined) data.hue = patch.hue;
    const u = await call<SbUser>("/auth/v1/user", { method: "PUT", token, body: { data } });
    const s = load();
    if (s) save({ ...s, user: u }, !!localStorage.getItem(SKEY));
    return toUser(u);
  },

  async changePassword(_userId, current, next) {
    const s = load();
    if (!s?.user.email) throw new AuthError("credentials", "Сессия истекла. Войдите снова");
    // проверяем текущий пароль повторным входом
    await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: s.user.email, password: current } });
    const token = await getAccessToken();
    await call("/auth/v1/user", { method: "PUT", token: token ?? undefined, body: { password: next } });
  },

  async requestPasswordReset(email) {
    await call("/auth/v1/recover", { method: "POST", body: { email: email.trim() } });
  },

  async deleteAccount(_userId, password) {
    const s = load();
    if (!s?.user.email) throw new AuthError("credentials", "Сессия истекла. Войдите снова");
    await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: s.user.email, password } });
    const token = await getAccessToken();
    // функция delete_my_account() создаётся в supabase/schema.sql
    await call("/rest/v1/rpc/delete_my_account", { method: "POST", token: token ?? undefined, body: {} });
    save(null);
  },

  async listKnown() {
    return [];
  },

  subscribe(cb) {
    const onStorage = async (e: StorageEvent) => {
      if (e.key !== SKEY) return;
      cb(await supabaseProvider.restore());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
};
