import type { Session } from "./types";
import { addCalendarDays, dayStart, secondsInRange } from "./stats";

/**
 * Производные величины для страницы статистики: профиль слушателя, тепловая карта,
 * достижения, рекорды и сравнения. Здесь только чистые функции — их удобно проверять
 * без браузера, а страница остаётся тонкой.
 */

/* ------------------------------------------------------------------ время по слотам */

/** Секунды прослушивания по часам суток (0–23) с учётом сессий, пересекающих час. */
export function secondsByHour(sessions: Session[], from: number, to: number): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const session of sessions) {
    const start = Math.max(session.startedAt, from);
    const end = Math.min(session.endedAt, to);
    if (end <= start) continue;
    const played = Math.max(0, session.seconds);
    const span = session.endedAt - session.startedAt;
    if (span <= 0) {
      if (session.startedAt >= from && session.startedAt < to) buckets[new Date(session.startedAt).getHours()] += played;
      continue;
    }
    const rate = played / span;
    let cursor = start;
    while (cursor < end) {
      const hourStart = new Date(cursor);
      hourStart.setMinutes(0, 0, 0);
      const nextHour = hourStart.getTime() + 3600_000;
      const sliceEnd = Math.min(end, nextHour);
      buckets[hourStart.getHours()] += (sliceEnd - cursor) * rate;
      cursor = sliceEnd;
    }
  }
  return buckets;
}

/** Секунды по дням недели, где 0 — понедельник. */
export function secondsByWeekday(sessions: Session[], from: number, to: number): number[] {
  const buckets = new Array<number>(7).fill(0);
  for (const session of sessions) {
    const start = Math.max(session.startedAt, from);
    const end = Math.min(session.endedAt, to);
    if (end <= start) continue;
    const played = Math.max(0, session.seconds);
    const span = session.endedAt - session.startedAt;
    if (span <= 0) {
      if (session.startedAt >= from && session.startedAt < to) buckets[weekdayIndex(session.startedAt)] += played;
      continue;
    }
    const rate = played / span;
    let cursor = start;
    while (cursor < end) {
      const day = new Date(cursor);
      day.setHours(0, 0, 0, 0);
      const nextDay = addCalendarDays(day.getTime(), 1);
      const sliceEnd = Math.min(end, nextDay);
      buckets[weekdayIndex(cursor)] += (sliceEnd - cursor) * rate;
      cursor = sliceEnd;
    }
  }
  return buckets;
}

/** Матрица «день недели × час» в секундах: 7 строк по 24 значения. */
export function weeklyMatrix(sessions: Session[], from: number, to: number): number[][] {
  const matrix = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const session of sessions) {
    const start = Math.max(session.startedAt, from);
    const end = Math.min(session.endedAt, to);
    if (end <= start) continue;
    const played = Math.max(0, session.seconds);
    const span = session.endedAt - session.startedAt;
    if (span <= 0) {
      if (session.startedAt >= from && session.startedAt < to) {
        matrix[weekdayIndex(session.startedAt)][new Date(session.startedAt).getHours()] += played;
      }
      continue;
    }
    const rate = played / span;
    let cursor = start;
    while (cursor < end) {
      const hourStart = new Date(cursor);
      hourStart.setMinutes(0, 0, 0);
      const nextHour = hourStart.getTime() + 3600_000;
      const sliceEnd = Math.min(end, nextHour);
      matrix[weekdayIndex(cursor)][hourStart.getHours()] += (sliceEnd - cursor) * rate;
      cursor = sliceEnd;
    }
  }
  return matrix;
}

export function weekdayIndex(ts: number): number {
  return (new Date(ts).getDay() + 6) % 7;
}

export const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export type PartOfDay = "night" | "morning" | "day" | "evening";

export const PARTS: { id: PartOfDay; label: string; hours: string }[] = [
  { id: "night", label: "Ночь", hours: "0–5" },
  { id: "morning", label: "Утро", hours: "6–11" },
  { id: "day", label: "День", hours: "12–17" },
  { id: "evening", label: "Вечер", hours: "18–23" },
];

