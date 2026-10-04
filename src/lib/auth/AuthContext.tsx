import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { copyGuestIntoCurrent, switchDb, userDbName } from "../db";
import { player } from "../player";
import { provider } from "./index";
import type { AuthProvider, AuthUser, ResetInput } from "./types";
import { clearAudioScope } from "../offline";

type Phase = "booting" | "auth" | "ready";

const GUEST_KEY = "pr.guest";

interface SignUpOpts {
  login: string;
  password: string;
  displayName: string;
  remember: boolean;
  importGuest: boolean;
}

interface Ctx {
  phase: Phase;
  user: AuthUser | null;
  guest: boolean;
  provider: AuthProvider;
  /** ключ для перемонтирования приложения при смене аккаунта */
  scope: string;
  /** код восстановления, который нужно показать после регистрации */
  pendingRecovery: string | null;
  signIn(login: string, password: string, remember: boolean): Promise<void>;
  signUp(o: SignUpOpts): Promise<{ needsConfirm: boolean }>;
  resetPassword(i: ResetInput): Promise<void>;
  requestReset(email: string): Promise<void>;
  ackRecovery(): void;
  signOut(): Promise<void>;
  deleteAccount(password: string): Promise<void>;
  continueAsGuest(): void;
  openAuth(): void;
  updateUser(u: AuthUser): void;
}

const AuthCtx = createContext<Ctx | null>(null);

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth вызван вне AuthProvider");
  return c;
}

/** Останавливает плеер и дожидается записи статистики — до смены базы данных. */
async function quiesce() {
  try {
    player.stop();
    await player.flush(false);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("booting");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guest, setGuest] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  // восстановление сессии при запуске
  useEffect(() => {
    let alive = true;
    const asGuestOrAuth = () => {
      if (localStorage.getItem(GUEST_KEY) === "1") {
        switchDb(null);
        setGuest(true);
        setPhase("ready");
      } else setPhase("auth");
    };
    provider
      .restore()
      .then((u) => {
        if (!alive) return;
        if (u) {
          switchDb(u.id);
          setUser(u);
          setPhase("ready");
        } else asGuestOrAuth();
      })
      .catch(() => alive && asGuestOrAuth());
    return () => {
      alive = false;
    };
  }, []);

  // вход или выход в другой вкладке — перезагружаем эту, чтобы не работать «под чужой» базой
  useEffect(
    () =>
      provider.subscribe((u) => {
        if ((u?.id ?? null) !== (userRef.current?.id ?? null)) window.location.reload();
      }),
    []
  );

  const enter = useCallback((u: AuthUser) => {
    switchDb(u.id);
    localStorage.removeItem(GUEST_KEY);
    setGuest(false);
    setUser(u);
  }, []);

  const signIn = useCallback(
    async (login: string, password: string, remember: boolean) => {
      const u = await provider.signIn({ login, password, remember });
      enter(u);
      setPhase("ready");
    },
    [enter]
  );

  const signUp = useCallback(
    async (o: SignUpOpts) => {
      const r = await provider.signUp({ login: o.login, password: o.password, displayName: o.displayName, remember: o.remember });
      if (!r.user) return { needsConfirm: true };
      enter(r.user);
      if (o.importGuest) {
        try {
          await copyGuestIntoCurrent();
        } catch {
          /* перенос необязателен */
        }
      }
      if (r.recoveryCode) setPending(r.recoveryCode);
      else setPhase("ready");
      return { needsConfirm: false };
    },
    [enter]
  );

  const resetPassword = useCallback(
    async (i: ResetInput) => {
      if (!provider.resetPassword) return;
      const r = await provider.resetPassword(i);
      enter(r.user);
      setPending(r.recoveryCode);
    },
    [enter]
  );

  const requestReset = useCallback(async (email: string) => {
    if (provider.requestPasswordReset) await provider.requestPasswordReset(email);
  }, []);

  const ackRecovery = useCallback(() => {
    setPending(null);
    setPhase("ready");
  }, []);

  const signOut = useCallback(async () => {
    await quiesce();
    await provider.signOut();
    localStorage.removeItem(GUEST_KEY);
    setPhase("auth");
    setUser(null);
    setGuest(false);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    const u = userRef.current;
    if (!u) return;
    await quiesce();
    // Закрываем пользовательскую Dexie до Dexie.delete(), иначе удаление может зависнуть
    // в ожидании самой же открытой вкладки. При ошибке возвращаем прежнюю базу.
    switchDb(null);
    try {
      await provider.deleteAccount(u.id, password);
      await clearAudioScope(userDbName(u.id));
      localStorage.removeItem(GUEST_KEY);
      setPhase("auth");
      setUser(null);
      setGuest(false);
    } catch (e) {
      switchDb(u.id);
      throw e;
    }
  }, []);

  const continueAsGuest = useCallback(() => {
    localStorage.setItem(GUEST_KEY, "1");
    switchDb(null);
    setUser(null);
    setGuest(true);
    setPhase("ready");
  }, []);

  const openAuth = useCallback(() => {
    void quiesce();
    setPhase("auth");
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      phase,
      user,
      guest,
      provider,
      scope: user?.id ?? "guest",
      pendingRecovery: pending,
      signIn,
      signUp,
      resetPassword,
      requestReset,
      ackRecovery,
      signOut,
      deleteAccount,
      continueAsGuest,
      openAuth,
      updateUser: setUser,
    }),
    [phase, user, guest, pending, signIn, signUp, resetPassword, requestReset, ackRecovery, signOut, deleteAccount, continueAsGuest, openAuth]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
