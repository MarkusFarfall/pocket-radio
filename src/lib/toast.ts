import { useSyncExternalStore } from "react";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastItem {
  id: number;
  msg: string;
  kind: "info" | "ok" | "error";
  action?: ToastAction;
}

let items: ToastItem[] = [];
let n = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Всплывающее уведомление. С action показывается дольше и содержит кнопку («Отменить», «Вернуть»). */
export function toast(msg: string, kind: ToastItem["kind"] = "info", action?: ToastAction) {
  const id = ++n;
  items = [...items, { id, msg, kind, action }].slice(-3);
  emit();
  setTimeout(() => dismissToast(id), action ? 7000 : 4200);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => items
  );
}
