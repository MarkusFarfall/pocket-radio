import { expect, test, type Page } from "@playwright/test";

async function openCollections(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.getByLabel("Раздел обзора").selectOption("collections");
}

type ArchiveDoc = Record<string, unknown>;

async function archiveDocs(page: Page, docs: ArchiveDoc[] | ((query: string) => ArchiveDoc[])) {
  const queries: string[] = [];
  await page.route("https://archive.org/advancedsearch.php**", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q") ?? "";
    queries.push(query);
    const responseDocs = typeof docs === "function" ? docs(query) : docs;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ response: { numFound: responseDocs.length, docs: responseDocs } }),
    });
  });
  await page.route("https://archive.org/metadata/**", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1) ?? "fixture";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ metadata: { title: id, creator: "" }, files: [] }),
    });
  });
  return queries;
}

test("quick offline music search submits a Russian-labeled genre suggestion", async ({ page }) => {
  await archiveDocs(page, [
    { identifier: "jazz-night", title: "Jazz Night", creator: "Jazz Ensemble", subject: "jazz", downloads: 250, collection: ["opensource_audio"] },
  ]);

  await openCollections(page);
  const artistInput = page.getByLabel("Запрос для поиска офлайн-музыки");
  await expect(artistInput).toHaveAttribute("placeholder", "Например: Кино, Михаил Круг, a-ha");
  await expect(page.getByRole("button", { name: "Быстрый поиск: Кино" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Быстрый поиск: Михаил Круг" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Быстрый поиск: Земфира" })).toHaveCount(0);
  await expect(page.locator('#offline-music-search-suggestions option[value="Кино"]')).toHaveCount(1);

  await page.getByRole("button", { name: "По названию / жанру" }).click();
  await page.getByRole("button", { name: "Быстрый поиск: Джаз" }).click();

  await expect(page.getByRole("heading", { name: "«jazz»" })).toBeVisible();
  await expect(page.getByText("Jazz Night", { exact: true })).toBeVisible();
  await expect(page.getByRole("search", { name: "Поиск музыки офлайн" }).getByLabel("Запрос для поиска офлайн-музыки")).toHaveValue("jazz");
});

test("Кино suggestion searches Latin Archive metadata from a Russian query", async ({ page }) => {
  const queries = await archiveDocs(page, (query) => {
    if (query.includes('creator:"Kino"')) return [{ identifier: "kino-archive", title: "Группа Кино", creator: "Kino", downloads: 120, collection: ["opensource_audio"] }];
    return [];
  });

  await openCollections(page);
  await page.getByRole("button", { name: "Быстрый поиск: Кино" }).click();

  await expect(page.getByRole("heading", { name: "«Кино»" })).toBeVisible();
  await expect(page.getByText("Группа Кино", { exact: true })).toBeVisible();
  expect(queries.some((query) => query.includes('creator:"Kino"'))).toBe(true);
});

