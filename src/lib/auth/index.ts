import type { AuthProvider } from "./types";
import { localProvider } from "./local";
import { supabaseConfigured, supabaseProvider } from "./supabase";

/**
 * В dev по умолчанию используем локальную базу — случайная регистрация не создаст
 * аккаунт в общем облачном проекте. Production сохраняет существующий Supabase default.
 * VITE_AUTH_PROVIDER=local|supabase позволяет явно выбрать режим.
 */
const requested = import.meta.env.VITE_AUTH_PROVIDER?.trim().toLowerCase();
const cloudRequested = requested === "supabase" || (!requested && !import.meta.env.DEV);
export const provider: AuthProvider =
  cloudRequested && supabaseConfigured && requested !== "local" ? supabaseProvider : localProvider;
export { AuthError } from "./types";
export type { AuthUser, AuthProvider, KnownAccount } from "./types";
