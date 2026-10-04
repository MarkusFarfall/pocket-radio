export type StreamKind = "http" | "icecast" | "shoutcast" | "hls" | "lan" | "vod";

export interface Health {
  ok: boolean;
  ts: number;
  ms?: number;
  msg?: string;
}

export interface Station {
  id: string;
  name: string;
  url: string;
  kind: StreamKind;
  genre: string;
  mood: string;
  city: string;
  tags: string[];
  icon: string;
  note: string;
  bitrate: number; // kbps, для оценки трафика
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  lastPlayedAt?: number;
  plays: number;
  totalSeconds: number;
  resumePos?: number; // секунды, для VOD/подкастов
  demo?: boolean;
  health?: Health;
  /** https-адрес логотипа станции (необязателен) */
  logo?: string;
}

export interface Session {
  id?: number;
  stationId: string;
  genre: string;
  mood: string;
  kind: StreamKind;
  startedAt: number;
  endedAt: number;
  seconds: number;
  /** Снимок данных на момент прослушивания: нужен, даже если станцию/трек потом удалили. */
  stationName?: string;
  stationLogo?: string;
  city?: string;
  bitrate?: number;
  /** не расходовало интернет: кэш, файл с устройства или локальная сеть */
  offline?: boolean;
}

export interface PlayEvent {
  id?: number;
  stationId: string;
  type: "error" | "buffer";
  ts: number;
  ms?: number;
  message?: string;
  stationName?: string;
}

export interface OfflineItem {
  stationId: string;
  size: number;
  ts: number;
}

export interface SavedTrack {
  id?: number;
  title: string;
  artist?: string;
  station: string;
  stationId: string;
  ts: number;
}

/** Режим «нет интернета»: вместо эфира играет эмбиент или офлайн-станция. */
export interface FallbackInfo {
  kind: "ambient" | "library";
  scene?: string;
  title: string;
  /** станция, к которой вернёмся, когда связь появится */
  original: Station | null;
  since: number;
  /** запущено вручную (не из-за обрыва) */
  manual: boolean;
}

/** Один трек плейлиста: серия подкаста, песня, файл с устройства или обычная станция. */
export interface PlaylistItem {
  id: string;
  title: string;
  /** исполнитель, название подкаста или жанр/город станции */
  subtitle?: string;
  url: string;
  kind: StreamKind;
  logo?: string;
  genre?: string;
  /** длительность в секундах */
  duration?: number;
  /** размер файла в байтах (если источник его сообщил) */
  size?: number;
  note?: string;
  /** файл с устройства: лежит только во встроенном офлайн-хранилище */
  local?: boolean;
  date?: string;
  addedAt: number;
}

/** Подписка на подкаст: плейлист, который умеет подтягивать новые серии. */
export interface PlaylistFollow {
  showId: number;
  country: string;
  name: string;
  artist: string;
  art: string;
  genre: string;
  checkedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  desc: string;
  /** URL или встроенная data:image-обложка */
  cover?: string;
  items: PlaylistItem[];
  follow?: PlaylistFollow;
  createdAt: number;
  updatedAt: number;
}

export interface Draft {
  id?: string;
  name?: string;
  url?: string;
  kind?: StreamKind;
  genre?: string;
  mood?: string;
  city?: string;
  tags?: string[];
  icon?: string;
  note?: string;
  bitrate?: number;
  logo?: string;
}
