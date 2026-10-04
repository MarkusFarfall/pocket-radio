import { useSyncExternalStore } from "react";
import type { PlaylistFollow, PlaylistItem } from "./types";
import { toast } from "./toast";

/** Окно «Добавить в плейлист»: открывается откуда угодно (станция, серия, трек) и показывается один раз в приложении. */

export interface PickerRequest {
  items: PlaylistItem[];
  /** название нового плейлиста по умолчанию */
  suggest?: string;
  follow?: PlaylistFollow;
  cover?: string;
}

let req: PickerRequest | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function openPicker(r: PickerRequest) {
  if (!r.items.length) {
    toast("Нечего добавлять", "info");
    return;
  }
  req = r;
  emit();
}

export function closePicker() {
  req = null;
  emit();
}

export function usePicker(): PickerRequest | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => req
  );
}

/** Перейти в раздел «Плейлисты» (и открыть конкретный плейлист); слушает App.tsx. */
export function gotoPlaylist(id?: string) {
  window.dispatchEvent(new CustomEvent("pr:goto", { detail: { id } }));
}
