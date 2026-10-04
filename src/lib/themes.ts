import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type VarKey = "bg" | "surface" | "surface-2" | "line" | "ink" | "muted" | "accent" | "accent-ink" | "ok" | "bad";
export type Vars = Record<VarKey, string>;

export interface Palette {
  id: string;
  name: string;
  hint: string;
  dark: boolean;
  vars: Vars;
}

const L = { ok: "#2a8f5a", bad: "#cf3a3a" };
const D = { ok: "#4cc58a", bad: "#ff6b6b" };

type C = [bg: string, surface: string, surface2: string, line: string, ink: string, muted: string, accent: string, accentInk: string];

function pal(id: string, name: string, hint: string, dark: boolean, c: C): Palette {
  const [bg, surface, s2, line, ink, muted, accent, accentInk] = c;
  return { id, name, hint, dark, vars: { bg, surface, "surface-2": s2, line, ink, muted, accent, "accent-ink": accentInk, ...(dark ? D : L) } };
}

export const PALETTES: Palette[] = [
  // светлые
  pal("paper", "Бумага", "тёплый off-white", false, ["#f6f4ef", "#ffffff", "#eeebe4", "#e1ddd3", "#1b1a17", "#77726a", "#e4532b", "#ffffff"]),
  pal("snow", "Снег", "холодный белый", false, ["#f3f5f8", "#ffffff", "#e8ecf2", "#d9dfe8", "#151a22", "#64707f", "#3366e0", "#ffffff"]),
  pal("cream", "Сливки", "кремовый и уютный", false, ["#f8f1e4", "#fffaf0", "#f0e5d1", "#e6d8bd", "#2a2116", "#86745a", "#c2571a", "#ffffff"]),
  pal("mint", "Мята", "свежая зелень", false, ["#eef5f0", "#fcfffd", "#e1ede5", "#cfe0d5", "#14231b", "#5e7466", "#1f8a5b", "#ffffff"]),
  pal("lavender", "Лаванда", "мягкий фиолетовый", false, ["#f3f0f9", "#fefdff", "#e8e3f3", "#d9d2ea", "#1d1830", "#6f6890", "#7a4fd1", "#ffffff"]),
  pal("peach", "Персик", "тёплый розовый", false, ["#fbefe9", "#fffaf7", "#f5e1d6", "#ebd2c4", "#2c1a14", "#8b6a5c", "#d9483b", "#ffffff"]),
  pal("sky", "Небо", "прозрачный голубой", false, ["#eaf3fa", "#fbfdff", "#dbeaf5", "#c8dcec", "#10202e", "#5a7388", "#0f86c9", "#ffffff"]),
  pal("stone", "Графит", "строгий нейтральный", false, ["#efefee", "#fafaf9", "#e4e4e2", "#d4d4d1", "#1a1a19", "#706f6c", "#2f2f2d", "#ffffff"]),
  // тёмные
  pal("charcoal", "Уголь", "классический тёмный", true, ["#0e0f12", "#17181d", "#212329", "#2a2c33", "#f2efe8", "#8e8c85", "#ff7347", "#1a0b05"]),
  pal("midnight", "Полночь", "глубокий синий", true, ["#0b1020", "#131a2e", "#1c2540", "#26314f", "#e8edf8", "#8593b3", "#6ea0ff", "#07122a"]),
  pal("forest", "Лес", "тёмная зелень", true, ["#0b130f", "#121d17", "#1b2a22", "#25382d", "#e6f1ea", "#82998b", "#4cc58a", "#04170d"]),
  pal("wine", "Бордо", "винный полумрак", true, ["#140a0e", "#1f1117", "#2c1a22", "#3b242e", "#f6e9ee", "#a38792", "#ff6b8b", "#2a0610"]),
  pal("ocean", "Океан", "глубокая бирюза", true, ["#08141a", "#0f1f27", "#172c37", "#1f3b49", "#e3f2f6", "#7ea0ad", "#2fd0c4", "#031a18"]),
  pal("espresso", "Эспрессо", "кофейные тона", true, ["#15100c", "#201913", "#2c2319", "#3a2e22", "#f3e9dd", "#a08f7c", "#f0a04b", "#261503"]),
  pal("dusk", "Сумерки", "фиолетовый вечер", true, ["#110c1c", "#1a1429", "#261d3b", "#33274f", "#eee8fa", "#9a8dbb", "#b794ff", "#1c0b3d"]),
  pal("amoled", "AMOLED", "чистый чёрный", true, ["#000000", "#0b0b0c", "#151517", "#222225", "#f5f5f5", "#8a8a8f", "#ff7347", "#1a0b05"]),
];

