import { expect, test, type Page } from "@playwright/test";

/**
 * Треки релиза без Archive: MusicBrainz отдаёт треклист, Deezer — официальные 30-секундные
 * превью по ISRC. Проверяем точное сопоставление, честные «нет превью», отсутствие
 * ложных совпадений, воспроизведение и добавление в плейлист.
 */

const json = (value: unknown) => ({
  status: 200,
  contentType: "application/json",
  headers: { "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(value),
});

const ARTIST = { artists: [{ id: "mbid-zemfira", name: "Земфира", "sort-name": "Zemfira", score: 100, type: "Person", country: "RU" }] };
const GROUPS = { "release-groups": [{ id: "rg-prosti", title: "Прости меня моя любовь", "first-release-date": "2000-03-28", "primary-type": "Album" }] };

const RELEASE = {
  releases: [
    {
      id: "rel-1",
      title: "Прости меня моя любовь",
      date: "2000-03-28",
      country: "RU",
      status: "Official",
      "artist-credit": [{ name: "Земфира" }],
      media: [
        {
          position: 1,
          tracks: [
            { number: "1", title: "ШКАЛЯТ ДАТЧИКИ", length: 218000, recording: { id: "rec-1", title: "ШКАЛЯТ ДАТЧИКИ", length: 218000, isrcs: ["FR6V82120062"] } },
            { number: "2", title: "ZERO", length: 166000, recording: { id: "rec-2", title: "ZERO", length: 166000, isrcs: ["FR6V82120063"] } },
            { number: "3", title: "БЕЗ ИСРК", length: 200000, recording: { id: "rec-3", title: "БЕЗ ИСРК", length: 200000, isrcs: [] } },
          ],
        },
      ],
      relations: [],
    },
  ],
};

interface Calls {
  deezerIsrc: string[];
  deezerSearch: string[];
  previewAudio: string[];
}

const PREVIEW = "https://cdnt-preview.dzcdn.net/api/1/1/0/6/3/0/preview.mp3";

async function mockBase(page: Page, calls: Calls) {
  await page.route("https://musicbrainz.org/ws/2/artist**", (route) => route.fulfill(json(ARTIST)));
  await page.route("https://musicbrainz.org/ws/2/release-group**", (route) => route.fulfill(json(GROUPS)));
  await page.route("https://musicbrainz.org/ws/2/release?**", (route) => route.fulfill(json(RELEASE)));
  await page.route("https://coverartarchive.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>' })
  );
  await page.route("https://archive.org/**", (route) => route.fulfill(json({ response: { numFound: 0, docs: [] } })));
  await page.route("https://api.audius.co/**", (route) => route.fulfill(json({ data: [] })));
  await page.route("https://api.deezer.com/**", (route) => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback") ?? "cb";
    const path = url.pathname.replace(/^\//, "");
    if (path.startsWith("track/isrc:")) {
      const isrc = decodeURIComponent(path.slice("track/isrc:".length));
      calls.deezerIsrc.push(isrc);
      if (isrc === "FR6V82120062") {
        return route.fulfill({ status: 200, contentType: "application/javascript", body: `${callback}(${JSON.stringify({ id: 1, readable: true, title: "ШКАЛЯТ ДАТЧИКИ", preview: PREVIEW, link: "https://www.deezer.com/track/1", artist: { name: "Земфира" } })})` });
      }
      return route.fulfill({ status: 200, contentType: "application/javascript", body: `${callback}(${JSON.stringify({ error: { type: "DataException", message: "no data" } })})` });
    }
    calls.deezerSearch.push(url.search);
    return route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `${callback}(${JSON.stringify({ data: [{ id: 3, readable: true, title: "Совсем другая песня", preview: PREVIEW, artist: { name: "Земфира" } }] })})`,
    });
  });
  await page.route("https://cdnt-preview.dzcdn.net/**", (route) => route.fulfill({ status: 200, contentType: "audio/mpeg", body: "" }));
}

async function boot(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}

