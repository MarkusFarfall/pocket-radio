import { useSyncExternalStore } from "react";
import { markSyncKey } from "./syncBus";
import { prefDocKey } from "./syncKeys";

export type PlayerLayout = "focus" | "vinyl" | "compact";
export type PlayerMotion = "calm" | "vinyl" | "signal" | "aurora" | "none";

export type PlayerSkin = "classic" | "aurora" | "vinyl" | "neon" | "paper" | "studio";

export interface PlayerAppearance {
  skin: PlayerSkin;
  layout: PlayerLayout;
  motion: PlayerMotion;
  /** окрашивать фон плеера по текущей обложке/названию */
  colorWash: boolean;
}

export const PLAYER_LAYOUTS: { id: PlayerLayout; name: string; desc: string }[] = [
  { id: "focus", name: "Фокус", desc: "Обложка, название и управление — всё в первом экране" },
  { id: "vinyl", name: "Винил", desc: "Круглая вращающаяся пластинка и тёплая атмосфера" },
  { id: "compact", name: "Компакт", desc: "Маленькая обложка, больше места для очереди и подробностей" },
];

export const PLAYER_MOTIONS: { id: PlayerMotion; name: string; desc: string }[] = [
  { id: "calm", name: "Спокойно", desc: "Мягкое дыхание света и плавные переходы" },
  { id: "vinyl", name: "Пластинка", desc: "Вращение обложки во время музыки" },
  { id: "signal", name: "Радиоволны", desc: "Расходящиеся волны вокруг обложки" },
  { id: "aurora", name: "Сияние", desc: "Медленно движущийся цветной свет" },
  { id: "none", name: "Без движения", desc: "Статичный плеер и минимум нагрузки" },
];

export interface PlayerTemplate {
  id: PlayerSkin;
  name: string;
  desc: string;
  tag: string;
  prefs: PlayerAppearance;
}

export const PLAYER_TEMPLATES: PlayerTemplate[] = [
  { id: "classic", name: "Классика", desc: "Знакомый плеер в цветах приложения. Ничего лишнего.", tag: "Универсальный", prefs: { skin: "classic", layout: "focus", motion: "calm", colorWash: true } },
  { id: "aurora", name: "Кинотеатр", desc: "Обложка во весь экран, крупное название поверх и плавающая панель управления.", tag: "Иммерсивный", prefs: { skin: "aurora", layout: "focus", motion: "aurora", colorWash: true } },
  { id: "vinyl", name: "Тёплый винил", desc: "Настоящая дека с тонармом, пластинкой и отдельным блоком управления.", tag: "Проигрыватель", prefs: { skin: "vinyl", layout: "vinyl", motion: "vinyl", colorWash: false } },
  { id: "neon", name: "Цифровая консоль", desc: "Матричный дисплей, очередь в отдельном модуле и командная панель.", tag: "Ресивер", prefs: { skin: "neon", layout: "focus", motion: "signal", colorWash: false } },
  { id: "paper", name: "Афиша", desc: "Журнальная композиция: крупная типографика, асимметричная обложка, трек-лист.", tag: "Редакционный", prefs: { skin: "paper", layout: "focus", motion: "none", colorWash: false } },
  { id: "studio", name: "Кассетник", desc: "Кассета с двумя катушками, бумажной этикеткой и механическими клавишами.", tag: "Портативный", prefs: { skin: "studio", layout: "compact", motion: "calm", colorWash: false } },
];

const KEY = "pr.playerAppearance";
export const DEFAULT_PLAYER_APPEARANCE: PlayerAppearance = { ...PLAYER_TEMPLATES[0].prefs };

export function normalizePlayerAppearance(value: unknown): PlayerAppearance {
  const p = value && typeof value === "object" ? value as Partial<PlayerAppearance> : {};
  return {
    skin: PLAYER_TEMPLATES.some((x) => x.id === p.skin) ? p.skin! : "classic",
    layout: PLAYER_LAYOUTS.some((x) => x.id === p.layout) ? p.layout! : "focus",
    motion: PLAYER_MOTIONS.some((x) => x.id === p.motion) ? p.motion! : "calm",
    colorWash: typeof p.colorWash === "boolean" ? p.colorWash : true,
  };
}

function read(): PlayerAppearance {
  try { return normalizePlayerAppearance(JSON.parse(localStorage.getItem(KEY) ?? "null")); }
  catch { return { ...DEFAULT_PLAYER_APPEARANCE }; }
}

let prefs = read();
const subs = new Set<() => void>();
export const getPlayerAppearance = () => prefs;

export function matchPlayerTemplate(value: PlayerAppearance) {
  return PLAYER_TEMPLATES.find(({ prefs: p }) => p.skin === value.skin && p.layout === value.layout && p.motion === value.motion && p.colorWash === value.colorWash);
}

export function applyPlayerTemplate(id: PlayerSkin) {
  const template = PLAYER_TEMPLATES.find((x) => x.id === id);
  if (template) setPlayerAppearance(template.prefs);
}

export function setPlayerAppearance(patch: Partial<PlayerAppearance>) {
  markSyncKey(prefDocKey("player"));
  prefs = normalizePlayerAppearance({ ...prefs, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); }
  catch { /* device storage can be disabled */ }
  subs.forEach((f) => f());
}

if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key !== KEY && event.key !== null) return;
  prefs = read();
  subs.forEach((f) => f());
});

export function usePlayerAppearance(): PlayerAppearance {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => prefs
  );
}
