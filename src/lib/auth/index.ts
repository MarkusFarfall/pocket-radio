import type { AuthProvider } from "./types";
import { localProvider } from "./local";
import { supabaseConfigured, supabaseProvider } from "./supabase";

/** Активный поставщик аккаунтов: Supabase, если заданы переменные окружения, иначе локальный. */
export const provider: AuthProvider = supabaseConfigured ? supabaseProvider : localProvider;
export { supabaseConfigured };
export { AuthError } from "./types";
export type { AuthUser, AuthProvider, KnownAccount } from "./types";
