import { expect, test, type Page } from "@playwright/test";

/**
 * Карточка релиза: один клик по дискографии открывает проверку всех открытых источников.
 * Archive отсекает случайные совпадения, Audius отдаёт полные треки, Openverse и Commons
 * проверяются только по требованию, пустой итог объясняется без выдуманных результатов.
 */

const json = (value: unknown) => ({
  status: 200,
  contentType: "application/json",
  headers: { "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(value),
});

const ARTIST = { artists: [{ id: "mbid-zemfira", name: "Земфира", "sort-name": "Zemfira", score: 100, type: "Person", country: "RU" }] };
const GROUPS = { "release-groups": [{ id: "rg-bord", title: "Бордерлайн", "first-release-date": "2021-02-26", "primary-type": "Album" }] };

interface Calls {
  archive: string[];
  audius: number;
  openverse: number;
  commons: number;
}

const audiusTrack = (overrides: Record<string, unknown> = {}) => ({
  id: "track1",
  title: "Бордерлайн — Земфира",
  duration: 214,
  is_streamable: true,
  is_downloadable: false,
  permalink: "/someone/borderline",
  artwork: { "480x480": "https://example.test/art.jpg" },
  user: { name: "Someone", handle: "someone" },
  license: "",
  ...overrides,
});

async function mockBase(page: Page, calls: Calls) {
  await page.route("https://musicbrainz.org/ws/2/artist**", (route) => route.fulfill(json(ARTIST)));
  await page.route("https://musicbrainz.org/ws/2/release-group**", (route) => route.fulfill(json(GROUPS)));
  // Карточка сначала открывает «Треки»; в этих тестах треклист пуст, проверяем источники.
  await page.route("https://musicbrainz.org/ws/2/release?**", (route) => route.fulfill(json({ releases: [] })));
  await page.route("https://coverartarchive.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>' })
  );
  await page.route("https://api.audius.co/**", (route) => {
    calls.audius += 1;
    return route.fulfill(json({ data: [] }));
  });
  await page.route("https://api.openverse.org/**", (route) => {
    calls.openverse += 1;
    return route.fulfill(json({ results: [], page_count: 0 }));
  });
  await page.route("https://commons.wikimedia.org/**", (route) => {
    calls.commons += 1;
    return route.fulfill(json({ query: { pages: {} } }));
  });
}

async function boot(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}

async function openRelease(page: Page) {
  await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("button", { name: /^Обзор(?: \d)?$/ }).click();
  if (page.viewportSize()!.width < 768) await page.getByLabel("Раздел обзора").selectOption("collections");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Земфира");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  const panel = page.getByRole("region", { name: "Дискография исполнителя" });
  await expect(panel).toContainText("Дискография: Земфира");
  const header = panel.getByRole("button", { name: /^Дискография: Земфира/ });
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await page.getByRole("button", { name: "Где слушать: Бордерлайн" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Треки/ })).toBeVisible();
  return dialog;
}

/** Тесты источников проверяют вкладку Archive, а не треклист. */
async function openArchive(page: Page) {
  const dialog = await openRelease(page);
  await dialog.getByRole("tab", { name: /Archive/ }).click();
  return dialog;
}

const emptyCalls = (): Calls => ({ archive: [], audius: 0, openverse: 0, commons: 0 });

test("Archive отделяет точное совпадение от случайных записей со словом из названия", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://archive.org/advancedsearch.php**", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    calls.archive.push(q);
    return route.fulfill(
      json({
        response: {
          numFound: 4,
          docs: [
            { identifier: "exact", title: "Бордерлайн", creator: "Земфира", year: "2021", downloads: 900 },
            { identifier: "junk-1", title: "Спасибо", creator: "Другой автор", downloads: 5000 },
            { identifier: "junk-2", title: "Бордерлайн", creator: "Неизвестный оркестр", downloads: 4000 },
            { identifier: "live", title: "Бордерлайн — концерт", creator: "Земфира", year: "2022", downloads: 100 },
          ],
        },
      })
    );
  });
  await boot(page);
  const dialog = await openArchive(page);

  await expect(dialog.getByText("Точных совпадений: 2")).toBeVisible();
  const rows = dialog.locator(".release-archive-row");
  await expect(rows).toHaveCount(2);
  await expect(dialog.getByText("Спасибо")).toHaveCount(0);
  await expect(rows.nth(0)).toContainText("Бордерлайн");
  await expect(rows.nth(0)).toContainText("Точное совпадение");
  expect(calls.archive.some((q) => q.includes('title:"Бордерлайн"'))).toBe(true);
});

test("Archive без релиза объясняет причину, а не показывает похожий мусор", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://archive.org/advancedsearch.php**", (route) =>
    route.fulfill(json({ response: { numFound: 1, docs: [{ identifier: "junk", title: "Спасибо", creator: "Другой автор", downloads: 1000 }] } }))
  );
  await boot(page);
  const dialog = await openArchive(page);

  await expect(dialog.getByText("В Internet Archive этого релиза нет")).toBeVisible();
  await expect(dialog.locator(".release-archive-row")).toHaveCount(0);
  await expect(dialog.getByText("Открыть релиз в MusicBrainz")).toBeVisible();
});

