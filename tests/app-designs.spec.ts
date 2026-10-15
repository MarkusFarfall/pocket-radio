import { expect, test, type Page } from "@playwright/test";

type Design = "classic" | "editorial" | "library" | "console";
const designs: Design[] = ["editorial", "library", "console"];
async function open(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}
async function apply(page: Page, design: Design) {
  await page.evaluate(async id => (await import("/src/lib/appDesign.ts")).applyAppDesign(id), design);
  await expect(page.locator("html")).toHaveAttribute("data-app-design", design);
}
async function nav(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("button", { name: new RegExp(`^${name}(?: \\d)?$`) }).click();
}
async function fit(page: Page) {
  const geometry = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const shell = document.querySelector("#app-shell")!;
    const active = document.querySelector('[data-tab-panel]:not([hidden])')!;
    return [document.documentElement, main, shell, active].map(e => ({ node: e.className, overflow: e.scrollWidth - e.clientWidth }));
  });
  for (const g of geometry) expect(g.overflow, String(g.node)).toBeLessThanOrEqual(1);
  const add = page.getByRole("button", { name: "Добавить станцию", exact: true });
  if (await add.count() === 1) {
    const r = await add.boundingBox();
    expect(r!.x).toBeGreaterThanOrEqual(0);
    expect(r!.x + r!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
}
async function appearance(page: Page) {
  await nav(page, "Настройки");
  if (!(await page.getByRole("button", { name: "Стиль", exact: true }).isVisible())) {
    await page.getByRole("navigation", { name: "Разделы настроек" }).getByRole("button", { name: /Оформление/ }).click();
  }
  await page.getByRole("button", { name: "Стиль", exact: true }).click();
}

for (const width of [320, 768, 1024, 1440]) {
  test(`all app designs navigate every page and fit ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await open(page, width);
    await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
    for (const design of designs) {
      await apply(page, design);
      await nav(page, "Главная");
      await expect(page.locator(`.experience-home-${design}`)).toBeVisible();
      await fit(page);
      for (const [label, id] of [["Каталог", "catalog"], ["Плейлисты", "playlists"], ["Обзор", "discover"], ["Статистика", "stats"], ["Настройки", "settings"]]) {
        await nav(page, label);
        await expect(page.locator(`[data-tab-panel="${id}"]`)).toBeVisible();
        if (id !== "settings") await expect(page.locator(`[data-tab-panel="${id}"] h1`).first()).toHaveText(label);
        await fit(page);
      }
      await appearance(page);
      await expect(page.getByRole("button", { name: /^Интерфейс «/ })).toHaveCount(4);
      for (const card of await page.locator(".app-design-card").all()) {
        await card.scrollIntoViewIfNeeded();
        const box = await card.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(await card.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
      }
      await fit(page);
    }
    expect(errors).toEqual([]);
  });
}

test("designs change geometry, not only colors, and keep catalog modes separate", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  const layouts: string[] = [];
  for (const design of designs) {
    await apply(page, design);
    layouts.push(await page.locator("#app-shell > .app-layout-grid").evaluate(e => getComputedStyle(e).gridTemplateAreas));
    await nav(page, "Каталог");
    const selector = design === "console" ? ".catalog-list" : ".catalog-grid";
    await expect(page.locator(selector)).toBeVisible();
    if (design === "editorial") expect(await page.locator(".station-card").first().evaluate(e => getComputedStyle(e).display)).toBe("grid");
    if (design === "library") expect(await page.locator(".station-card").first().evaluate(e => getComputedStyle(e).display)).not.toBe("grid");
    if (design === "console") await expect(page.getByRole("complementary", { name: "Текущая очередь" })).toBeVisible();
  }
  expect(new Set(layouts).size).toBe(3);
  await page.getByRole("button", { name: "Плитка", exact: true }).click();
  await expect(page.locator(".catalog-grid")).toBeVisible();
  await apply(page, "library");
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await apply(page, "console");
  await expect(page.locator(".catalog-grid")).toBeVisible();
  await apply(page, "editorial");
  await expect(page.locator(".catalog-grid")).toBeVisible();
  await apply(page, "library");
  await expect(page.locator(".catalog-list")).toBeVisible();
});

test("keyboard selection preserves mounted pages, Classic preferences, accessibility and reload state", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  const original = await page.evaluate(async () => {
    const ui = await import("/src/lib/uiStyle.ts");
    const theme = await import("/src/lib/themes.ts");
    const player = await import("/src/lib/playerAppearance.ts");
    ui.setUiPrefs({ radius: "round", font: "serif", scale: 112, reduceMotion: true });
    theme.setThemePrefs({ mode: "dark", dark: "charcoal", accent: "#ce5079" });
    player.applyPlayerTemplate("vinyl");
    localStorage.setItem("radio.equalizer.v1", "unchanged-sentinel");
    return { ui: ui.getUiPrefs(), theme: theme.getThemePrefs(), player: player.getPlayerAppearance() };
  });
  await nav(page, "Каталог");
  const search = page.locator('[data-tab-panel="catalog"] input[data-search]');
  await search.fill("SomaFM");
  await appearance(page);
  const portal = await page.locator(".global-page-host").elementHandle();
  for (const name of ["Редакция", "Медиатека", "Пульт", "Классика"]) {
    const card = page.getByRole("button", { name: `Интерфейс «${name}»` });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(card).toBeFocused();
    expect(await portal!.evaluate(e => e === document.querySelector(".global-page-host") && e.isConnected)).toBe(true);
    await nav(page, "Каталог");
    await expect(search).toHaveValue("SomaFM");
    await nav(page, "Настройки");
    await expect(card).toHaveAttribute("aria-pressed", "true");
  }
  const restored = await page.evaluate(async () => ({ ui: (await import("/src/lib/uiStyle.ts")).getUiPrefs(), theme: (await import("/src/lib/themes.ts")).getThemePrefs(), player: (await import("/src/lib/playerAppearance.ts")).getPlayerAppearance() }));
  expect(restored).toEqual(original);
  expect(await page.evaluate(() => localStorage.getItem("radio.equalizer.v1"))).toBe("unchanged-sentinel");
  await page.getByRole("button", { name: "Интерфейс «Медиатека»" }).click();
  await page.reload();
  await expect(page.locator("#app-shell")).toHaveAttribute("data-app-layout", "library");
  const a11y = await page.evaluate(async () => (await import("/src/lib/uiStyle.ts")).getUiPrefs());
  expect(a11y.reduceMotion).toBe(true);
  expect(a11y.scale).toBe(original.ui.scale);
  await apply(page, "classic");
  expect(await page.evaluate(async () => (await import("/src/lib/playerAppearance.ts")).getPlayerAppearance())).toEqual(original.player);
});

async function toneQueue(page: Page) {
  await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    const { draftToStation } = await import("/src/lib/db.ts");
    const sr = 8000, samples = sr * 120;
    const buffer = new ArrayBuffer(44 + samples * 2), v = new DataView(buffer);
    const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) v.setUint8(at + i, value.charCodeAt(i)); };
    text(0, "RIFF"); v.setUint32(4, 36 + samples * 2, true); text(8, "WAVE"); text(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, "data"); v.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 3000, true);
    const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    const stations = ["Первый трек", "Следующий трек"].map(name => ({ ...draftToStation({ name, url: "https://example.test/test.wav", kind: "vod" }), url }));
    player.pin(stations);
    await player.play(stations[0], stations.map(s => s.id), { sourcePlaylistId: "local-test-playlist", sourceContext: { kind: "playlist", title: "Проверка очереди" } });
  });
}
for (const width of [320, 1440]) {
  test(`playback, queue, fullscreen and modal state survive shell switches at ${width}px`, async ({ page }) => {
    await open(page, width);
    await toneQueue(page);
    await expect.poll(() => page.evaluate(async () => (await import("/src/lib/player.ts")).player.getState().status)).toBe("playing");
    await expect.poll(() => page.evaluate(async () => (await import("/src/lib/player.ts")).player.getTime().position)).toBeGreaterThan(0);
    const baseline = await page.evaluate(async () => {
      const { player } = await import("/src/lib/player.ts"); const p = player.getState();
      return { queue: p.queue, station: p.station?.id, source: p.sourcePlaylistId, time: player.getTime().position };
    });
    for (const design of [...designs, "classic"] as Design[]) {
      await apply(page, design);
      const compact = page.locator(width < 1024 ? ".player-mini" : ".player-dock");
      await expect(compact).toBeVisible();
      if (design !== "classic") await fit(page);
      const p = await page.evaluate(async () => {
        const { player } = await import("/src/lib/player.ts"); const s = player.getState();
        return { queue: s.queue, station: s.station?.id, source: s.sourcePlaylistId, status: s.status, time: player.getTime().position };
      });
      expect(p).toMatchObject({ queue: baseline.queue, station: baseline.station, source: baseline.source, status: "playing" });
      expect(p.time).toBeGreaterThanOrEqual(baseline.time);
    }
    await page.getByRole("button", { name: width < 1024 ? "Открыть плеер" : "Открыть плеер на весь экран", exact: true }).click();
    for (const design of designs) {
      await apply(page, design);
      await expect(page.getByRole("button", { name: "Свернуть плеер", exact: true })).toBeVisible();
      await expect(page.locator(".player-experience:not(.ex-preview)")).toBeVisible();
      await expect(page.getByRole("button", { name: "Эквалайзер", exact: true }).last()).toBeVisible();
    }
    await page.getByRole("button", { name: "Свернуть плеер", exact: true }).click();
    if (width >= 1280) {
      await page.getByRole("complementary", { name: "Текущая очередь" }).getByRole("button", { name: /Следующий трек/ }).click();
      expect(await page.evaluate(async () => (await import("/src/lib/player.ts")).player.getState().sourcePlaylistId)).toBe(baseline.source);
    }
    await page.getByRole("button", { name: "Добавить станцию", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const field = dialog.locator("input").first();
    await field.fill("Черновик");
    for (const design of ["editorial", "library", "classic"] as Design[]) {
      await apply(page, design);
      await expect(dialog).toBeVisible();
      await expect(field).toHaveValue("Черновик");
    }
  });
}

for (const design of designs) {
  test(`${design} empty home offers real setup and survives reload`, async ({ page }) => {
    await open(page, 390);
    await apply(page, design);
    await expect(page.locator(`.experience-home-${design}`)).toBeVisible();
    await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
    await nav(page, "Каталог");
    await expect(page.locator(".station-card, .station-line").first()).toBeVisible();
    await page.reload();
    await expect(page.locator("#app-shell")).toHaveAttribute("data-app-layout", design);
    await nav(page, "Каталог");
    await expect(page.locator(".station-card, .station-line").first()).toBeVisible();
  });
}

test("invalid persisted identity safely falls back and settings search opens advanced controls", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pr.appDesign", "not-a-design");
    localStorage.setItem("pr.appDesign.previous", '{"ui":{},"theme":{"mode":"bad"},"player":{}}');
    localStorage.setItem("pr.ui", '{"scale":"invalid","font":"invalid","reduceMotion":"no"}');
  });
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-app-design", "classic");
  await appearance(page);
  await expect(page.locator(".design-advanced")).not.toHaveAttribute("open", "");
  await page.getByRole("textbox", { name: "Поиск по настройкам" }).fill("Размер интерфейса");
  await page.getByRole("list", { name: "Результаты поиска" }).getByRole("button").first().click();
  await expect(page.locator(".design-advanced")).toHaveAttribute("open", "");
  await apply(page, "console");
  await page.getByRole("textbox", { name: "Поиск по настройкам" }).fill("Сбросить оформление");
  await page.getByRole("list", { name: "Результаты поиска" }).getByRole("button").first().click();
  await page.locator('[data-row="Сбросить оформление"]').getByRole("button", { name: "Сбросить" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-app-design", "classic");
  expect(await page.evaluate(() => [localStorage.getItem("pr.appDesign"), localStorage.getItem("pr.appDesign.previous")])).toEqual([null, null]);
});

test("nested design previews retain their own layouts in every outer shell", async ({ page }) => {
  await open(page);
  await appearance(page);
  const expected = new Map<string, string>();
  for (const outer of ["classic", ...designs] as Design[]) {
    await apply(page, outer);
    for (const inner of designs) {
      const grid = page.locator(`.preview-design-${inner} .app-layout-grid`);
      const geometry = await grid.evaluate(e => {
        const s = getComputedStyle(e);
        return `${s.gridTemplateAreas}/${s.gridTemplateColumns}`;
      });
      if (outer === "classic") expected.set(inner, geometry);
      else expect(geometry).toBe(expected.get(inner));
    }
  }
});

test("populated playlists, details and statistics fit every design on phone and desktop", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await page.evaluate(async () => {
    const { db, draftToStation } = await import("/src/lib/db.ts");
    const { createPlaylist, stationToItem } = await import("/src/lib/playlists.ts");
    const stations = ["Вечерняя музыка и невероятно длинное название композиции", "Вторая композиция"].map((name, i) => draftToStation({ name, url: `https://example.test/${i}.wav`, kind: "vod" }));
    await db.stations.bulkPut(stations);
    await createPlaylist("Моя вечерняя коллекция — музыка для долгих прогулок", stations.map(stationToItem));
    const now = Date.now();
    await db.sessions.add({ stationId: stations[0].id, stationName: stations[0].name, genre: "Джаз", mood: "", kind: "vod", startedAt: now - 3_600_000, endedAt: now, seconds: 3600, offline: true, city: "" });
  });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const design of designs) {
      await apply(page, design);
      await nav(page, "Плейлисты");
      await expect(page.locator(".playlist-card")).toBeVisible();
      await fit(page);
      await page.locator(".playlist-card-copy").click();
      await expect(page.locator(".playlist-detail-header")).toBeVisible();
      await fit(page);
      await page.getByRole("button", { name: "Все плейлисты", exact: true }).click();
      await nav(page, "Статистика");
      await expect(page.getByTestId("stats-total-time")).toHaveText("1 ч 0 м");
      await fit(page);
    }
  }
});
