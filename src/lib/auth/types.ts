export type AuthErrorCode = "validation" | "exists" | "credentials" | "locked" | "confirm" | "network" | "unsupported" | "unknown";

export class AuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export interface AuthUser {
  id: string;
  /** логин (локальный аккаунт) или email (Supabase) */
  login: string;
  displayName: string;
  /** оттенок аватара 0–359 */
  hue: number;
  createdAt: number;
  lastLoginAt?: number;
  provider: "local" | "supabase";
}

export interface KnownAccount {
  login: string;
  displayName: string;
  hue: number;
}

export interface SignUpInput {
  login: string;
  password: string;
  displayName?: string;
  remember: boolean;
}
export interface SignInInput {
  login: string;
  password: string;
  remember: boolean;
}
export interface ResetInput {
  login: string;
  recoveryCode: string;
  password: string;
}

/**
 * Единый интерфейс «поставщика аккаунтов».
 * Сейчас работают два: local (всё в браузере) и supabase (облако; включается переменными окружения).
 * Чтобы подключить другой бэкенд (Firebase, свой API), достаточно реализовать этот интерфейс.
 */
export interface AuthProvider {
  id: "local" | "supabase";
  label: string;
  /** что вводит пользователь в поле «логин» */
  loginKind: "login" | "email";
  capabilities: {
    recoveryCode: boolean;
    emailReset: boolean;
    changePassword: boolean;
    deleteAccount: boolean;
    cloudSync: boolean;
  };
  restore(): Promise<AuthUser | null>;
  /** user === null означает «нужно подтвердить email» */
  signUp(i: SignUpInput): Promise<{ user: AuthUser | null; recoveryCode?: string }>;
  signIn(i: SignInInput): Promise<AuthUser>;
  signOut(): Promise<void>;
  updateProfile(userId: string, patch: { displayName?: string; hue?: number }): Promise<AuthUser>;
  changePassword(userId: string, current: string, next: string): Promise<void>;
  newRecoveryCode?(userId: string, password: string): Promise<string>;
  resetPassword?(i: ResetInput): Promise<{ user: AuthUser; recoveryCode: string }>;
  requestPasswordReset?(email: string): Promise<void>;
  deleteAccount(userId: string, password: string): Promise<void>;
  listKnown(): Promise<KnownAccount[]>;
  /** Изменение сессии в другой вкладке. Собственные действия сюда не приходят. */
  subscribe(cb: (u: AuthUser | null) => void): () => void;
}
