import { useSyncExternalStore } from "react";
import { db, draftToStation } from "./db";
import { player } from "./player";
import { connectivity } from "./connectivity";
import { hasCachedAudio } from "./offline";
import { ambient, sceneFor, sceneInfo, type SceneId } from "./ambient";
import { isLanUrl } from "./templates";
import { toast } from "./toast";
import { listPlaylists, playableOffline, playPlaylist } from "./playlists";
import type { FallbackInfo, Playlist, Station } from "./types";

/**
 * Поведение приложения при потере интернета.
 *
 * 1. Мы замечаем проблему: событие «offline», поток завис или упал, нажали «играть» без сети.
 * 2. Проверяем реальную связь (connectivity.probe) — чтобы не реагировать на сбой одной станции.
 * 3. Если интернета нет — предлагаем скачать плейлист; если таких нет, запускаем эмбиент.
 * 4. Когда связь вернулась — предлагаем вернуться к исходной трансляции.
 */

export interface ResilienceSettings {
  scene: SceneId | "auto";
  volume: number;
}

const KEY = "pr.resilience";
const DEFAULTS: ResilienceSettings = { scene: "auto", volume: 0.6 };

function load(): ResilienceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ResilienceSettings>) };
  } catch {
    /* повреждённая запись */
  }
  return { ...DEFAULTS };
}

let settings = load();
const subs = new Set<() => void>();

export interface OfflineOffer {
  original: Station;
  playlists: { playlist: Playlist; available: number }[];
}
export interface RecoveryOffer {
  original: Station;
  currentTitle: string;
  kind: "ambient" | "library";
}
let offer: OfflineOffer | null = null;
let recovery: RecoveryOffer | null = null;
const offerSubs = new Set<() => void>();
const setOffer = (o: OfflineOffer | null) => {
  offer = o;
  offerSubs.forEach((f) => f());
};
const recoverySubs = new Set<() => void>();
const setRecovery = (o: RecoveryOffer | null) => {
  recovery = o;
  recoverySubs.forEach((f) => f());
};

export function useOfflineOffer(): OfflineOffer | null {
  return useSyncExternalStore(
    (f) => {
      offerSubs.add(f);
      return () => {
        offerSubs.delete(f);
      };
    },
    () => offer
  );
}
export function useRecoveryOffer(): RecoveryOffer | null {
  return useSyncExternalStore(
    (f) => {
      recoverySubs.add(f);
      return () => recoverySubs.delete(f);
    },
    () => recovery
  );
}

export function setResilience(patch: Partial<ResilienceSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  if (patch.volume !== undefined) ambient.setVolume(settings.volume);
  subs.forEach((f) => f());
}

export function useResilience(): ResilienceSettings {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => settings
  );
}

async function needsInternet(st: Station): Promise<boolean> {
  if (st.kind === "lan" || isLanUrl(st.url)) return false;
  if (st.kind === "vod" && (await hasCachedAudio(st))) return false;
  return true;
}

function pseudoStation(scene: SceneId): Station {
  const info = sceneInfo(scene);
  return draftToStation({
    id: `ambient:${scene}`,
    name: `Эмбиент · ${info.title}`,
    url: `https://ambient.local/${scene}`,
    kind: "http",
    genre: "Ambient / Chill",
    mood: "Спокойное",
    city: "Pocket Radio",
    tags: ["ambient", "offline"],
    icon: `g:${info.glyph}`,
    note: "Генеративный эмбиент: звучит прямо в приложении, интернет не нужен.",
    bitrate: 0,
  });
}

type Reason = "error" | "stall" | "offline";

class Resilience {
  private timer: number | null = null;
  private recoverTimer: number | null = null;
  private lastKey = "";
  private busy = false;
  private leaving = false;
  private slowHinted = false;
  private declinedSince = 0;

  constructor() {
    player.setFallbackStop((resume) => void this.leave(resume));
    player.subscribe(this.onPlayer);
    connectivity.subscribe(this.onNet);
    // медленная сеть (Chrome/Android): предлагаем экономию трафика
    const conn = (navigator as unknown as { connection?: EventTarget & { saveData?: boolean; effectiveType?: string } }).connection;
    conn?.addEventListener?.("change", () => {
      const slow = conn.saveData || /(^|-)2g$/.test(conn.effectiveType ?? "");
      if (slow && !this.slowHinted && !player.getState().dataSaver && player.getState().station) {
        this.slowHinted = true;
        toast("Медленное соединение. Включить экономию трафика?", "info", { label: "Включить", run: () => player.setDataSaver(true) });
      }
    });
  }

