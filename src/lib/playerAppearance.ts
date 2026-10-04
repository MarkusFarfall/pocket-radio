import { useSyncExternalStore } from "react";

export type PlayerLayout = "focus" | "vinyl" | "compact";
export type PlayerMotion = "calm" | "vinyl" | "signal" | "aurora" | "none";

export interface PlayerAppearance {
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

const KEY = "pr.playerAppearance";
const DEFAULT: PlayerAppearance = { layout: "focus", motion: "calm", colorWash: true };

function read(): PlayerAppearance {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PlayerAppearance> | null;
    if (p) {
      return {
        layout: PLAYER_LAYOUTS.some((x) => x.id === p.layout) ? p.layout! : DEFAULT.layout,
        motion: PLAYER_MOTIONS.some((x) => x.id === p.motion) ? p.motion! : DEFAULT.motion,
        colorWash: p.colorWash !== false,
      };
    }
  } catch {
    /* повреждённая запись */
  }
  return { ...DEFAULT };
}

let prefs = read();
const subs = new Set<() => void>();
export const getPlayerAppearance = () => prefs;

export function setPlayerAppearance(patch: Partial<PlayerAppearance>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}

export function usePlayerAppearance(): PlayerAppearance {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => prefs
  );
}