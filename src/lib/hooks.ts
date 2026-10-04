import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { connectivity } from "./connectivity";
import { setThemePrefs, useThemePrefs, type ThemeMode } from "./themes";
import type { OfflineItem, PlayEvent, SavedTrack, Session, Station } from "./types";
import { fixText } from "./text";

export function useStations(): Station[] | undefined {
  return useLiveQuery(async () =>
    (await db.stations.toArray()).map((s) => ({
      ...s,
      name: fixText(s.name),
      genre: fixText(s.genre),
      mood: fixText(s.mood),
      city: fixText(s.city),
      note: fixText(s.note),
      tags: s.tags.map(fixText),
    })),
  []);
}
export function useSessions(): Session[] {
  return useLiveQuery(() => db.sessions.toArray(), []) ?? [];
}
export function useEvents(): PlayEvent[] {
  return useLiveQuery(() => db.events.toArray(), []) ?? [];
}
export function useOfflineItems(): OfflineItem[] {
  return useLiveQuery(() => db.offline.toArray(), []) ?? [];
}
export function useSavedTracks(): SavedTrack[] {
  return useLiveQuery(async () => (await db.tracks.orderBy("ts").reverse().toArray()).map((t) => ({ ...t, title: fixText(t.title), artist: fixText(t.artist) || undefined, station: fixText(t.station) })), []) ?? [];
}
/** Станция из каталога по id: undefined — ещё грузится, null — в каталоге её нет (предпросмотр). */
export function useSavedStation(st: { id: string; url: string } | null | undefined): Station | null | undefined {
  const id = st?.id;
  const url = st?.url;
  return useLiveQuery(async () => {
    if (!id) return null;
    // встроенный эмбиент — не станция каталога и не «предпросмотр»
    if (id.startsWith("ambient:") || id.startsWith("pli:")) return undefined;
    return (await db.stations.get(id)) ?? (await db.stations.filter((s) => s.url === url).first()) ?? null;
  }, [id, url]);
}

/** Есть ли интернет: учитывает не только событие браузера, но и реальную проверку связи. */
export function useOnline(): boolean {
  return useSyncExternalStore(connectivity.subscribe, connectivity.isOnline);
}

export type Theme = ThemeMode;

/** Режим темы (светлая / тёмная / системная). Палитры и акцент — в themes.ts. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const p = useThemePrefs();
  const set = useCallback((m: Theme) => setThemePrefs({ mode: m }), []);
  return [p.mode, set];
}

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export function useInstall() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  );
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = useCallback(async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
  }, [evt]);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return { canInstall: !!evt, installed, install, ios };
}

/** Секунды → «тик» раз в секунду, пока active. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
