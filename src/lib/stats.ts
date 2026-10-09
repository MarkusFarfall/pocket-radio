import type { Session } from "./types";

export const MIN_ACTIVE_DAY_SECONDS = 5 * 60;

export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Сдвиг по локальным календарным дням (не по 24 часам — важно на переходах DST). */
export function addCalendarDays(ts: number, amount: number): number {
  const d = new Date(dayStart(ts));
  d.setDate(d.getDate() + amount);
  return d.getTime();
}

/**
 * Оценивает, сколько сохранённых секунд приходится на интервал.
 * В модели сессии хранится только общий итог, поэтому при паузах внутри длинной
 * сессии время распределяется пропорционально её календарной длительности.
 */
export function secondsInRange(session: Session, from: number, to: number): number {
  const played = Math.max(0, Number.isFinite(session.seconds) ? session.seconds : 0);
  if (!played || to <= from) return 0;

  const start = Number.isFinite(session.startedAt) ? session.startedAt : 0;
  const end = Math.max(start, Number.isFinite(session.endedAt) ? session.endedAt : start);
  if (end <= start) return start >= from && start < to ? played : 0;

  const overlap = Math.max(0, Math.min(end, to) - Math.max(start, from));
  return played * (overlap / (end - start));
}

export function totalSecondsInRange(sessions: Session[], from: number, to: number): number {
  return sessions.reduce((total, session) => total + secondsInRange(session, from, to), 0);
}

/** Учтённые секунды по локальным календарным дням; используются для серий и активности. */
export function secondsByLocalDay(sessions: Session[], from = -Infinity, to = Infinity): Map<number, number> {
  const days = new Map<number, number>();
  for (const session of sessions) {
    const start = Number.isFinite(session.startedAt) ? session.startedAt : 0;
    const end = Math.max(start, Number.isFinite(session.endedAt) ? session.endedAt : start);
    if (end <= start) {
      const key = dayStart(start);
      const seconds = Math.max(0, Number.isFinite(session.seconds) ? session.seconds : 0);
      if (seconds && start >= from && start < to) days.set(key, (days.get(key) ?? 0) + seconds);
      continue;
    }

    const clippedStart = Math.max(start, from);
    const clippedEnd = Math.min(end, to);
    if (clippedEnd <= clippedStart) continue;

    for (let day = dayStart(clippedStart); day < clippedEnd; day = addCalendarDays(day, 1)) {
      const nextDay = addCalendarDays(day, 1);
      const seconds = secondsInRange(session, day, nextDay);
      if (seconds > 0) days.set(day, (days.get(day) ?? 0) + seconds);
    }
  }
  return days;
}

/** День считается активным, если набралось хотя бы пять минут учтённого прослушивания. */
export function streakDays(sessions: Session[], now = Date.now(), minSeconds = MIN_ACTIVE_DAY_SECONDS): number {
  const daily = secondsByLocalDay(sessions);
  const active = new Set([...daily.entries()].filter(([, seconds]) => seconds >= minSeconds).map(([day]) => day));
  let current = dayStart(now);
  if (!active.has(current)) current = addCalendarDays(current, -1);
  let streak = 0;
  while (active.has(current)) {
    streak++;
    current = addCalendarDays(current, -1);
  }
  return streak;
}

/** Секунды за сегодня, включая часть сессии, начавшейся до полуночи. */
export function todaySeconds(sessions: Session[], now = Date.now()): number {
  return totalSecondsInRange(sessions, dayStart(now), now);
}
