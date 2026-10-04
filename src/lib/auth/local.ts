import Dexie, { type Table } from "dexie";
import { userDbName } from "../db";
import { AuthError, type AuthProvider, type AuthUser, type KnownAccount } from "./types";
import { generateRecoveryCode, hashSecret, normalizeRecovery, randomId, verifySecret, type Secret } from "./crypto";
import { validateLogin, validatePassword } from "./validation";

/**
 * Локальные аккаунты: хранятся в IndexedDB этого браузера.
 * Пароль хранится только в виде соленого хеша (PBKDF2-SHA256), данные аккаунта изолированы в отдельной базе.
 * Это защита входа в приложение, а не шифрование данных на диске; для настоящей защиты и синхронизации
 * между устройствами см. supabase.ts.
 */

interface UserRow {
  id: string;
  login: string;
  loginKey: string;
  displayName: string;
  hue: number;
  pass: Secret;
  rec: Secret;
  createdAt: number;
  lastLoginAt?: number;
  failed: number;
  lockedUntil: number;
  sessionVersion: number;
}

class AuthDB extends Dexie {
  users!: Table<UserRow, string>;
  constructor() {
    super("pocket-radio-auth");
    this.version(1).stores({ users: "id, &loginKey, lastLoginAt" });
  }
}
const adb = new AuthDB();

const SESSION_KEY = "pr.session";
const REMEMBER_MS = 30 * 864e5;
const TAB_MS = 12 * 36e5;
const MAX_FAILS = 5;
const BAD = "Неверный логин или пароль";

interface Session {
  uid: string;
  v: number;
  exp: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readSession(): Session | null {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      /* повреждённая запись */
    }
  }
  return null;
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}
function persistSession(row: UserRow, remember: boolean) {
  clearSession();
  const s: Session = { uid: row.id, v: row.sessionVersion, exp: Date.now() + (remember ? REMEMBER_MS : TAB_MS) };
  (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s));
}

const toUser = (r: UserRow): AuthUser => ({
  id: r.id,
  login: r.login,
  displayName: r.displayName,
  hue: r.hue,
  createdAt: r.createdAt,
  lastLoginAt: r.lastLoginAt,
  provider: "local",
});

const findByLogin = (login: string) => adb.users.where("loginKey").equals(login.trim().toLowerCase()).first();

function lockMessage(until: number) {
  const s = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  return s >= 90 ? `Слишком много попыток. Повторите через ${Math.ceil(s / 60)} мин` : `Слишком много попыток. Повторите через ${s} с`;
}

/** Фиксирует неудачную попытку; после 5-й блокирует вход с растущей паузой (до 15 минут). */
async function registerFail(row: UserRow): Promise<number> {
  const failed = row.failed + 1;
  const lock = failed >= MAX_FAILS ? Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** (failed - MAX_FAILS)) : 0;
  await adb.users.update(row.id, { failed, lockedUntil: lock });
  return lock;
}

async function checkPassword(row: UserRow, password: string): Promise<void> {
  if (row.lockedUntil > Date.now()) throw new AuthError("locked", lockMessage(row.lockedUntil));
  if (await verifySecret(password, row.pass)) return;
  const lock = await registerFail(row);
  if (lock) throw new AuthError("locked", lockMessage(lock));
  const left = MAX_FAILS - (row.failed + 1);
  throw new AuthError("credentials", left <= 2 ? `${BAD}. Осталось попыток: ${left}` : BAD);
}

async function mustGet(userId: string): Promise<UserRow> {
  const row = await adb.users.get(userId);
  if (!row) throw new AuthError("unknown", "Аккаунт не найден");
  return row;
}

