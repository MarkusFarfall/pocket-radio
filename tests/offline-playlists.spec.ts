import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:4175";

async function openAsGuest(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto(BASE);
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}

function wav(seconds = 3, frequency = 440, sampleRate = 8_000): Buffer {
  const samples = seconds * sampleRate;
  const bytes = samples * 2;
  const out = Buffer.alloc(44 + bytes);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + bytes, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples; i++) {
    out.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * frequency) / sampleRate) * 3_500), 44 + i * 2);
  }
  return out;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, check]);
}

function png(): Buffer {
  const width = 64;
  const height = 64;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const pixels = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    pixels[row] = 0; // PNG filter: none
    for (let x = 0; x < width; x++) {
      const pos = row + 1 + x * 4;
      pixels[pos] = 40;
      pixels[pos + 1] = 130;
      pixels[pos + 2] = 210;
      pixels[pos + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

interface FixtureTrack {
  file: string;
  title: string;
  seconds: number;
  frequency: number;
}

async function mockArchive(page: Page, id: string, title: string, tracks: FixtureTrack[]) {
  const image = png();
  await page.route("https://archive.org/advancedsearch.php**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ response: { docs: [{ identifier: id, title, creator: "Fixture ensemble", year: 1962, downloads: 20 }] } }),
    })
  );
  await page.route(`https://archive.org/metadata/${id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        metadata: { title, creator: "Fixture ensemble" },
        files: [
          ...tracks.map((track, i) => ({
            name: track.file,
            format: "VBR MP3",
            title: track.title,
            track: String(i + 1),
            length: `00:${String(track.seconds).padStart(2, "0")}`,
            size: String(wav(track.seconds, track.frequency).length),
          })),
          { name: "cover.jpg", format: "JPEG", size: "25000" },
        ],
      }),
    })
  );
  await page.route(`https://archive.org/services/img/${id}`, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: image })
  );
  await page.route(`https://archive.org/download/${id}/**`, (route) => {
    const filename = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    if (filename === "cover.jpg") {
      return route.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: image });
    }
    const track = tracks.find((item) => item.file === filename);
    if (!track) return route.fulfill({ status: 404, headers: { "Access-Control-Allow-Origin": "*" }, body: "Not found" });
    const body = wav(track.seconds, track.frequency);
    return route.fulfill({
      status: 200,
      contentType: "audio/wav",
      headers: { "Access-Control-Allow-Origin": "*", "Content-Length": String(body.length) },
      body,
    });
  });
}

async function openFixtureAlbum(page: Page) {
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.getByLabel("Раздел обзора").selectOption("collections");
  await page.getByRole("button", { name: "Джаз 20–50-х" }).click();
  await page.getByRole("button", { name: /Fixture jazz album/ }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Fixture jazz album/ }).click();
  await expect(page.getByRole("button", { name: "Выбрать треки", exact: true })).toBeVisible();
}

async function deleteCurrentPlaylist(page: Page) {
  await page.getByRole("main").getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Удалить плейлист", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить", exact: true }).click();
}

async function selectAllAndDownload(page: Page) {
  await page.getByRole("button", { name: "Выбрать треки", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать всё", exact: true }).click();
  await page.getByRole("button", { name: /Создать и скачать/ }).click();
}

async function offlineState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("local-radio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["offline", "settings"], "readonly");
    const offline = await new Promise<{ stationId: string; size: number }[]>((resolve, reject) => {
      const request = tx.objectStore("offline").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const settings = await new Promise<{ key: string; value: unknown }[]>((resolve, reject) => {
      const request = tx.objectStore("settings").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const cache = await caches.open("radio-audio-v1");
    const prefix = `${location.origin}/__pocket_radio_audio__/local-radio/`;
    const keys = (await cache.keys()).map((key) => key.url).filter((url) => url.startsWith(prefix));
    db.close();
    return { offline, playlists: settings.filter((row) => row.key.startsWith("pl:")), keys };
  });
}

test("downloaded collection tracks play from cache offline and advance in queue", async ({ page, context }) => {
  await mockArchive(page, "offline-fixture", "Fixture jazz album", [
    { file: "01 - track-one.mp3", title: "Track One", seconds: 3, frequency: 440 },
    { file: "02 - track-two.mp3", title: "Track Two", seconds: 8, frequency: 660 },
  ]);
  const mediaRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "archive.org" && url.pathname.endsWith(".mp3")) mediaRequests.push(url.pathname);
  });

  await openAsGuest(page);
  await openFixtureAlbum(page);
  await selectAllAndDownload(page);
  await expect(page.getByText(/Готово: скачано 2/)).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await offlineState(page)).offline.filter((row) => row.stationId.startsWith("pli:")).length).toBe(2);
  expect((await offlineState(page)).keys).toHaveLength(2);
  await expect.poll(async () => {
    const row = (await offlineState(page)).playlists.map((item) => item.value as { name?: string; cover?: string }).find((item) => item.name === "Fixture jazz album");
    return row?.cover?.startsWith("data:image/jpeg;base64,") ?? false;
  }).toBe(true);

  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  const albumCard = page.getByRole("button", { name: "Открыть «Fixture jazz album»" });
  await expect(albumCard.locator("img")).toHaveCount(1);
  await expect(albumCard.locator("img")).toHaveAttribute("src", /^data:image\/jpeg/);
  await albumCard.click();
  await context.setOffline(true);
  mediaRequests.length = 0;
  await page.getByRole("main").getByRole("button", { name: "Слушать", exact: true }).click();
  await page.getByRole("button", { name: "Открыть плеер" }).click();
  await expect(page.getByText("офлайн", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Track One" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Track Two" })).toBeVisible({ timeout: 8_000 });
  expect(mediaRequests, "offline playback should use the cached Blob, not request the Archive URL").toEqual([]);
});