export function partOfHour(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export interface PartShare {
  id: PartOfDay;
  label: string;
  hours: string;
  seconds: number;
  share: number;
}

export function partShares(hourly: number[]): PartShare[] {
  const totals = new Map<PartOfDay, number>();
  hourly.forEach((seconds, hour) => {
    const part = partOfHour(hour);
    totals.set(part, (totals.get(part) ?? 0) + seconds);
  });
  const all = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return PARTS.map((part) => {
    const seconds = totals.get(part.id) ?? 0;
    return { ...part, seconds, share: all > 0 ? (seconds / all) * 100 : 0 };
  });
}

/* ------------------------------------------------------------------ профиль слушателя */

export interface PersonaInput {
  totalSeconds: number;
  hourly: number[];
  genreCount: number;
  topStationShare: number;
  offlineShare: number;
  averageSessionSeconds: number;
  activeDays: number;
}

export interface Persona {
  title: string;
  tagline: string;
  accent: "night" | "morning" | "day" | "evening" | "curious" | "loyal" | "offline" | "marathon" | "new";
  traits: string[];
}

const PERSONAS: Record<Persona["accent"], Persona> = {
  new: {
    title: "Первые шаги",
    tagline: "История только начинается: включите эфир, и здесь появится ваш профиль.",
    accent: "new",
    traits: [],
  },
  night: {
    title: "Ночной радист",
    tagline: "Большая часть прослушивания приходится на тихие часы после полуночи.",
    accent: "night",
    traits: ["тихие частоты", "поздние эфиры"],
  },
  morning: {
    title: "Ранняя пташка",
    tagline: "Ваш день начинается со звука — основное время приходится на утро.",
    accent: "morning",
    traits: ["утренние эфиры", "ясный старт"],
  },
  day: {
    title: "Дневной слушатель",
    tagline: "Середина дня — ваш основной сеанс: музыка идёт фоном к работе.",
    accent: "day",
    traits: ["рабочий ритм", "ровный темп"],
  },
  evening: {
    title: "Вечерний меломан",
    tagline: "Пик приходится на вечер: вы слушаете, когда день уже закончился.",
    accent: "evening",
    traits: ["вечерние сеансы", "медленное погружение"],
  },
  curious: {
    title: "Искатель жанров",
    tagline: "Много разных жанров и станций: вы пробуете, а не сидите на одной волне.",
    accent: "curious",
    traits: ["широкий диапазон", "поиск нового"],
  },
  loyal: {
    title: "Верный одной волне",
    tagline: "Одна станция забирает большую часть времени — у вас есть любимая частота.",
    accent: "loyal",
    traits: ["одна частота", "глубокое погружение"],
  },
  offline: {
    title: "Офлайн-путешественник",
    tagline: "Значительная доля прослушивания идёт без интернета — из кэша и файлов.",
    accent: "offline",
    traits: ["без сети", "своя фонотека"],
  },
  marathon: {
    title: "Марафонец",
    tagline: "Длинные сессии — ваш стиль: вы не переключаетесь каждые пять минут.",
    accent: "marathon",
    traits: ["длинные сессии", "непрерывный поток"],
  },
};

export function buildPersona(input: PersonaInput): Persona {
  const { totalSeconds, hourly, genreCount, topStationShare, offlineShare, averageSessionSeconds, activeDays } = input;
  if (totalSeconds < 30 * 60 || activeDays === 0) return PERSONAS.new;

  const shares = new Map(partShares(hourly).map((part) => [part.id, part.share]));
  const traits: string[] = [];
  if (genreCount >= 5) traits.push(`${genreCount} жанров`);
  if (offlineShare >= 20) traits.push(`офлайн ${Math.round(offlineShare)}%`);
  if (topStationShare >= 40) traits.push(`любимая станция ${Math.round(topStationShare)}%`);

  const pick = (accent: Persona["accent"]): Persona => ({ ...PERSONAS[accent], traits: [...PERSONAS[accent].traits.slice(0, 2), ...traits.slice(0, 1)] });

  if ((shares.get("night") ?? 0) >= 35) return pick("night");
  if ((shares.get("morning") ?? 0) >= 40) return pick("morning");
  if ((shares.get("evening") ?? 0) >= 40) return pick("evening");
  if ((shares.get("day") ?? 0) >= 40) return pick("day");
  if (genreCount >= 8) return pick("curious");
  if (topStationShare >= 55) return pick("loyal");
  if (offlineShare >= 40) return pick("offline");
  if (averageSessionSeconds >= 90 * 60) return pick("marathon");
  return pick("curious");
}

/* ------------------------------------------------------------------ тепловая карта года */

export interface HeatCell {
  day: number;
  seconds: number;
  /** 0 — пусто, 1–4 — интенсивность; null для будущих дней. */
  level: number | null;
}

export interface Heatmap {
  columns: HeatCell[][];
  months: { index: number; label: string }[];
  start: number;
  end: number;
  maxSeconds: number;
  activeDays: number;
}

export const HEAT_LEVELS = [
  { level: 1, max: 20 * 60, label: "до 20 мин" },
  { level: 2, max: 60 * 60, label: "до часа" },
  { level: 3, max: 120 * 60, label: "до 2 часов" },
  { level: 4, max: Infinity, label: "2 часа и больше" },
];

export function heatLevel(seconds: number): number {
  if (seconds <= 0) return 0;
  for (const step of HEAT_LEVELS) if (seconds < step.max) return step.level;
  return 4;
}

/**
 * Сетка «неделя — столбец, день — строка», как в календаре активности.
 * Заканчивается сегодняшним днём; будущие дни недели остаются пустыми.
 */
export function buildHeatmap(sessions: Session[], now: number, weeks = 53): Heatmap {
  const end = dayStart(now);
  const trailing = weekdayIndex(end);
  const start = addCalendarDays(end, -((weeks - 1) * 7 + trailing));
  const totals = new Map<number, number>();
  for (const session of sessions) {
    const from = Math.max(session.startedAt, start);
    const to = Math.min(session.endedAt, now + 1);
    if (to <= from) continue;
    for (let day = dayStart(from); day < to; day = addCalendarDays(day, 1)) {
      const seconds = secondsInRange(session, day, Math.min(addCalendarDays(day, 1), now + 1));
      if (seconds > 0) totals.set(day, (totals.get(day) ?? 0) + seconds);
    }
  }

  const columns: HeatCell[][] = [];
  const months: { index: number; label: string }[] = [];
  let previousMonth = -1;
  for (let week = 0; week < weeks; week += 1) {
    const column: HeatCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = addCalendarDays(start, week * 7 + weekday);
      if (day > end) {
        column.push({ day, seconds: 0, level: null });
        continue;
      }
      const seconds = totals.get(day) ?? 0;
      column.push({ day, seconds, level: heatLevel(seconds) });
    }
    const month = new Date(column[0].day).getMonth();
    if (month !== previousMonth) {
      months.push({ index: week, label: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(column[0].day).replace(".", "") });
      previousMonth = month;
    }
    columns.push(column);
  }

  const values = [...totals.values()];
  return {
    columns,
    months,
    start,
    end,
    maxSeconds: values.length ? Math.max(...values) : 0,
    activeDays: values.filter((seconds) => seconds >= 5 * 60).length,
  };
}

