import { useSyncExternalStore } from "react";

/**
 * Стиль интерфейса — не про цвета (они в themes.ts), а про форму и характер:
 * скругления, плотность, размер текста, шрифт, вид карточек, форма обложек, расположение меню, анимации.
 * Всё применяется через CSS-переменные Tailwind (--radius-*, --spacing), размер шрифта html и атрибуты data-*.
 */

export type Radius = "sharp" | "normal" | "soft" | "round";
export type Density = "compact" | "normal" | "cozy";
export type FontId = "system" | "humanist" | "geometric" | "serif" | "rounded" | "mono";
export type Surface = "outline" | "soft" | "flat" | "glass" | "bold";
export type CoverShape = "rounded" | "square" | "circle";
export type NavLayout = "sidebar" | "rail" | "top";

export interface UiPrefs {
  radius: Radius;
  density: Density;
  /** размер интерфейса в процентах от обычного */
  scale: number;
  font: FontId;
  surface: Surface;
  cover: CoverShape;
  nav: NavLayout;
  reduceMotion: boolean;
  /** подсвечивать фон цветом играющей станции */
  glow: boolean;
}

export const DEFAULT_UI: UiPrefs = { radius: "normal", density: "normal", scale: 100, font: "system", surface: "outline", cover: "rounded", nav: "sidebar", reduceMotion: false, glow: false };

export interface UiPreset {
  id: string;
  name: string;
  desc: string;
  prefs: Omit<UiPrefs, "reduceMotion">;
}

export const UI_PRESETS: UiPreset[] = [
  { id: "classic", name: "Классика", desc: "Спокойный контур, меню слева", prefs: { ...DEFAULT_UI } },
  { id: "soft", name: "Мягкий", desc: "Круглые формы, тени, просторно", prefs: { radius: "round", density: "cozy", scale: 100, font: "rounded", surface: "soft", cover: "rounded", nav: "sidebar", glow: false } },
  { id: "editorial", name: "Журнал", desc: "Строгие углы, шрифт с засечками, меню сверху", prefs: { radius: "sharp", density: "normal", scale: 100, font: "serif", surface: "flat", cover: "square", nav: "top", glow: false } },
  { id: "glass", name: "Стекло", desc: "Полупрозрачные панели и подсветка фона", prefs: { radius: "round", density: "normal", scale: 100, font: "humanist", surface: "glass", cover: "rounded", nav: "rail", glow: true } },
  { id: "terminal", name: "Терминал", desc: "Моно-шрифт, жирные рамки, без скруглений", prefs: { radius: "sharp", density: "compact", scale: 100, font: "mono", surface: "bold", cover: "square", nav: "sidebar", glow: false } },
  { id: "compact", name: "Компакт", desc: "Больше на экране: плотно и узкое меню", prefs: { radius: "normal", density: "compact", scale: 90, font: "geometric", surface: "flat", cover: "rounded", nav: "rail", glow: false } },
  { id: "vinyl", name: "Винил", desc: "Круглые обложки и свечение под станцию", prefs: { radius: "soft", density: "normal", scale: 100, font: "humanist", surface: "soft", cover: "circle", nav: "sidebar", glow: true } },
];

export const UI_OPTIONS = {
  radius: [
    ["sharp", "Острые"],
    ["normal", "Обычные"],
    ["soft", "Мягкие"],
    ["round", "Круглые"],
  ],
  density: [
    ["compact", "Плотно"],
    ["normal", "Обычно"],
    ["cozy", "Просторно"],
  ],
  scale: [
    [90, "Мелкий"],
    [100, "Обычный"],
    [112, "Крупный"],
    [125, "Очень крупный"],
  ],
  font: [
    ["system", "Системный"],
    ["humanist", "Гуманистический"],
    ["geometric", "Геометрический"],
    ["serif", "С засечками"],
    ["rounded", "Округлый"],
    ["mono", "Моноширинный"],
  ],
  surface: [
    ["outline", "Контур"],
    ["soft", "Тени"],
    ["flat", "Плоские"],
    ["glass", "Стекло"],
    ["bold", "Жирные рамки"],
  ],
  cover: [
    ["rounded", "Скруглённые"],
    ["square", "Квадрат"],
    ["circle", "Круг"],
  ],
  nav: [
    ["sidebar", "Панель слева"],
    ["rail", "Узкая панель"],
    ["top", "Меню сверху"],
  ],
} as const;

