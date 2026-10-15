import { useSyncExternalStore } from "react";
import { DEFAULT_UI, getUiPrefs, normalizeUiPrefs, setUiPrefs, type UiPrefs } from "./uiStyle";
import { getThemePrefs, PALETTES, setThemePrefs, type ThemePrefs } from "./themes";
import { applyPlayerTemplate, getPlayerAppearance, normalizePlayerAppearance, setPlayerAppearance, type PlayerAppearance } from "./playerAppearance";

export type PremiumDesign = "panorama" | "focus" | "atelier" | "nocturne";
export type AppDesign = "classic" | "editorial" | "library" | "console" | PremiumDesign;
export const PREMIUM_DESIGNS: PremiumDesign[] = ["panorama", "focus", "atelier", "nocturne"];
export const isPremiumDesign = (id: AppDesign): id is PremiumDesign => PREMIUM_DESIGNS.includes(id as PremiumDesign);
export interface AppDesignTemplate {
  id: AppDesign; name: string; eyebrow: string; desc: string; features: string[];
  ui: Partial<UiPrefs>; theme: ThemePrefs;
}
export const APP_DESIGNS: AppDesignTemplate[] = [
  { id: "classic", name: "Классика", eyebrow: "ЗНАКОМЫЙ ИНТЕРФЕЙС", desc: "Прежний Pocket Radio. Возвращает оформление, которое было до выбора нового интерфейса.", features: ["Привычные страницы", "Ваши прежние настройки", "Студия или боковое меню"], ui: {}, theme: { mode: "system", light: "paper", dark: "charcoal", accent: null } },
  { id: "editorial", name: "Редакция", eyebrow: "МУЗЫКАЛЬНЫЙ ЖУРНАЛ", desc: "Большой газетный заголовок, верхнее меню и подборки-развороты. Музыка как личное издание.", features: ["Навигация сверху", "Каталог как лента статей", "Плейлисты и плеер в одном стиле"], ui: { font: "serif", radius: "sharp", density: "normal", surface: "outline", cover: "square", nav: "top", glow: false }, theme: { mode: "light", light: "paper", dark: "charcoal", accent: "#ad402a" } },
  { id: "library", name: "Медиатека", eyebrow: "ЛИЧНАЯ КОЛЛЕКЦИЯ", desc: "Большие обложки, полки музыки и узкая навигация. Больше пространства для того, что хочется слушать.", features: ["Компактное меню сбоку", "Полки обложек и коллекций", "Крупные карточки и единый плеер"], ui: { font: "humanist", radius: "soft", density: "normal", surface: "flat", cover: "rounded", nav: "rail", glow: false }, theme: { mode: "dark", light: "mint", dark: "forest", accent: "#c7e5a0" } },
  { id: "console", name: "Пульт", eyebrow: "РАБОЧАЯ КОНСОЛЬ", desc: "Постоянная навигация, плотный каталог, независимая очередь и панели с данными. Всё под рукой.", features: ["Меню и рабочие панели", "Каталог — список по умолчанию", "Очередь и плеер в стиле Пульта"], ui: { font: "mono", radius: "sharp", density: "compact", surface: "outline", cover: "square", nav: "sidebar", glow: false }, theme: { mode: "dark", light: "snow", dark: "midnight", accent: "#b5d4ff" } },
  { id: "panorama", name: "Панорама", eyebrow: "СВЕТ И ПРОСТРАНСТВО", desc: "Светлый музыкальный экран с единой верхней навигацией, широким первым планом и спокойными рядами обложек.", features: ["Всё меню в одной строке", "Широкий первый экран", "Воздушные карточки и горизонтальные полки"], ui: { font: "system", radius: "soft", density: "normal", surface: "flat", cover: "rounded", nav: "top", glow: false }, theme: { mode: "light", light: "porcelain", dark: "graphite", accent: "#2d504b" } },
  { id: "focus", name: "Фокус", eyebrow: "НИЧЕГО ЛИШНЕГО", desc: "Компактный остров навигации, центрированная рабочая область и чистые списки. Музыка без визуального шума.", features: ["Плавающее меню-остров", "Список вместо стены обложек", "Небольшой плеер и точная типографика"], ui: { font: "system", radius: "normal", density: "normal", surface: "flat", cover: "rounded", nav: "rail", glow: false }, theme: { mode: "light", light: "porcelain", dark: "graphite", accent: "#202529" } },
  { id: "atelier", name: "Ателье", eyebrow: "ЛИЧНАЯ ФОНОТЕКА", desc: "Тёплая библиотека: плейлисты всегда рядом, коллекции раскрываются как альбомы, а обложки живут на отдельных полках.", features: ["Меню и ваши плейлисты слева", "Альбомные развороты и полки", "Мягкие нейтральные поверхности"], ui: { font: "humanist", radius: "soft", density: "normal", surface: "flat", cover: "rounded", nav: "sidebar", glow: false }, theme: { mode: "light", light: "linen", dark: "espresso", accent: "#71533f" } },
  { id: "nocturne", name: "Ноктюрн", eyebrow: "ВЕЧЕРНИЙ СЕАНС", desc: "Кинематографичный тёмный интерфейс: большие обложки, мягкий свет и навигация снизу даже на компьютере.", features: ["Нижняя навигация на всех экранах", "Крупные панорамные карточки", "Глубокий графит без неонового шума"], ui: { font: "system", radius: "soft", density: "normal", surface: "flat", cover: "rounded", nav: "top", glow: false }, theme: { mode: "dark", light: "porcelain", dark: "graphite", accent: "#d8d2c4" } },
];
const KEY = "pr.appDesign";
const BACKUP = "pr.appDesign.previous";
export const normalizeAppDesign = (value: unknown): AppDesign => APP_DESIGNS.some(t => t.id === value) ? value as AppDesign : "classic";
function read(): AppDesign { try { return normalizeAppDesign(localStorage.getItem(KEY)); } catch { return "classic"; } }
interface Snapshot { ui: UiPrefs; theme: ThemePrefs; player: PlayerAppearance }
function readBackup(): Snapshot | null {
  try {
    const p = JSON.parse(localStorage.getItem(BACKUP) ?? "null");
    if (!p || typeof p !== "object" || !p.ui || !p.theme || !p.player) return null;
    const t = p.theme;
    if (!["light", "dark", "system"].includes(t.mode) || !PALETTES.some(x => x.id === t.light && !x.dark) || !PALETTES.some(x => x.id === t.dark && x.dark) || !(t.accent === null || /^#[0-9a-f]{6}$/i.test(t.accent))) return null;
    return { ui: normalizeUiPrefs(p.ui), theme: { mode: t.mode, light: t.light, dark: t.dark, accent: t.accent }, player: normalizePlayerAppearance(p.player) };
  } catch { return null; }
}
let current = read();
let previous = readBackup();
const listeners = new Set<() => void>();
export const getAppDesign = () => current;
function publish() {
  if (typeof document !== "undefined") document.documentElement.dataset.appDesign = current;
  listeners.forEach(f => f());
}
export function applyAppDesign(value: AppDesign) {
  const id = normalizeAppDesign(value);
  const template = APP_DESIGNS.find(x => x.id === id)!;
  if (current === "classic" && id !== "classic") {
    previous = { ui: { ...getUiPrefs() }, theme: { ...getThemePrefs() }, player: { ...getPlayerAppearance() } };
    try { localStorage.setItem(BACKUP, JSON.stringify(previous)); } catch { /* in-memory restore still works */ }
  }
  // Accessibility choices survive switching designs, including restoring Classic.
  const { reduceMotion, scale } = getUiPrefs();
  if (id === "classic") {
    if (current !== "classic") {
      setUiPrefs({ ...(previous?.ui ?? DEFAULT_UI), reduceMotion, scale });
      setThemePrefs(previous?.theme ?? template.theme);
      if (previous) setPlayerAppearance(previous.player); else applyPlayerTemplate("classic");
    }
  } else {
    setUiPrefs({ ...DEFAULT_UI, ...template.ui, reduceMotion, scale });
    setThemePrefs(template.theme);
  }
  current = id;
  try { localStorage.setItem(KEY, current); } catch { /* persistence may be unavailable */ }
  publish();
}
/** Used by Device's explicit full appearance reset; does not restore a previous theme. */
export function resetAppDesign() {
  current = "classic"; previous = null;
  try { localStorage.removeItem(KEY); localStorage.removeItem(BACKUP); } catch { /* ignore */ }
  publish();
}
export function useAppDesign() {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => current);
}
if (typeof document !== "undefined") publish();