/* ------------------------------------------------------------------ достижения */

export type AchievementIcon =
  | "rocket" | "clock" | "flame" | "trophy" | "compass" | "moon"
  | "wifi" | "disc" | "crown" | "sparkles" | "headphones" | "globe" | "calendar";

export interface Achievement {
  id: string;
  title: string;
  hint: string;
  icon: AchievementIcon;
  current: number;
  target: number;
  unit: "seconds" | "count" | "days" | "percent";
  unlocked: boolean;
  progress: number;
}

export interface AchievementInput {
  totalSeconds: number;
  sessionCount: number;
  stationCount: number;
  genreCount: number;
  streak: number;
  nightShare: number;
  offlineSeconds: number;
  topStationShare: number;
  cityCount: number;
}

export function buildAchievements(input: AchievementInput): Achievement[] {
  const { totalSeconds, sessionCount, stationCount, genreCount, streak, nightShare, offlineSeconds, topStationShare, cityCount } = input;
  const make = (
    id: string, title: string, hint: string, icon: AchievementIcon,
    current: number, target: number, unit: Achievement["unit"],
  ): Achievement => ({
    id, title, hint, icon, current, target, unit,
    unlocked: current >= target,
    progress: Math.max(0, Math.min(100, target > 0 ? (current / target) * 100 : 0)),
  });

  return [
    make("first", "Первый эфир", "Сохранена хотя бы одна сессия", "rocket", sessionCount, 1, "count"),
    make("hour", "Первый час", "Час суммарного прослушивания", "clock", totalSeconds, 3600, "seconds"),
    make("ten", "Десять часов", "Половина суток в звуке", "headphones", totalSeconds, 10 * 3600, "seconds"),
    make("hundred", "Сотня часов", "Сто часов на этом устройстве", "trophy", totalSeconds, 100 * 3600, "seconds"),
    make("streak7", "Неделя подряд", "Семь активных дней без пропусков", "flame", streak, 7, "days"),
    make("streak30", "Месяц в эфире", "Тридцать дней подряд", "calendar", streak, 30, "days"),
    make("stations", "Коллекционер", "Двадцать пять разных станций", "disc", stationCount, 25, "count"),
    make("genres", "Полиглот жанров", "Десять разных жанров", "compass", genreCount, 10, "count"),
    make("cities", "Географ", "Пять городов в эфире", "globe", cityCount, 5, "count"),
    make("night", "Ночной дозор", "Четверть времени — после полуночи", "moon", Math.round(nightShare), 25, "percent"),
    make("offline", "Свой запас", "Час прослушивания без интернета", "wifi", offlineSeconds, 3600, "seconds"),
    make("loyal", "Верная частота", "Любимая станция — больше половины времени", "crown", Math.round(topStationShare), 50, "percent"),
    make("spark", "Знакомство", "Пять разных жанров", "sparkles", genreCount, 5, "count"),
  ];
}

