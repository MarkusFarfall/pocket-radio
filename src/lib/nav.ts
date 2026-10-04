import { ChartColumn, Compass, House, LayoutGrid, ListMusic, Settings, type LucideIcon } from "lucide-react";
import type { Tab } from "../views/shared";

export const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Главная", icon: House },
  { id: "catalog", label: "Каталог", icon: LayoutGrid },
  { id: "playlists", label: "Плейлисты", icon: ListMusic },
  { id: "discover", label: "Обзор", icon: Compass },
  { id: "stats", label: "Статистика", icon: ChartColumn },
  { id: "settings", label: "Настройки", icon: Settings },
];
