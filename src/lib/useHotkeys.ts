import { useEffect, useRef } from "react";
import { player } from "./player";
import { toggleFavoriteAny } from "./db";
import { toast } from "./toast";
import { NAV } from "./nav";
import type { Tab } from "../views/shared";

export interface HotkeyActions {
  openAdd(): void;
  openHelp(): void;
  goTab(t: Tab): void;
  back(): void;
  forward(): void;
  togglePanel(): void;
}

/** Горячие клавиши приложения (список — в окне «Горячие клавиши»). */
export function useHotkeys(actions: HotkeyActions) {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ref.current;
      const t = e.target as HTMLElement;
      const typing = !!t.closest("input, textarea, select, [contenteditable=true]");
      const dialog = !!document.querySelector('[role="dialog"]');
      if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        if (typing || dialog) return;
        e.preventDefault();
        if (e.key === "ArrowLeft") a.back();
        else a.forward();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing || dialog) return;
      const st = player.getState();
      switch (e.key) {
        case " ":
          if (t.closest("button, a")) return;
          e.preventDefault();
          player.toggle();
          break;
        case "ArrowRight":
        case "ArrowLeft": {
          if (!st.station) return;
          const d = e.key === "ArrowRight" ? 1 : -1;
          e.preventDefault();
          if (!st.isLive) player.skip(d > 0 ? 30 : -15);
          else player.step(d as 1 | -1);
          break;
        }
        case "ArrowUp":
        case "ArrowDown":
          if (t.closest("button")) return;
          e.preventDefault();
          player.setVolume(st.volume + (e.key === "ArrowUp" ? 0.05 : -0.05));
          if (st.muted) player.toggleMute();
          break;
        case "m":
        case "M":
        case "ь":
        case "Ь":
          player.toggleMute();
          break;
        case "f":
        case "F":
        case "а":
        case "А":
          if (st.station) void toggleFavoriteAny(st.station).then((on) => toast(on ? "Добавлено в избранное" : "Убрано из избранного", "info"));
          break;
        case "p":
        case "P":
        case "з":
        case "З":
          a.togglePanel();
          break;
        case "a":
        case "A":
        case "ф":
        case "Ф":
          a.openAdd();
          break;
        case "?":
          a.openHelp();
          break;
        default:
          if (/^[1-6]$/.test(e.key)) a.goTab(NAV[Number(e.key) - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
