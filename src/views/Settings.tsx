import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CloudOff, Database, Headphones, Palette, Search, Smartphone, UserRound, X, type LucideIcon } from "lucide-react";
import type { Station } from "../lib/types";
import { OfflineSection } from "../components/OfflineSection";
import { inputCls } from "../components/ui";
import { useMedia } from "../lib/desktop";
import { cn } from "../utils/cn";
import { Profile } from "./settings/Profile";
import { Appearance } from "./settings/Appearance";
import { Playback } from "./settings/Playback";
import { Data } from "./settings/Data";
import { Device } from "./settings/Device";

type Section = "profile" | "appearance" | "playback" | "offline" | "data" | "device";
type Sub = "colors" | "style" | "player";

const SECTIONS: { id: Section; label: string; hint: string; icon: LucideIcon; hue: number }[] = [
  { id: "profile", label: "Аккаунт", hint: "Профиль и облако", icon: UserRound, hue: 215 },
  { id: "appearance", label: "Оформление", hint: "Цвета и стиль интерфейса", icon: Palette, hue: 330 },
  { id: "playback", label: "Плеер", hint: "Звук, экран, запуск", icon: Headphones, hue: 150 },
  { id: "offline", label: "Без интернета", hint: "Эмбиент и офлайн", icon: CloudOff, hue: 195 },
  { id: "data", label: "Данные", hint: "Копии, импорт, проверка", icon: Database, hue: 28 },
  { id: "device", label: "Устройство", hint: "Установка, диагностика", icon: Smartphone, hue: 270 },
];

/** Индекс для поиска по настройкам. title совпадает с заголовком строки — по нему находим и подсвечиваем. */
interface Entry {
  section: Section;
  sub?: Sub;
  title: string;
  keys: string;
}
const E = (section: Section, title: string, keys = "", sub?: Sub): Entry => ({ section, title, keys, sub });
const INDEX: Entry[] = [
  E("profile", "Аккаунт", "профиль имя логин войти выйти гость аватар пароль"),
  E("profile", "Облако", "синхронизация supabase сервер облачный устройства"),
  E("appearance", "Светлая или тёмная", "тема режим ночной тёмная светлая системная", "colors"),
  E("appearance", "Палитры и цвета", "палитра акцент цвет оттенок тема", "colors"),
  E("appearance", "Скругления", "форма углы радиус острые круглые", "style"),
  E("appearance", "Плотность", "расстояния компактно просторно отступы", "style"),
  E("appearance", "Размер интерфейса", "масштаб крупный мелкий текст зум", "style"),
  E("appearance", "Шрифт", "гарнитура засечки моноширинный", "style"),
  E("appearance", "Карточки и панели", "стекло тени рамки плоские контур", "style"),
  E("appearance", "Форма обложек", "круг квадрат обложка картинка", "style"),
  E("appearance", "Компоновка на компьютере", "студия классика панели пк экран макет", "style"),
  E("appearance", "Правая панель «Сейчас играет»", "студия панель очередь треки пк", "style"),
  E("appearance", "Меню на компьютере", "навигация боковое верхнее панель пк", "style"),
  E("appearance", "Свечение под станцию", "подсветка фон цвет станции", "style"),
  E("appearance", "Меньше анимаций", "движение батарея эффекты", "style"),
  E("appearance", "Макет плеера", "большой плеер фокус винил компакт окно", "player"),
  E("appearance", "Характер движения", "анимация пластинка радиоволны сияние спокойно", "player"),
  E("playback", "Экономия трафика", "мобильный интернет качество hls данные"),
  E("playback", "Не гасить экран", "экран сон wake lock дисплей"),
  E("playback", "Включать последнюю станцию при открытии", "автозапуск автоплей старт"),
  E("playback", "Таймер сна", "сон уснуть остановить выключить"),
  E("playback", "Открывать с раздела", "старт главная каталог начальный раздел"),
  E("offline", "Что произойдёт при обрыве", "нет интернета скачанные плейлисты эмбиент возврат в эфир"),
  E("offline", "Сцены эмбиента", "дождь пианино джаз lo-fi прибой звук"),
  E("offline", "Громкость эмбиента", "звук тише громче"),
  E("data", "Скачать", "резервная копия экспорт json m3u бэкап"),
  E("data", "Из файла", "импорт m3u pls json файл"),
  E("data", "По ссылке", "импорт плейлист url адрес"),
  E("data", "Из текста", "импорт вставить текст m3u"),
  E("data", "Проверка доступности", "здоровье станций мёртвые не отвечают проверить"),
  E("data", "Доступно офлайн", "скачанные подкасты кэш эпизоды"),
  E("data", "Очистить историю", "статистика сессии сброс"),
  E("data", "Удалить все станции", "очистка стереть каталог"),
  E("device", "На домашний экран", "установка приложение pwa иконка"),
  E("device", "Защита данных от очистки", "хранилище persist браузер данные"),
  E("device", "Занято места", "хранилище размер память квота"),
  E("device", "Диагностика", "проверка поддержка браузер hls форматы почему не играет"),
  E("device", "Сбросить оформление", "по умолчанию вернуть тему стиль"),
];

