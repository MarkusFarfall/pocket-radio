import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";

const ITEM_ID = "fixture-cdda-disc";
const IMAGE_SIZE = 150 * 2_352;
const CUE = [
  'FILE "disc.img" BINARY',
  "  TRACK 01 AUDIO",
  "    INDEX 01 00:00:00",
  "  TRACK 02 AUDIO",
  "    INDEX 01 00:01:00",
].join("\r\n");
const ART = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#be3f7a"/></svg>')}`;

async function openAsGuest(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("http://127.0.0.1:4175");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}

async function mockCdItem(page: Page): Promise<string[]> {
  const ranges: string[] = [];
  await page.route("https://archive.org/advancedsearch.php**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ response: { numFound: 1, docs: [{ identifier: ITEM_ID, title: "Fixture Audio CD", creator: "Fixture Artist", year: 1989, downloads: 102 }] } }),
    })
  );
  await page.route(`https://archive.org/metadata/${ITEM_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        metadata: { title: "Fixture Audio CD", creator: "Fixture Artist" },
        files: [
          { name: "disc.cue", format: "Cue Sheet", size: "100" },
          { name: "disc.img", format: "ISO Image", size: String(IMAGE_SIZE) },
        ],
      }),
    })
  );
  await page.route(/\/api\/archive-file\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "cue") {
      return route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: CUE });
    }
    const range = route.request().headers().range ?? "";
    ranges.push(range);
    const match = range.match(/^bytes=(\d+)-(\d+)$/);
    if (!match) return route.fulfill({ status: 416, body: "Range required" });
    const start = Number(match[1]);
    const end = Number(match[2]);
    return route.fulfill({
      status: 206,
      contentType: "application/octet-stream",
      headers: {
        "Content-Range": `bytes ${start}-${end}/${IMAGE_SIZE}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
      },
      body: Buffer.alloc(end - start + 1),
    });
  });
  await page.route("https://itunes.apple.com/**", async (route) => {
    const url = new URL(route.request().url());
    const results = url.pathname.endsWith("/search")
      ? [{ wrapperType: "collection", collectionId: 123, collectionName: "Fixture Audio CD", artistName: "Fixture Artist", trackCount: 2, releaseDate: "1989-01-01T00:00:00Z", artworkUrl600: ART }]
      : [
          { wrapperType: "collection", collectionId: 123, collectionName: "Fixture Audio CD", artistName: "Fixture Artist", trackCount: 2, artworkUrl600: ART },
          { wrapperType: "track", trackNumber: 1, trackName: "Summer Rain", artistName: "Fixture Artist", trackTimeMillis: 1_000 },
          { wrapperType: "track", trackNumber: 2, trackName: "Romeos", artistName: "Fixture Artist", trackTimeMillis: 1_000 },
        ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ results }),
    });
  });
  return ranges;
}

test("opens a CUE-indexed raw CD image as separate tracks and requests only the selected audio range", async ({ page }) => {
  const ranges = await mockCdItem(page);
  await openAsGuest(page);
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.getByLabel("Раздел обзора").selectOption("collections");
  await page.getByRole("button", { name: "Джаз 20–50-х" }).click();

  const result = page.getByRole("button", { name: /Fixture Audio CD/ });
  await expect(result.getByText("CD · 2")).toBeVisible();
  await result.click();

  await expect(page.getByText(/Этот релиз хранится как аудио CD-образ/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Включить «Summer Rain»" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Включить «Romeos»" })).toBeVisible();
  await expect(page.locator(".album-hero .cover img")).toHaveAttribute("src", ART);

  const request = page.waitForRequest((item) => item.url().includes("/api/archive-file?") && item.headers().range === "bytes=0-176399");
  await page.getByRole("button", { name: "Включить «Summer Rain»" }).click();
  await request;
  expect(ranges).toEqual(["bytes=0-176399"]);
});

test("unsupported Archive entries show a clear no-audio message instead of a blank panel", async ({ page }) => {
  const id = "fixture-unsupported-audio";
  await page.route("https://archive.org/advancedsearch.php**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ response: { numFound: 1, docs: [{ identifier: id, title: "Unsupported archive entry", creator: "Fixture Artist", downloads: 1 }] } }),
    })
  );
  await page.route(`https://archive.org/metadata/${id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ metadata: { title: "Unsupported archive entry", creator: "Fixture Artist" }, files: [{ name: "track.wma", format: "Windows Media Audio", size: "1000" }] }),
    })
  );

  await openAsGuest(page);
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.getByLabel("Раздел обзора").selectOption("collections");
  await page.getByRole("button", { name: "Джаз 20–50-х" }).click();
  await page.getByRole("button", { name: /Unsupported archive entry/ }).click();

  await expect(page.getByText("Не нашёл поддерживаемых аудиофайлов или разметки .cue для CD-образа.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Включить/ })).toHaveCount(0);
});

test("saved-track rows on Home reuse the source artwork instead of dropping it", async ({ page }) => {
  await openAsGuest(page);
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  const stationArt = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#2e86c1"/></svg>')}`;
  const savedArt = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#be3f7a"/></svg>')}`;
  await page.evaluate(async ({ stationLogo, savedLogo }) => {
    const { db, saveTrack } = await import("/src/lib/db.ts");
    const station = await db.stations.toCollection().first();
    if (!station) throw new Error("Starter station missing");
    await db.stations.update(station.id, { logo: stationLogo });
    await db.tracks.add({ title: "Home cover fixture", artist: "Fixture Artist", station: station.name, stationId: station.id, ts: Date.now() });
    await saveTrack({ title: "Saved cover snapshot fixture", artist: "Fixture Artist", station: station.name, stationId: station.id, logo: savedLogo });
  }, { stationLogo: stationArt, savedLogo: savedArt });

  const section = page.getByRole("heading", { name: "Сохранённые треки" }).locator("xpath=ancestor::section");
  await expect(section.getByText("Home cover fixture")).toBeVisible();
  await expect(section.getByText("Saved cover snapshot fixture")).toBeVisible();
  const fallbackRow = section.locator(".divide-y > div").filter({ hasText: "Home cover fixture" });
  const snapshotRow = section.locator(".divide-y > div").filter({ hasText: "Saved cover snapshot fixture" });
  await expect(fallbackRow.locator(".cover img")).toHaveAttribute("src", stationArt);
  await expect(snapshotRow.locator(".cover img")).toHaveAttribute("src", savedArt);
});
