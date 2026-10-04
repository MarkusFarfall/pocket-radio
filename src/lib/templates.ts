import type { Draft, StreamKind } from "./types";

export interface Template {
  kind: StreamKind;
  label: string;
  short: string;
  placeholder: string;
  hint: string;
  bitrate: number;
}

export const TEMPLATES: Template[] = [
  {
    kind: "http",
    label: "HTTP / MP3",
    short: "Прямой аудиопоток",
    placeholder: "https://example.com/stream.mp3",
    hint: "Прямая ссылка на MP3/AAC/OGG. Подходит для большинства станций.",
    bitrate: 128,
  },
  {
    kind: "icecast",
    label: "Icecast",
    short: "Mount-точка сервера",
    placeholder: "https://icecast.example.com:8000/live",
    hint: "Адрес сервера + mount-точка. Метаданные трека берутся из status-json.xsl, если сервер разрешает CORS.",
    bitrate: 128,
  },
  {
    kind: "shoutcast",
    label: "Shoutcast",
    short: "Сервер SHOUTcast",
    placeholder: "http://shoutcast.example.com:8000/",
    hint: "Для v1 к адресу автоматически добавится «/;». Название трека читается из /currentsong или 7.html.",
    bitrate: 128,
  },
  {
    kind: "hls",
    label: "HLS",
    short: "Плейлист .m3u8",
    placeholder: "https://example.com/live/index.m3u8",
    hint: "Адаптивный поток. Работает через hls.js, в режиме экономии трафика выбирается самое низкое качество.",
    bitrate: 96,
  },
  {
    kind: "vod",
    label: "Аудиофайл / подкаст",
    short: "Файл или эпизод",
    placeholder: "https://example.com/episode.mp3",
    hint: "Обычный аудиофайл с перемоткой. Можно скачать в кэш для прослушивания офлайн (нужен CORS).",
    bitrate: 96,
  },
];

export const KIND_LABEL: Record<StreamKind, string> = {
  ...(Object.fromEntries(TEMPLATES.map((t) => [t.kind, t.label])) as Omit<Record<StreamKind, string>, "lan">),
  // Старые записи этого типа продолжают работать, но новый LAN-шаблон больше не показываем.
  lan: "Локальная сеть",
};

export const GENRES = [
  "Поп",
  "Рок",
  "Джаз",
  "Классика",
  "Электроника",
  "Ambient / Chill",
  "Хип-хоп",
  "Инди",
  "Ретро",
  "Новости",
  "Разговорное",
  "Подкасты",
  "Детям",
  "Метал",
  "Регги",
  "Блюз",
  "Кантри",
];

export const MOODS = ["Бодрое", "Спокойное", "Фокус", "Ночное", "Энергия", "Ностальгия", "Грусть", "Весёлое"];

/* ------------------------------- утилиты ------------------------------- */

export function isLanUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return (
      h === "localhost" ||
      h.endsWith(".local") ||
      h.endsWith(".lan") ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h) ||
      (!h.includes(".") && !h.includes(":"))
    );
  } catch {
    return false;
  }
}

export function guessKind(url: string): StreamKind {
  if (/\.m3u8(\?|$)/i.test(url)) return "hls";
  if (isLanUrl(url)) return "lan";
  if (/\/(;|7\.html)$/.test(url)) return "shoutcast";
  return "http";
}

export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^[a-z]+:\/\//i.test(s)) return s;
  return (isLanUrl("http://" + s) ? "http://" : "https://") + s;
}

export function validUrl(raw: string): boolean {
  try {
    const u = new URL(normalizeUrl(raw));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function mixedContentRisk(url: string): boolean {
  return typeof location !== "undefined" && location.protocol === "https:" && /^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.)/i.test(url);
}

export function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function fmtDuration(totalSec: number, compact = false): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (compact) return h > 0 ? `${h} ч ${m} м` : `${m} м`;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return `${s} с`;
}

export function fmtClock(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} КБ`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} МБ`;
  return `${(b / 1024 ** 3).toFixed(2)} ГБ`;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ------------------------------ шаринг ------------------------------ */

function b64e(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64d(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildShareLink(d: Draft): string {
  const payload = { n: d.name, u: d.url, k: d.kind, g: d.genre, m: d.mood, c: d.city, t: d.tags, i: d.icon, o: d.note, b: d.bitrate };
  Object.keys(payload).forEach((k) => {
    const v = (payload as Record<string, unknown>)[k];
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) delete (payload as Record<string, unknown>)[k];
  });
  const base = typeof location !== "undefined" ? location.href.split("#")[0] : "";
  return `${base}#add=${b64e(JSON.stringify(payload))}`;
}

export function parseShare(text: string): Draft | null {
  try {
    const m = text.match(/#add=([A-Za-z0-9_-]+)/) ?? text.match(/^add=([A-Za-z0-9_-]+)/);
    if (m) {
      const p = JSON.parse(b64d(m[1]));
      if (!p.u) return null;
      return { name: p.n, url: p.u, kind: p.k, genre: p.g, mood: p.m, city: p.c, tags: p.t, icon: p.i, note: p.o, bitrate: p.b };
    }
    const t = text.trim();
    if (validUrl(t)) return { url: normalizeUrl(t), kind: guessKind(normalizeUrl(t)) };
    return null;
  } catch {
    return null;
  }
}
