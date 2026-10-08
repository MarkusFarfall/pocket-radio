import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";

async function openCollections(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.getByLabel("Раздел обзора").selectOption("collections");
}

const openverseTrack = {
  id: "fixture-openverse-jazz",
  title: "Moonlit Harbor",
  creator: "The Moon Ensemble",
  url: "https://audio.example.test/moonlit-harbor.mp3",
  foreign_landing_url: "https://www.jamendo.com/track/12345",
  license: "by",
  license_version: "4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
  source: "jamendo",
  category: "music",
  filetype: "mp32",
  filesize: 2048,
  duration: 92_000,
  audio_set: { title: "Moonlit Harbor", url: null },
  thumbnail: null,
  attribution: "Moonlit Harbor by The Moon Ensemble is licensed under CC BY 4.0.",
};

test("Openverse finds licensed music, maps attribution, and can add-and-download it", async ({ page }) => {
  const apiQueries: URL[] = [];
  await page.route("https://api.openverse.org/v1/audio/**", async (route) => {
    apiQueries.push(new URL(route.request().url()));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: 1,
        page_size: 20,
        page_count: 1,
        result_count: 2,
        results: [openverseTrack, { ...openverseTrack, id: "fixture-no-license", title: "Unlicensed demo", license: "" }],
      }),
    });
  });
  await page.route("https://audio.example.test/moonlit-harbor.mp3", async (route) => {
    const bytes = Buffer.alloc(2048, 73);
    await route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      headers: { "Access-Control-Allow-Origin": "*", "Content-Length": String(bytes.length) },
      body: bytes,
    });
  });

  await openCollections(page);
  await page.getByLabel("Источник музыки").selectOption("openverse");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("The Moon");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  const track = page.locator('[data-provider-track="openverse-fixture-openverse-jazz"]');
  await expect(track).toBeVisible();
  await expect(track.getByText("Moonlit Harbor", { exact: true })).toBeVisible();
  await expect(track.getByText("The Moon Ensemble · Jamendo · Openverse", { exact: true })).toBeVisible();
  await expect(track.getByText("CC BY 4.0", { exact: true })).toBeVisible();
  await expect(track.getByRole("link", { name: "Оригинал: Moonlit Harbor" })).toHaveAttribute("href", "https://www.jamendo.com/track/12345");
  await expect(page.locator("[data-provider-track]")).toHaveCount(1);
  expect(apiQueries[0]?.searchParams.get("creator")).toBe("The Moon");
  expect(apiQueries[0]?.searchParams.get("category")).toBe("music");
  expect(apiQueries[0]?.searchParams.get("license_type")).toBe("commercial");
  expect(apiQueries[0]?.searchParams.get("mature")).toBe("false");

  await track.getByRole("button", { name: "Скачать офлайн: Moonlit Harbor" }).click();
  const picker = page.getByRole("dialog").last();
  await expect(picker.getByText("После добавления сразу начнётся скачивание для офлайн-прослушивания.")).toBeVisible();
  await picker.getByPlaceholder("Например, «Дорога» или «Хиты шансона»").fill("Openverse favorites");
  await picker.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText(/Готово: скачано 1/)).toBeVisible({ timeout: 15_000 });

  const saved = await page.evaluate(async () => {
    const { db } = await import("/src/lib/db.ts");
    const [settings, offline] = await Promise.all([db.settings.toArray(), db.offline.toArray()]);
    return {
      playlist: settings.map((row) => row.value as { name?: string }).find((value) => value.name === "Openverse favorites"),
      offlineCount: offline.filter((item) => item.stationId.startsWith("pli:")).length,
    };
  });
  expect(saved.playlist?.name).toBe("Openverse favorites");
  expect(saved.offlineCount).toBe(1);
});

test("direct Wikimedia Commons search keeps music files and drops pronunciation/MIDI entries", async ({ page }) => {
  let commonsQuery = "";
  const file = (pageid: number, title: string, objectName: string, mime: string, artist: string, license: string) => ({
    pageid,
    ns: 6,
    title: `File:${title}`,
    imageinfo: [{
      url: `https://upload.wikimedia.org/wikipedia/commons/test/${encodeURIComponent(title)}`,
      thumburl: "https://commons.wikimedia.org/w/resources/assets/file-type-icons/fileicon-ogg.png",
      size: 40_000,
      mime,
      mediatype: "AUDIO",
      extmetadata: {
        ObjectName: { value: objectName },
        Artist: { value: artist },
        LicenseShortName: { value: license },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
        ImageDescription: { value: "A musical performance." },
        Credit: { value: "Wikimedia Commons contributor" },
      },
    }],
  });
  await page.route("https://commons.wikimedia.org/w/api.php**", async (route) => {
    const url = new URL(route.request().url());
    commonsQuery = url.searchParams.get("gsrsearch") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        query: {
          pages: {
            1: file(1, "Blue-Jazz.mp3", "Blue Jazz", "audio/mpeg", "Commons Ensemble", "CC BY-SA 4.0"),
            2: file(2, "LL-Q150-fra-jazz.wav", "French pronunciation of jazz", "audio/wav", "Lingua Libre", "CC BY-SA 4.0"),
            3: file(3, "Jazz.mid", "Jazz MIDI", "audio/midi", "Unknown", "Public domain"),
            4: file(4, "Unknown-license-jazz.mp3", "Unlicensed Jazz", "audio/mpeg", "Unknown", "Unknown"),
          },
        },
      }),
    });
  });

  await openCollections(page);
  await page.getByLabel("Источник музыки").selectOption("commons");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("jazz");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Жанр: Джаз" })).toBeVisible();
  await expect(page.locator('[data-provider-track="commons-1"]')).toBeVisible();
  await expect(page.getByText("Blue Jazz", { exact: true })).toBeVisible();
  await expect(page.getByText("Commons Ensemble · Wikimedia Commons", { exact: true })).toBeVisible();
  await expect(page.getByText("CC BY-SA 4.0", { exact: true })).toBeVisible();
  await expect(page.getByText("French pronunciation of jazz", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Jazz MIDI", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Unlicensed Jazz", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-provider-track]")).toHaveCount(1);
  expect(commonsQuery).toContain('filemime:audio "jazz"');

  const track = page.locator('[data-provider-track="commons-1"]');
  await track.getByRole("button", { name: "В плейлист: Blue Jazz" }).click();
  const picker = page.getByRole("dialog").last();
  await expect(picker.getByText("После добавления сразу начнётся скачивание для офлайн-прослушивания.")).toHaveCount(0);
  await picker.getByPlaceholder("Например, «Дорога» или «Хиты шансона»").fill("Commons favorites");
  await picker.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Плейлист «Commons favorites» создан", { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { db } = await import("/src/lib/db.ts");
    const [settings, offline] = await Promise.all([db.settings.toArray(), db.offline.toArray()]);
    const playlist = settings.map((row) => row.value as { name?: string; items?: Array<{ provider?: string; licenseName?: string }> }).find((value) => value.name === "Commons favorites");
    return { item: playlist?.items?.[0], offlineCount: offline.length };
  });
  expect(saved.item?.provider).toBe("commons");
  expect(saved.item?.licenseName).toBe("CC BY-SA 4.0");
  expect(saved.offlineCount).toBe(0);
});
