import { expect, test, type Page } from "@playwright/test";

async function openStats(page: Page) {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Ещё", exact: true })).toBeVisible();
}

test("statistics total local listening seconds, offline share, and period totals coherently", async ({ page }) => {
  await openStats(page);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const fixtures = {
    todayStart,
    sessions: [
      { stationId: "demo-rock", genre: "Рок", mood: "Энергичное", kind: "http", offset: -1, hour: 10, minute: 0, seconds: 7200, offline: false, stationName: "Rock Radio", city: "Франкфурт" },
      { stationId: "demo-jazz", genre: "Джаз", mood: "Спокойное", kind: "vod", offset: -2, hour: 10, minute: 0, seconds: 3600, offline: true, stationName: "Jazz Radio", city: "Берлин" },
      { stationId: "demo-rock", genre: "Рок", mood: "Энергичное", kind: "http", offset: -5, hour: 10, minute: 0, seconds: 300, offline: false, stationName: "Rock Radio", city: "Франкфурт" },
      { stationId: "demo-rock", genre: "Рок", mood: "Энергичное", kind: "http", offset: -8, hour: 10, minute: 0, seconds: 1800, offline: false, stationName: "Rock Radio", city: "Франкфурт" },
    ],
  };

  await page.evaluate(async ({ todayStart, sessions }) => {
    const request = indexedDB.open("local-radio");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(["stations", "sessions", "events"], "readwrite");
      const stationRows = [
        { id: "demo-rock", name: "Rock Radio", url: "https://example.test/rock", kind: "http", genre: "Рок", mood: "Энергичное", city: "Франкфурт", tags: [], icon: "", note: "", bitrate: 128, favorite: false, createdAt: todayStart, updatedAt: todayStart, plays: 3, totalSeconds: 0 },
        { id: "demo-jazz", name: "Jazz Radio", url: "https://example.test/jazz", kind: "vod", genre: "Джаз", mood: "Спокойное", city: "Берлин", tags: [], icon: "", note: "", bitrate: 128, favorite: false, createdAt: todayStart, updatedAt: todayStart, plays: 1, totalSeconds: 0 },
      ];
      const stationStore = tx.objectStore("stations");
      stationStore.put(stationRows[0]);
      stationStore.put(stationRows[1]);
      const sessionStore = tx.objectStore("sessions");
      sessionStore.clear();
      for (const row of sessions) {
        const start = new Date(todayStart);
        start.setDate(start.getDate() + row.offset);
        start.setHours(row.hour, row.minute, 0, 0);
        const startedAt = start.getTime();
        sessionStore.add({
          stationId: row.stationId,
          genre: row.genre,
          mood: row.mood,
          kind: row.kind,
          startedAt,
          endedAt: startedAt + row.seconds * 1000,
          seconds: row.seconds,
          offline: row.offline,
          stationName: row.stationName,
          city: row.city,
        });
      }
      const eventStore = tx.objectStore("events");
      eventStore.clear();
      eventStore.add({ stationId: "demo-jazz", type: "buffer", ts: Date.now() - 60_000, ms: 4200, stationName: "Jazz Radio" });
      eventStore.add({ stationId: "demo-rock", type: "error", ts: Date.now() - 30_000, message: "test error", stationName: "Rock Radio" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    database.close();
  }, fixtures);

  await page.reload();
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Статистика/ }).click();
  await expect(page.locator('main [data-tab-panel="stats"] h1')).toHaveText("Статистика");
  await expect(page.getByTestId("stats-total-time")).toHaveText("3 ч 5 м");
  await expect(page.getByText("3 активных дня", { exact: true })).toBeVisible();
  await expect(page.getByText("3 включения", { exact: true })).toBeVisible();
  await expect(page.getByText("2 уникальные станции", { exact: true })).toBeVisible();
  await expect(page.getByText("Ошибки", { exact: true })).toBeVisible();
  await expect(page.getByText("Буферизация", { exact: true })).toBeVisible();
  await expect(page.getByText("2 дня", { exact: true })).toBeVisible();
  const averageCard = page.getByText("Средняя сессия", { exact: true }).locator("xpath=../..");
  await expect(averageCard).toContainText("1 ч 2 м");
  const trafficCard = page.getByText("Трафик", { exact: true }).locator("xpath=../..");
  await expect(trafficCard).toContainText("114.4 МБ");

  const offlineCard = page.getByText("Офлайн", { exact: true }).locator("xpath=../..");
  await expect(offlineCard).toContainText("32%");
  await page.getByRole("button", { name: "30 дней", exact: true }).click();
  await expect(page.getByTestId("stats-total-time")).toHaveText("3 ч 35 м");
  await page.getByRole("button", { name: "Всё время", exact: true }).click();
  await expect(page.getByTestId("stats-total-time")).toHaveText("3 ч 35 м");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("analytics blocks: persona, year map, rhythm, records and achievements react to real listening", async ({ page }) => {
  await openStats(page);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  // Ночная история на несколько месяцев: профиль, карта года и достижения должны ожить.
  const plan = [
    { stationId: "demo-night", genre: "Электроника", mood: "Ночное", hour: 1, seconds: 7200, offset: -1, name: "Nightwave" },
    { stationId: "demo-night", genre: "Электроника", mood: "Ночное", hour: 2, seconds: 10800, offset: -2, name: "Nightwave" },
    { stationId: "demo-jazz", genre: "Джаз", mood: "Спокойное", hour: 3, seconds: 5400, offset: -3, name: "Jazz24" },
    { stationId: "demo-rock", genre: "Рок", mood: "Энергичное", hour: 0, seconds: 9000, offset: -4, name: "Rock Radio" },
    { stationId: "demo-night", genre: "Электроника", mood: "Ночное", hour: 1, seconds: 3600, offset: -10, name: "Nightwave" },
    { stationId: "demo-jazz", genre: "Джаз", mood: "Спокойное", hour: 2, seconds: 7200, offset: -40, name: "Jazz24" },
    { stationId: "demo-rock", genre: "Рок", mood: "Энергичное", hour: 23, seconds: 4800, offset: -70, name: "Rock Radio" },
  ];

  await page.evaluate(async ({ todayStart, plan }) => {
    const request = indexedDB.open("local-radio");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(["stations", "sessions", "events"], "readwrite");
      const stationStore = tx.objectStore("stations");
      for (const row of [
        { id: "demo-night", name: "Nightwave", genre: "Электроника", city: "Токио" },
        { id: "demo-jazz", name: "Jazz24", genre: "Джаз", city: "Сиэтл" },
        { id: "demo-rock", name: "Rock Radio", genre: "Рок", city: "Франкфурт" },
      ]) {
        stationStore.put({ ...row, url: `https://example.test/${row.id}`, kind: "http", mood: "", tags: [], icon: "", note: "", bitrate: 128, favorite: false, createdAt: todayStart, updatedAt: todayStart, plays: 1, totalSeconds: 0 });
      }
      const sessionStore = tx.objectStore("sessions");
      sessionStore.clear();
      for (const row of plan) {
        const start = new Date(todayStart);
        start.setDate(start.getDate() + row.offset);
        start.setHours(row.hour, 0, 0, 0);
        sessionStore.add({
          stationId: row.stationId, genre: row.genre, mood: row.mood, kind: "http",
          startedAt: start.getTime(), endedAt: start.getTime() + row.seconds * 1000,
          seconds: row.seconds, offline: false, stationName: row.name,
        });
      }
      const eventStore = tx.objectStore("events");
      eventStore.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, { todayStart, plan });

  await page.reload();
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Статистика/ }).click();
  await expect(page.locator('main [data-tab-panel="stats"] h1')).toHaveText("Статистика");

  // Портрет слушателя: почти всё ночью → «Ночной радист» и доля ночи в подписи.
  await expect(page.locator(".stats-hero-title")).toHaveText("Ночной радист");
  await expect(page.locator(".stats-print-label")).toContainText("ночь");

  // Карта года: 53 недели по 7 дней, активные дни закрашены.
  const cells = page.locator(".stats-heat-grid .stats-heat-cell");
  await expect(cells).toHaveCount(371);
  const levels = await cells.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-level")));
  // Одна из сессий переходит полночь — поэтому закрашенных дней на один больше, чем записей.
  expect(levels.filter((level) => level && level !== "0" && level !== "null").length).toBeGreaterThanOrEqual(7);

  // Ритм недели: 7×24 ячейки и подписи частей суток.
  await expect(page.locator(".stats-weekly-cell")).toHaveCount(168);
  await expect(page.getByText(/Ночь · 0–5 ·/)).toBeVisible();

  // Рекорды и достижения.
  await expect(page.getByText("Самая длинная сессия", { exact: true })).toBeVisible();
  await expect(page.getByText("3 ч 0 м", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Первый час", { exact: true })).toBeVisible();
  await expect(page.getByText("Ночной дозор", { exact: true })).toBeVisible();
  const badges = page.locator(".stats-badge");
  await expect(badges).toHaveCount(13);
  const unlocked = await page.locator('.stats-badge[data-unlocked="true"]').count();
  expect(unlocked).toBeGreaterThanOrEqual(3);

  // Сравнения в понятных единицах.
  await expect(page.locator(".stats-fact")).toHaveCount(4);
  await expect(page.locator(".stats-fact").filter({ hasText: "Abbey Road" })).toHaveCount(1);

  // Ничего не вылезает за экран на 320 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
