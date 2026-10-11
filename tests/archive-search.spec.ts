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

async function archiveDocs(
  page: Page,
  docs: ArchiveDoc[] | ((query: string) => ArchiveDoc[]),
  metadataFixtures: Record<string, { metadata?: { title?: string; creator?: string }; files?: { name: string; format?: string; title?: string; creator?: string }[] }> = {},
) {
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
      body: JSON.stringify(metadataFixtures[id] ?? { metadata: { title: id, creator: "" }, files: [] }),
    });
  });
  return queries;
}

test("offline music search keeps the familiar layout and finds Russian genre names", async ({ page }) => {
  const queries = await archiveDocs(page, (query) => {
    if (query.includes("subject:rock")) return [
      { identifier: "rock-night", title: "Rock Night", creator: "The Rockers", subject: "rock", downloads: 210, collection: ["opensource_audio"] },
      { identifier: "rock-audiobook", title: "Rock History — Unabridged Audiobook", creator: "The Rockers", subject: "rock", downloads: 9900, collection: ["audio_books"] },
    ];
    if (query.includes("subject:jazz")) return [{ identifier: "jazz-night", title: "Jazz Night", creator: "Jazz Ensemble", subject: "jazz", downloads: 250, collection: ["opensource_audio"] }];
    if (query.includes("subject:folk")) return [{ identifier: "folk-evening", title: "Folk Evening", creator: "The Folk Band", subject: "folk music", downloads: 70, collection: ["opensource_audio"] }];
    return [];
  });

  await openCollections(page);
  const searchInput = page.getByLabel("Запрос для поиска офлайн-музыки");
  await expect(page.getByRole("button", { name: "По исполнителю" })).toHaveAttribute("aria-pressed", "true");
  await expect(searchInput).toHaveAttribute("placeholder", "Например: Кино, Михаил Круг, a-ha");
  await expect(page.getByRole("button", { name: "Быстрый поиск: Кино" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Быстрый поиск: Михаил Круг" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Быстрый поиск: Земфира" })).toHaveCount(0);
  await expect(page.getByLabel("Выбрать жанр")).toBeVisible();
  const quickHintTops = await page.getByRole("button", { name: /Быстрый поиск:/ }).evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
  expect(new Set(quickHintTops).size).toBe(1);
  const quickScroll = page.getByRole("group", { name: "Популярные запросы" }).locator(".overflow-x-auto");
  const quickScrollBox = await quickScroll.boundingBox();
  for (const name of ["Кино", "Михаил Круг"]) {
    const hintBox = await page.getByRole("button", { name: `Быстрый поиск: ${name}` }).boundingBox();
    expect(hintBox).not.toBeNull();
    expect(hintBox!.x).toBeGreaterThanOrEqual(quickScrollBox!.x);
    expect(hintBox!.x + hintBox!.width).toBeLessThanOrEqual(quickScrollBox!.x + quickScrollBox!.width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(searchInput).toHaveAttribute("type", "text");
  await expect(searchInput).toHaveAttribute("role", "searchbox");
  await expect(page.locator('input[type="search"]')).toHaveCount(0);
  await expect(page.locator("#offline-music-search-suggestions")).toHaveCount(0);
  await searchInput.fill("временный запрос");
  await expect(page.getByRole("button", { name: "Очистить запрос" })).toBeVisible();
  expect(await searchInput.evaluate((input) => getComputedStyle(input).outlineStyle)).toBe("none");
  await page.getByRole("button", { name: "Очистить запрос" }).click();
  await expect(searchInput).toHaveValue("");
  await expect(page.getByRole("button", { name: "Очистить запрос" })).toHaveCount(0);

  // Даже в привычном режиме поиска по исполнителю точный русский жанр распознаётся автоматически.
  await searchInput.fill("рок");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Жанр: Рок" })).toBeVisible();
  await expect(page.getByText("Rock Night", { exact: true })).toBeVisible();
  await expect(page.getByText("Rock History — Unabridged Audiobook", { exact: true })).toHaveCount(0);
  await expect(searchInput).toHaveValue("рок");
  expect(queries.some((query) => query.includes("subject:rock"))).toBe(true);

  await page.getByRole("button", { name: "По названию / жанру" }).click();
  await page.getByRole("button", { name: "Быстрый поиск: Джаз" }).click();
  await expect(page.getByRole("heading", { name: "Жанр: Джаз" })).toBeVisible();
  await expect(page.getByText("Jazz Night", { exact: true })).toBeVisible();
  await expect(searchInput).toHaveValue("джаз");
  expect(queries.some((query) => query.includes("subject:jazz"))).toBe(true);

  await page.getByLabel("Выбрать жанр").selectOption("folk");
  await expect(page.getByRole("heading", { name: "Жанр: Фолк" })).toBeVisible();
  await expect(page.getByText("Folk Evening", { exact: true })).toBeVisible();
  expect(queries.some((query) => query.includes("subject:folk"))).toBe(true);
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
    { identifier: "aha-audiobook", title: "A-Ha — Complete Biography (Unabridged Audiobook)", creator: "A-Ha", subject: "audiobook", downloads: 9900, collection: ["audio_books"] },
    { identifier: "aha-interview", title: "Interview with A-Ha", creator: "A-Ha", subject: "interview", downloads: 8000, collection: ["opensource_audio"] },
    { identifier: "false-artist", title: "A Ha Llegado", creator: "Someone Else", downloads: 1, collection: ["opensource_audio"] },
  ]);

  await openCollections(page);
  await page.getByRole("button", { name: "По исполнителю", exact: true }).click();
  await expect(page.getByRole("button", { name: "По исполнителю", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("a-ha");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "«a-ha»" })).toBeVisible();
  await expect(page.getByText("Stay on These Roads", { exact: true })).toBeVisible();
  await expect(page.getByText("a-ha - Gorgon City All Four Walls", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Written by A-Ha, covered by Asteroid M", { exact: true })).toHaveCount(0);
  await expect(page.getByText("ForSaken Borders Townsfolk Music", { exact: true })).toHaveCount(0);
  await expect(page.getByText("A-Ha — Complete Biography (Unabridged Audiobook)", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Interview with A-Ha", { exact: true })).toHaveCount(0);
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
    { identifier: "talk-talk-interview", title: "Talk Talk — Interview", creator: "Talk Talk", subject: "spoken word", downloads: 5000, collection: ["opensource_audio"] },
  ]);

  await openCollections(page);
  await page.getByRole("button", { name: "По названию / жанру", exact: true }).click();
  await expect(page.getByRole("button", { name: "По названию / жанру", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByPlaceholder("Название альбома, песни или жанр").fill("Talk Talk");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "«Talk Talk»" })).toBeVisible();
  await expect(page.getByText("Spirit of Eden", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Talk Talk Various artists/ })).toBeVisible();
  await expect(page.getByText("Talk to Me", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Talking Heads", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Talk Talk — Interview", { exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "По исполнителю", exact: true }).click();
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
  await page.getByRole("button", { name: "По исполнителю", exact: true }).click();
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

test("artist search reaches subject-tagged music but excludes stray title mentions and broadcasts", async ({ page }) => {
  const creatorMatch: ArchiveDoc = {
    identifier: "alphaville-creator-match", title: "The Breathtaking Blue", creator: "Alphaville", downloads: 90, collection: ["opensource_audio"],
  };
  const titleMatch: ArchiveDoc = {
    identifier: "alphaville-title-match", title: "Alphaville - Afternoons in Utopia", creator: "", downloads: 80, collection: ["hifidelity"],
  };
  const movieTitleNoise: ArchiveDoc = {
    identifier: "alphaville-movie-noise", title: "Paul Misraki - 1965 - Alphaville OST", creator: "Paul Misraki", downloads: 500, collection: ["hifidelity"],
  };
  const subjectMatch: ArchiveDoc = {
    identifier: "alphaville-subject-match", title: "Big In Japan", creator: "", subject: ["Alphaville", "Big In Japan"], downloads: 70, collection: ["opensource_audio"],
  };
  const broadcastNoise: ArchiveDoc = {
    identifier: "alphaville-radio-noise", title: "Progrock for Requesters", creator: "Radio Archive", subject: ["Alphaville"], downloads: 900, collection: ["radioshowarchive"],
  };
  const popcastNoise: ArchiveDoc = {
    identifier: "alphaville-popcast-noise", title: "Loopy Popcast, May 2006", creator: "Loopy", subject: ["Alphaville"], downloads: 400, collection: ["ourmedia"],
  };
  const radioCreatorNoise: ArchiveDoc = {
    identifier: "alphaville-radio-creator-noise", title: "Programming for 7th - 21st April 2018", creator: "Hobart Radio International", subject: ["Alphaville", "Radio"], downloads: 200, collection: ["opensource_audio"],
  };
  const episodeNoise: ArchiveDoc = {
    identifier: "alphaville-episode-noise", title: "TFR Ep. 467: Alphaville", creator: "The First Run", subject: ["Alphaville"], downloads: 200, collection: ["opensource_audio"],
  };
  const exactTitleNoise: ArchiveDoc = {
    identifier: "alphaville-exact-title-noise", title: "Alphaville", creator: "LAILA ELEKTRA", subject: ["Forever Young"], downloads: 300, collection: ["opensource_audio"],
  };
  const uncreditedTitleNoise: ArchiveDoc = {
    identifier: "alphaville-uncredited-title-noise", title: "Alphaville", creator: "", subject: ["French New Wave"], downloads: 100, collection: ["opensource_audio"],
  };
  const coverSubjectNoise: ArchiveDoc = {
    identifier: "alphaville-cover-noise", title: "Interactive - Forever Young", creator: "Interactive", subject: ["Alphaville"], downloads: 500, collection: ["opensource_audio"],
  };
  const mixSubjectNoise: ArchiveDoc = {
    identifier: "alphaville-mix-noise", title: "Varios 80/90 Remember A", creator: "Man-Equinox", subject: ["Alphaville"], downloads: 250, collection: ["hifidelity"],
  };
  const noAudioSubjectNoise: ArchiveDoc = {
    identifier: "alphaville-no-audio-noise", title: "Relevans Music Alphaville Glorioso Dia", creator: "", subject: ["Alphaville"], downloads: 40, collection: ["opensource_audio"],
  };
  const queries = await archiveDocs(page, (query) => {
    if (query.includes('creator:"Alphaville"')) return [creatorMatch];
    if (query.includes('title:"Alphaville"')) return [titleMatch, movieTitleNoise, exactTitleNoise, uncreditedTitleNoise];
    if (query.includes('subject:"Alphaville"')) return [subjectMatch, broadcastNoise, popcastNoise, radioCreatorNoise, episodeNoise, exactTitleNoise, coverSubjectNoise, mixSubjectNoise, noAudioSubjectNoise];
    return [];
  }, {
    "alphaville-subject-match": {
      metadata: { title: "Big In Japan", creator: "" },
      files: [{ name: "ALPHAVILLE_-_BIG_IN_JAPAN.mp3", title: "Big In Japan", format: "VBR MP3" }],
    },
    "alphaville-cover-noise": {
      metadata: { title: "Forever Young", creator: "Interactive" },
      files: [{ name: "Interactive - Forever Young.mp3", title: "Forever Young", format: "MP3" }],
    },
    "alphaville-mix-noise": {
      metadata: { title: "Varios 80/90 Remember A", creator: "Man-Equinox" },
      files: [
        { name: "Alphaville - Big In Japan.mp3", title: "Big In Japan", creator: "Alphaville", format: "MP3" },
        { name: "A-Ha - Take On Me.mp3", title: "Take On Me", creator: "A-Ha", format: "MP3" },
      ],
    },
  });

  await openCollections(page);
  await page.getByRole("button", { name: "По исполнителю", exact: true }).click();
  await page.getByLabel("Запрос для поиска офлайн-музыки").fill("Alphaville");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "«Alphaville»" })).toBeVisible();
  await expect(page.getByText("The Breathtaking Blue", { exact: true })).toBeVisible();
  await expect(page.getByText("Alphaville - Afternoons in Utopia", { exact: true })).toBeVisible();
  await expect(page.getByText("Big In Japan", { exact: true })).toBeVisible();
  await expect(page.getByText(/совпало в темах/).first()).toBeVisible();
  await expect(page.getByText("Paul Misraki - 1965 - Alphaville OST", { exact: true })).toHaveCount(0);
  await expect(page.getByText("LAILA ELEKTRA", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Alphaville Автор не указан/ })).toHaveCount(0);
  await expect(page.getByText("Progrock for Requesters", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Loopy Popcast, May 2006", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Programming for 7th - 21st April 2018", { exact: true })).toHaveCount(0);
  await expect(page.getByText("TFR Ep. 467: Alphaville", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Interactive - Forever Young", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Varios 80/90 Remember A", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Relevans Music Alphaville Glorioso Dia", { exact: true })).toHaveCount(0);
  expect(queries.some((query) => query.includes('subject:"Alphaville"'))).toBe(true);
});

test("visited tabs keep artist-search state and switch without page animation or navigation", async ({ page }) => {
  const docs: ArchiveDoc[] = [
    { identifier: "talk-talk-stays-put", title: "Spirit of Eden", creator: "Talk Talk", downloads: 120, collection: ["opensource_audio"] },
  ];
  const queries = await archiveDocs(page, docs);

  await openCollections(page);
  const input = page.getByLabel("Запрос для поиска офлайн-музыки");
  await input.fill("Talk Talk");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.getByText("Spirit of Eden", { exact: true })).toBeVisible();
  const queryCount = queries.length;

  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(page.locator('[data-tab-panel="discover"]')).toBeHidden();
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await expect(input).toHaveValue("Talk Talk");
  await expect(page.getByText("Spirit of Eden", { exact: true })).toBeVisible();

  await page.getByLabel("Раздел обзора").selectOption("packs");
  await page.getByLabel("Раздел обзора").selectOption("collections");
  await expect(input).toHaveValue("Talk Talk");
  await expect(page.getByText("Spirit of Eden", { exact: true })).toBeVisible();
  expect(queries).toHaveLength(queryCount);
  expect(await page.locator('[data-tab-panel="discover"]').evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
});
