import { expect, test, type Page } from "@playwright/test";

/** Дискография исполнителя: MusicBrainz как источник, Apple Music как резерв, честные состояния. */

const json = (value: unknown) => ({
  status: 200,
  contentType: "application/json",
  headers: { "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(value),
});

const ARTIST = {
  artists: [
    { id: "mbid-zemfira", name: "Земфира", "sort-name": "Zemfira", score: 100, type: "Person", country: "RU" },
    { id: "mbid-other", name: "Земфира Вербицкая", "sort-name": "Verbitskaya, Zemphira", score: 73, type: "Person" },
  ],
};

const GROUPS = {
  "release-groups": [
    { id: "rg-bord", title: "Бордерлайн", "first-release-date": "2021-02-26", "primary-type": "Album" },
    { id: "rg-prosti", title: "Прости меня моя любовь", "first-release-date": "2000-03-28", "primary-type": "Album" },
    { id: "rg-zemfira", title: "Земфира", "first-release-date": "1999-05-10", "primary-type": "Album" },
    { id: "rg-zemfira-dup", title: "Земфира", "first-release-date": "1999-05-10", "primary-type": "Album" },
    { id: "rg-ah", title: "Ах", "first-release-date": "2021-07-28", "primary-type": "EP" },
    { id: "rg-live", title: "Live", "first-release-date": "2003-12-20", "primary-type": "Album", "secondary-types": ["Live"] },
    { id: "rg-best", title: "...Лучшее", "first-release-date": "2008-04-01", "primary-type": "Album", "secondary-types": ["Compilation"] },
  ],
};

interface SearchCalls {
  artist: number;
  groups: number;
  archive: string[];
}

async function mockSources(page: Page, calls: SearchCalls, archiveDocs = 0, mbStatus = 200) {
  await page.route("https://musicbrainz.org/ws/2/artist**", (route) => {
    calls.artist += 1;
    return mbStatus === 200 ? route.fulfill(json(ARTIST)) : route.fulfill({ status: mbStatus, body: "rate limited" });
  });
  await page.route("https://musicbrainz.org/ws/2/release-group**", (route) => {
    calls.groups += 1;
    return mbStatus === 200 ? route.fulfill(json(GROUPS)) : route.fulfill({ status: mbStatus, body: "rate limited" });
  });
  await page.route("https://coverartarchive.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#2f6f8f"/></svg>',
    })
  );
  await page.route("https://archive.org/advancedsearch.php**", (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q") ?? "";
    calls.archive.push(query);
    const docs =
      archiveDocs && query.includes("title:")
        ? Array.from({ length: archiveDocs }, (_, index) => ({
            identifier: `match-${index}`,
            title: index === 0 ? "Бордерлайн" : `Бордерлайн (запись ${index + 1})`,
            creator: "Земфира",
            downloads: 500 - index,
          }))
        : [];
    return route.fulfill(json({ response: { numFound: docs.length, docs } }));
  });
  await page.route("https://archive.org/metadata/**", (route) => route.fulfill(json({ metadata: { title: "Бордерлайн", artist: "Земфира" }, files: [{ name: "01.mp3" }] })));
  await page.route("https://api.audius.co/**", (route) => route.fulfill(json({ data: [] })));
  await page.route("https://musicbrainz.org/ws/2/release?**", (route) => route.fulfill(json({ releases: [] })));
}

async function boot(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}

async function artistSearch(page: Page, query = "Земфира") {
  await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("button", { name: /^Обзор(?: \d)?$/ }).click();
  if (page.viewportSize()!.width < 768) await page.getByLabel("Раздел обзора").selectOption("collections");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill(query);
  await page.getByRole("button", { name: "Найти", exact: true }).click();
}

const panel = (page: Page) => page.getByRole("region", { name: "Дискография исполнителя" });

test("дискография приходит из MusicBrainz: группировка, годы, дубликаты", async ({ page }) => {
  const calls: SearchCalls = { artist: 0, groups: 0, archive: [] };
  await mockSources(page, calls);
  await boot(page);
  await artistSearch(page);

  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("Дискография: Земфира");
  await expect(panel(page).locator("[data-discography-source]")).toHaveText("MusicBrainz");
  // 7 релизов в источнике, две одинаковые записи «Земфира» (1999) схлопываются.
  await expect(panel(page)).toContainText("6 релизов");
  expect(calls.artist).toBe(1);
  expect(calls.groups).toBe(1);

  // На телефоне список свёрнут: раскрываем. Альбомы по годам, концерт и EP в своих разделах.
  await panel(page).getByRole("button", { name: /^Дискография: Земфира/ }).click();
  await expect(panel(page)).toContainText("Студийные альбомы");
  await expect(panel(page)).toContainText("Концерты и живые записи");
  await expect(panel(page)).toContainText("Синглы и EP");
  await expect(panel(page)).toContainText("Сборники и саундтреки");
  const rows = panel(page).locator(".discography-release");
  await expect(rows.first()).toContainText("Земфира");
  await expect(rows.first()).toContainText("1999");
  await expect(panel(page)).toContainText("Бордерлайн");
  await expect(panel(page)).toContainText("Концерт");
  await expect(panel(page).locator(".discography-release")).toHaveCount(6);
});

