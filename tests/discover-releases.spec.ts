import { expect, test, type Page } from "@playwright/test";
import { fixText } from "../src/lib/text";

const json = (value: unknown) => ({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(value) });
async function boot(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.route("https://itunes.apple.com/**", r => r.fulfill(json({ results: [] })));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}
async function music(page: Page) {
  await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("button", { name: /^Обзор(?: \d)?$/ }).click();
  await page.getByLabel("Раздел обзора").selectOption("collections");
}

test("Archive format labels cannot turn ZIP bundles and playlists into playable MP3 tracks", async ({ page }) => {
  await page.route("https://archive.org/metadata/encodings", r => r.fulfill(json({
    metadata: { title: "Live", artist: "Земфира" },
    files: [
      { name: "01-.mp3", title: "Самолёт", track: "1", format: "VBR MP3" },
      { name: "01-_64kb.mp3", title: "Duplicate", original: "01-.mp3", format: "64Kbps MP3" },
      { name: "01-.ogg", original: "01-.mp3", format: "Ogg Vorbis" },
      { name: "02-.mp3", format: "VBR MP3" },
      { name: "all_mp3.zip", format: "VBR MP3", original: ["01-.mp3", "02-.mp3"] },
      { name: "all.m3u", format: "VBR MP3", original: ["01-.mp3", "02-.mp3"] },
      { name: "private.mp3", private: "true", format: "VBR MP3" },
    ],
  })));
  await boot(page);
  const result = await page.evaluate(async () => (await import("/src/lib/archive.ts")).albumTracks("encodings"));
  expect(result.creator).toBe("Земфира");
  expect(result.tracks.map(t => t.url.split("/").at(-1))).toEqual(["01-.mp3", "02-.mp3"]);
  expect(result.tracks.map(t => t.title)).toEqual(["Самолёт", "Трек 2"]);
});

test("artist search includes self-titled releases verified by metadata.artist and excludes a spoken biography", async ({ page }) => {
  await page.route("https://archive.org/advancedsearch.php**", r => {
    const q = new URL(r.request().url()).searchParams.get("q")!;
    return r.fulfill(json({ response: { numFound: q.includes('title:"') ? 2 : 0, docs: q.includes('title:"') ? [
      { identifier: "self-title", title: "Zemfira", creator: "", subject: "N3377B", downloads: 900 },
      { identifier: "biography", title: "Zemfira and us", creator: "", description: "This <b>book</b> is about the musician", downloads: 1000 },
    ] : [] } }));
  });
  await page.route("https://archive.org/metadata/self-title", r => r.fulfill(json({ metadata: { title: "Zemfira", artist: "Земфира" }, files: [{ name: "song.mp3" }] })));
  await boot(page);
  const result = await page.evaluate(async () => (await import("/src/lib/archive.ts")).searchTextAlbums("Земфира", "artist", 1));
  expect(result.albums.map(a => a.id)).toEqual(["self-title"]);
  expect(result.albums[0].trackCount).toBe(1);
});

test("a ninth creator hit does not suppress real artist-led releases with missing creator metadata", async ({ page }) => {
  await page.route("https://archive.org/advancedsearch.php**", r => {
    const q = new URL(r.request().url()).searchParams.get("q")!;
    const docs = q.includes('creator:"') ? Array.from({ length: 9 }, (_, i) => ({ identifier: `artist-${i}`, title: `Album ${i}`, creator: "Example Band", downloads: 20 - i }))
      : q.includes('title:"') ? [{ identifier: "title-release", title: "Example Band - Live", creator: "", downloads: 500 }] : [];
    return r.fulfill(json({ response: { numFound: docs.length, docs } }));
  });
  await boot(page);
  const result = await page.evaluate(async () => (await import("/src/lib/archive.ts")).searchTextAlbums("Example Band", "artist", 1));
  expect(result.albums).toHaveLength(10);
  expect(result.albums.at(-1)?.id).toBe("title-release");
});

