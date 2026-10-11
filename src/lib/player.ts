import { useSyncExternalStore } from "react";
import type Hls from "hls.js";
import { db, getSetting, setSetting } from "./db";
import { itemStationId, itemToStation, loadProgress } from "./playlistModel";
import type { FallbackInfo, Playlist, Session, Station } from "./types";
import { ambient } from "./ambient";
import { fixText } from "./text";
import { cachedBlobUrl } from "./offline";
import { fetchCddaWav, parseCddaTrackUrl } from "./cdda";
import { connectivity } from "./connectivity";
import { isLanUrl, mixedContentRisk, uid } from "./templates";
import { isPlaceholderArtwork } from "./artwork";
import { toast } from "./toast";
import {
  applyEqualizerGraph,
  createEqualizerGraph,
  loadEqualizerSettings,
  normalizeEqualizerSettings,
  saveEqualizerPreset,
  saveEqualizerSettings,
  selectEqualizerPreset,
  setEqualizerBand,
  setEqualizerPreamp,
  deleteEqualizerPreset,
  type EqualizerGraph,
  type EqualizerSettings,
} from "./equalizer";

export type Status = "idle" | "loading" | "playing" | "paused" | "buffering" | "error";
export type EqualizerAvailability = "idle" | "checking" | "available" | "unavailable" | "unsupported";

export interface Meta {
  title?: string;
  artist?: string;
}

/** Volatile source-list context; unlike saved playlist ids, it is not persisted. */
export interface PlayerSourceContext {
  kind: "playlist" | "album" | "collection";
  title: string;
}

export interface TrackEntry {
  title: string;
  artist?: string;
  ts: number;
  stationId: string;
  stationName: string;
  logo?: string;
}

export interface PlayerState {
  station: Station | null;
  status: Status;
  error: string | null;
  volume: number;
  muted: boolean;
  isLive: boolean;
  meta: Meta | null;
  sleepAt: number | null;
  queue: string[];
  dataSaver: boolean;
  fromCache: boolean;
  rate: number;
  equalizer: EqualizerSettings;
  equalizerAvailability: EqualizerAvailability;
  equalizerBypass: boolean;
  history: TrackEntry[];
  /** режим «нет интернета»: играет эмбиент или офлайн-станция вместо эфира */
  fallback: FallbackInfo | null;
  /** Сохранённый плейлист, из которого запущен трек; используется для прямого перехода по id. */
  sourcePlaylistId: string | null;
  /** Контекст открытого списка/альбома до его сохранения; живёт только в текущей сессии. */
  sourceContext: PlayerSourceContext | null;
}

export interface TimeState {
  position: number;
  duration: number;
}

interface Track {
  syncId: string;
  stationId: string;
  stationName: string;
  stationLogo?: string;
  genre: string;
  mood: string;
  city: string;
  bitrate: number;
  offline: boolean;
  kind: Station["kind"];
  startedAt: number;
  accMs: number;
  since: number | null;
  savedMs: number;
  id?: number;
}

const FADE_MS = 20000;

class Engine {
  /** Active output: native playback stays untouched for streams which do not grant CORS. */
  private audio = new Audio();
  private nativeAudio = this.audio;
  private eqAudio = new Audio();
  private eqContext: AudioContext | null = null;
  private eqGraph: EqualizerGraph | null = null;
  private sleepGain = 1;
  private hls: Hls | null = null;
  private state: PlayerState;
  private time: TimeState = { position: 0, duration: 0 };
  private listeners = new Set<() => void>();
  private timeListeners = new Set<() => void>();
  private catalog = new Map<string, Station>();
  /** Станции из «Обзора»: можно слушать, не добавляя в каталог. */
  private ephemeral = new Map<string, Station>();
  private token = 0;
  private retries = 0;
  private playlistRetries = 0;
  private playlistRetryTimer: number | null = null;
  private playlistRetryToken: number | null = null;
  private playlistRetryInProgressToken: number | null = null;
  private bufferSince: number | null = null;
  private wasPlaying = false;
  private track: Track | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private blobUrl: string | null = null;
  private loadAbort: AbortController | null = null;
  private metaTimer: number | null = null;
  private sleepTimer: number | null = null;
  private lastResumeSave = 0;
  private switching = false;
  private wantsPlayback = false;
  private hiddenWhilePlaying = false;
  private handledEndedToken: number | null = null;
  private equalizerFallbackToken: number | null = null;

  constructor() {
    const vol = Number(localStorage.getItem("radio.volume") ?? "0.8");
    this.state = {
      station: null,
      status: "idle",
      error: null,
      volume: isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 0.8,
      muted: false,
      isLive: true,
      meta: null,
      sleepAt: null,
      queue: [],
      dataSaver: localStorage.getItem("radio.dataSaver") === "1",
      fromCache: false,
      rate: Number(localStorage.getItem("radio.rate")) || 1,
      equalizer: loadEqualizerSettings(),
      equalizerAvailability: "idle",
      equalizerBypass: false,
      history: [],
      fallback: null,
      sourcePlaylistId: null,
      sourceContext: null,
    };
    this.nativeAudio.preload = "none";
    this.eqAudio.preload = "none";
    this.eqAudio.crossOrigin = "anonymous";
    this.bindAudioEvents(this.nativeAudio);
    this.bindAudioEvents(this.eqAudio);
    this.applyAudioSettings(this.nativeAudio);
    ambient.setEqualizer(this.state.equalizer);
    window.setInterval(() => this.flush(false), 10000);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.setupMediaSession();
  }

  private bindAudioEvents(audio: HTMLAudioElement) {
    const active = (fn: () => void) => () => {
      if (this.audio === audio) fn();
    };
    audio.addEventListener("playing", active(this.onPlaying));
    audio.addEventListener("pause", active(this.onPause));
    audio.addEventListener("waiting", active(this.onWaiting));
    audio.addEventListener("error", active(this.onError));
    audio.addEventListener("ended", active(this.onEnded));
    audio.addEventListener("timeupdate", active(this.onTime));
    audio.addEventListener("durationchange", active(this.onTime));
    audio.addEventListener("canplay", active(() => {
      if (audio === this.eqAudio && this.state.equalizer.enabled) this.set({ equalizerAvailability: "available" });
    }));
  }

  private currentOutputLevel(): number {
    return this.state.muted ? 0 : this.state.volume * this.sleepGain;
  }

