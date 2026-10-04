import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

/** Блок настроек: заголовок и карточка со строками. */
export function Group({ title, hint, children }: { title?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6" data-row={title}>
      {title && <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.15em] text-muted">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
      {hint && <p className="mt-2 px-1 text-xs leading-relaxed text-muted">{hint}</p>}
    </section>
  );
}

/** Строка настройки. data-row нужен, чтобы поиск по настройкам мог прокрутить сюда и подсветить строку. */
export function Row({ title, desc, children, stack }: { title: string; desc?: ReactNode; children?: ReactNode; stack?: boolean }) {
  return (
    <div data-row={title} className={cn("flex gap-4 p-4", stack ? "flex-col" : "items-center justify-between")}>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{title}</div>
        {desc && <div className="mt-0.5 text-xs leading-relaxed text-muted">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/** Сегментированный переключатель. */
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {options.map(([id, name]) => (
        <button
          key={String(id)}
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition", value === id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** Вкладки внутри раздела. */
export function SubTabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map(([id, name]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          aria-current={value === id ? "true" : undefined}
          className={cn("-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition", value === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
