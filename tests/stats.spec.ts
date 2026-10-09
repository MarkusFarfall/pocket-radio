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
  await expect(page.locator("main h1").first()).toHaveText("Статистика");
  await expect(page.getByTestId("stats-total-time")).toHaveText("3 ч 5 м");
  await expect(page.getByText("3 активных дня", { exact: true })).toBeVisible();
  await expect(page.getByText("3 включения", { exact: true })).toBeVisible();
  await expect(page.getByText("2 уникальные станции", { exact: true })).toBeVisible();
  await expect(page.getByText("Ошибки", { exact: true })).toBeVisible();
  await expect(page.getByText("Буферизация", { exact: true })).toBeVisible();
  await expect(page.getByText("2 дня", { exact: true })).toBeVisible();
  const averageCard = page.getByText("Средняя сессия", { exact: true }).locator("xpath=../..");
  await expect(averageCard).toContainText("1 ч 2 м");
  const trafficCard = page.getByText("Трафик · оценка", { exact: true }).locator("xpath=../..");
  await expect(trafficCard).toContainText("114.4 МБ");

  const offlineCard = page.getByText("Офлайн", { exact: true }).locator("xpath=../..");
  await expect(offlineCard).toContainText("32%");
  await page.getByRole("button", { name: "30 дней", exact: true }).click();
  await expect(page.getByTestId("stats-total-time")).toHaveText("3 ч 35 м");
  await page.getByRole("button", { name: "Всё время", exact: true }).click();
  await expect(page.getByTestId("stats-total-time")).toHaveText("3 ч 35 м");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
