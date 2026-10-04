import { useEffect, useRef, useState } from "react";
import { ChevronUp, Cloud, Copy, Download, KeyRound, LogIn, LogOut, Settings as SettingsIcon, ShieldCheck, Trash2, User, UserRound } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext";
import { AuthError } from "../lib/auth";
import type { AuthUser } from "../lib/auth/types";
import { passwordStrength, validatePassword } from "../lib/auth/validation";
import { exportJSON } from "../lib/db";
import { download } from "../lib/m3u";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";
import { Modal, btnGhost, btnPrimary, inputCls } from "./ui";

export function Avatar({ user, size = 36, className }: { user: Pick<AuthUser, "displayName" | "login" | "hue"> | null; size?: number; className?: string }) {
  const text = user ? (user.displayName || user.login || "?").trim().slice(0, 1).toUpperCase() : "";
  return (
    <span
      className={cn("flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white", !user && "bg-surface-2 text-muted", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: user ? `linear-gradient(135deg, hsl(${user.hue} 55% 46%), hsl(${(user.hue + 35) % 360} 55% 32%))` : undefined,
      }}
      aria-hidden
    >
      {user ? text : <User size={size * 0.5} />}
    </span>
  );
}

/** Карточка аккаунта внизу боковой панели (компьютер). */
export function AccountCard({ onOpenAccount, onSettings }: { onOpenAccount: () => void; onSettings: () => void }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!auth.user)
    return (
      <div className="rounded-xl border border-line bg-bg p-3">
        <div className="flex items-center gap-3">
          <Avatar user={null} size={36} />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Гость</div>
            <div className="text-xs text-muted">Без аккаунта</div>
          </div>
        </div>
        <button onClick={auth.openAuth} className={btnPrimary + " mt-3 w-full !py-2"}>
          <LogIn size={16} /> Войти
        </button>
      </div>
    );

  const u = auth.user;
  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="anim-pop absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl" role="menu">
          {(
            [
              [UserRound, "Профиль и безопасность", () => onOpenAccount()],
              [SettingsIcon, "Настройки", () => onSettings()],
            ] as const
          ).map(([I, label, fn]) => (
            <button
              key={label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                fn();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-surface-2"
            >
              <I size={17} className="text-muted" /> {label}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void auth.signOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-bad transition hover:bg-bad/10"
          >
            <LogOut size={17} /> Выйти
          </button>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg p-2.5 text-left transition hover:border-ink/30">
        <Avatar user={u} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{u.displayName}</span>
          <span className="block truncate text-xs text-muted">{u.login}</span>
        </span>
        <ChevronUp size={16} className={cn("shrink-0 text-muted transition", !open && "rotate-180")} />
      </button>
    </div>
  );
}

const HUES = [8, 28, 48, 95, 150, 175, 200, 225, 255, 285, 320, 345];

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

type Tab = "profile" | "security" | "data";

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const { user, provider } = auth;
  const [tab, setTab] = useState<Tab>("profile");
  const [name, setName] = useState("");
  const [hue, setHue] = useState(20);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [recPwd, setRecPwd] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);
  const [delLogin, setDelLogin] = useState("");
  const [delPwd, setDelPwd] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !user) return;
    setTab("profile");
    setName(user.displayName);
    setHue(user.hue);
    setCur("");
    setNext("");
    setNext2("");
    setRecPwd("");
    setNewCode(null);
    setDelLogin("");
    setDelPwd("");
    setDelOpen(false);
    setErr({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  if (!user) return <Modal open={false} onClose={onClose} children={null} />;

  const setE = (k: string, v?: string) => setErr((p) => ({ ...p, [k]: v ?? "" }));
  const msg = (e: unknown) => (e instanceof AuthError ? e.message : "Не удалось выполнить действие");

  const saveProfile = async () => {
    setBusy("profile");
    try {
      const u = await provider.updateProfile(user.id, { displayName: name, hue });
      auth.updateUser(u);
      setE("name");
      toast("Профиль сохранён", "ok");
    } catch (e) {
      setE("name", msg(e));
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async () => {
    const pe = validatePassword(next, user.login);
    if (!cur) return setE("pw", "Введите текущий пароль");
    if (pe) return setE("pw", pe);
    if (next !== next2) return setE("pw", "Новые пароли не совпадают");
    setBusy("pw");
    try {
      await provider.changePassword(user.id, cur, next);
      setCur("");
      setNext("");
      setNext2("");
      setE("pw");
      toast("Пароль изменён", "ok");
    } catch (e) {
      setE("pw", msg(e));
    } finally {
      setBusy(null);
    }
  };

  const regenCode = async () => {
    if (!provider.newRecoveryCode) return;
    setBusy("rec");
    try {
      setNewCode(await provider.newRecoveryCode(user.id, recPwd));
      setRecPwd("");
      setE("rec");
    } catch (e) {
      setE("rec", msg(e));
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    setBusy("del");
    try {
      await auth.deleteAccount(delPwd);
      toast("Аккаунт удалён", "info");
    } catch (e) {
      setE("del", msg(e));
      setBusy(null);
    }
  };

  const tabs: [Tab, string][] = [
    ["profile", "Профиль"],
    ["security", "Безопасность"],
    ["data", "Данные"],
  ];
  const strength = passwordStrength(next, user.login);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Аккаунт"
      footer={
        <div className="flex justify-between gap-2">
          <button className={btnGhost} onClick={onClose}>
            Закрыть
          </button>
          <button
            className={btnGhost + " !text-bad"}
            onClick={() => {
              onClose();
              void auth.signOut();
            }}
          >
            <LogOut size={16} /> Выйти
          </button>
        </div>
      }
    >
      <div className="p-5">
        <div className="flex items-center gap-4">
          <Avatar user={{ ...user, displayName: name || user.displayName, hue }} size={60} />
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-semibold leading-tight">{user.displayName}</div>
            <div className="truncate text-sm text-muted">{user.login}</div>
            <div className="mt-1 text-xs text-muted">
              {provider.id === "supabase" ? "Облачный аккаунт" : "Локальный аккаунт"} · с {new Date(user.createdAt).toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("rounded-lg py-2 text-sm font-semibold transition", tab === id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-7">
          {tab === "profile" && (
            <>
              <Section title="Имя" desc="Так вас видно в приложении.">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Имя" />
                {err.name && <p className="text-xs font-medium text-bad">{err.name}</p>}
              </Section>
              <Section title="Цвет аватара">
                <div className="flex flex-wrap gap-2">
                  {HUES.map((h) => (
                    <button
                      key={h}
                      onClick={() => setHue(h)}
                      aria-label={`Цвет ${h}`}
                      aria-pressed={hue === h}
                      className={cn("h-9 w-9 rounded-full ring-offset-2 ring-offset-surface transition", hue === h ? "ring-2 ring-ink" : "hover:scale-110")}
                      style={{ background: `linear-gradient(135deg, hsl(${h} 55% 46%), hsl(${(h + 35) % 360} 55% 32%))` }}
                    />
                  ))}
                </div>
              </Section>
              <button className={btnPrimary} disabled={busy === "profile" || (name.trim() === user.displayName && hue === user.hue)} onClick={saveProfile}>
                Сохранить
              </button>
            </>
          )}

          {tab === "security" && (
            <>
              {provider.id === "local" && (
                <div className="flex gap-3 rounded-xl bg-surface-2 p-3.5 text-xs leading-relaxed text-muted">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-ok" />
                  <span>
                    Аккаунт хранится только в этом браузере. Пароль защищён хешем (PBKDF2), после 5 неверных попыток вход временно блокируется. Данные на диске не шифруются — для доступа с других устройств подключите облако (Supabase, см. Настройки).
                  </span>
                </div>
              )}
              {provider.capabilities.changePassword && (
                <Section title="Смена пароля">
                  <input className={inputCls} type="password" placeholder="Текущий пароль" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
                  <input className={inputCls} type="password" placeholder="Новый пароль" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
                  {next && <p className="text-xs text-muted">{strength.label}{strength.tips.length > 0 && ` · ${strength.tips.join(", ")}`}</p>}
                  <input className={inputCls} type="password" placeholder="Повторите новый пароль" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
                  {err.pw && <p className="text-xs font-medium text-bad">{err.pw}</p>}
                  <button className={btnPrimary} disabled={busy === "pw" || !cur || !next} onClick={changePassword}>
                    Изменить пароль
                  </button>
                </Section>
              )}
              {provider.newRecoveryCode && (
                <Section title="Код восстановления" desc="Нужен, если вы забудете пароль. Новый код отменяет старый.">
                  {newCode ? (
                    <div className="space-y-2">
                      <div className="select-all rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-center font-mono text-lg font-bold tracking-[0.1em]">{newCode}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button className={btnGhost} onClick={() => navigator.clipboard.writeText(newCode).then(() => toast("Код скопирован", "ok"))}>
                          <Copy size={16} /> Копировать
                        </button>
                        <button className={btnGhost} onClick={() => download("pocket-radio-recovery-code.txt", `Pocket Radio — код восстановления\n\n${newCode}\n`, "text/plain")}>
                          <Download size={16} /> Скачать
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input className={inputCls} type="password" placeholder="Пароль для подтверждения" value={recPwd} onChange={(e) => setRecPwd(e.target.value)} autoComplete="current-password" />
                      {err.rec && <p className="text-xs font-medium text-bad">{err.rec}</p>}
                      <button className={btnGhost} disabled={busy === "rec" || !recPwd} onClick={regenCode}>
                        <KeyRound size={16} /> Выпустить новый код
                      </button>
                    </>
                  )}
                </Section>
              )}
            </>
          )}

          {tab === "data" && (
            <>
              <Section title="Резервная копия" desc="Станции, избранное, сохранённые треки и статистика этого аккаунта одним файлом.">
                <button className={btnGhost} onClick={async () => download(`pocket-radio-${user.login}-${new Date().toISOString().slice(0, 10)}.json`, await exportJSON(true), "application/json")}>
                  <Download size={16} /> Скачать JSON
                </button>
              </Section>
              {provider.capabilities.cloudSync && (
                <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3.5 text-xs text-muted">
                  <Cloud size={18} className="shrink-0" /> Синхронизация с облаком — в разделе «Настройки».
                </div>
              )}
              <Section title="Удаление аккаунта" desc="Профиль и все его данные на этом устройстве будут стёрты без возможности восстановления.">
                {!delOpen ? (
                  <button className={btnGhost + " !text-bad"} onClick={() => setDelOpen(true)}>
                    <Trash2 size={16} /> Удалить аккаунт…
                  </button>
                ) : (
                  <div className="space-y-2 rounded-xl border border-bad/40 bg-bad/5 p-3.5">
                    <p className="text-xs text-muted">
                      Для подтверждения введите {provider.loginKind === "email" ? "email" : "логин"} <b className="text-ink">{user.login}</b> и пароль.
                    </p>
                    <input className={inputCls} value={delLogin} onChange={(e) => setDelLogin(e.target.value)} placeholder={user.login} autoComplete="off" />
                    <input className={inputCls} type="password" value={delPwd} onChange={(e) => setDelPwd(e.target.value)} placeholder="Пароль" autoComplete="current-password" />
                    {err.del && <p className="text-xs font-medium text-bad">{err.del}</p>}
                    <div className="flex gap-2">
                      <button className={btnGhost} onClick={() => setDelOpen(false)}>
                        Отмена
                      </button>
                      <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-bad px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy === "del" || delLogin.trim().toLowerCase() !== user.login.toLowerCase() || !delPwd} onClick={del}>
                        Удалить навсегда
                      </button>
                    </div>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