export const ACCENTS: { id: string; name: string; color: string }[] = [
  { id: "coral", name: "Коралл", color: "#e4532b" },
  { id: "amber", name: "Янтарь", color: "#e59a00" },
  { id: "gold", name: "Золото", color: "#f2b705" },
  { id: "lime", name: "Лайм", color: "#8bb21a" },
  { id: "emerald", name: "Изумруд", color: "#1f9d68" },
  { id: "teal", name: "Бирюза", color: "#12a8a0" },
  { id: "azure", name: "Лазурь", color: "#2b7de9" },
  { id: "indigo", name: "Индиго", color: "#5b5bd6" },
  { id: "violet", name: "Фиолет", color: "#8e4ec6" },
  { id: "pink", name: "Роза", color: "#d6409f" },
  { id: "crimson", name: "Малина", color: "#c9284a" },
  { id: "graphite", name: "Графит", color: "#3d4451" },
];

export interface ThemePrefs {
  mode: ThemeMode;
  /** выбранная светлая и тёмная палитры */
  light: string;
  dark: string;
  /** свой акцентный цвет поверх палитры (null — из палитры) */
  accent: string | null;
}

const K = { mode: "radio.theme", light: "pr.palette.light", dark: "pr.palette.dark", accent: "pr.accent", vars: "pr.tv" };

const byId = (id: string | null, dark: boolean) => PALETTES.find((p) => p.id === id && p.dark === dark);

function read(): ThemePrefs {
  let mode: ThemeMode = "system";
  let light = "paper";
  let dark = "charcoal";
  let accent: string | null = null;
  try {
    const m = localStorage.getItem(K.mode);
    if (m === "light" || m === "dark" || m === "system") mode = m;
    light = byId(localStorage.getItem(K.light), false)?.id ?? light;
    dark = byId(localStorage.getItem(K.dark), true)?.id ?? dark;
    const a = localStorage.getItem(K.accent);
    if (a && /^#[0-9a-f]{6}$/i.test(a)) accent = a;
  } catch {
    /* хранилище недоступно */
  }
  return { mode, light, dark, accent };
}

let prefs: ThemePrefs = read();
const listeners = new Set<() => void>();

export const getThemePrefs = () => prefs;
export const systemDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

/** Чёрный или белый текст на акцентной кнопке — по яркости цвета. */
export function inkFor(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#1a0b05" : "#ffffff";
}

function varsFor(p: ThemePrefs, dark: boolean): Vars {
  const palette = byId(dark ? p.dark : p.light, dark) ?? PALETTES.find((x) => x.dark === dark)!;
  const v = { ...palette.vars };
  if (p.accent) {
    v.accent = p.accent;
    v["accent-ink"] = inkFor(p.accent);
  }
  return v;
}

export function effective(p: ThemePrefs = prefs): { dark: boolean; palette: Palette; vars: Vars } {
  const dark = p.mode === "dark" || (p.mode === "system" && systemDark());
  const palette = byId(dark ? p.dark : p.light, dark) ?? PALETTES.find((x) => x.dark === dark)!;
  return { dark, palette, vars: varsFor(p, dark) };
}

export function applyTheme() {
  const { dark, vars } = effective();
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  (Object.keys(vars) as VarKey[]).forEach((k) => root.style.setProperty(`--${k}`, vars[k]));
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", vars.bg);
  try {
    // читается скриптом в index.html до первой отрисовки — чтобы не было «вспышки» другой темы
    localStorage.setItem(K.vars, JSON.stringify({ light: varsFor(prefs, false), dark: varsFor(prefs, true) }));
  } catch {
    /* ignore */
  }
}

export function setThemePrefs(patch: Partial<ThemePrefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(K.mode, prefs.mode);
    localStorage.setItem(K.light, prefs.light);
    localStorage.setItem(K.dark, prefs.dark);
    if (prefs.accent) localStorage.setItem(K.accent, prefs.accent);
    else localStorage.removeItem(K.accent);
  } catch {
    /* ignore */
  }
  applyTheme();
  listeners.forEach((f) => f());
}

/** Выбор палитры: включает её режим (светлый/тёмный), если он сейчас не активен. */
export function choosePalette(p: Palette) {
  const patch: Partial<ThemePrefs> = p.dark ? { dark: p.id } : { light: p.id };
  if (prefs.mode !== "system" || systemDark() !== p.dark) patch.mode = p.dark ? "dark" : "light";
  setThemePrefs(patch);
}

export function useThemePrefs(): ThemePrefs {
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

if (typeof window !== "undefined") {
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (prefs.mode === "system") {
      applyTheme();
      listeners.forEach((f) => f());
    }
  });
}