async function openTracks(page: Page) {
  await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("button", { name: /^Обзор(?: \d)?$/ }).click();
  if (page.viewportSize()!.width < 768) await page.getByLabel("Раздел обзора").selectOption("collections");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Земфира");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  const panel = page.getByRole("region", { name: "Дискография исполнителя" });
  await expect(panel).toContainText("Дискография: Земфира");
  const header = panel.getByRole("button", { name: /^Дискография: Земфира/ });
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await panel.getByRole("button", { name: "Где слушать: Прости меня моя любовь" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Треки/ })).toBeVisible();
  await expect(dialog.locator("[data-preview-track]").first()).toBeVisible();
  return dialog;
}

const emptyCalls = (): Calls => ({ deezerIsrc: [], deezerSearch: [], previewAudio: [] });

test("треки приходят из MusicBrainz, а не из Archive", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await boot(page);
  const dialog = await openTracks(page);

  await expect(dialog.getByRole("tab", { name: /Треки/ })).toContainText("3");
  await expect(dialog.locator("[data-preview-track]")).toHaveCount(3);
  const rows = dialog.locator("[data-preview-track]");
  await expect(rows.nth(0)).toContainText("ШКАЛЯТ ДАТЧИКИ");
  await expect(rows.nth(0)).toContainText("Земфира");
  await expect(rows.nth(0)).toContainText("3:38");
  // У трека без ISRC нет превью — и это честно написано.
  await expect(rows.nth(2)).toContainText("30 с · Deezer");
});

test("превью находится по ISRC и играет через общий плеер", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await boot(page);
  const dialog = await openTracks(page);

  await dialog.locator("[data-preview-track]").first().getByRole("button", { name: /Слушать/ }).click();
  await expect(dialog.locator("[data-preview-track]").first()).toContainText("превью 30 с · ISRC");
  await expect(dialog.locator("[data-preview-track]").first().getByRole("button", { name: /Слушать/ })).toHaveAttribute("title", "Слушать 30 секунд");

  const state = await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    const s = player.getState();
    return { name: s.station?.name ?? null, url: s.station?.url ?? null, isLive: s.isLive };
  });
  expect(state.url).toBe(PREVIEW);
  expect(state.name).toContain("превью 30 с");
  expect(state.isLive).toBe(false);
  expect(calls.deezerIsrc).toContain("FR6V82120062");
});

test("трек без совпадения не получает чужое превью", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await boot(page);
  const dialog = await openTracks(page);

  const third = dialog.locator("[data-preview-track]").nth(2);
  await third.getByRole("button", { name: /Слушать/ }).click();
  await expect(third).toContainText("нет превью");
  // Поиск по названию был, но «Совсем другая песня» не подставлена.
  expect(calls.deezerSearch.length).toBeGreaterThan(0);
  await expect(third.getByRole("button", { name: /Слушать/ })).toBeDisabled();
});

test("превью можно добавить в плейлист с честной пометкой", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await boot(page);
  const dialog = await openTracks(page);
  const first = dialog.locator("[data-preview-track]").first();
  await first.getByRole("button", { name: /Слушать/ }).click();
  await expect(first).toContainText("превью 30 с");

  await first.getByRole("button", { name: /В плейлист/ }).click();
  const picker = page.getByRole("dialog").filter({ hasText: "В плейлист" }).last();
  await expect(picker).toBeVisible();
  await expect(picker).toContainText("ШКАЛЯТ ДАТЧИКИ");
});

test("переиздание выбирается по самому полному официальному изданию", async ({ page }) => {
  const calls = emptyCalls();
  await mockBase(page, calls);
  await page.route("https://musicbrainz.org/ws/2/release?**", (route) =>
    route.fulfill(
      json({
        releases: [
          { id: "rel-single", title: "Single edit", date: "2000", country: "RU", status: "Official", media: [{ tracks: [{ number: "1", title: "Один трек", recording: { id: "r1", title: "Один трек" } }] }] },
          {
            id: "rel-full",
            title: "Прости меня моя любовь",
            date: "2000-03-28",
            status: "Official",
            "artist-credit": [{ name: "Земфира" }],
            media: [{ tracks: [1, 2, 3, 4].map((n) => ({ number: String(n), title: `Песня ${n}`, recording: { id: `r${n}`, title: `Песня ${n}` } })) }],
          },
        ],
      })
    )
  );
  await boot(page);
  const dialog = await openTracks(page);
  await expect(dialog.locator("[data-preview-track]")).toHaveCount(4);
  await expect(dialog.locator("[data-preview-track]").first()).toContainText("Песня 1");
});
