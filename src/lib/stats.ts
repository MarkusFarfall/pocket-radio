import type { Session } from "./types";

const DAY = 86400000;

export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function todaySeconds(sessions: Session[]): number {
  const start = dayStart(Date.now());
  return sessions.filter((s) => s.startedAt >= start).reduce((a, s) => a + s.seconds, 0);
}

/** Сколько дней подряд (до сегодня или вчера) были прослушивания. */
export function streakDays(sessions: Session[]): number {
  const days = new Set(sessions.map((s) => dayStart(s.startedAt)));
  let cur = dayStart(Date.now());
  if (!days.has(cur)) cur -= DAY;
  let n = 0;
  while (days.has(cur)) {
    n++;
    cur -= DAY;
  }
  return n;
}
