import { useEffect, useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowLeft, ChartColumn, Copy, Download, Eye, EyeOff, KeyRound, Loader2, MailCheck, Radio, TriangleAlert, WifiOff } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext";
import { AuthError } from "../lib/auth";
import type { KnownAccount } from "../lib/auth/types";
import { passwordStrength, validateLogin, validatePassword } from "../lib/auth/validation";
import { guestSummary } from "../lib/db";
import { download } from "../lib/m3u";
import { packPhoto } from "../lib/packs";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";
import { Toasts, Toggle, btnGhost, btnPrimary, inputCls } from "./ui";
import { Logo } from "./Logo";

type View = "login" | "register" | "reset" | "confirm" | "sent";

interface Errors {
  login?: string;
  password?: string;
  password2?: string;
  code?: string;
}

function Mark({ className }: { className?: string }) {
  return (
    <Logo size={40} className={className} />
  );
}

function TextField({
  label,
  error,
  hint,
  right,
  className,
  ...props
}: { label: string; error?: string; hint?: ReactNode; right?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-semibold">
        {label}
        {right}
      </span>
      <input {...props} aria-invalid={!!error} className={cn(inputCls, "!py-3", className, error && "!border-bad ring-2 ring-bad/15")} />
      {error ? <span className="mt-1.5 block text-xs font-medium text-bad">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function PasswordField({ label, error, hint, id, ...props }: { label: string; error?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const descriptionId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="block">
      <label htmlFor={inputId} className="mb-1.5 flex items-center justify-between text-sm font-semibold">
        <span>{label}</span>
        {caps && <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Включён Caps Lock</span>}
      </label>
      <span className="relative block">
        <input
          {...props}
          id={inputId}
          type={show ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={descriptionId}
          onKeyUp={(e) => {
            setCaps(e.getModifierState?.("CapsLock") ?? false);
            props.onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCaps(false);
            props.onBlur?.(e);
          }}
          className={cn(inputCls, "!py-3 pr-12", error && "!border-bad ring-2 ring-bad/15")}
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted transition hover:text-ink" aria-label={show ? "Скрыть пароль" : "Показать пароль"} aria-pressed={show}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {error ? <span id={descriptionId} className="mt-1.5 block text-xs font-medium text-bad">{error}</span> : hint ? <span id={descriptionId} className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

function StrengthMeter({ password, login }: { password: string; login: string }) {
  if (!password) return null;
  const s = passwordStrength(password, login);
  const color = ["bg-bad", "bg-bad", "bg-amber-500", "bg-ok", "bg-ok"][s.score];
  return (
    <div className="-mt-1" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < Math.max(1, s.score) ? color : "bg-surface-2")} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {s.label}
        {s.tips.length > 0 && ` · ${s.tips.join(", ")}`}
      </p>
    </div>
  );
}

function Banner({ children, kind = "error" }: { children: ReactNode; kind?: "error" | "info" }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm", kind === "error" ? "bg-bad/10 text-bad" : "bg-surface-2 text-ink")}>
      {kind === "error" && <TriangleAlert size={17} className="mt-0.5 shrink-0" />}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Brand() {
  return (
    <aside className="relative hidden overflow-hidden bg-neutral-900 text-white lg:block">
      <img src={packPhoto(34172064, 1200, 1600)} alt="" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 h-full w-full object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/45 to-black/80" />
      <div className="relative flex h-full min-h-dvh flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="font-display text-xl font-bold tracking-tight">Pocket Radio</span>
        </div>
        <div className="max-w-lg">
          <h2 className="font-display text-4xl font-bold leading-[1.1] tracking-tight xl:text-5xl">
            Ваше радио.
            <br />
            Всегда с собой.
          </h2>
          <ul className="mt-8 space-y-4 text-[15px] text-white/85">
            {(
              [
                [Radio, "Свои потоки и каталог из десятков тысяч станций"],
                [WifiOff, "Работает офлайн: интерфейс, избранное и скачанные плейлисты"],
                [ChartColumn, "Статистика, история и настройки — в вашем профиле"],
              ] as const
            ).map(([I, t]) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/20 backdrop-blur">
                  <I size={17} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/55">Фото — Pexels</p>
      </div>
    </aside>
  );
}

function RecoveryStep({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-5">
      <div>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/12 text-accent">
          <KeyRound size={24} />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Сохраните код восстановления</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Это единственный способ вернуть доступ, если забудете пароль: почты у локального аккаунта нет. Код показывается один раз — запишите его или сохраните в менеджер паролей.
        </p>
      </div>
      <div className="select-all rounded-2xl border border-line bg-surface-2 px-4 py-5 text-center font-mono text-2xl font-bold tracking-[0.12em]">{code}</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={btnGhost}
          onClick={() =>
            navigator.clipboard.writeText(code).then(
              () => toast("Код скопирован", "ok"),
              () => toast("Не удалось скопировать", "error")
            )
          }
        >
          <Copy size={16} /> Копировать
        </button>
        <button className={btnGhost} onClick={() => download("pocket-radio-recovery-code.txt", `Pocket Radio — код восстановления\n\n${code}\n\nХраните в надёжном месте.\n`, "text/plain")}>
          <Download size={16} /> Скачать
        </button>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        Я сохранил код восстановления в надёжном месте
      </label>
      <button className={btnPrimary + " w-full !py-3"} disabled={!saved} onClick={onDone}>
        Продолжить
      </button>
    </div>
  );
}

export function AuthScreen() {
  const auth = useAuth();
  const { provider } = auth;
  const email = provider.loginKind === "email";
  const [view, setView] = useState<View>("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [importGuest, setImportGuest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [known, setKnown] = useState<KnownAccount[]>([]);
  const [guestData, setGuestData] = useState(0);

  useEffect(() => {
    provider.listKnown().then(setKnown).catch(() => {});
    guestSummary().then((g) => setGuestData(g.stations)).catch(() => {});
  }, [provider]);

  const go = (v: View) => {
    setView(v);
    setError(null);
    setErrors({});
    setPassword("");
    setPassword2("");
  };

  const fail = (e: unknown) => {
    if (e instanceof AuthError) {
      if (e.code === "confirm") return setView("confirm");
      setError(e.message);
    } else setError("Что-то пошло не так. Попробуйте ещё раз.");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    const le = validateLogin(login, provider.loginKind);
    if (le) errs.login = le;
    if (!password) errs.password = "Введите пароль";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    void run(() => auth.signIn(login, password, remember));
  };

  const submitRegister = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    const le = validateLogin(login, provider.loginKind);
    if (le) errs.login = le;
    const pe = validatePassword(password, email ? "" : login);
    if (pe) errs.password = pe;
    if (password2 !== password) errs.password2 = "Пароли не совпадают";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    void run(async () => {
      const r = await auth.signUp({ login, password, displayName: name, remember, importGuest: importGuest && guestData > 0 });
      if (r.needsConfirm) setView("confirm");
    });
  };

  const submitReset = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    const le = validateLogin(login, provider.loginKind);
    if (le) errs.login = le;
    if (provider.capabilities.recoveryCode) {
      if (code.replace(/[^a-z0-9]/gi, "").length < 16) errs.code = "Введите код из 16 символов";
      const pe = validatePassword(password, login);
      if (pe) errs.password = pe;
      if (password2 !== password) errs.password2 = "Пароли не совпадают";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    void run(async () => {
      if (provider.capabilities.recoveryCode) await auth.resetPassword({ login, recoveryCode: code, password });
      else {
        await auth.requestReset(login);
        setView("sent");
      }
    });
  };

  const tabs = view === "login" || view === "register";

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg text-ink lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <Brand />
      <main className="flex min-h-dvh flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[26rem]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Mark />
            <span className="font-display text-xl font-bold tracking-tight">Pocket Radio</span>
          </div>

          {auth.pendingRecovery ? (
            <RecoveryStep code={auth.pendingRecovery} onDone={auth.ackRecovery} />
          ) : view === "confirm" || view === "sent" ? (
            <div className="space-y-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <MailCheck size={24} />
              </span>
              <h1 className="font-display text-2xl font-bold tracking-tight">Проверьте почту</h1>
              <p className="text-sm leading-relaxed text-muted">
                {view === "confirm" ? (
                  <>
                    Мы отправили письмо на <b className="text-ink">{login || "ваш адрес"}</b>. Перейдите по ссылке из письма, чтобы подтвердить аккаунт, а затем войдите.
                  </>
                ) : (
                  <>
                    Если аккаунт с адресом <b className="text-ink">{login}</b> существует, мы отправили на него ссылку для сброса пароля.
                  </>
                )}
              </p>
              <button className={btnPrimary + " w-full !py-3"} onClick={() => go("login")}>
                Ко входу
              </button>
            </div>
          ) : view === "reset" ? (
            <form onSubmit={submitReset} className="space-y-4" noValidate>
              <button type="button" onClick={() => go("login")} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-ink">
                <ArrowLeft size={16} /> Назад
              </button>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">Восстановление доступа</h1>
                <p className="mt-1.5 text-sm text-muted">
                  {provider.capabilities.recoveryCode ? "Введите логин и код восстановления, который вы получили при регистрации." : "Укажите email — отправим ссылку для сброса пароля."}
                </p>
              </div>
              {error && <Banner>{error}</Banner>}
              <TextField label={email ? "Email" : "Логин"} value={login} onChange={(e) => setLogin(e.target.value)} error={errors.login} autoComplete="username" autoCapitalize="none" spellCheck={false} inputMode={email ? "email" : "text"} />
              {provider.capabilities.recoveryCode && (
                <>
                  <TextField label="Код восстановления" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={errors.code} placeholder="XXXX-XXXX-XXXX-XXXX" className="font-mono tracking-wider" autoComplete="off" spellCheck={false} />
                  <PasswordField label="Новый пароль" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="new-password" />
                  <StrengthMeter password={password} login={login} />
                  <PasswordField label="Повторите пароль" value={password2} onChange={(e) => setPassword2(e.target.value)} error={errors.password2} autoComplete="new-password" />
                </>
              )}
              <button className={btnPrimary + " w-full !py-3"} disabled={busy}>
                {busy && <Loader2 size={17} className="animate-spin" />} {provider.capabilities.recoveryCode ? "Сменить пароль и войти" : "Отправить ссылку"}
              </button>
            </form>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold tracking-tight">{view === "login" ? "С возвращением" : "Создайте аккаунт"}</h1>
              <p className="mt-1.5 text-sm text-muted">
                {view === "login" ? "Войдите, чтобы вернуться к своим станциям и статистике." : "Станции, избранное и статистика будут сохраняться в вашем профиле."}
              </p>

              {tabs && (
                <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
                  {(
                    [
                      ["login", "Вход"],
                      ["register", "Регистрация"],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} role="tab" aria-selected={view === v} onClick={() => go(v)} className={cn("rounded-lg py-2 text-sm font-semibold transition", view === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
                      {l}
                    </button>
                  ))}
                </div>
              )}

              {view === "login" && known.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Аккаунты на этом устройстве</div>
                  <div className="flex flex-wrap gap-2">
                    {known.map((k) => (
                      <button
                        key={k.login}
                        type="button"
                        onClick={() => {
                          setLogin(k.login);
                          setErrors({});
                          document.getElementById("auth-password")?.focus();
                        }}
                        className={cn("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition hover:border-ink/40", login === k.login ? "border-accent bg-accent/10" : "border-line")}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, hsl(${k.hue} 55% 46%), hsl(${(k.hue + 35) % 360} 55% 32%))` }}>
                          {(k.displayName || k.login).slice(0, 1).toUpperCase()}
                        </span>
                        {k.displayName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={view === "login" ? submitLogin : submitRegister} className="mt-5 space-y-4" noValidate>
                {error && <Banner>{error}</Banner>}
                <TextField
                  label={email ? "Email" : "Логин"}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  error={errors.login}
                  hint={view === "register" && !email ? "От 3 символов: буквы, цифры, _ . - @" : undefined}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode={email ? "email" : "text"}
                  autoFocus
                />
                {view === "register" && <TextField label="Как вас называть" value={name} onChange={(e) => setName(e.target.value)} placeholder="Необязательно" maxLength={40} autoComplete="nickname" />}
                <PasswordField
                  id="auth-password"
                  label="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={errors.password}
                  autoComplete={view === "login" ? "current-password" : "new-password"}
                  hint={view === "register" ? "Не короче 8 символов; лучше — буквы разного регистра, цифры и символы" : undefined}
                />
                {view === "register" && (
                  <>
                    <StrengthMeter password={password} login={login} />
                    <PasswordField label="Повторите пароль" value={password2} onChange={(e) => setPassword2(e.target.value)} error={errors.password2} autoComplete="new-password" />
                  </>
                )}

                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <Toggle checked={remember} onChange={setRemember} label="Запомнить меня" />
                    Запомнить меня
                  </label>
                  {view === "login" && (
                    <button type="button" onClick={() => go("reset")} className="text-sm font-semibold text-accent hover:underline">
                      Забыли пароль?
                    </button>
                  )}
                </div>

                {view === "register" && guestData > 0 && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 text-sm">
                    <input type="checkbox" checked={importGuest} onChange={(e) => setImportGuest(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                    <span>
                      Перенести в аккаунт мои текущие данные
                      <span className="mt-0.5 block text-xs text-muted">Станций: {guestData}, плюс избранное и статистика из гостевого режима.</span>
                    </span>
                  </label>
                )}

                <button className={btnPrimary + " w-full !py-3"} disabled={busy}>
                  {busy && <Loader2 size={17} className="animate-spin" />}
                  {view === "login" ? "Войти" : "Создать аккаунт"}
                </button>
              </form>

              <div className="mt-6 border-t border-line pt-5 text-center">
                <button type="button" onClick={auth.continueAsGuest} className={btnGhost + " w-full"}>
                  {auth.guest ? "Вернуться в гостевой режим" : "Продолжить без аккаунта"}
                </button>
                <p className="mt-2.5 text-xs leading-relaxed text-muted">
                  {provider.id === "local"
                    ? "Аккаунт хранится на этом устройстве. Без него данные тоже сохраняются, но общие для всех, кто открывает приложение."
                    : "Без аккаунта данные хранятся только в этом браузере."}
                </p>
              </div>
            </>
          )}
        </div>
      </main>
      <Toasts />
    </div>
  );
}

export function Splash() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <Mark className="h-14 w-14 animate-pulse" />
        <span className="font-display text-lg font-bold tracking-tight">Pocket Radio</span>
      </div>
    </div>
  );
}
