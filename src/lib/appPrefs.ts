import { useSyncExternalStore } from "react";
import { player } from "./player";
import type { Tab } from "../views/shared";

/** Небольшие пользовательские настройки приложения. */

export interface AppPrefs {
  startTab: Tab;
  /** пробовать сразу включить последнюю станцию при открытии */
  autoplay: boolean;
  /** не гасить экран, пока играет эфир */
  wake: boolean;
}

const KEY = "pr.app";
const DEFAULT: AppPrefs = { startTab: "home", autoplay: false, wake: false };
const TABS: Tab[] = ["home", "catalog", "playlists", "discover", "stats", "settings"];

function read(): AppPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AppPrefs> | null;
    if (v) return { startTab: TABS.includes(v.startTab as Tab) ? (v.startTab as Tab) : "home", autoplay: !!v.autoplay, wake: !!v.wake };
  } catch {
    /* повреждённая запись */
  }
  return { ...DEFAULT };
}

let prefs = read();
const listeners = new Set<() => void>();

export const getAppPrefs = () => prefs;

export function setAppPrefs(patch: Partial<AppPrefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
  void syncWake();
}

export function useAppPrefs(): AppPrefs {
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

/* ----------------------- «не гасить экран», пока играет эфир ----------------------- */

export const wakeSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;
let sentinel: WakeLockSentinel | null = null;

async function syncWake() {
  if (!wakeSupported) return;
  const st = player.getState().status;
  const want = prefs.wake && (st === "playing" || st === "buffering" || st === "loading") && document.visibilityState === "visible";
  if (want && !sentinel) {
    try {
      const s = await navigator.wakeLock.request("screen");
      sentinel = s;
      s.addEventListener("release", () => {
        if (sentinel === s) sentinel = null;
      });
    } catch {
      /* запрещено (например, режим экономии батареи) */
    }
  } else if (!want && sentinel) {
    const s = sentinel;
    sentinel = null;
    try {
      await s.release();
    } catch {
      /* уже освобождён */
    }
  }
}

if (typeof window !== "undefined") {
  player.subscribe(() => void syncWake());
  document.addEventListener("visibilitychange", () => void syncWake());
}