test("Okean name variants are queried together and do not match isolated words", async ({ page }) => {
  const queries: string[] = [];
  await page.route("https://archive.org/advancedsearch.php**", r => {
    const q = new URL(r.request().url()).searchParams.get("q")!; queries.push(q);
    const docs = q.includes('title:"') ? [
      { identifier: "ua", title: "Океан Ельзи - Дякую Тобі", downloads: 3 },
      { identifier: "latin", title: "Okean Elzy - Ne tvoja vijna", downloads: 2 },
      { identifier: "alternative", title: "Okean Elzi - Obnimi Remix", downloads: 1 },
      { identifier: "wrong", title: "Океан звуков и Эльзы песни", downloads: 100 },
    ] : [];
    return r.fulfill(json({ response: { numFound: docs.length, docs } }));
  });
  await boot(page);
  const result = await page.evaluate(async () => (await import("/src/lib/archive.ts")).searchTextAlbums("Океан Эльзы", "artist", 1));
  expect(result.albums.map(a => a.id)).toEqual(["ua", "latin", "alternative"]);
  expect(queries).toHaveLength(3);
  expect(queries[0]).toContain('creator:"Океан Ельзи"');
  expect(queries[0]).toContain('creator:"Okean Elzy"');
  expect(queries[0]).toContain('creator:"Okean Elzi"');
});

test("rejected subject hits do not consume the page or hide valid songs in the next provider batch", async ({ page }) => {
  await page.route("https://archive.org/advancedsearch.php**", r => {
    const url = new URL(r.request().url()), q = url.searchParams.get("q")!, pg = Number(url.searchParams.get("page"));
    const docs = !q.includes('subject:"') ? [] : pg === 1
      ? Array.from({ length: 50 }, (_, i) => ({ identifier: `noise-${i}`, title: `Mention ${i}`, subject: "Example Band" }))
      : [{ identifier: "real", title: "A song", subject: "Example Band" }];
    return r.fulfill(json({ response: { numFound: q.includes('subject:"') ? 51 : 0, docs } }));
  });
  await page.route("https://archive.org/metadata/**", r => r.fulfill(json({ metadata: { title: "A song", artist: "Example Band" }, files: r.request().url().endsWith("/real") ? [{ name: "song.mp3" }] : [] })));
  await boot(page);
  const result = await page.evaluate(async () => (await import("/src/lib/archive.ts")).searchTextAlbums("Example Band", "artist", 1));
  expect(result.albums.map(a => a.id)).toEqual(["real"]);
  expect(result.hasMore).toBe(false);
});

test("search scanning limits report partial results instead of an endless empty next page", async ({ page }) => {
  await page.route("https://archive.org/advancedsearch.php**", r => r.fulfill(json({ response: { numFound: 999999, docs: Array.from({ length: 50 }, (_, i) => ({ identifier: `spoken-${i}`, title: "Example audiobook", creator: "Example Band" })) } })));
  await boot(page);
  const result = await page.evaluate(async () => (await import("/src/lib/archive.ts")).searchTextAlbums("Example Band", "artist", 1));
  expect(result.albums).toEqual([]);
  expect(result.hasMore).toBe(false);
  expect(result.limited).toBe(true);
});

test("RAR-only releases show their actual format, a source link and a completed state on mobile", async ({ page }) => {
  await page.route("https://archive.org/advancedsearch.php**", r => r.fulfill(json({ response: { numFound: 1, docs: [{ identifier: "rar-only", title: "Example Band - Release", creator: "Example Band" }] } })));
  await page.route("https://archive.org/metadata/rar-only", r => r.fulfill(json({ metadata: { title: "Example Band - Release" }, files: [{ name: "release.rar", format: "RAR" }] })));
  await boot(page); await music(page);
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Example Band");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  const row = page.locator('[data-archive-album="rar-only"]');
  await expect(row.getByText("RAR", { exact: true })).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { name: "Аудио упаковано в RAR" })).toBeVisible();
  await expect(page.locator(".album-hero")).not.toContainText("Загружаем");
  await expect(page.getByRole("link", { name: "Открыть источник" })).toHaveAttribute("href", "https://archive.org/details/rar-only");
  await expect(page.getByRole("button", { name: /Включить «/ })).toHaveCount(0);
  await page.getByRole("button", { name: "К результатам" }).click();
  await expect(page.getByLabel("Запрос для поиска офлайн-музыки")).toHaveValue("Example Band");
});