test("stale download metadata is repaired and deleting a playlist frees its unused audio", async ({ page }) => {
  await mockArchive(page, "cleanup-fixture", "Fixture jazz album", [
    { file: "01 - track-one.mp3", title: "Track One", seconds: 2, frequency: 440 },
    { file: "02 - track-two.mp3", title: "Track Two", seconds: 2, frequency: 660 },
  ]);
  await openAsGuest(page);
  await openFixtureAlbum(page);
  await selectAllAndDownload(page);
  await expect(page.getByText(/Готово: скачано 2/)).toBeVisible({ timeout: 15_000 });
  // Тот же трек можно переиспользовать: общий offline blob должен жить, пока есть хотя бы одна ссылка.
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await page.getByRole("button", { name: "Добавить альбом", exact: true }).click();
  const picker = page.getByRole("dialog").last();
  await picker.getByPlaceholder("Например, «Дорога» или «Хиты шансона»").fill("Second use");
  await picker.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText(/Плейлист «Second use» создан/)).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();

  const before = await offlineState(page);
  expect(before.offline.filter((row) => row.stationId.startsWith("pli:")).length).toBe(2);
  expect(before.playlists).toHaveLength(2);

  const missingId = before.offline.find((row) => row.stationId.startsWith("pli:"))!.stationId;
  await page.evaluate(async (stationId) => {
    const cache = await caches.open("radio-audio-v1");
    await cache.delete(`${location.origin}/__pocket_radio_audio__/local-radio/${encodeURIComponent(stationId)}`);
  }, missingId);
  await page.reload();
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await expect.poll(async () => (await offlineState(page)).offline.filter((row) => row.stationId.startsWith("pli:")).length).toBe(1);

  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  await page.getByRole("button", { name: "Открыть «Fixture jazz album»" }).click();
  await expect(page.getByText(/офлайн 1\/2/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Скачать офлайн \(1\)/ })).toBeEnabled();

  await page.getByRole("main").getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Удалить скачанные файлы", exact: true }).click();
  await expect(page.getByText(/Общие треки ещё нужны другим плейлистам/)).toBeVisible();
  await expect.poll(async () => (await offlineState(page)).offline.filter((row) => row.stationId.startsWith("pli:")).length).toBe(1);

  await deleteCurrentPlaylist(page);
  await expect.poll(async () => (await offlineState(page)).offline.filter((row) => row.stationId.startsWith("pli:")).length, { timeout: 13_000, intervals: [250, 500, 1_000] }).toBe(1);
  expect((await offlineState(page)).keys.filter((url) => url.includes("pli%3A"))).toHaveLength(1);
  await page.getByRole("button", { name: "Открыть «Second use" }).click();
  await expect(page.getByText(/офлайн 1\/2/)).toBeVisible();

  await deleteCurrentPlaylist(page);
  await expect.poll(async () => (await offlineState(page)).offline.filter((row) => row.stationId.startsWith("pli:")).length, { timeout: 13_000, intervals: [250, 500, 1_000] }).toBe(0);
  expect((await offlineState(page)).keys.filter((url) => url.includes("pli%3A"))).toHaveLength(0);
});