test("дискография кэшируется: повторный поиск не мучает MusicBrainz", async ({ page }) => {
  const calls: SearchCalls = { artist: 0, groups: 0, archive: [] };
  await mockSources(page, calls);
  await boot(page);
  await artistSearch(page);
  await expect(panel(page)).toContainText("6 релизов");

  await page.getByRole("button", { name: "Коллекции" }).click();
  await artistSearch(page);
  await expect(panel(page)).toContainText("6 релизов");
  await expect(panel(page).locator("[data-discography-source]")).toContainText("кэш");
  expect(calls.artist).toBe(1);
  expect(calls.groups).toBe(1);
});

test("неизвестного исполнителя источник не выдумывает", async ({ page }) => {
  const calls: SearchCalls = { artist: 0, groups: 0, archive: [] };
  await mockSources(page, calls);
  await page.route("https://musicbrainz.org/ws/2/artist**", (route) => {
    calls.artist += 1;
    return route.fulfill(json({ artists: [{ id: "x", name: "Совсем другой исполнитель", score: 60, type: "Group" }] }));
  });
  await page.route("https://itunes.apple.com/**", (route) => route.fulfill(json({ results: [] })));
  await boot(page);
  await artistSearch(page, "Несуществующий Оркестр");

  await expect(panel(page)).toContainText("Исполнитель не найден в открытых базах");
  await expect(panel(page).locator(".discography-release")).toHaveCount(0);
});

test("MusicBrainz недоступен: включается резерв Apple Music с пометкой", async ({ page }) => {
  const calls: SearchCalls = { artist: 0, groups: 0, archive: [] };
  await mockSources(page, calls, 0, 503);
  await page.route("https://itunes.apple.com/search**", (route) =>
    route.fulfill(json({ results: [{ wrapperType: "artist", artistId: 380174444, artistName: "Земфира" }] }))
  );
  await page.route("https://itunes.apple.com/lookup**", (route) =>
    route.fulfill(
      json({
        results: [
          { wrapperType: "artist", artistId: 380174444, artistName: "Земфира" },
          { wrapperType: "collection", collectionId: 1, collectionName: "бордерлайн (deluxe edition)", artistName: "Земфира", releaseDate: "2022-02-26T08:00:00Z", trackCount: 15, artworkUrl100: "https://is1.example/100x100bb.jpg" },
        ],
      })
    )
  );
  await boot(page);
  await artistSearch(page);

  await expect(panel(page).locator("[data-discography-source]")).toHaveText("Apple Music");
  await expect(panel(page)).toContainText("1 релизов");
  await panel(page).getByRole("button", { name: /^Дискография: Земфира/ }).click();
  await expect(panel(page)).toContainText("бордерлайн (deluxe edition)");
  await expect(panel(page)).toContainText("15 трек.");
  await expect(panel(page)).toContainText("MusicBrainz не ответил");
  expect(calls.artist).toBeGreaterThan(1);
});

test("релиз из дискографии открывает проверку источников и запоминает результат", async ({ page }) => {
  const calls: SearchCalls = { artist: 0, groups: 0, archive: [] };
  await mockSources(page, calls, 2);
  await boot(page);
  await artistSearch(page);
  await panel(page).getByRole("button", { name: /^Дискография: Земфира/ }).click();
  await panel(page).getByRole("button", { name: "Где слушать: Бордерлайн" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /Archive/ }).click();
  await expect(dialog.getByRole("tab", { name: /Archive/ })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => calls.archive.some((q) => q.includes('creator:"Земфира"') && q.includes('title:"Бордерлайн"'))).toBe(true);
  const rows = dialog.locator(".release-archive-row");
  await expect(rows.first()).toContainText("Бордерлайн");

  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel(page).getByText(/В открытых источниках: \d+/)).toBeVisible();
});

test("«назад» выходит из результатов поиска в коллекции", async ({ page }) => {
  const calls: SearchCalls = { artist: 0, groups: 0, archive: [] };
  await mockSources(page, calls);
  await boot(page);
  await page.evaluate(() => {
    (window as unknown as { __prAlive?: string }).__prAlive = "same-document";
  });

  await artistSearch(page);
  await expect(panel(page)).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole("heading", { name: "Коллекции" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __prAlive?: string }).__prAlive)).toBe("same-document");
});

test("панель дискографии помещается на узком экране", async ({ page }) => {
  const calls: SearchCalls = { artist: 0, groups: 0, archive: [] };
  await mockSources(page, calls);
  await boot(page, 320);
  await artistSearch(page);

  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole("button", { name: /^Дискография: Земфира/ }).click();
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("main");
    return { viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, main: main?.scrollWidth ?? 0 };
  });
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
  const header = await panel(page).getByRole("button", { name: /^Дискография: Земфира/ }).boundingBox();
  expect(header!.height).toBeGreaterThanOrEqual(44);
  const row = await panel(page).locator(".discography-release").first().boundingBox();
  expect(row!.height).toBeGreaterThanOrEqual(44);
});
