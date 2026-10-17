import { expect, test } from "@playwright/test";
import { buildHeatmap, buildPersona, heatLevel, partShares, secondsByHour, secondsByWeekday, weeklyMatrix } from "../src/lib/statsInsights";
import type { Session } from "../src/lib/types";

function s(startedAt: number, endedAt: number, seconds: number, overrides: Partial<Session> = {}): Session {
  return { stationId: "a", genre: "Рок", mood: "", kind: "http", startedAt, endedAt, seconds, ...overrides };
}

test("hour buckets split a session that crosses hours", () => {
  const start = new Date(2025, 5, 3, 22, 30).getTime();
  const end = new Date(2025, 5, 4, 0, 30).getTime();
  const hourly = secondsByHour([s(start, end, 7200)], start, end);
  expect(hourly[22]).toBeCloseTo(1800);
  expect(hourly[23]).toBeCloseTo(3600);
  expect(hourly[0]).toBeCloseTo(1800);
  expect(hourly.reduce((sum, v) => sum + v, 0)).toBeCloseTo(7200);
});

test("weekday buckets start on Monday and keep the total", () => {
  const start = new Date(2025, 5, 2, 23, 0).getTime(); // понедельник
  const end = new Date(2025, 5, 3, 1, 0).getTime();
  const week = secondsByWeekday([s(start, end, 7200)], start, end);
  expect(week[0]).toBeCloseTo(3600);
  expect(week[1]).toBeCloseTo(3600);
});

test("weekly matrix is 7x24 and matches hourly totals", () => {
  const start = new Date(2025, 5, 2, 20, 0).getTime();
  const end = new Date(2025, 5, 2, 22, 0).getTime();
  const matrix = weeklyMatrix([s(start, end, 7200)], start, end);
  expect(matrix).toHaveLength(7);
  expect(matrix.every((row) => row.length === 24)).toBe(true);
  expect(matrix[0][20]).toBeCloseTo(3600);
  expect(matrix[0][21]).toBeCloseTo(3600);
});

test("heat levels map to five buckets", () => {
  expect(heatLevel(0)).toBe(0);
  expect(heatLevel(60)).toBe(1);
  expect(heatLevel(30 * 60)).toBe(2);
  expect(heatLevel(90 * 60)).toBe(3);
  expect(heatLevel(5 * 3600)).toBe(4);
});

test("year map ends today and stays within 53 weeks", () => {
  const now = new Date(2025, 8, 17, 12, 0).getTime();
  const map = buildHeatmap([], now);
  expect(map.columns).toHaveLength(53);
  expect(map.columns.every((week) => week.length === 7)).toBe(true);
  expect(map.end).toBe(new Date(2025, 8, 17).getTime());
  expect(map.columns.at(-1)![(new Date(2025, 8, 17).getDay() + 6) % 7].day).toBe(map.end);
  expect(map.activeDays).toBe(0);
});

test("persona prefers the dominant part of day and falls back politely", () => {
  const hourly = new Array(24).fill(0);
  hourly[1] = 5000; hourly[2] = 4000; hourly[14] = 100;
  const persona = buildPersona({ totalSeconds: 9100, hourly, genreCount: 2, topStationShare: 10, offlineShare: 0, averageSessionSeconds: 3600, activeDays: 2 });
  expect(persona.title).toBe("Ночной радист");
  const empty = buildPersona({ totalSeconds: 60, hourly, genreCount: 1, topStationShare: 100, offlineShare: 0, averageSessionSeconds: 60, activeDays: 1 });
  expect(empty.accent).toBe("new");
});

test("part shares always sum to 100", () => {
  const shares = partShares([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  const total = shares.reduce((sum, part) => sum + part.share, 0);
  expect(total).toBeCloseTo(100);
});
