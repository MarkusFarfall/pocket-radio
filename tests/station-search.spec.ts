import { expect, test, type Page } from "@playwright/test";

async function openStationSearch(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.getByLabel("Раздел обзора").selectOption("search");
  await expect(page.getByLabel("Источник каталога")).toBeVisible();
}

const station = {
  stationuuid: "00000000-0000-4000-8000-000000000001",
  name: "Jazz FM",
  url: "https://stream.example.test/jazz",
  url_resolved: "https://stream.example.test/jazz",
  favicon: "",
  tags: "jazz",
  country: "Germany",
  countrycode: "DE",
  state: "",
  language: "english",
  votes: 42,
  codec: "MP3",
  bitrate: 128,
  hls: 0,
  clickcount: 10,
};

test("station categories are Russian and category filters remain combined with station-name search", async ({ page }) => {
  const stationQueries: URL[] = [];
  await page.route("https://**.api.radio-browser.info/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/json/tags") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { name: "jazz", stationcount: 500 },
          { name: "downtempo", stationcount: 300 },
          { name: "very-rare-raw-tag", stationcount: 1 },
        ]),
      });
      return;
    }
    if (url.pathname === "/json/countries") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ name: "Germany", iso_3166_1: "DE", stationcount: 30 }]) });
      return;
    }
    if (url.pathname === "/json/languages") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ name: "english", iso_639: "en", stationcount: 30 }]) });
      return;
    }
    if (url.pathname === "/json/stations/search") {
      stationQueries.push(url);
      const name = url.searchParams.get("name") ?? "";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(name.toLowerCase().includes("no match") ? [] : [station]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await openStationSearch(page);
  const categories = page.getByLabel("Жанр или тема");
  await expect(categories.getByRole("option", { name: "Джаз", exact: true })).toBeAttached();
  await expect(categories.getByRole("option", { name: "Даунтемпо", exact: true })).toBeAttached();
  await expect(categories.getByRole("option", { name: "Религиозные", exact: true })).toBeAttached();
  await expect(categories.getByRole("option", { name: "Детские", exact: true })).toBeAttached();
  await expect(categories.getByRole("option", { name: "jazz", exact: true })).toHaveCount(0);
  await expect(categories.getByRole("option", { name: "very-rare-raw-tag", exact: true })).toHaveCount(0);

  await categories.selectOption("religious");
  await expect.poll(() => stationQueries.some((url) => url.searchParams.get("tag") === "religious")).toBe(true);
  await categories.selectOption("children");
  await expect.poll(() => stationQueries.some((url) => url.searchParams.get("tag") === "children")).toBe(true);

  await categories.selectOption("jazz");
  await expect.poll(() => stationQueries.some((url) => url.searchParams.get("tag") === "jazz")).toBe(true);
  const search = page.locator("input[data-search]");
  await search.fill("Jazz FM");
  await expect(page.getByText("Jazz FM", { exact: true })).toBeVisible();
  await expect.poll(() => stationQueries.some((url) => url.searchParams.get("name") === "Jazz FM" && url.searchParams.get("tag") === "jazz")).toBe(true);

  const removeGenre = page.getByRole("button", { name: "Удалить фильтр: Джаз" });
  await expect(removeGenre).toBeVisible();
  await removeGenre.click();
  await expect.poll(() => stationQueries.some((url) => url.searchParams.get("name") === "Jazz FM" && !url.searchParams.has("tag"))).toBe(true);

  await categories.selectOption("jazz");
  await search.fill("No Match Radio");
  await expect(page.getByText("Ничего не найдено. Измените запрос или ослабьте фильтры.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Снять фильтры" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Очистить запрос" })).toBeVisible();
  await page.getByRole("button", { name: "Снять фильтры" }).click();
  await expect.poll(() => stationQueries.some((url) => url.searchParams.get("name") === "No Match Radio" && !url.searchParams.has("tag"))).toBe(true);
});

test("Radio Garden searches go through the same-origin proxy and map station results", async ({ page }) => {
  const gardenRequests: URL[] = [];
  await page.route("**/api/radio-garden/search**", async (route) => {
    const url = new URL(route.request().url());
    gardenRequests.push(url);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hits: {
          hits: [
            {
              _source: {
                code: "GB",
                page: {
                  url: "/listen/bbc-world-service/FXyhz9Xk",
                  type: "channel",
                  title: "BBC World Service",
                  subtitle: "London, United Kingdom",
                },
              },
            },
            {
              _source: {
                code: "GB",
                page: { url: "/visit/london/abc123", type: "place", title: "London" },
              },
            },
          ],
        },
      }),
    });
  });

  await openStationSearch(page);
  await page.getByLabel("Источник каталога").selectOption("garden");
  const search = page.locator("input[data-search]");
  await search.fill("b");
  await page.waitForTimeout(550);
  expect(gardenRequests).toHaveLength(0);
  await search.fill("bbc");

  await expect(page.getByText("BBC World Service", { exact: true })).toBeVisible();
  await expect.poll(() => gardenRequests.some((url) => url.searchParams.get("q") === "bbc")).toBe(true);
  expect(gardenRequests.every((url) => url.origin === new URL(page.url()).origin)).toBe(true);
  await expect(page.getByText("London, United Kingdom")).toBeVisible();
});