  private applyAudioSettings(audio: HTMLAudioElement) {
    const rate = this.state.station?.kind === "vod" ? this.state.rate : 1;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    this.applyOutputVolume(audio);
  }

  private applyOutputVolume(audio: HTMLAudioElement) {
    if (audio === this.eqAudio) {
      // Web Audio owns volume/mute after MediaElementAudioSourceNode takes the output.
      audio.volume = 1;
      audio.muted = false;
      this.setEqualizerOutputLevel();
    } else {
      audio.volume = this.state.volume * this.sleepGain;
      audio.muted = this.state.muted;
    }
  }

  private setEqualizerOutputLevel() {
    if (!this.eqGraph || !this.eqContext) return;
    const param = this.eqGraph.outputGain.gain;
    const level = this.currentOutputLevel();
    try {
      param.cancelScheduledValues(this.eqContext.currentTime);
      param.setTargetAtTime(level, this.eqContext.currentTime, 0.025);
    } catch {
      param.value = level;
    }
  }

  private applyEqualizerGraph() {
    if (this.eqGraph && this.eqContext) {
      applyEqualizerGraph(this.eqGraph, this.eqContext, this.state.equalizer, this.state.equalizerBypass, this.currentOutputLevel());
    }
  }

  /** Create the graph only after a user gesture, and only on its isolated CORS-capable audio element. */
  private ensureEqualizerGraph(): boolean {
    if (this.eqGraph && this.eqContext) {
      if (this.eqContext.state === "suspended") void this.eqContext.resume().catch(() => undefined);
      return true;
    }
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return false;
    let context: AudioContext | null = null;
    try {
      context = new Ctor();
      this.eqAudio.crossOrigin = "anonymous";
      const source = context.createMediaElementSource(this.eqAudio);
      this.eqGraph = createEqualizerGraph(context, source, context.destination);
      this.eqContext = context;
      this.applyEqualizerGraph();
      if (context.state === "suspended") void context.resume().catch(() => undefined);
      return true;
    } catch {
      if (context) void context.close().catch(() => undefined);
      this.eqContext = null;
      this.eqGraph = null;
      return false;
    }
  }

  private useAudioElement(audio: HTMLAudioElement) {
    this.audio = audio;
    this.applyAudioSettings(audio);
  }

  private markHidden = () => {
    const status = this.state.status;
    if (this.wantsPlayback && !this.state.fallback && (status === "playing" || status === "loading" || status === "buffering")) {
      this.hiddenWhilePlaying = true;
    }
  };

  private onPageHide = () => {
    this.markHidden();
    void this.flush(false);
  };