const label = (id: Section) => SECTIONS.find((s) => s.id === id)!.label;
const SUB_NAME: Record<Sub, string> = { colors: "Цвета", style: "Стиль", player: "Плеер" };

function search(q: string): Entry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return INDEX.filter((e) => {
    const hay = `${e.title} ${e.keys} ${label(e.section)}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }).slice(0, 10);
}

/** Прокручивает к найденной настройке и подсвечивает её. */
function focusRow(title: string) {
  window.setTimeout(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-row]")).find((e) => e.dataset.row === title);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("row-flash");
    void el.offsetWidth;
    el.classList.add("row-flash");
    window.setTimeout(() => el.classList.remove("row-flash"), 1900);
  }, 140);
}

function Badge({ s, size = 36 }: { s: (typeof SECTIONS)[number]; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[28%] text-white" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${s.hue} 62% 52%), hsl(${(s.hue + 24) % 360} 62% 40%))` }}>
      <s.icon size={size * 0.5} />
    </span>
  );
}

export function Settings({ stations, online, onAccount }: { stations: Station[]; online: boolean; onAccount: () => void }) {
  const desktop = useMedia("(min-width: 1024px)");
  const [section, setSection] = useState<Section | null>(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(min-width: 1024px)").matches) {
      const saved = sessionStorage.getItem("pr.settingsTab");
      return SECTIONS.some((s) => s.id === saved) ? (saved as Section) : "profile";
    }
    return null;
  });
  const [nonce, setNonce] = useState(0);
  const [q, setQ] = useState("");
  const results = useMemo(() => search(q), [q]);

  // на телефоне без выбранного раздела показываем список категорий; на компьютере всегда есть раздел
  const active: Section | null = section ?? (desktop ? "profile" : null);
  const cur = SECTIONS.find((s) => s.id === active);

  const pick = (s: Section) => {
    setSection(s);
    sessionStorage.setItem("pr.settingsTab", s);
    setQ("");
  };
  const open = (e: Entry) => {
    if (e.section === "appearance") sessionStorage.setItem("pr.appearanceTab", e.sub ?? "colors");
    pick(e.section);
    setNonce((n) => n + 1);
    focusRow(e.title);
  };
  const closeMobile = () => {
    setSection(null);
    sessionStorage.removeItem("pr.settingsTab");
  };

  const searchBox = (
    <div className="relative mb-3">
      <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти настройку…" aria-label="Поиск по настройкам" className={cn(inputCls, "pl-10 pr-9")} />
      {q && (
        <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить поиск">
          <X size={15} />
        </button>
      )}
    </div>
  );

  const resultList = (
    <ul className="space-y-1" aria-label="Результаты поиска">
      {results.map((e) => (
        <li key={e.section + e.title}>
          <button onClick={() => open(e)} className="flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left ring-1 ring-line transition hover:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{e.title}</span>
              <span className="block truncate text-xs text-muted">
                {label(e.section)}
                {e.sub ? ` · ${SUB_NAME[e.sub]}` : ""}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </button>
        </li>
      ))}
      {results.length === 0 && <li className="rounded-xl bg-surface-2 p-4 text-sm text-muted">Ничего не нашлось. Попробуйте другое слово: «тема», «экран», «импорт».</li>}
    </ul>
  );

  const menu = desktop ? (
    <ul className="space-y-1">
      {SECTIONS.map((s) => {
        const on = active === s.id;
        return (
          <li key={s.id}>
            <button onClick={() => pick(s.id)} aria-current={on ? "page" : undefined} className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition", on ? "bg-surface-2 ring-1 ring-line" : "hover:bg-surface-2/70")}>
              <Badge s={s} size={34} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{s.label}</span>
                <span className="block truncate text-[11px] text-muted">{s.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  ) : (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {SECTIONS.map((s) => (
        <li key={s.id}>
          <button onClick={() => pick(s.id)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition active:bg-surface-2">
            <Badge s={s} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-tight">{s.label}</span>
              <span className="block truncate text-xs text-muted">{s.hint}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );

  const showMenuColumn = desktop || !active;

  return (
    <div className="mx-auto max-w-5xl">
      {showMenuColumn && <h1 className="mb-5 font-display text-3xl font-bold tracking-tight md:text-4xl">Настройки</h1>}

      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-10">
        {showMenuColumn && (
          <nav className="self-start lg:sticky lg:top-1" aria-label="Разделы настроек">
            {searchBox}
            {q ? resultList : menu}
          </nav>
        )}

        {active && cur && (
          <div className="min-w-0">
            {!desktop && (
              <>
                <button onClick={closeMobile} className="-ml-2 mb-3 inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-accent">
                  <ChevronLeft size={19} /> Настройки
                </button>
                {searchBox}
                {q && <div className="mb-5">{resultList}</div>}
              </>
            )}
            <h2 className="mb-4 flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
              {!desktop && <Badge s={cur} size={34} />}
              {cur.label}
            </h2>
            <div key={nonce}>
              {active === "profile" && <Profile online={online} onAccount={onAccount} />}
              {active === "appearance" && <Appearance />}
              {active === "playback" && <Playback />}
              {active === "offline" && <OfflineSection />}
              {active === "data" && <Data stations={stations} online={online} />}
              {active === "device" && <Device />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