export function unlockedCount(items: Achievement[]): number {
  return items.filter((item) => item.unlocked).length;
}

/* ------------------------------------------------------------------ сравнения */

export interface Comparison {
  id: string;
  value: string;
  label: string;
  hint: string;
}

const SONG_SECONDS = 3.5 * 60;
const ABBEY_ROAD_SECONDS = 47 * 60 + 23;
const AUDIOBOOK_SECONDS = 8 * 3600;

function plural(value: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(value)) % 100;
  if (n >= 11 && n <= 14) return many;
  switch (n % 10) {
    case 1: return one;
    case 2:
    case 3:
    case 4: return few;
    default: return many;
  }
}

export function buildComparisons(totalSeconds: number): Comparison[] {
  const songs = Math.round(totalSeconds / SONG_SECONDS);
  const days = totalSeconds / 86400;
  const books = totalSeconds / AUDIOBOOK_SECONDS;
  const albums = totalSeconds / ABBEY_ROAD_SECONDS;
  return [
    {
      id: "songs",
      value: new Intl.NumberFormat("ru-RU").format(songs),
      label: `${plural(songs, "песня", "песни", "песен")} по 3:30`,
      hint: "столько треков средней длины вы бы успели послушать",
    },
    {
      id: "albums",
      value: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(albums),
      label: `${plural(Math.round(albums), "раз", "раза", "раз")} «Abbey Road»`,
      hint: "полный альбом The Beatles длится 47 минут",
    },
    {
      id: "books",
      value: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(books),
      label: `${plural(Math.round(books), "аудиокнига", "аудиокниги", "аудиокниг")}`,
      hint: "по восемь часов каждая",
    },
    {
      id: "days",
      value: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(days),
      label: `${plural(Math.round(days), "полный день", "полных дня", "полных дней")} в звуке`,
      hint: "если играть без остановки",
    },
  ];
}

/* ------------------------------------------------------------------ рекорды */

export interface RecordItem {
  id: string;
  title: string;
  value: string;
  detail: string;
  icon: "trophy" | "clock" | "flame" | "calendar" | "radio" | "calendar-check";
}

export interface RecordInput {
  bestDayDay: number;
  bestDaySeconds: number;
  longestSessionSeconds: number;
  longestSessionName: string;
  longestSessionAt: number;
  favoriteWeekday: number | null;
  peakHour: number | null;
  streak: number;
  activeDays: number;
  stationCount: number;
}

export function buildRecords(input: RecordInput): RecordItem[] {
  const fmt: (seconds: number) => string = (seconds) => {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return hours > 0 ? `${hours} ч ${minutes} м` : `${minutes} м`;
  };
  const date = (ts: number) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(ts).replace(" г.", "");
  return [
    {
      id: "best-day", title: "Лучший день", value: fmt(input.bestDaySeconds), icon: "trophy",
      detail: input.bestDaySeconds ? date(input.bestDayDay) : "пока нет данных",
    },
    {
      id: "longest", title: "Самая длинная сессия", value: fmt(input.longestSessionSeconds), icon: "clock",
      detail: input.longestSessionSeconds ? `${input.longestSessionName} · ${date(input.longestSessionAt)}` : "пока нет данных",
    },
    {
      id: "weekday", title: "Любимый день", value: input.favoriteWeekday === null ? "—" : WEEKDAYS[input.favoriteWeekday], icon: "calendar",
      detail: "по суммарному времени",
    },
    {
      id: "hour", title: "Пиковый час", value: input.peakHour === null ? "—" : `${String(input.peakHour).padStart(2, "0")}:00`, icon: "radio",
      detail: "чаще всего включаете эфир",
    },
    {
      id: "streak", title: "Серия", value: `${input.streak} ${plural(input.streak, "день", "дня", "дней")}`, icon: "flame",
      detail: "минимум 5 минут в день",
    },
    {
      id: "days", title: "Дней с музыкой", value: `${input.activeDays}`, icon: "calendar-check",
      detail: `${input.stationCount} ${plural(input.stationCount, "станция", "станции", "станций")} в обороте`,
    },
  ];
}