const FONTS: Record<FontId, { body: string; display: string }> = {
  system: { body: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', display: '"Avenir Next","Segoe UI","Helvetica Neue",system-ui,sans-serif' },
  humanist: { body: '"Segoe UI","Gill Sans","Trebuchet MS",Candara,system-ui,sans-serif', display: '"Segoe UI","Gill Sans","Trebuchet MS",Candara,system-ui,sans-serif' },
  geometric: { body: '"Century Gothic","Avenir","Futura","Trebuchet MS",system-ui,sans-serif', display: '"Century Gothic","Avenir","Futura","Trebuchet MS",system-ui,sans-serif' },
  serif: { body: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', display: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif' },
  rounded: { body: 'ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Nunito,"Varela Round",system-ui,sans-serif', display: 'ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Nunito,"Varela Round",system-ui,sans-serif' },
  mono: { body: 'ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace', display: 'ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace' },
};

export const fontStack = (f: FontId) => FONTS[f];

const RADIUS_FACTOR: Record<Radius, number> = { sharp: 0.12, normal: 1, soft: 1.35, round: 1.75 };
const RADIUS_BASE: Record<string, number> = { xs: 0.125, sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, "2xl": 1, "3xl": 1.5, "4xl": 2 };
const SPACING: Record<Density, string> = { compact: "0.21rem", normal: "0.25rem", cozy: "0.285rem" };

/** Радиус в пикселях для предпросмотра. */
export const radiusPx = (r: Radius, base = 12) => Math.round(base * RADIUS_FACTOR[r]);

const KEY = "pr.ui";
const KEY_VARS = "pr.uiv";

function read(): UiPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<UiPrefs> | null;
    if (v) {
      const has = <T extends string>(list: readonly (readonly [T, string])[], x: unknown): x is T => list.some(([id]) => id === x);
      return {
        radius: has(UI_OPTIONS.radius, v.radius) ? v.radius : DEFAULT_UI.radius,
        density: has(UI_OPTIONS.density, v.density) ? v.density : DEFAULT_UI.density,
        scale: UI_OPTIONS.scale.some(([s]) => s === v.scale) ? (v.scale as number) : DEFAULT_UI.scale,
        font: has(UI_OPTIONS.font, v.font) ? v.font : DEFAULT_UI.font,
        surface: has(UI_OPTIONS.surface, v.surface) ? v.surface : DEFAULT_UI.surface,
        cover: has(UI_OPTIONS.cover, v.cover) ? v.cover : DEFAULT_UI.cover,
        nav: has(UI_OPTIONS.nav, v.nav) ? v.nav : DEFAULT_UI.nav,
        reduceMotion: !!v.reduceMotion,
        glow: !!v.glow,
      };
    }
  } catch {
    /* повреждённая запись */
  }
  return { ...DEFAULT_UI };
}

let prefs = read();
const listeners = new Set<() => void>();

export const getUiPrefs = () => prefs;

export function applyUi() {
  const root = document.documentElement;
  const vars: Record<string, string> = {};
  for (const [k, base] of Object.entries(RADIUS_BASE)) vars[`--radius-${k}`] = `${(base * RADIUS_FACTOR[prefs.radius]).toFixed(3)}rem`;
  vars["--spacing"] = SPACING[prefs.density];
  vars["--ui-font"] = FONTS[prefs.font].body;
  vars["--ui-display"] = FONTS[prefs.font].display;
  const attrs = { surface: prefs.surface, cover: prefs.cover, nav: prefs.nav, motion: prefs.reduceMotion ? "reduced" : "full" };
  const fs = `${prefs.scale}%`;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(attrs)) root.setAttribute(`data-${k}`, v);
  root.style.fontSize = fs;
  try {
    // читается скриптом в index.html до первой отрисовки — чтобы интерфейс не «перестраивался» при загрузке
    localStorage.setItem(KEY_VARS, JSON.stringify({ vars, attrs, fs }));
  } catch {
    /* ignore */
  }
}

export function setUiPrefs(patch: Partial<UiPrefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  applyUi();
  listeners.forEach((f) => f());
}

export function resetUi() {
  setUiPrefs({ ...DEFAULT_UI });
}

/** Какой готовый стиль сейчас включён (null — свои настройки). */
export function matchPreset(p: UiPrefs = prefs): UiPreset | null {
  return (
    UI_PRESETS.find((x) => {
      const q = x.prefs;
      return q.radius === p.radius && q.density === p.density && q.scale === p.scale && q.font === p.font && q.surface === p.surface && q.cover === p.cover && q.nav === p.nav && q.glow === p.glow;
    }) ?? null
  );
}

export function useUiPrefs(): UiPrefs {
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

if (typeof window !== "undefined") applyUi();