test("failed metadata is not labelled no-audio and can be retried from the album panel", async ({ page }) => {
  let failing = true;
  await page.route("https://archive.org/advancedsearch.php**", r => r.fulfill(json({ response: { numFound: 1, docs: [{ identifier: "retry", title: "Example Band - Retry", creator: "Example Band" }] } })));
  await page.route("https://archive.org/metadata/retry", r => failing ? r.fulfill({ status: 503, body: "Unavailable" }) : r.fulfill(json({ metadata: { title: "Example Band - Retry" }, files: [{ name: "one.mp3", title: "Recovered song" }] })));
  await boot(page); await music(page);
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Example Band");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.locator('[data-archive-album="retry"]')).toContainText("Не проверено");
  await page.locator('[data-archive-album="retry"]').click();
  await expect(page.getByRole("alert")).toContainText("Не удалось загрузить релиз");
  await expect(page.locator(".album-hero")).not.toContainText("Загружаем");
  failing = false;
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(page.getByRole("button", { name: "Включить «Recovered song»" })).toBeVisible();
});

for (const width of [320, 390]) test(`compact mobile Browse and album panel fit all eight interfaces at ${width}px and 125%`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("https://archive.org/advancedsearch.php**", r => r.fulfill(json({ response: { numFound: 1, docs: [{ identifier: "mobile-rar", title: "Zemfira-Myaso-SINGLE-WEB-RU-2022-2o22", creator: "Земфира" }] } })));
  await page.route("https://archive.org/metadata/mobile-rar", r => r.fulfill(json({ metadata: { title: "Zemfira-Myaso-SINGLE-WEB-RU-2022-2o22" }, files: [{ name: "release.rar" }] })));
  await boot(page, width);
  await page.evaluate(async () => (await import("/src/lib/uiStyle.ts")).setUiPrefs({ scale: 125, reduceMotion: true }));
  await music(page);
  for (const design of ["classic", "editorial", "library", "console", "atelier", "panorama", "nocturne", "focus"]) {
    await page.evaluate(async design => (await import("/src/lib/appDesign.ts")).applyAppDesign(design), design);
    await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Земфира");
    await page.getByRole("button", { name: "Найти", exact: true }).click();
    await page.locator('[data-archive-album="mobile-rar"]').click();
    await expect(page.getByRole("heading", { name: "Аудио упаковано в RAR" })).toBeVisible();
    const geometry = await page.locator(".album-hero, .album-copy h2, .album-availability").evaluateAll(es => es.map(e => e.scrollWidth - e.clientWidth));
    for (const overflow of geometry) expect(overflow, design).toBeLessThanOrEqual(1);
    const hero = await page.locator(".album-hero").boundingBox();
    expect(hero!.height, design).toBeLessThan(360);
    await page.getByRole("button", { name: "К результатам" }).click();
    for (const selector of [".discover-page", ".design-page-heading", ".music-workspace", ".music-search-card"]) {
      expect(await page.locator('.discover-page').locator(selector === '.discover-page' ? ':scope' : selector).evaluate(e => e.scrollWidth - e.clientWidth), design + selector).toBeLessThanOrEqual(1);
    }
  }
});

test("double-encoded UTF-8 titles recover through valid UTF-8 before CP1251 fallback", () => {
  const encodeTwice = (s: string) => {
    const wrong = (value: string) => Array.from(new TextEncoder().encode(value), n => String.fromCharCode(n)).join("");
    return wrong(wrong(s));
  };
  expect(fixText(encodeTwice("01-Самолёт"))).toBe("01-Самолёт");
  expect(fixText(encodeTwice("02-Любовь как случайная смерть"))).toBe("02-Любовь как случайная смерть");
  expect(fixText("Björk — Океан Ельзи")).toBe("Björk — Океан Ельзи");
});