test("uploaded covers persist in the playlist and local songs remain playable offline in edited order", async ({ page, context }) => {
  await openAsGuest(page);
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  await page.getByRole("button", { name: "Новый плейлист" }).click();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png() });
  await expect(page.locator('[role="dialog"] .cover img[src^="data:image/jpeg"]')).toBeVisible();
  await page.getByLabel("Название").fill("Weekend Mix");
  await page.getByRole("dialog").getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Weekend Mix" })).toBeVisible();
  await expect.poll(async () => (await offlineState(page)).playlists.some((row) => String((row.value as { name?: string; cover?: string }).name) === "Weekend Mix")).toBe(true);

  await page.reload();
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  await expect(page.locator('main .cover img[src^="data:image/jpeg"]')).toBeVisible();
  await page.getByRole("button", { name: "Открыть «Weekend Mix" }).click();

  await page.locator('input[type="file"][multiple][accept*=".wav"]').setInputFiles([
    { name: "01 - Alpha.wav", mimeType: "audio/wav", buffer: wav(7, 440) },
    { name: "02 - Beta.wav", mimeType: "audio/wav", buffer: wav(7, 660) },
  ]);
  await expect(page.getByText("Alpha", { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Beta", { exact: true })).toBeVisible({ timeout: 12_000 });

  await page.getByRole("main").getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Изменить порядок треков" }).click();
  await page.locator("main ul li").filter({ hasText: "Alpha" }).getByRole("button", { name: "Ниже" }).click();
  await expect.poll(async () => (await page.locator("main ul li").allTextContents()).map((text) => text.replace(/\s+/g, " ").trim())[0]).toContain("Beta");

  await context.setOffline(true);
  await page.getByRole("main").getByRole("button", { name: "Слушать", exact: true }).click();
  await page.getByRole("button", { name: "Открыть плеер" }).click();
  await expect(page.getByText("офлайн", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beta" })).toBeVisible();
});

test("offline music playlists persist one main cover from the first track", async ({ page }) => {
  await openAsGuest(page);
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  const first = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c23450"/></svg>')}`;
  const second = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#2459c2"/></svg>')}`;
  await page.evaluate(async ({ firstCover, secondCover }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("local-radio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({
        key: "pl:cover-selection-fixture",
        value: {
          id: "cover-selection-fixture",
          name: "Cover selection fixture",
          desc: "",
          items: [
            { id: "cover-track-first", title: "First cover", url: "https://example.invalid/first.mp3", kind: "vod", genre: "Музыка", logo: firstCover, addedAt: 1 },
            { id: "cover-track-second", title: "Second cover", url: "https://example.invalid/second.mp3", kind: "vod", genre: "Музыка", logo: secondCover, addedAt: 2 },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { firstCover: first, secondCover: second });
  await page.reload();
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();

  const card = page.getByRole("button", { name: "Открыть «Cover selection fixture»" });
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toHaveCount(1);
  await expect(card.locator("img")).toHaveAttribute("src", first);
  await expect.poll(async () => {
    const state = await offlineState(page);
    const row = state.playlists.find((item) => item.key === "pl:cover-selection-fixture");
    return (row?.value as { cover?: string } | undefined)?.cover === first;
  }).toBe(true);
});

test("adding offline music to an empty playlist saves its first track cover", async ({ page }) => {
  await mockArchive(page, "playlist-cover-fixture", "Fixture jazz album", [
    { file: "01 - track-one.mp3", title: "Track One", seconds: 2, frequency: 440 },
  ]);
  await openAsGuest(page);
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  await page.getByRole("button", { name: "Новый плейлист" }).click();
  await page.getByLabel("Название").fill("Empty to album");
  await page.getByRole("dialog").getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Empty to album" })).toBeVisible();

  await openFixtureAlbum(page);
  await page.getByRole("button", { name: "Добавить альбом", exact: true }).click();
  const picker = page.getByRole("dialog").last();
  await picker.getByRole("button", { name: /Empty to album/ }).click();
  await expect(page.getByText(/Добавлено: 1/)).toBeVisible();
  await expect.poll(async () => {
    const row = (await offlineState(page)).playlists.map((item) => item.value as { name?: string; cover?: string }).find((item) => item.name === "Empty to album");
    return row?.cover?.startsWith("data:image/jpeg;base64,") ?? false;
  }).toBe(true);

  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  const card = page.getByRole("button", { name: "Открыть «Empty to album»" });
  await expect(card.locator("img")).toHaveCount(1);
  await expect(card.locator("img")).toHaveAttribute("src", /^data:image\/jpeg/);
});

test("local and online search modes remain distinct and usable", async ({ page }) => {
  await page.route("https://*.api.radio-browser.info/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown[] = [];
    if (url.pathname.includes("/stations/search")) {
      data = [{ stationuuid: "00000000-0000-0000-0000-000000000123", name: "Fixture Jazz Radio", url: "https://example.invalid/radio.mp3", url_resolved: "https://example.invalid/radio.mp3", favicon: "", tags: "jazz,fixture", country: "Germany", countrycode: "DE", state: "Hesse", language: "english", votes: 45, codec: "MP3", bitrate: 128, hls: 0, clickcount: 200 }];
    } else if (url.pathname.includes("/tags")) data = [{ name: "jazz", stationcount: 200 }];
    else if (url.pathname.includes("/countries")) data = [{ name: "Germany", iso_3166_1: "DE", stationcount: 100 }];
    else if (url.pathname.includes("/languages")) data = [{ name: "english", iso_639: "en", stationcount: 100 }];
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
  });
  await page.route("https://somafm.com/channels.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ channels: [{ id: "fixture", title: "Fixture Jazz Channel", description: "Test channel", genre: "jazz|ambient", image: "", largeimage: "", listeners: "123", playlists: [{ url: "https://somafm.com/fixture.pls", format: "mp3", quality: "high" }] }] }) })
  );
  await page.route("https://radio.garden/api/search**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ hits: { hits: [{ _source: { code: "DE", page: { url: "/listen/fixture123", type: "channel", title: "Fixture Garden Jazz", subtitle: "Frankfurt" } } }] } }) })
  );
  await page.route("https://itunes.apple.com/**", async (route) => {
    const url = new URL(route.request().url());
    let results: unknown[] = [];
    if (url.searchParams.get("entity") === "podcastEpisode") {
      results = [{ wrapperType: "podcastEpisode", trackId: 222, trackName: "Fixture episode", episodeUrl: "https://example.invalid/episode.mp3", releaseDate: "2025-03-01T00:00:00Z", trackTimeMillis: 90_000, description: "An example episode", collectionName: "Fixture Podcast" }];
    } else if (url.pathname.endsWith("/search")) {
      results = [{ wrapperType: "track", collectionId: 111, collectionName: "Fixture Podcast", artistName: "Fixture creator", artworkUrl600: "", primaryGenreName: "Technology", trackCount: 3 }];
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ results }) });
  });
  await page.route("https://raw.githubusercontent.com/AlonDrilich/radio-playlists/main/index.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ playlists: [{ type: "country", id: "DE", name: "Germany", stations: 12, url: "https://raw.githubusercontent.com/test/fixture.m3u" }] }) })
  );
  await page.route("https://raw.githubusercontent.com/test/fixture.m3u", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", headers: { "Access-Control-Allow-Origin": "*" }, body: "#EXTM3U\n#EXTINF:-1,Fixture M3U Station\nhttps://stream.example.invalid/test.mp3\n" })
  );

  await openAsGuest(page);
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await expect(page.getByRole("heading", { name: "Что послушаем?" })).toBeVisible();
  await expect(page.locator('header button[aria-label="Поиск"]')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("header").getByRole("button", { name: /Поиск станций, жанров/ })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Быстрый поиск" })).toHaveCount(0);
  await page.keyboard.press("/");
  await expect(page.getByRole("dialog", { name: "Быстрый поиск" })).toHaveCount(0);

  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.locator("input[data-search]").fill("SomaFM");
  await expect(page.getByText("SomaFM · Groove Salad", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Плейлисты" })).toBeVisible();

  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.getByLabel("Раздел обзора").selectOption("search");
  await page.locator("input[data-search]").fill("jazz");
  await expect(page.getByText("Fixture Jazz Radio")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Источник каталога").selectOption("soma");
  await expect(page.getByText("Fixture Jazz Channel")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Источник каталога").selectOption("garden");
  await page.locator("input[data-search]").fill("jazz");
  await expect(page.getByText("Fixture Garden Jazz")).toBeVisible({ timeout: 10_000 });

  await page.getByLabel("Раздел обзора").selectOption("podcasts");
  await page.locator("input[data-search]").fill("fixture");
  await expect(page.getByText("Fixture Podcast").first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("radiogroup", { name: "Что искать" }).getByRole("radio", { name: "Серии" }).click();
  await expect(page.getByText("Fixture episode")).toBeVisible({ timeout: 10_000 });

  await page.getByLabel("Раздел обзора").selectOption("playlists");
  await page.locator("input[data-search]").fill("Германия");
  await page.getByRole("button", { name: /Германия/ }).click();
  await expect(page.getByText("Fixture M3U Station")).toBeVisible({ timeout: 10_000 });
});
