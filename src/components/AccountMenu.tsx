import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut, Settings as SettingsIcon, UserRound } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext";
import { cn } from "../utils/cn";
import { Avatar } from "./AccountUI";

/** Кнопка-аватар с меню аккаунта: для узкой панели (side) и верхнего меню (down). */
export function AccountMenu({ placement, onOpenAccount, onSettings }: { placement: "side" | "down"; onOpenAccount: () => void; onSettings: () => void }) {
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
      <button onClick={auth.openAuth} title="Войти" aria-label="Войти" className="flex items-center gap-2 rounded-full transition hover:opacity-80">
        <Avatar user={null} size={38} />
        {placement === "down" && <LogIn size={16} className="text-muted" />}
      </button>
    );

  const u = auth.user;
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-surface-2";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Аккаунт" title={u.displayName} className="block rounded-full transition hover:opacity-85">
        <Avatar user={u} size={38} />
      </button>
      {open && (
        <div role="menu" className={cn("anim-pop absolute z-40 w-60 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl", placement === "side" ? "bottom-0 left-full ml-3" : "right-0 top-full mt-2")}>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar user={u} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{u.displayName}</div>
              <div className="truncate text-xs text-muted">{u.login}</div>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onOpenAccount();
            }}
          >
            <UserRound size={17} className="text-muted" /> Профиль и безопасность
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
          >
            <SettingsIcon size={17} className="text-muted" /> Настройки
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            className={cn(item, "text-bad hover:bg-bad/10")}
            onClick={() => {
              setOpen(false);
              void auth.signOut();
            }}
          >
            <LogOut size={17} /> Выйти
          </button>
        </div>
      )}
    </div>
  );
}
