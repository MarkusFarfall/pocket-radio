import { useState } from "react";
import { Laptop, Moon, Sun, type LucideIcon } from "lucide-react";
import { PaletteSection } from "../../components/PaletteSection";
import { StyleSection } from "../../components/StyleSection";
import { PlayerAppearanceSection } from "../../components/PlayerAppearanceSection";
import { setThemePrefs, useThemePrefs, type ThemeMode } from "../../lib/themes";
import { cn } from "../../utils/cn";
import { Group, Row, SubTabs } from "./parts";

type Sub = "colors" | "style" | "player";
const TABS = [
  ["colors", "Цвета"],
  ["style", "Стиль"],
  ["player", "Плеер"],
] as const;

const MODES: [ThemeMode, string, LucideIcon][] = [
  ["light", "Светлая", Sun],
  ["dark", "Тёмная", Moon],
  ["system", "Как в системе", Laptop],
];

export function Appearance() {
  const [sub, setSub] = useState<Sub>(() => {
    const saved = sessionStorage.getItem("pr.appearanceTab");
    return TABS.some(([id]) => id === saved) ? (saved as Sub) : "colors";
  });
  const prefs = useThemePrefs();
  const pick = (s: Sub) => {
    setSub(s);
    sessionStorage.setItem("pr.appearanceTab", s);
  };

  return (
    <>
      <SubTabs value={sub} tabs={TABS} onChange={pick} />
      {sub === "colors" && (
        <>
          <Group title="Режим">
            <Row title="Светлая или тёмная" stack>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map(([m, label, I]) => (
                  <button
                    key={m}
                    onClick={() => setThemePrefs({ mode: m })}
                    aria-pressed={prefs.mode === m}
                    className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-semibold transition", prefs.mode === m ? "border-accent bg-accent/10 text-accent" : "border-line bg-bg hover:bg-surface-2")}
                  >
                    <I size={20} />
                    {label}
                  </button>
                ))}
              </div>
            </Row>
          </Group>
          <PaletteSection />
        </>
      )}
      {sub === "style" && <StyleSection />}
      {sub === "player" && <PlayerAppearanceSection />}
    </>
  );
}