test("Audius даёт полные треки, но не предлагает скачивание без разрешения автора", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://archive.org/advancedsearch.php**", (route) => route.fulfill(json({ response: { numFound: 0, docs: [] } })));
  await page.route("https://api.audius.co/v1/tracks/search**", (route) => {
    calls.audius += 1;
    return route.fulfill(json({ data: [audiusTrack()] }));
  });
  await boot(page);
  const dialog = await openRelease(page);

  await dialog.getByRole("tab", { name: /Audius/ }).click();
  const row = dialog.locator("[data-provider-track]").first();
  await expect(row).toContainText("Бордерлайн — Земфира");
  await expect(row).toContainText("Someone");
  await expect(row.getByRole("button", { name: /Слушать/ })).toBeVisible();
  await expect(row.getByRole("button", { name: /Скачать офлайн/ })).toHaveCount(0);
  expect(calls.audius).toBeGreaterThan(0);
});

test("Openverse и Commons проверяются по нажатию и показывают честный итог", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://archive.org/advancedsearch.php**", (route) => route.fulfill(json({ response: { numFound: 0, docs: [] } })));
  await boot(page);
  const dialog = await openArchive(page);
  await expect(dialog.getByText("В Internet Archive этого релиза нет")).toBeVisible();
  expect(calls.openverse).toBe(0);
  expect(calls.commons).toBe(0);

  await dialog.getByRole("tab", { name: /Openverse/ }).click();
  await expect(dialog.getByText("Нет треков с открытой лицензией")).toBeVisible();
  expect(calls.openverse).toBeGreaterThan(0);

  await dialog.getByRole("tab", { name: /Commons/ }).click();
  await expect(dialog.getByText("В Wikimedia Commons пусто")).toBeVisible();
  expect(calls.commons).toBeGreaterThan(0);

  // Все четыре источника проверены и пусты — итог честный, без ложных совпадений.
  await expect(dialog.getByText("Ни в одном открытом источнике релиза нет")).toBeVisible();
});

test("системная «назад» закрывает карточку релиза и оставляет дискографию", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://archive.org/advancedsearch.php**", (route) => route.fulfill(json({ response: { numFound: 0, docs: [] } })));
  await boot(page);
  await page.evaluate(() => {
    (window as unknown as { __prAlive?: string }).__prAlive = "same-document";
  });
  const dialog = await openRelease(page);
  await expect(dialog).toBeVisible();

  await page.evaluate(() => history.back());
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("region", { name: "Дискография исполнителя" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __prAlive?: string }).__prAlive)).toBe("same-document");
});

test("Audius доступен и как основной источник поиска", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://archive.org/advancedsearch.php**", (route) => route.fulfill(json({ response: { numFound: 0, docs: [] } })));
  await page.route("https://api.audius.co/v1/tracks/search**", (route) => {
    calls.audius += 1;
    return route.fulfill(json({ data: [audiusTrack({ id: "track2", title: "Небо Лондона", user: { name: "SIDXKICK" } })] }));
  });
  await boot(page);
  await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("button", { name: /^Обзор(?: \d)?$/ }).click();
  if (page.viewportSize()!.width < 768) await page.getByLabel("Раздел обзора").selectOption("collections");
  await page.getByLabel("Источник музыки").selectOption("audius");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Земфира");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  const row = page.locator("[data-provider-track]").first();
  await expect(row).toContainText("Небо Лондона");
  await expect(row).toContainText("Audius");
  expect(calls.audius).toBeGreaterThan(0);
});

test("Archive проверяет metadata: концерт подписан исполнителем, альбом — в метаданных", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://archive.org/advancedsearch.php**", (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q") ?? "";
    calls.archive.push(q);
    // Поиск по названию альбома ничего не даёт: запись называется «Земфира».
    const docs = q.includes('title:"Бордерлайн"') ? [] : [{ identifier: "live-item", title: "Земфира", creator: "Земфира", downloads: 300 }];
    return route.fulfill(json({ response: { numFound: docs.length, docs } }));
  });
  await page.route("https://archive.org/metadata/live-item", (route) =>
    route.fulfill(json({ metadata: { title: "Земфира", album: "Бордерлайн", creator: "Земфира" }, files: [{ name: "01.mp3" }] }))
  );
  await boot(page);
  const dialog = await openArchive(page);

  await expect(dialog.getByText("Точных совпадений: 1")).toBeVisible({ timeout: 20000 });
  const row = dialog.locator(".release-archive-row").first();
  await expect(row).toContainText("Бордерлайн");
  await expect(row).toContainText("Точное совпадение");
  expect(calls.archive.filter((q) => q.includes('creator:"Земфира"')).length).toBeGreaterThan(1);
});

test("карточка релиза не перезапрашивает Archive бесконечно", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://archive.org/advancedsearch.php**", (route) => {
    calls.archive.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    return route.fulfill(json({ response: { numFound: 0, docs: [] } }));
  });
  await boot(page);
  const dialog = await openArchive(page);
  await expect(dialog.getByText("В Internet Archive этого релиза нет").first()).toBeVisible();
  const first = calls.archive.length;
  await page.waitForTimeout(2500);
  // Две волны запросов (точный поиск и проверка metadata) — и ни одного повтора после ответа.
  expect(calls.archive.length - first).toBeLessThanOrEqual(1);
});
