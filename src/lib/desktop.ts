import { useEffect, useState, useSyncExternalStore } from "react";
import { markSyncKey } from "./syncBus";
import { prefDocKey } from "./syncKeys";

/** Настройки компоновки для компьютера. */

export type Shell = "studio" | "classic";
export type PanelTab = "about" | "tracks" | "queue";

export interface DesktopPrefs {
  /** «Студия» — три панели и док-плеер; «Классика» — одна колонка с меню */
  shell: Shell;
  /** правая панель «Сейчас играет» (только на широких экранах) */
  panel: boolean;
  panelTab: PanelTab;
}

const KEY = "pr.desktop";
const DEFAULT: DesktopPrefs = { shell: "studio", panel: true, panelTab: "about" };

function read(): DesktopPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<DesktopPrefs> | null;
    if (v) {
      return {
        shell: v.shell === "classic" ? "classic" : "studio",
        panel: v.panel !== false,
        panelTab: v.panelTab === "tracks" || v.panelTab === "queue" ? v.panelTab : "about",
      };
    }
  } catch {
    /* повреждённая запись */
  }
  return { ...DEFAULT };
}

let prefs = read();
const listeners = new Set<() => void>();

export const getDesktopPrefs = () => prefs;

export function setDesktopPrefs(patch: Partial<DesktopPrefs>) {
  markSyncKey(prefDocKey("desktop"));
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export function useDesktopPrefs(): DesktopPrefs {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    () => prefs
  );
}

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => (typeof matchMedia === "undefined" ? false : matchMedia(query).matches));
  useEffect(() => {
    const mq = matchMedia(query);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return m;
}

/** Компьютер и большой планшет. */
export const useIsDesktop = () => useMedia("(min-width: 1024px)");
/** Достаточно места для правой панели. */
export const useIsWide = () => useMedia("(min-width: 1280px)");