export const localProvider: AuthProvider = {
  id: "local",
  label: "Локальный аккаунт",
  loginKind: "login",
  capabilities: { recoveryCode: true, emailReset: false, changePassword: true, deleteAccount: true, cloudSync: false },

  async restore() {
    const s = readSession();
    if (!s) return null;
    if (s.exp < Date.now()) {
      clearSession();
      return null;
    }
    const row = await adb.users.get(s.uid);
    if (!row || row.sessionVersion !== s.v) {
      clearSession();
      return null;
    }
    return toUser(row);
  },

  async signUp({ login, password, displayName, remember }) {
    const lerr = validateLogin(login, "login");
    if (lerr) throw new AuthError("validation", lerr);
    const perr = validatePassword(password, login);
    if (perr) throw new AuthError("validation", perr);
    if (await findByLogin(login)) throw new AuthError("exists", "Этот логин уже занят");
    const recoveryCode = generateRecoveryCode();
    const name = (displayName?.trim() || login.trim()).slice(0, 40);
    const row: UserRow = {
      id: randomId(),
      login: login.trim(),
      loginKey: login.trim().toLowerCase(),
      displayName: name,
      hue: Math.floor(Math.random() * 360),
      pass: await hashSecret(password),
      rec: await hashSecret(normalizeRecovery(recoveryCode)),
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      failed: 0,
      lockedUntil: 0,
      sessionVersion: 1,
    };
    await adb.users.add(row);
    persistSession(row, remember);
    return { user: toUser(row), recoveryCode };
  },

  async signIn({ login, password, remember }) {
    const row = await findByLogin(login);
    if (!row) {
      // выравниваем время ответа, чтобы нельзя было угадать существующие логины
      await hashSecret(password);
      await sleep(200);
      throw new AuthError("credentials", BAD);
    }
    await checkPassword(row, password);
    await adb.users.update(row.id, { failed: 0, lockedUntil: 0, lastLoginAt: Date.now() });
    const fresh = (await adb.users.get(row.id))!;
    persistSession(fresh, remember);
    return toUser(fresh);
  },

  async signOut() {
    clearSession();
  },

  async updateProfile(userId, patch) {
    const row = await mustGet(userId);
    const next: Partial<UserRow> = {};
    if (patch.displayName !== undefined) {
      const n = patch.displayName.trim();
      if (!n) throw new AuthError("validation", "Имя не может быть пустым");
      next.displayName = n.slice(0, 40);
    }
    if (patch.hue !== undefined) next.hue = ((Math.round(patch.hue) % 360) + 360) % 360;
    await adb.users.update(row.id, next);
    return toUser((await adb.users.get(row.id))!);
  },

  async changePassword(userId, current, next) {
    const row = await mustGet(userId);
    await checkPassword(row, current);
    const perr = validatePassword(next, row.login);
    if (perr) throw new AuthError("validation", perr);
    if (current === next) throw new AuthError("validation", "Новый пароль совпадает со старым");
    await adb.users.update(row.id, { pass: await hashSecret(next), failed: 0, lockedUntil: 0, sessionVersion: row.sessionVersion + 1 });
    // остальные сессии становятся недействительными, текущую продлеваем
    persistSession((await adb.users.get(row.id))!, !!localStorage.getItem(SESSION_KEY));
  },

  async newRecoveryCode(userId, password) {
    const row = await mustGet(userId);
    await checkPassword(row, password);
    const code = generateRecoveryCode();
    await adb.users.update(row.id, { rec: await hashSecret(normalizeRecovery(code)) });
    return code;
  },

  async resetPassword({ login, recoveryCode, password }) {
    const generic = new AuthError("credentials", "Неверный логин или код восстановления");
    const row = await findByLogin(login);
    if (!row) {
      await hashSecret(password);
      await sleep(200);
      throw generic;
    }
    if (row.lockedUntil > Date.now()) throw new AuthError("locked", lockMessage(row.lockedUntil));
    if (!(await verifySecret(normalizeRecovery(recoveryCode), row.rec))) {
      const lock = await registerFail(row);
      throw lock ? new AuthError("locked", lockMessage(lock)) : generic;
    }
    const perr = validatePassword(password, row.login);
    if (perr) throw new AuthError("validation", perr);
    const code = generateRecoveryCode();
    await adb.users.update(row.id, {
      pass: await hashSecret(password),
      rec: await hashSecret(normalizeRecovery(code)),
      failed: 0,
      lockedUntil: 0,
      lastLoginAt: Date.now(),
      sessionVersion: row.sessionVersion + 1,
    });
    const fresh = (await adb.users.get(row.id))!;
    persistSession(fresh, true);
    return { user: toUser(fresh), recoveryCode: code };
  },

  async deleteAccount(userId, password) {
    const row = await mustGet(userId);
    await checkPassword(row, password);
    clearSession();
    await adb.users.delete(row.id);
    try {
      await Dexie.delete(userDbName(row.id));
    } catch {
      /* база могла быть уже закрыта */
    }
  },

  async listKnown(): Promise<KnownAccount[]> {
    try {
      const rows = await adb.users.orderBy("lastLoginAt").reverse().limit(4).toArray();
      return rows.map((r) => ({ login: r.login, displayName: r.displayName, hue: r.hue }));
    } catch {
      return [];
    }
  },

  subscribe(cb) {
    const onStorage = async (e: StorageEvent) => {
      if (e.key !== SESSION_KEY) return;
      cb(await localProvider.restore());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
};