test("artist search keeps A-ha results precise and drops noisy Archive metadata", async ({ page }) => {
  const queries = await archiveDocs(page, [
    { identifier: "aha-good", title: "Stay on These Roads", creator: "A-Ha", year: 1988, downloads: 30, collection: ["hifidelity"] },
    { identifier: "aha-jamendo-noise", title: "a-ha - Gorgon City All Four Walls", creator: "a-ha", year: 2025, downloads: 900, collection: ["jamendo-albums"] },
    { identifier: "aha-cover", title: "Take On Me", creator: "Written by A-Ha, covered by Asteroid M", downloads: 80, collection: ["opensource_audio"] },
    { identifier: "aha-giant-mix", title: "ForSaken Borders Townsfolk Music", creator: "A-ha, Coldplay, Don McLean, Imagine Dragons, Jason Mraz", downloads: 40, collection: ["opensource_audio"] },
    { identifier: "false-artist", title: "A Ha Llegado", creator: "Someone Else", downloads: 1, collection: ["opensource_audio"] },
  ]);

  await openCollections(page);
  await expect(page.getByRole("button", { name: "По исполнителю" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("a-ha");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "«a-ha»" })).toBeVisible();
  await expect(page.getByText("Stay on These Roads", { exact: true })).toBeVisible();
  await expect(page.getByText("a-ha - Gorgon City All Four Walls", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Written by A-Ha, covered by Asteroid M", { exact: true })).toHaveCount(0);
  await expect(page.getByText("ForSaken Borders Townsfolk Music", { exact: true })).toHaveCount(0);
  await expect(page.getByText("A Ha Llegado", { exact: true })).toHaveCount(0);
  expect(queries[0]).toContain('creator:"a-ha"');
  expect(queries[0]).not.toContain(" OR title:(a ha)");
});

test("all-fields search uses an exact phrase rather than matching isolated words", async ({ page }) => {
  const queries = await archiveDocs(page, [
    { identifier: "talk-talk-album", title: "Spirit of Eden", creator: "Talk Talk", year: 1988, downloads: 100, collection: ["opensource_audio"] },
    { identifier: "talk-talk-by-title", title: "Talk Talk", creator: "Various artists", downloads: 20, collection: ["opensource_audio"] },
    { identifier: "talk-only", title: "Talk to Me", creator: "Another Artist", downloads: 999, collection: ["opensource_audio"] },
    { identifier: "talking-heads", title: "Talking Heads", creator: "Talking Heads", downloads: 500, collection: ["opensource_audio"] },
  ]);

  await openCollections(page);
  await page.getByRole("button", { name: "По названию / жанру" }).click();
  await page.getByPlaceholder("Название альбома, песни или жанр").fill("Talk Talk");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "«Talk Talk»" })).toBeVisible();
  await expect(page.getByText("Spirit of Eden", { exact: true })).toBeVisible();
  await expect(page.getByText("Talk Talk", { exact: true })).toBeVisible();
  await expect(page.getByText("Talk to Me", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Talking Heads", { exact: true })).toHaveCount(0);
  expect(queries[0]).toContain('title:"Talk Talk"');
  expect(queries[0]).toContain('creator:"Talk Talk"');
});

test("artist search keeps Talk Talk creator matches ahead of title-only mentions", async ({ page }) => {
  const docs: ArchiveDoc[] = Array.from({ length: 9 }, (_, index) => ({
    identifier: `talk-talk-${index}`,
    title: `Talk Talk album ${index + 1}`,
    creator: "Talk Talk",
    downloads: 100 - index,
    collection: ["opensource_audio"],
  }));
  docs.push(
    { identifier: "talk-talk-title-only", title: "Talk Talk", creator: "Various artists", downloads: 5000, collection: ["opensource_audio"] },
    { identifier: "talk-talk-jamendo", title: "Talk Talk cover", creator: "Talk Talk", downloads: 9000, collection: ["jamendo-albums"] },
  );
  const queries = await archiveDocs(page, docs);

  await openCollections(page);
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Talk Talk");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "«Talk Talk»" })).toBeVisible();
  await expect(page.getByText("Talk Talk album 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Various artists", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Talk Talk cover", { exact: true })).toHaveCount(0);
  expect(queries[0]).toContain('creator:"Talk Talk"');
  expect(queries.some((query) => query.includes('title:"Talk Talk"'))).toBe(false);
});

test("smart artist search finds Zemfira variants and Mikhail Krug when creator metadata is missing", async ({ page }) => {
  const zemfiraCyrillic: ArchiveDoc = {
    identifier: "zemfira-creator-ru", title: "Хочешь", creator: "Земфира", downloads: 166, collection: ["opensource_audio"],
  };
  const zemfiraLatin: ArchiveDoc = {
    identifier: "zemfira-creator-latin", title: "Beskonechnost", creator: "Zemfira", downloads: 104, collection: ["ourmedia"],
  };
  const zemfiraDemo: ArchiveDoc = {
    identifier: "zemfira-demo", title: "Земфира — Демо 1998–1999", creator: "", downloads: 0, collection: ["opensource_audio"],
  };
  const zemfiraStory: ArchiveDoc = {
    identifier: "zemfira-story-noise", title: "Рик Татьяна — Крыса Земфира — мутант", creator: "", downloads: 800, collection: ["audioboo_ru"],
  };
  const zemfiraJamendo: ArchiveDoc = {
    identifier: "zemfira-jamendo-noise", title: "Zemfira cover", creator: "Dmitriy Kozhemyako", downloads: 900, collection: ["jamendo-albums"],
  };
  const krugDuets: ArchiveDoc = {
    identifier: "mikhail-krug-duets", title: "Михаил Круг (Mikhail Krug) — Дуэты (2012)", creator: "", downloads: 5301, collection: ["folksoundomy_audio_y2k"],
  };
  const krugAlbum: ArchiveDoc = {
    identifier: "mikhail-krug-central", title: "Михаил Круг — Владимирский централ", creator: "Master Sound", downloads: 96, collection: ["russian-post-soviet-cds"],
  };
  const krugStory: ArchiveDoc = {
    identifier: "mikhail-krug-story-noise", title: "Михаил Круг рассказывает сказку", creator: "", downloads: 1000, collection: ["audioboo_ru"],
  };

  const queries = await archiveDocs(page, (query) => {
    if (query.includes('creator:"Земфира"')) return [zemfiraCyrillic];
    if (query.includes('creator:"Zemfira"')) return [zemfiraLatin];
    if (query.includes('title:"Земфира"')) return [zemfiraCyrillic, zemfiraDemo, zemfiraStory, zemfiraJamendo];
    if (query.includes('title:"Zemfira"')) return [zemfiraLatin, zemfiraJamendo];
    if (query.includes('creator:"Михаил Круг"') || query.includes('creator:"Mikhail Krug"')) return [];
    if (query.includes('title:"Михаил Круг"')) return [krugDuets, krugAlbum, krugStory];
    if (query.includes('title:"Mikhail Krug"')) return [krugDuets];
    return [];
  });

  await openCollections(page);
  const input = page.getByLabel("Запрос для поиска офлайн-музыки");
  const find = page.getByRole("button", { name: "Найти", exact: true });

  await input.fill("Земфира");
  await find.click();
  await expect(page.getByRole("heading", { name: "«Земфира»" })).toBeVisible();
  await expect(page.getByText("Хочешь", { exact: true })).toBeVisible();
  await expect(page.getByText("Beskonechnost", { exact: true })).toBeVisible();
  await expect(page.getByText("Земфира — Демо 1998–1999", { exact: true })).toBeVisible();
  await expect(page.getByText(/совпало в названии/).first()).toBeVisible();
  await expect(page.getByText("Рик Татьяна — Крыса Земфира — мутант", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Zemfira cover", { exact: true })).toHaveCount(0);
  expect(queries.some((query) => query.includes('creator:"Zemfira"'))).toBe(true);

  await input.fill("Михаил Круг");
  await find.click();
  await expect(page.getByRole("heading", { name: "«Михаил Круг»" })).toBeVisible();
  await expect(page.getByText("Михаил Круг (Mikhail Krug) — Дуэты (2012)", { exact: true })).toBeVisible();
  await expect(page.getByText("Михаил Круг — Владимирский централ", { exact: true })).toBeVisible();
  await expect(page.getByText("Михаил Круг рассказывает сказку", { exact: true })).toHaveCount(0);
  expect(queries.some((query) => query.includes('title:"Mikhail Krug"'))).toBe(true);
});