  /* ----------------------------- наблюдение за плеером ----------------------------- */

  private clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(ms: number) {
    this.clear();
    this.timer = window.setTimeout(() => void this.trouble("stall"), ms);
  }

  private onPlayer = () => {
    const s = player.getState();
    const key = `${s.station?.id ?? ""}|${s.status}|${s.fallback?.kind ?? ""}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.clear();
    if (!s.station) return;
    if (s.fallback) {
      // офлайн-станция из библиотеки тоже не заиграла — переключаемся на эмбиент
      if (s.fallback.kind === "library" && s.status === "error") void this.toAmbient();
      return;
    }
    if (s.status === "error") void this.trouble("error");
    else if (s.status === "loading" || s.status === "buffering") {
      if (!connectivity.isOnline()) void this.trouble("offline");
      else this.arm(s.status === "loading" ? 12000 : 8000);
    }
  };

  private onNet = () => {
    const s = player.getState();
    if (!connectivity.isOnline()) {
      if (!s.fallback && s.station && (s.status === "playing" || s.status === "buffering" || s.status === "loading")) void this.trouble("offline");
      return;
    }
    const fb = s.fallback;
    if (!fb || fb.manual) return;
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
    // даём связи «устояться», чтобы не прыгать туда-сюда
    this.recoverTimer = window.setTimeout(() => {
      const cur = player.getState().fallback;
      if (connectivity.isOnline() && cur && !cur.manual) this.recovered();
    }, 1500);
  };

  /* --------------------------------- вход и выход --------------------------------- */

  private async trouble(reason: Reason): Promise<void> {
    if (this.busy) return;
    const s = player.getState();
    const st = s.station;
    if (!st || s.fallback) return;
    if (!(await needsInternet(st))) return;
    this.busy = true;
    try {
      const online = await connectivity.probe();
      const now = player.getState();
      if (now.station?.id !== st.id || now.fallback) return;
      if (online) {
        // интернет есть — значит проблема только у этой станции; для зависания перепроверим позже
        if (reason === "stall" && (now.status === "loading" || now.status === "buffering")) this.arm(10000);
        return;
      }
      if (reason !== "offline" && (now.status === "playing" || now.status === "paused" || now.status === "idle")) return;
      await this.enter(st);
    } finally {
      this.busy = false;
    }
  }

  private async enter(orig: Station): Promise<void> {
    this.declinedSince = 0;
    setRecovery(null);
    const since = Date.now();
    const choices = await this.offlinePlaylists();
    if (choices.length) {
      const info: FallbackInfo = { kind: "library", title: "Выберите офлайн-плейлист", original: orig, since, manual: false };
      player.enterFallback(info, orig, "paused");
      connectivity.setFast(true);
      setOffer({ original: orig, playlists: choices });
      return;
    }
    await this.startAmbient(orig, since, false);
  }

  private async toAmbient(): Promise<void> {
    const fb = player.getState().fallback;
    await this.startAmbient(fb?.original ?? null, fb?.since ?? Date.now(), false);
  }

  private async offlinePlaylists(): Promise<{ playlist: Playlist; available: number }[]> {
    const [lists, rows] = await Promise.all([listPlaylists(), db.offline.toArray()]);
    const off = new Set(rows.map((o) => o.stationId));
    return lists
      .map((playlist) => ({ playlist, available: playlist.items.filter((i) => playableOffline(i, off)).length }))
      .filter((x) => x.available > 0)
      .sort((a, b) => Number(b.available === b.playlist.items.length) - Number(a.available === a.playlist.items.length) || b.available - a.available);
  }

  private async startAmbient(orig: Station | null, since: number, manual: boolean, force?: SceneId): Promise<void> {
    const scene: SceneId = force ?? (settings.scene === "auto" ? sceneFor(orig ?? {}) : settings.scene);
    const info = sceneInfo(scene);
    const fb: FallbackInfo = { kind: "ambient", scene, title: `Эмбиент · ${info.title}`, original: orig, since, manual };
    player.enterFallback(fb, manual ? pseudoStation(scene) : (orig ?? undefined));
    connectivity.setFast(!manual);
    try {
      await ambient.start(scene, settings.volume);
    } catch {
      player.leaveFallback("error");
      toast("Не удалось запустить эмбиент: браузер не поддерживает Web Audio", "error");
      return;
    }
    if (!manual && !force) {
      toast(`Нет интернета — играет эмбиент «${info.title}»${orig ? `. Вернёмся к «${orig.name}», когда связь появится` : ""}`, "info");
    }
  }

  private recovered() {
    const fb = player.getState().fallback;
    if (!fb) return;
    connectivity.setFast(false);
    const ignoredOutageDialog = offer !== null;
    setOffer(null);
    const orig = fb.original;
    if (!orig) return;
    // Пользователь не трогал окно обрыва: продолжаем то, что прервалось, без второго вопроса.
    if (ignoredOutageDialog) {
      toast(`Связь вернулась — продолжаем «${orig.name}»`, "ok");
      void this.leave(true);
      return;
    }
    // Пользователь сам включил офлайн-плейлист/эмбиент: не отбираем его, а предлагаем выбор.
    if (fb.since !== this.declinedSince) setRecovery({ original: orig, currentTitle: fb.title, kind: fb.kind });
  }

  /** Выйти из режима без сети. resume — сразу включить исходную станцию. */
  async leave(resume: boolean): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    try {
      const state = player.getState();
      const fb = state.fallback;
      setOffer(null);
      setRecovery(null);
      connectivity.setFast(false);
      if (fb?.kind === "ambient") ambient.stop(1.2);
      player.leaveFallback("paused");
      if (fb?.manual) player.stop();
      else if (resume && fb?.original) await player.play(fb.original, state.queue, { sourcePlaylistId: state.sourcePlaylistId });
    } finally {
      this.leaving = false;
    }
  }

  /* ----------------------------- действия из интерфейса ----------------------------- */

  /** Проверить связь и, если она есть, вернуться к эфиру. */
  async retryNow(): Promise<void> {
    const ok = await connectivity.probe();
    const fb = player.getState().fallback;
    if (!ok) {
      toast("Интернета пока нет — офлайн-режим продолжается", "info");
      return;
    }
    await this.leave(!!fb?.original);
  }

  async choosePlaylist(pl: Playlist): Promise<void> {
    const current = offer;
    const fb = player.getState().fallback;
    const original = current?.original ?? fb?.original;
    if (!original) return;
    setOffer(null);
    setRecovery(null);
    const info: FallbackInfo = { kind: "library", title: pl.name, original, since: fb?.since ?? Date.now(), manual: false };
    await playPlaylist(pl, { fallback: info });
  }

  async chooseAmbient(): Promise<void> {
    const current = offer;
    const fb = player.getState().fallback;
    const original = current?.original ?? fb?.original ?? null;
    setOffer(null);
    setRecovery(null);
    await this.startAmbient(original, fb?.since ?? Date.now(), false);
  }

  dismissOffer() {
    setOffer(null);
    const fb = player.getState().fallback;
    if (fb && fb.title === "Выберите офлайн-плейлист") {
      const next: FallbackInfo = { ...fb, title: "Трансляция приостановлена" };
      player.enterFallback(next, fb.original ?? undefined, "paused");
    }
  }

  async returnToBroadcast(): Promise<void> {
    setRecovery(null);
    await this.leave(true);
  }

  /** Продолжить выбранную офлайн-музыку. Предложение больше не повторяется до нового обрыва. */
  continueOffline() {
    const fb = player.getState().fallback;
    if (fb) this.declinedSince = fb.since;
    setRecovery(null);
    connectivity.setFast(false);
  }

  async switchScene(id: SceneId): Promise<void> {
    const fb = player.getState().fallback;
    if (!fb || fb.kind !== "ambient") return;
    await this.startAmbient(fb.original, fb.since, fb.manual, id);
  }

  /** Включить эмбиент вручную (когда интернет есть): для фона, работы или сна. */
  async startManual(id: SceneId): Promise<void> {
    await this.startAmbient(null, Date.now(), true, id);
  }
}

export const resilience = new Resilience();
