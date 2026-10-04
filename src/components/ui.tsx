import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "../utils/cn";
import { dismissToast, useToasts } from "../lib/toast";

export { Cover } from "./Cover";

export function Equalizer({ active, className }: { active: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-4 items-end gap-[2px]", !active && "eq-paused", className)} aria-hidden>
      {[0, 0.25, 0.1, 0.4].map((d, i) => (
        <span key={i} className="eq-bar w-[3px] rounded-full bg-current" style={{ height: "100%", animationDelay: `${d}s` }} />
      ))}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  mobile = "sheet",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** На телефоне: короткий bottom-sheet или отдельная полноэкранная страница. */
  mobile?: "sheet" | "page";
}) {
  const [present, setPresent] = useState(open);
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    let timer = 0;
    if (open) {
      setPresent(true);
      requestAnimationFrame(() => setClosing(false));
    } else if (present) {
      setClosing(true);
      timer = window.setTimeout(() => setPresent(false), 240);
    }
    return () => clearTimeout(timer);
  }, [open, present]);
  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      // закрываем только верхнюю модалку
      const all = document.querySelectorAll('[role="dialog"]');
      if (e.key === "Escape" && all[all.length - 1] === ref.current?.parentElement) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [present]);
  if (!present) return null;
  const w = { sm: "md:max-w-sm", md: "md:max-w-lg", lg: "md:max-w-3xl", xl: "md:max-w-4xl", full: "md:max-w-5xl" }[size];
  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex justify-center", mobile === "page" ? "items-stretch bg-surface md:items-center md:bg-transparent md:p-6" : "items-end md:items-center md:p-6")} role="dialog" aria-modal="true">
      <div className={cn("modal-backdrop absolute inset-0 bg-black/55 backdrop-blur-sm", mobile === "page" && "hidden md:block", closing && "modal-backdrop-out")} onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          "modal-panel relative flex w-full flex-col overflow-hidden border border-line bg-surface shadow-2xl outline-none md:max-h-[92dvh] md:rounded-3xl",
          closing && "modal-panel-out",
          mobile === "page" ? "h-dvh max-h-dvh rounded-none border-x-0 border-b-0 md:h-auto md:border" : "max-h-[92dvh] rounded-t-3xl",
          size === "full" && "h-[92dvh]",
          w
        )}
        data-mobile-modal={mobile}
      >
        <div className={cn("justify-center pt-2 md:hidden", mobile === "sheet" ? "flex" : "hidden")} aria-hidden>
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
            <button onClick={onClose} className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Закрыть">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overscroll-contain overflow-x-hidden overflow-y-auto">{children}</div>
        {footer && <div className="safe-bottom border-t border-line bg-surface px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-surface-2 ring-1 ring-line")}
    >
      <span
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
          checked ? "left-[22px]" : "left-0.5"
        )}
      />
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition",
        active ? "bg-ink text-bg" : "bg-surface text-ink ring-1 ring-line hover:bg-surface-2",
        className
      )}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-xl font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function Toasts() {
  const items = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4 safe-top">
      {items.map((t) => (
        <div
          key={t.id}
          className="toast-motion pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-xl"
        >
          {t.kind === "ok" ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" />
          ) : t.kind === "error" ? (
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-bad" />
          ) : (
            <Info size={18} className="mt-0.5 shrink-0 text-accent" />
          )}
          <span className="min-w-0 flex-1">{t.msg}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
              className="-my-1 shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold text-accent transition hover:bg-accent/10"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/60 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 active:scale-[0.98] disabled:opacity-50";
