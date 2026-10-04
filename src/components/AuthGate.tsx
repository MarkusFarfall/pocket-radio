import { Fragment, type ReactNode } from "react";
import { useAuth } from "../lib/auth/AuthContext";
import { AuthScreen, Splash } from "./AuthScreen";

/** Показывает вход, пока нет аккаунта или гостевого режима; приложение пересоздаётся при смене аккаунта. */
export function AuthGate({ children }: { children: ReactNode }) {
  const a = useAuth();
  if (a.phase === "booting") return <Splash />;
  if (a.phase === "auth" || a.pendingRecovery) return <AuthScreen />;
  return <Fragment key={a.scope}>{children}</Fragment>;
}
