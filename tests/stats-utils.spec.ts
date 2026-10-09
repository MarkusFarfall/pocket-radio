import { expect, test } from "@playwright/test";
import { dayStart, secondsByLocalDay, secondsInRange, streakDays, todaySeconds, totalSecondsInRange } from "../src/lib/stats";
import type { Session } from "../src/lib/types";

function session(startedAt: number, endedAt: number, seconds: number, overrides: Partial<Session> = {}): Session {
  return {
    stationId: "station-a",
    genre: "Рок",
    mood: "Энергичное",
    kind: "http",
    startedAt,
    endedAt,
    seconds,
    ...overrides,
  };
}

test("session time is proportionally assigned when a period cuts through a saved session", () => {
  const start = new Date(2025, 5, 3, 23, 0).getTime();
  const end = new Date(2025, 5, 4, 1, 0).getTime();
  const saved = session(start, end, 3600);
  const midnight = dayStart(end);

  expect(secondsInRange(saved, start, midnight)).toBeCloseTo(1800);
  expect(secondsInRange(saved, midnight, end)).toBeCloseTo(1800);
  expect(totalSecondsInRange([saved], start, end)).toBeCloseTo(3600);
});

test("daily listening uses local calendar days and preserves the session total", () => {
  const start = new Date(2025, 5, 3, 23, 0).getTime();
  const end = new Date(2025, 5, 4, 1, 0).getTime();
  const perDay = secondsByLocalDay([session(start, end, 3600)]);

  expect(perDay.get(dayStart(start))).toBeCloseTo(1800);
  expect(perDay.get(dayStart(end))).toBeCloseTo(1800);
  expect([...perDay.values()].reduce((sum, seconds) => sum + seconds, 0)).toBeCloseTo(3600);
});

test("a streak counts days with at least five minutes and gives today until midnight", () => {
  const now = new Date(2025, 4, 10, 12, 0).getTime();
  const shortDay = session(new Date(2025, 4, 8, 10, 0).getTime(), new Date(2025, 4, 8, 10, 5).getTime(), 299);
  const activeYesterday = session(new Date(2025, 4, 9, 10, 0).getTime(), new Date(2025, 4, 9, 10, 5).getTime(), 300);

  expect(streakDays([shortDay, activeYesterday], now)).toBe(1);
});

test("today total includes only the part of an overnight session after local midnight", () => {
  const now = new Date(2025, 1, 5, 0, 30).getTime();
  const overnight = session(new Date(2025, 1, 4, 23, 0).getTime(), new Date(2025, 1, 5, 1, 0).getTime(), 3600);

  expect(todaySeconds([overnight], now)).toBeCloseTo(900);
});