  private onPageShow = () => this.recoverAfterBackground();

  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      this.markHidden();
      void this.flush(false);
      return;
    }
    this.recoverAfterBackground();
  };

  /** Recover a VOD queue if the browser deferred its ended event while the page was suspended. */
  private recoverAfterBackground() {
    if (!this.hiddenWhilePlaying) return;
    this.hiddenWhilePlaying = false;
    if (!this.wantsPlayback || this.state.fallback || !this.state.station) return;
    const finiteTrackEnded = this.audio.ended && Number.isFinite(this.audio.duration) && this.audio.duration > 0;
    if ((!this.state.isLive || finiteTrackEnded) && this.audio.ended && !this.switching) {
      this.handleEnded();
      return;
    }
    // Some mobile browsers pause a media element when resuming a frozen page.
    if (this.state.status === "paused" && !this.audio.ended) void this.resume();
  }

  /* ------------------------------- store ------------------------------- */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  subscribeTime = (fn: () => void) => {
    this.timeListeners.add(fn);
    return () => this.timeListeners.delete(fn);
  };
  getTime = () => this.time;

  private set(p: Partial<PlayerState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((f) => f());
  }
  private setTime(p: Partial<TimeState>) {
    this.time = { ...this.time, ...p };
    this.timeListeners.forEach((f) => f());
  }

  /** Каталог нужен для next/prev и обновления карточки текущей станции. */
  setEphemeral(list: Station[]) {
    this.ephemeral = new Map(list.map((s) => [s.id, s]));
  }

  /** Очередь воспроизведения (плейлист, серии подкаста): не зависит от того, что сейчас показывают экраны. */
  private pinned = new Map<string, Station>();
  private progressSink: ((st: Station, pos: number) => void) | null = null;

  pin(list: Station[]) {
    this.pinned = new Map(list.map((s) => [s.id, s]));
  }

  /** Получатель позиции воспроизведения (для «продолжить с того же места» у треков плейлистов). */
  setProgressSink(fn: (st: Station, pos: number) => void) {
    this.progressSink = fn;
  }

  private lookup(id: string): Station | undefined {
    return this.catalog.get(id) ?? this.pinned.get(id) ?? this.ephemeral.get(id);
  }

  /** Снимок очереди для интерфейса «Далее». */
  queueItems(): Station[] {
    return this.state.queue.map((id) => this.lookup(id)).filter((s): s is Station => !!s);
  }

  /** Есть ли в очереди следующий трек (без зацикливания). */
  hasNext(): boolean {
    const { queue, station } = this.state;
    if (!station) return false;
    const ids = queue.filter((id) => this.lookup(id));
    const i = ids.indexOf(station.id);
    return i >= 0 && i < ids.length - 1;
  }

  setCatalog(list: Station[]) {
    this.catalog = new Map(list.map((s) => [s.id, s]));
    const cur = this.state.station;
    if (cur) {
      const fresh = this.catalog.get(cur.id);
      if (!fresh) {
        // эмбиент, предпросмотр и треки плейлистов не лежат в каталоге — их не трогаем
        if (!this.lookup(cur.id) && !this.state.fallback) this.stop();
      } else if (fresh !== cur) {
        const urlChanged = fresh.url !== cur.url;
        this.set({ station: fresh });
        if (urlChanged && this.state.status === "playing") void this.play(fresh, this.state.queue, { sourcePlaylistId: this.state.sourcePlaylistId, sourceContext: this.state.sourceContext });
        else this.updateMediaSession();
      }
    }
  }

  /** Восстановить последнюю станцию/позицию без автозапуска. */
  async restore() {
    const [id, savedQueue, savedPlaylistId] = await Promise.all([
      getSetting<string | null>("lastStationId", null),
      getSetting<string[]>("lastQueue", []),
      getSetting<string | null>("lastSourcePlaylistId", null),
    ]);
    let queue = Array.isArray(savedQueue) ? savedQueue.filter((x): x is string => typeof x === "string") : [];
    let sourcePlaylistId = savedPlaylistId;
    let sourceContext: PlayerSourceContext | null = null;
    if (sourcePlaylistId) {
      try {
        const row = await db.settings.get(`pl:${sourcePlaylistId}`);
        const playlist = row?.value as Playlist | undefined;
        if (playlist?.id === sourcePlaylistId) sourceContext = { kind: "playlist", title: fixText(playlist.name) };
      } catch {
        // Старый или удалённый плейлист не должен мешать восстановлению станции.
      }
    }
    let st = id ? this.catalog.get(id) : undefined;

    // Плейлистовые станции (`pli:*`) не входят в каталог, поэтому их нужно собрать из сохранённого плейлиста.
    if (id?.startsWith("pli:") && !st) {
      try {
        const rows = await db.settings.where(":id").startsWith("pl:").toArray();
        const playlists = rows.map((row) => row.value as Playlist).filter((playlist) => playlist && typeof playlist.id === "string" && Array.isArray(playlist.items));
        const containsCurrent = (playlist: Playlist) => playlist.items.some((item) => typeof item?.id === "string" && itemStationId(item.id) === id);
        const playlist = (sourcePlaylistId ? playlists.find((item) => item.id === sourcePlaylistId && containsCurrent(item)) : undefined)
          ?? playlists.find(containsCurrent);
        if (playlist) {
          const items = playlist.items.filter((item) => item && typeof item.id === "string" && typeof item.url === "string");
          const progress = await loadProgress(items.map((item) => item.id));
          const stations = items.map((item) => itemToStation(item, progress.get(item.id)));
          const byId = new Map(stations.map((item) => [item.id, item]));
          st = byId.get(id);
          if (st) {
            this.pin(stations);
            const validQueue = queue.filter((queueId) => byId.has(queueId));
            queue = validQueue.length ? validQueue : stations.map((item) => item.id);
            if (!queue.includes(id)) queue = [id, ...queue];
            sourcePlaylistId = playlist.id;
            sourceContext = { kind: "playlist", title: fixText(playlist.name) };
          }
        }
      } catch {
        // Повреждённый/удалённый плейлист не должен ломать восстановление обычной станции.
      }
    }

    if (st && !this.state.station) {
      if (!queue.includes(st.id)) queue = [st.id, ...queue];
      this.audio.muted = false;
      this.set({ station: st, status: "paused", isLive: st.kind !== "vod", queue, sourcePlaylistId, sourceContext });
      this.setTime({ position: st.resumePos ?? 0, duration: 0 });
      this.updateMediaSession();
    }
  }

  /* ------------------------------ управление ------------------------------ */
  async play(station: Station, queue?: string[], opts?: { fallback?: FallbackInfo; sourcePlaylistId?: string | null; sourceContext?: PlayerSourceContext | null }) {
    const sourcePlaylistId = opts?.sourcePlaylistId ?? null;
    const sourceContext: PlayerSourceContext | null = opts?.sourceContext ?? (sourcePlaylistId ? { kind: "playlist", title: "Плейлист" } : null);
    this.clearPlaylistRetry();
    this.playlistRetries = 0;
    this.wantsPlayback = true;
    // «разбудить» звук прямо в обработчике нажатия — на iOS иначе эмбиент потом не запустится
    ambient.prime();
    const useEq = this.state.equalizer.enabled;
    // Создаём и будим контекст только по запросу пользователя. Нативный элемент не подключаем к Web Audio.
    const eqReady = useEq && this.ensureEqualizerGraph();
    // обычный запуск станции выключает режим «нет интернета» (эмбиент останавливается)
    if (this.state.fallback && !opts?.fallback) this.fallbackStop?.(false);
    const my = ++this.token;
    this.equalizerFallbackToken = null;
    this.switching = true;
    await this.closeTrack();
    this.audio.pause();
    this.teardownSource();
    this.useAudioElement(eqReady ? this.eqAudio : this.nativeAudio);
    this.retries = 0;
    this.bufferSince = null;
    const q = queue ?? this.state.queue;
    this.set({
      station,
      status: "loading",
      error: null,
      meta: null,
      isLive: station.kind !== "vod",
      queue: q.includes(station.id) ? q : [station.id, ...q],
      fromCache: false,
      fallback: opts?.fallback ?? null,
      sourcePlaylistId,
      sourceContext,
      equalizerAvailability: useEq ? (eqReady ? "checking" : "unsupported") : "idle",
      equalizerBypass: false,
    });
    this.setTime({ position: station.resumePos ?? 0, duration: 0 });
    this.applyAudioSettings(this.audio);
    void setSetting("lastStationId", station.id);
    void setSetting("lastQueue", this.state.queue);
    void setSetting("lastSourcePlaylistId", this.state.sourcePlaylistId);
    this.updateMediaSession();
    try {
      await this.attach(station, my);
      if (my !== this.token) return;
      this.switching = false;
      await this.audio.play();
    } catch (e) {
      this.switching = false;
      if (my !== this.token) return;
      const err = e as DOMException;
      if (err?.name === "AbortError") return;
      if (err?.name === "NotAllowedError") {
        this.set({ status: "paused" });
        return;
      }
      if (this.equalizerFallbackToken === my) return;
      if (eqReady && this.audio === this.eqAudio) {
        const position = station.kind === "vod" && Number.isFinite(this.eqAudio.currentTime) ? this.eqAudio.currentTime : station.resumePos;
        if (await this.fallbackEqToNative(station, my, position)) this.recordPlay(station);
        return;
      }
      if (this.retryPlaylistTrack(station, my)) return;
      this.fail(err?.message || "Не удалось запустить поток", my);
      return;
    }
    this.switching = false;
    this.recordPlay(station);
  }

  private recordPlay(station: Station) {
    void db.stations.where("id").equals(station.id).modify((s) => {
      s.plays = (s.plays || 0) + 1;
      s.lastPlayedAt = Date.now();
    });
  }

  /** A CORS failure on the isolated EQ element must never silence the original native path. */
  private async fallbackEqToNative(station: Station, my: number, resumePosition?: number): Promise<boolean> {
    if (my !== this.token || this.audio !== this.eqAudio || this.equalizerFallbackToken === my) return false;
    this.equalizerFallbackToken = my;
    const resume = this.wantsPlayback && this.state.status !== "paused" && this.state.status !== "idle";
    this.switching = true;
    this.eqAudio.pause();
    await this.closeTrack();
    this.teardownSource();
    this.useAudioElement(this.nativeAudio);
    this.retries = 0;
    this.bufferSince = null;
    this.set({ equalizerAvailability: "unavailable", equalizerBypass: false, status: resume ? "loading" : "paused", error: null });
    this.setTime({ position: !this.state.isLive && Number.isFinite(resumePosition) ? resumePosition! : 0, duration: 0 });
    try {
      await this.attach(station, my, resumePosition);
      if (my !== this.token) return false;
      this.switching = false;
      if (resume) await this.audio.play();
      return true;
    } catch (error) {
      this.switching = false;
      if (my !== this.token) return false;
      const err = error as DOMException;
      if (err?.name === "NotAllowedError") {
        this.set({ status: "paused" });
        return false;
      }
      if (this.retryPlaylistTrack(station, my)) return false;
      this.fail(err?.message || "Не удалось воспроизвести поток", my);
      return false;
    }
  }

  private async switchCurrentToEqualizer() {
    const station = this.state.station;
    if (!station || this.state.fallback || this.audio !== this.nativeAudio || !this.state.equalizer.enabled) return;
    if (!this.ensureEqualizerGraph()) {
      this.set({ equalizerAvailability: "unsupported" });
      return;
    }
    const my = ++this.token;
    const resume = this.wantsPlayback && ["playing", "buffering", "loading"].includes(this.state.status);
    const position = !this.state.isLive && Number.isFinite(this.nativeAudio.currentTime) ? this.nativeAudio.currentTime : station.resumePos;
    this.switching = true;
    await this.closeTrack();
    this.nativeAudio.pause();
    this.teardownSource();
    this.useAudioElement(this.eqAudio);
    this.set({ status: resume ? "loading" : "paused", error: null, equalizerAvailability: "checking", equalizerBypass: false });
    this.setTime({ position: !this.state.isLive && Number.isFinite(position) ? position! : 0, duration: 0 });
    try {
      await this.attach(station, my, position);
      if (my !== this.token) return;
      this.switching = false;
      if (resume) await this.audio.play();
      this.updateMediaSession();
    } catch (error) {
      this.switching = false;
      if (my !== this.token) return;
      const err = error as DOMException;
      if (err?.name === "AbortError") return;
      if (err?.name === "NotAllowedError") {
        this.set({ status: "paused" });
        return;
      }
      await this.fallbackEqToNative(station, my, position);
    }
  }

  toggle() {
    const { status, station } = this.state;
    if (!station) return;
    if (status === "playing" || status === "buffering" || status === "loading") this.pause();
    else void this.resume();
  }

  pause() {
    this.wantsPlayback = false;
    this.clearPlaylistRetry();
    this.hiddenWhilePlaying = false;
    if (!this.state.station) return;
    const fb = this.state.fallback;
    if (fb) {
      this.fallbackStop?.(false);
      // эмбиент полностью остановлен; у офлайн-станции из библиотеки пауза выполняется ниже как обычно
      if (fb.kind === "ambient") return;
    }
    if (this.state.isLive) {
      // живой поток нельзя «поставить на паузу» — отпускаем соединение
      this.token++;
      this.audio.pause();
      this.teardownSource();
      this.set({ status: "paused", error: null });
    } else {
      this.audio.pause();
      if (this.state.status === "loading") this.set({ status: "paused", error: null });
    }
  }

  async resume() {
    const st = this.state.station;
    if (!st) return;
    this.wantsPlayback = true;
    this.hiddenWhilePlaying = false;
    if (this.state.isLive || !this.audio.src) {
      await this.play(st, this.state.queue, { sourcePlaylistId: this.state.sourcePlaylistId, sourceContext: this.state.sourceContext });
    } else {
      try {
        await this.audio.play();
      } catch {
        /* ignore */
      }
    }
  }

  /* ----------------------- режим «нет интернета» (см. resilience.ts) ----------------------- */

  private fallbackStop: ((resume: boolean) => void) | null = null;

  /** Обработчик, который останавливает эмбиент; регистрируется модулем resilience. */
  setFallbackStop(fn: (resume: boolean) => void) {
    this.fallbackStop = fn;
  }

  /** Заменяет эфир фоновым звуком: источник отпускаем, но станция в плеере остаётся (или подменяется). */
  enterFallback(info: FallbackInfo, station?: Station, status: Status = "playing") {
    this.clearPlaylistRetry();
    this.token++;
    this.switching = false;
    void this.closeTrack();
    this.audio.pause();
    this.teardownSource();
    this.set({
      station: station ?? this.state.station,
      fallback: info,
      status,
      error: null,
      isLive: true,
      fromCache: false,
      meta: { title: info.title, artist: info.manual ? "Pocket Radio" : "Нет интернета" },
      sourcePlaylistId: info.manual ? null : this.state.sourcePlaylistId,
      sourceContext: info.manual ? null : this.state.sourceContext,
    });
    this.setTime({ position: 0, duration: 0 });
    this.updateMediaSession();
  }

  leaveFallback(status: Status = "paused") {
    if (!this.state.fallback) return;
    this.set({ fallback: null, status, meta: null });
    this.updateMediaSession();
  }

  stop() {
    this.wantsPlayback = false;
    this.clearPlaylistRetry();
    this.hiddenWhilePlaying = false;
    if (this.state.fallback) this.fallbackStop?.(false);
    this.token++;
    void this.closeTrack();
    this.audio.pause();
    this.teardownSource();
    this.set({ station: null, status: "idle", meta: null, error: null, fallback: null, sourcePlaylistId: null, sourceContext: null });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
    void setSetting("lastStationId", null);
    void setSetting("lastQueue", []);
    void setSetting("lastSourcePlaylistId", null);
  }

  step(dir: 1 | -1) {
    const { queue, station } = this.state;
    if (!station) return;
    const ids = queue.filter((id) => this.lookup(id));
    if (!ids.length) return;
    const i = ids.indexOf(station.id);
    const next = this.lookup(ids[(i + dir + ids.length) % ids.length]);
    if (next && next.id !== station.id) void this.play(next, queue, { sourcePlaylistId: this.state.sourcePlaylistId, sourceContext: this.state.sourceContext });
  }

  /** Update the return target without restarting when the current track is selected from another open list. */
  updateSourceContext(sourceContext: PlayerSourceContext, queue: string[]) {
    const currentId = this.state.station?.id;
    const nextQueue = currentId && !queue.includes(currentId) ? [currentId, ...queue] : queue;
    this.set({ sourcePlaylistId: null, sourceContext, queue: nextQueue });
    void setSetting("lastQueue", nextQueue);
    void setSetting("lastSourcePlaylistId", null);
  }

  clearSourceContext(sourceContext: PlayerSourceContext) {
    if (this.state.sourcePlaylistId || this.state.sourceContext?.kind !== sourceContext.kind || this.state.sourceContext.title !== sourceContext.title) return;
    this.set({ sourceContext: null });
  }

  toggleMute() {
    const m = !this.state.muted;
    this.set({ muted: m });
    this.applyAudioSettings(this.audio);
  }

  setRate(r: number) {
    localStorage.setItem("radio.rate", String(r));
    this.set({ rate: r });
    if (!this.state.isLive) {
      this.audio.defaultPlaybackRate = r;
      this.audio.playbackRate = r;
    }
  }

  /** Случайная станция из списка (не текущая). */
  shuffleQueue(list: Station[]): string[] {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.map((s) => s.id);
  }

  setVolume(v: number) {
    const vol = Math.min(1, Math.max(0, v));
    localStorage.setItem("radio.volume", String(vol));
    this.set({ volume: vol });
    this.applyAudioSettings(this.audio);
  }

  seek(sec: number) {
    if (this.state.isLive || !isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.min(this.audio.duration, Math.max(0, sec));
    this.onTime();
  }
  skip(delta: number) {
    this.seek(this.audio.currentTime + delta);
  }

  setDataSaver(v: boolean) {
    localStorage.setItem("radio.dataSaver", v ? "1" : "0");
    this.set({ dataSaver: v });
    if (this.hls) {
      this.hls.autoLevelCapping = v ? 0 : -1;
      if (v) this.hls.nextLevel = 0;
    }
  }

  updateEqualizer(settings: EqualizerSettings) {
    const previous = this.state.equalizer;
    const next = normalizeEqualizerSettings(settings);
    const enabling = !previous.enabled && next.enabled;
    const ambientActive = this.state.fallback?.kind === "ambient";
    const hasStation = !!this.state.station;
    const graphReady = !next.enabled || !hasStation || ambientActive || this.ensureEqualizerGraph();
    const bypass = next.enabled ? this.state.equalizerBypass : false;
    const availability: EqualizerAvailability = !next.enabled
      ? (this.audio === this.eqAudio ? "available" : "idle")
      : ambientActive ? "available" : hasStation ? (graphReady ? "checking" : "unsupported") : "idle";
    this.set({ equalizer: next, equalizerBypass: bypass, equalizerAvailability: availability });
    saveEqualizerSettings(next);
    ambient.setEqualizer(next, bypass);
    this.applyEqualizerGraph();
    if (enabling && hasStation && !ambientActive && this.audio === this.nativeAudio && graphReady) {
      void this.switchCurrentToEqualizer();
    }
  }

  selectEqualizerPreset(id: string) {
    this.updateEqualizer(selectEqualizerPreset(this.state.equalizer, id));
  }

  setEqualizerBand(index: number, gainDb: number) {
    this.updateEqualizer(setEqualizerBand(this.state.equalizer, index, gainDb));
  }

  setEqualizerPreamp(preampDb: number) {
    this.updateEqualizer(setEqualizerPreamp(this.state.equalizer, preampDb));
  }

  saveEqualizerPreset(name: string) {
    const next = saveEqualizerPreset(this.state.equalizer, name);
    if (next === this.state.equalizer) return false;
    this.updateEqualizer(next);
    return true;
  }

  deleteEqualizerPreset(id: string) {
    this.updateEqualizer(deleteEqualizerPreset(this.state.equalizer, id));
  }

  setEqualizerBypass(bypass: boolean) {
    const ambientActive = this.state.fallback?.kind === "ambient";
    if (!this.state.equalizer.enabled || (!ambientActive && (this.audio !== this.eqAudio || this.state.equalizerAvailability !== "available"))) return;
    this.set({ equalizerBypass: bypass });
    this.applyEqualizerGraph();
    ambient.setEqualizer(this.state.equalizer, bypass);
  }

  setSleep(minutes: number | null) {
    if (this.sleepTimer) clearInterval(this.sleepTimer);
    this.sleepTimer = null;
    this.sleepGain = 1;
    this.applyOutputVolume(this.audio);
    if (!minutes) {
      this.set({ sleepAt: null });
      return;
    }
    const at = Date.now() + minutes * 60000;
    this.set({ sleepAt: at });
    this.sleepTimer = window.setInterval(() => {
      const left = at - Date.now();
      if (left <= 0) {
        clearInterval(this.sleepTimer!);
        this.sleepTimer = null;
        this.pause();
        this.sleepGain = 1;
        this.applyOutputVolume(this.audio);
        this.set({ sleepAt: null });
        toast("Таймер сна сработал — воспроизведение остановлено", "info");
      } else if (left < FADE_MS) {
        this.sleepGain = left / FADE_MS;
        this.applyOutputVolume(this.audio);
      }
    }, 500);
  }

  /* ------------------------------- источник ------------------------------- */
  private async hasCorsAccess(url: string, my: number): Promise<boolean> {
    if (/^(?:blob:|data:)/i.test(url)) return true;
    try {
      if (new URL(url, location.href).origin === location.origin) return true;
    } catch {
      return false;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2_500);
    try {
      const response = await fetch(url, { method: "GET", mode: "cors", cache: "no-store", signal: controller.signal });
      if (my !== this.token) return false;
      const allowed = response.ok || response.status === 206;
      void response.body?.cancel().catch(() => undefined);
      return allowed;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private teardownSource() {
    this.loadAbort?.abort();
    this.loadAbort = null;
    if (this.metaTimer) clearInterval(this.metaTimer);
    this.metaTimer = null;
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  private async attach(st: Station, my: number, resumePosition: number | undefined = st.resumePos) {
    const a = this.audio;
    let url = st.url;

    if (st.kind === "vod") {
      const blob = await cachedBlobUrl(st);
      if (my !== this.token) return;
      if (blob) {
        this.blobUrl = blob;
        url = blob;
        this.set({ fromCache: true });
      } else if (parseCddaTrackUrl(st.url)) {
        const controller = new AbortController();
        this.loadAbort = controller;
        try {
          const wav = await fetchCddaWav(st.url, controller.signal);
          if (my !== this.token) return;
          this.blobUrl = URL.createObjectURL(wav);
          url = this.blobUrl;
        } finally {
          if (this.loadAbort === controller) this.loadAbort = null;
        }
      }
    }
    if (st.kind === "shoutcast") {
      try {
        const u = new URL(url);
        if (u.pathname === "/" || u.pathname === "") {
          u.pathname = "/;";
          url = u.toString();
        }
      } catch {
        /* ignore */
      }
    }

    // http-поток на https-странице браузер блокирует (mixed content). Radio Browser
    // хранит много популярных станций только с http-адресом, поэтому пробуем https —
    // у большинства таких серверов он есть. Если нет, сработает обычный путь ошибки.
    if ((st.kind === "hls" || st.kind === "http" || st.kind === "shoutcast") && mixedContentRisk(url)) {
      url = url.replace(/^http:\/\//i, "https://");
    }

    if (a === this.eqAudio) {
      // MediaElementAudioSourceNode can silently output zero for a cross-origin source without CORS.
      // Probe the exact final URL before connecting it; on failure attach() throws and the native
      // audio element continues with the browser's normal, non-CORS playback path.
      if (!(await this.hasCorsAccess(url, my))) {
        if (my !== this.token) return;
        throw new Error("Источник не разрешает безопасную обработку звука (CORS)");
      }
      if (my !== this.token) return;
    }

    const isHls = st.kind === "hls" || /\.m3u8(\?|$)/i.test(st.url);
    if (isHls && !a.canPlayType("application/vnd.apple.mpegurl")) {
      const { default: HlsLib } = await import("hls.js");
      if (my !== this.token) return;
      if (!HlsLib.isSupported()) throw new Error("HLS не поддерживается в этом браузере");
      const ds = this.state.dataSaver;
      const hls = new HlsLib({
        startLevel: ds ? 0 : -1,
        capLevelToPlayerSize: true,
        maxBufferLength: ds ? 12 : 30,
        enableWorker: true,
      });
      if (ds) hls.autoLevelCapping = 0;
      this.hls = hls;
      hls.on(HlsLib.Events.ERROR, (_e, d) => {
        if (!d.fatal || my !== this.token) return;
        if (this.audio === this.eqAudio && this.state.equalizer.enabled && this.state.station) {
          const position = !this.state.isLive && Number.isFinite(this.eqAudio.currentTime) ? this.eqAudio.currentTime : this.state.station.resumePos;
          void this.fallbackEqToNative(this.state.station, my, position);
          return;
        }
        if (d.type === HlsLib.ErrorTypes.NETWORK_ERROR && this.retries < 3) {
          this.retries++;
          this.logEvent("error", `HLS сеть: ${d.details}`);
          setTimeout(() => my === this.token && hls.startLoad(), 1500 * this.retries);
        } else if (d.type === HlsLib.ErrorTypes.MEDIA_ERROR && this.retries < 3) {
          this.retries++;
          hls.recoverMediaError();
        } else {
          this.logEvent("error", `HLS: ${d.details}`);
          this.fail(`Ошибка HLS: ${d.details}`, my);
        }
      });
      hls.loadSource(url);
      hls.attachMedia(a);
    } else {
      a.src = url;
      a.load();
    }
    if (st.kind === "vod" && resumePosition && resumePosition > 3) {
      const pos = resumePosition;
      a.addEventListener("loadedmetadata", () => (a.currentTime = Math.min(pos, (a.duration || pos) - 1)), { once: true });
    }
  }

  /* ------------------------------ события audio ------------------------------ */
  private onPlaying = () => {
    const st = this.state.station;
    if (!st) return;
    if (this.bufferSince) {
      const ms = Date.now() - this.bufferSince;
      if (ms > 400) this.logEvent("buffer", undefined, ms);
      this.bufferSince = null;
    }
    this.wasPlaying = true;
    this.retries = 0;
    this.set({
      status: "playing",
      error: null,
      ...(this.audio === this.eqAudio && this.state.equalizer.enabled ? { equalizerAvailability: "available" as const } : {}),
    });
    if (!this.track || this.track.stationId !== st.id) {
      this.track = {
        syncId: uid(),
        stationId: st.id,
        stationName: st.name,
        stationLogo: st.logo,
        genre: st.genre,
        mood: st.mood,
        city: st.city,
        bitrate: st.bitrate,
        offline: this.state.fromCache || st.kind === "lan" || isLanUrl(st.url),
        kind: st.kind,
        startedAt: Date.now(),
        accMs: 0,
        since: null,
        savedMs: 0,
      };
    }
    if (this.track.since === null) this.track.since = Date.now();
    this.startMetaPolling();
    this.updateMediaSession();
  };

  private onPause = () => {
    this.pauseTrack();
    if (this.switching || this.audio.ended) return;
    if (this.state.status === "playing" || this.state.status === "buffering") {
      if (!this.state.isLive) this.set({ status: "paused" });
    }
    this.updateMediaSession();
    this.flush(false);
  };

  private onWaiting = () => {
    if (this.state.status === "playing" && this.wasPlaying) {
      this.bufferSince = Date.now();
      this.pauseTrack();
      this.set({ status: "buffering" });
    }
  };

  private clearPlaylistRetry() {
    if (this.playlistRetryTimer !== null) window.clearTimeout(this.playlistRetryTimer);
    this.playlistRetryTimer = null;
    this.playlistRetryToken = null;
  }

  /** Retry a transient launch error for an offline-playlist item before treating it as a bad track. */
  private retryPlaylistTrack(station: Station, my: number): boolean {
    if (!station.id.startsWith("pli:") || my !== this.token || this.state.station?.id !== station.id || !this.wantsPlayback) return false;
    if (this.playlistRetryToken === my || this.playlistRetryInProgressToken === my) return true;
    if (this.playlistRetries >= 2) return false;

    const attempt = ++this.playlistRetries;
    this.playlistRetryToken = my;
    this.set({ status: "loading", error: null });
    this.playlistRetryTimer = window.setTimeout(() => {
      this.playlistRetryTimer = null;
      if (this.playlistRetryToken === my) this.playlistRetryToken = null;
      if (my !== this.token) return;
      if (!this.wantsPlayback) {
        this.set({ status: "paused" });
        return;
      }
      this.playlistRetryInProgressToken = my;
      void this.retryPlaylistTrackAttempt(station, my);
    }, 300 * attempt);
    return true;
  }

  private async retryPlaylistTrackAttempt(station: Station, my: number) {
    const finish = () => {
      if (this.playlistRetryInProgressToken === my) this.playlistRetryInProgressToken = null;
    };
    if (my !== this.token) {
      finish();
      return;
    }
    if (!this.wantsPlayback) {
      this.set({ status: "paused" });
      finish();
      return;
    }

    const position = !this.state.isLive && Number.isFinite(this.audio.currentTime) && this.audio.currentTime > 1
      ? this.audio.currentTime
      : station.resumePos;
    this.switching = true;
    this.audio.pause();
    this.teardownSource();
    try {
      await this.attach(station, my, position);
      if (my !== this.token) return;
      this.switching = false;
      if (!this.wantsPlayback) {
        this.audio.pause();
        this.set({ status: "paused" });
        return;
      }
      await this.audio.play();
      if (this.audio.error) throw new Error("Не удалось запустить аудиофайл");
      if (my === this.token) this.recordPlay(station);
    } catch (error) {
      this.switching = false;
      if (my !== this.token) return;
      const err = error as DOMException;
      if (err?.name === "AbortError") return;
      if (!this.wantsPlayback || err?.name === "NotAllowedError") {
        this.set({ status: "paused" });
        return;
      }
      finish();
      if (this.audio === this.eqAudio && this.state.equalizer.enabled) {
        const currentPosition = !this.state.isLive && Number.isFinite(this.eqAudio.currentTime) ? this.eqAudio.currentTime : station.resumePos;
        if (await this.fallbackEqToNative(station, my, currentPosition)) this.recordPlay(station);
        return;
      }
      if (this.retryPlaylistTrack(station, my)) return;
      this.fail(err?.message || "Не удалось запустить трек", my);
    } finally {
      finish();
    }
  }

  private onError = () => {
    const my = this.token;
    if (!this.audio.getAttribute("src")) return;
    if (this.audio === this.eqAudio && this.state.equalizer.enabled && this.state.station) {
      const position = !this.state.isLive && Number.isFinite(this.eqAudio.currentTime) ? this.eqAudio.currentTime : this.state.station.resumePos;
      void this.fallbackEqToNative(this.state.station, my, position);
      return;
    }
    if (this.hls) return;
    const code = this.audio.error?.code;
    let msg = "Не удалось воспроизвести поток";
    if (code === 2) msg = "Сетевая ошибка — поток недоступен";
    else if (code === 3) msg = "Ошибка декодирования аудио";
    else if (code === 4) {
      const url = this.state.station?.url ?? "";
      msg = mixedContentRisk(url)
        ? "Браузер блокирует http-поток на https-странице. Используйте https-адрес"
        : "Формат не поддерживается или адрес недоступен";
    }
    const station = this.state.station;
    if (station && this.retryPlaylistTrack(station, my)) return;
    // navigator.onLine can briefly flip to false while Android reroutes traffic after VPN changes.
    // The global connectivity monitor decides whether the whole network is down; a stream error alone
    // should stay station-specific and still get the usual reconnect attempts.
    this.logEvent("error", msg);
    if (this.state.isLive && this.retries < 3) {
      this.retries++;
      this.set({ status: "loading" });
      const st = this.state.station!;
      setTimeout(async () => {
        if (my !== this.token) return;
        try {
          this.teardownSource();
          await this.attach(st, my);
          await this.audio.play();
        } catch {
          /* следующий error-ивент повторит */
        }
      }, 1500 * this.retries);
      return;
    }
    this.fail(msg, my, false);
  };

  private onEnded = () => this.handleEnded();

  private handleEnded() {
    if (this.switching || this.handledEndedToken === this.token || this.playlistRetryToken === this.token || this.playlistRetryInProgressToken === this.token) return;
    this.handledEndedToken = this.token;
    this.pauseTrack();
    // Некоторые mp3-файлы в плейлистах импортируются как обычный HTTP-источник, а не как VOD.
    // Если браузер сообщил конечную длительность и дошёл до ended, это трек, не оборвавшийся эфир.
    const finiteTrackEnded = !this.state.isLive || (this.audio.ended && Number.isFinite(this.audio.duration) && this.audio.duration > 0);
    if (!finiteTrackEnded) {
      this.logEvent("error", "Поток завершился");
      this.fail("Поток завершился", this.token, false);
      return;
    }
    const st = this.state.station;
    if (st) {
      void db.stations.update(st.id, { resumePos: 0, resumeUpdatedAt: Date.now() });
      this.progressSink?.(st, 0);
    }
    this.set({ status: "paused" });
    this.setTime({ position: 0 });
    // дальше по очереди (серии подкаста, плейлист) — до последнего трека, без зацикливания
    if (this.wantsPlayback && this.hasNext()) this.step(1);
  }

  private onTime = () => {
    const a = this.audio;
    const dur = isFinite(a.duration) ? a.duration : 0;
    this.setTime({ position: a.currentTime, duration: dur });
    const st = this.state.station;
    if (!this.state.isLive && st && Date.now() - this.lastResumeSave > 5000 && a.currentTime > 1) {
      this.lastResumeSave = Date.now();
      void db.stations.update(st.id, { resumePos: Math.floor(a.currentTime), resumeUpdatedAt: Date.now() });
      this.progressSink?.(st, a.currentTime);
      if ("mediaSession" in navigator && dur) {
        try {
          navigator.mediaSession.setPositionState({ duration: dur, position: Math.min(a.currentTime, dur), playbackRate: 1 });
        } catch {
          /* ignore */
        }
      }
    }
  };

  private fail(msg: string, my: number, log = true) {
    if (my !== this.token) return;
    if (log) this.logEvent("error", msg);
    this.pauseTrack();
    this.set({ status: "error", error: msg });
    this.updateMediaSession();
    this.flush(false);
    // Одна битая песня или серия не должна останавливать весь плейлист.
    if (this.state.station?.id.startsWith("pli:") && this.hasNext()) {
      toast("Трек недоступен — включаем следующий", "info");
      window.setTimeout(() => this.state.status === "error" && this.step(1), 1200);
    }
  }

  /* ------------------------------- статистика ------------------------------- */
  private pauseTrack() {
    const t = this.track;
    if (t && t.since !== null) {
      t.accMs += Date.now() - t.since;
      t.since = null;
    }
  }

  private logEvent(type: "error" | "buffer", message?: string, ms?: number) {
    const st = this.state.station;
    if (!st) return;
    void db.events.add({ stationId: st.id, stationName: st.name, type, ts: Date.now(), message, ms });
  }

  flush(final: boolean): Promise<unknown> {
    const t = this.track;
    if (!t) return this.chain;
    const now = Date.now();
    const total = t.accMs + (t.since !== null ? now - t.since : 0);
    if (final) this.track = null;
    this.chain = this.chain.then(async () => {
      if (total < 3000) return;
      const delta = total - t.savedMs;
      t.savedMs = total;
      const rec: Session = {
        syncId: t.syncId,
        stationId: t.stationId,
        stationName: t.stationName,
        stationLogo: t.stationLogo,
        genre: t.genre,
        mood: t.mood,
        city: t.city,
        bitrate: t.bitrate,
        offline: t.offline,
        kind: t.kind,
        startedAt: t.startedAt,
        endedAt: now,
        seconds: Math.round(total / 1000),
      };
      try {
        if (t.id === undefined) t.id = await db.sessions.add(rec);
        else await db.sessions.update(t.id, { endedAt: rec.endedAt, seconds: rec.seconds });
        if (delta > 0)
          await db.stations.where("id").equals(t.stationId).modify((s) => {
            s.totalSeconds = (s.totalSeconds || 0) + delta / 1000;
          });
      } catch {
        /* БД недоступна */
      }
    });
    return this.chain;
  }

  private async closeTrack() {
    this.pauseTrack();
    await this.flush(true);
  }

  /* ------------------------------- метаданные ------------------------------- */
  private startMetaPolling() {
    if (this.metaTimer) return;
    const run = async () => {
      const st = this.state.station;
      if (!st || !this.state.isLive || this.state.dataSaver || !connectivity.isOnline() || st.kind === "hls") return;
      const meta = await fetchMeta(st);
      if (this.state.station?.id === st.id && meta) {
        const cur = this.state.meta;
        if (cur?.title !== meta.title || cur?.artist !== meta.artist) {
          const title = fixText(meta.title);
          const artist = fixText(meta.artist);
          const cleanMeta = title ? { title, artist: artist || undefined } : null;
          const history = title
            ? [{ title, artist: artist || undefined, ts: Date.now(), stationId: st.id, stationName: st.name, logo: st.logo }, ...this.state.history].slice(0, 30)
            : this.state.history;
          this.set({ meta: cleanMeta, history });
          this.updateMediaSession();
        }
      }
    };
    setTimeout(run, 1500);
    this.metaTimer = window.setInterval(run, 20000);
  }

  /* ------------------------------- Media Session ------------------------------- */
  private setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const h = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* не поддерживается */
      }
    };
    h("play", () => void this.resume());
    h("pause", () => this.pause());
    h("stop", () => this.pause());
    h("previoustrack", () => this.step(-1));
    h("nexttrack", () => this.step(1));
    h("seekbackward", (d) => this.skip(-(d.seekOffset ?? 15)));
    h("seekforward", (d) => this.skip(d.seekOffset ?? 30));
    h("seekto", (d) => d.seekTime !== undefined && this.seek(d.seekTime));
  }

  private updateMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const { station: st, meta, status } = this.state;
    if (!st) return;
    try {
      const legacyInlineTrackArt = st.id.startsWith("pli:") && /^data:image\//i.test(st.logo ?? "");
      const art = st.logo && /^(https:\/\/|data:image\/)/i.test(st.logo) && !isPlaceholderArtwork(st.logo) && !legacyInlineTrackArt ? st.logo : undefined;
      const type = art && (/^data:image\/jpe?g/i.test(art) || /\.jpe?g(?:[?#]|$)/i.test(art)) ? "image/jpeg" : undefined;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: fixText(meta?.title || st.name),
        artist: fixText(meta?.title ? meta.artist || st.name : st.city || st.genre || "Pocket Radio"),
        album: fixText(meta?.title ? st.name : "Pocket Radio"),
        ...(art ? { artwork: [{ src: art, sizes: "512x512", ...(type ? { type } : {}) }] } : {}),
      });
      navigator.mediaSession.playbackState = status === "playing" || status === "buffering" ? "playing" : "paused";
    } catch {
      /* ignore */
    }
  }
}

async function fetchMeta(st: Station): Promise<Meta | null> {
  let u: URL;
  try {
    u = new URL(st.url);
  } catch {
    return null;
  }
  const get = async (path: string) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(u.origin + path, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) return null;
      return r;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  };
  const split = (s: string): Meta => {
    s = fixText(s);
    const i = s.indexOf(" - ");
    return i > 0 ? { artist: s.slice(0, i).trim(), title: s.slice(i + 3).trim() } : { title: s.trim() };
  };
  if (st.kind === "shoutcast") {
    const r = await get("/currentsong?sid=1");
    if (r) {
      const txt = (await r.text()).trim();
      if (txt && !txt.includes("<")) return split(txt);
    }
    const r2 = await get("/7.html");
    if (r2) {
      const body = (await r2.text()).replace(/<[^>]*>/g, "").trim();
      const parts = body.split(",");
      if (parts.length >= 7) return split(parts.slice(6).join(","));
    }
    return null;
  }
  const r = await get("/status-json.xsl");
  if (!r) return null;
  try {
    const j = await r.json();
    const src = j?.icestats?.source;
    const arr = Array.isArray(src) ? src : src ? [src] : [];
    const mount = arr.find((s: { listenurl?: string }) => s.listenurl && s.listenurl.endsWith(u.pathname)) ?? arr[0];
    const title: string | undefined = mount?.title || mount?.yp_currently_playing;
    if (!title) return null;
    if (mount.artist) return { artist: mount.artist, title };
    return split(title);
  } catch {
    return null;
  }
}

export const player = new Engine();

export function usePlayer(): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState);
}
export function usePlayerTime(): TimeState {
  return useSyncExternalStore(player.subscribeTime, player.getTime);
}
