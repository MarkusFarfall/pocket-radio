import { applyAppDesign, getAppDesign, normalizeAppDesign } from "./appDesign";
import { getAppPrefs, setAppPrefs, type AppPrefs } from "./appPrefs";
import { getDesktopPrefs, setDesktopPrefs, type DesktopPrefs } from "./desktop";
import { loadEqualizerSettings, normalizeEqualizerSettings } from "./equalizer";
import { getPlayerAppearance, normalizePlayerAppearance, setPlayerAppearance } from "./playerAppearance";
import { player } from "./player";
import { getResilienceSettings, setResilience, type ResilienceSettings } from "./resilience";
import { getThemePrefs, PALETTES, setThemePrefs, type ThemePrefs } from "./themes";
import { getUiPrefs, normalizeUiPrefs, setUiPrefs } from "./uiStyle";

/**
 * Оформление и настройки, которые имеют смысл на любом устройстве.
 *
 * Не синхронизируем громкость, скорость воспроизведения и «не гасить экран»:
 * это свойства конкретного устройства и его аудиовыхода.
 */

export type PrefDoc =
  | { name: "design"; data: ReturnType<typeof getAppDesign> }
  | { name: "theme"; data: ThemePrefs }
  | { name: "ui"; data: ReturnType<typeof getUiPrefs> }
  | { name: "player"; data: ReturnType<typeof getPlayerAppearance> }
  | { name: "app"; data: ReturnType<typeof getAppPrefs> & { dataSaver: boolean } }
  | { name: "desktop"; data: ReturnType<typeof getDesktopPrefs> }
  | { name: "resilience"; data: ResilienceSettings }
  | { name: "equalizer"; data: ReturnType<typeof loadEqualizerSettings> };

const dataSaver = () => {
  try {
    return localStorage.getItem("radio.dataSaver") === "1";
  } catch {
    return false;
  }
};

export function buildPrefDocs(): PrefDoc[] {
  return [
    { name: "design", data: getAppDesign() },
    { name: "theme", data: getThemePrefs() },
    { name: "ui", data: getUiPrefs() },
    { name: "player", data: getPlayerAppearance() },
    { name: "app", data: { ...getAppPrefs(), dataSaver: dataSaver() } },
    { name: "desktop", data: getDesktopPrefs() },
    { name: "resilience", data: getResilienceSettings() },
    { name: "equalizer", data: loadEqualizerSettings() },
  ];
}

export function buildPrefDoc(name: string): unknown | undefined {
  return buildPrefDocs().find((doc) => doc.name === name)?.data;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

function theme(value: unknown): ThemePrefs | null {
  if (!isRecord(value)) return null;
  const mode = oneOf(["light", "dark", "system"] as const, value.mode) ? value.mode : null;
  const light = PALETTES.find((p) => !p.dark && p.id === value.light)?.id;
  const dark = PALETTES.find((p) => p.dark && p.id === value.dark)?.id;
  const accent = value.accent === null || (typeof value.accent === "string" && /^#[0-9a-f]{6}$/i.test(value.accent)) ? (value.accent as string | null) : undefined;
  if (!mode || !light || !dark || accent === undefined) return null;
  return { mode, light, dark, accent };
}

const TABS: AppPrefs["startTab"][] = ["home", "catalog", "playlists", "discover", "stats", "settings"];

function appPrefs(value: unknown): (AppPrefs & { dataSaver: boolean }) | null {
  if (!isRecord(value)) return null;
  const startTab = TABS.includes(value.startTab as AppPrefs["startTab"]) ? (value.startTab as AppPrefs["startTab"]) : "home";
  return {
    startTab,
    autoplay: value.autoplay === true,
    wake: value.wake === true,
    dataSaver: value.dataSaver === true,
  };
}

function desktop(value: unknown): DesktopPrefs | null {
  if (!isRecord(value)) return null;
  if (value.shell !== "studio" && value.shell !== "classic") return null;
  return {
    shell: value.shell,
    panel: value.panel !== false,
    panelTab: value.panelTab === "tracks" || value.panelTab === "queue" ? value.panelTab : "about",
  };
}

function resilience(value: unknown): ResilienceSettings | null {
  if (!isRecord(value) || typeof value.volume !== "number") return null;
  const scene = oneOf(["auto", "drift", "lofi", "lounge", "pulse", "piano", "rain", "waves"] as const, value.scene) ? value.scene : "auto";
  return { scene, volume: Math.min(1, Math.max(0, value.volume)) };
}

/**
 * Применяет документ оформления. Возвращает false, если значение не нашего формата
 * (например, записано более старой или более новой версией приложения).
 */
export function applyPrefDoc(name: string, value: unknown): boolean {
  try {
    switch (name) {
      case "design":
        applyAppDesign(normalizeAppDesign(value));
        return true;
      case "theme": {
        const next = theme(value);
        if (!next) return false;
        setThemePrefs(next);
        return true;
      }
      case "ui":
        setUiPrefs(normalizeUiPrefs(value));
        return true;
      case "player":
        setPlayerAppearance(normalizePlayerAppearance(value));
        return true;
      case "app": {
        const prefs = appPrefs(value);
        if (!prefs) return false;
        const { dataSaver: saver, ...rest } = prefs;
        setAppPrefs(rest);
        player.setDataSaver(saver);
        return true;
      }
      case "desktop": {
        const prefs = desktop(value);
        if (!prefs) return false;
        setDesktopPrefs(prefs);
        return true;
      }
      case "resilience": {
        const prefs = resilience(value);
        if (!prefs) return false;
        setResilience(prefs);
        return true;
      }
      case "equalizer":
        player.updateEqualizer(normalizeEqualizerSettings(value));
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
