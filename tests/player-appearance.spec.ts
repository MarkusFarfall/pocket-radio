import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PLAYER_APPEARANCE, PLAYER_TEMPLATES, matchPlayerTemplate, normalizePlayerAppearance } from "../src/lib/playerAppearance";

test("player appearance migrates old preferences and rejects malformed values", () => {
  expect(normalizePlayerAppearance({ layout: "vinyl", motion: "signal", colorWash: false })).toEqual({ skin: "classic", layout: "vinyl", motion: "signal", colorWash: false });
  for (const bad of [null, [], "vinyl", 4, { skin: "invalid", layout: "bad", motion: "oops", colorWash: "no" }]) expect(normalizePlayerAppearance(bad)).toEqual(DEFAULT_PLAYER_APPEARANCE);
  for (const template of PLAYER_TEMPLATES) {
    expect(matchPlayerTemplate(normalizePlayerAppearance(template.prefs))?.id).toBe(template.id);
    expect(matchPlayerTemplate({ ...template.prefs, colorWash: !template.prefs.colorWash })).toBeUndefined();
  }
});

async function openApp(page: Page, width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}

async function settings(page: Page) {
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Настройки/ }).click();
  await page.getByRole("navigation", { name: "Разделы настроек" }).getByRole("button", { name: /Оформление/ }).click();
}

async function playTone(page: Page) {
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
    const station = { ...draftToStation({ name: "Очень длинное название любимой композиции — вечерний эфир Pocket Radio", url: "https://example.test/tone.wav", kind: "vod" }), url };
    player.pin([station]);
    await player.play(station);
  });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test("style settings offer six keyboard-selectable templates, keep other preferences and persist custom edits", async ({ page }) => {
  await openApp(page);
  await settings(page);
  await page.getByRole("button", { name: "Стиль", exact: true }).click();
  await page.getByRole("button", { name: /Шаблоны плеера/ }).click();
  const cards = page.getByRole("button", { name: /^Шаблон «/ });
  await expect(cards).toHaveCount(6);
  const before = await page.evaluate(() => ({ ui: localStorage.getItem("pr.ui"), eq: localStorage.getItem("radio.equalizer.v1"), palette: document.documentElement.style.getPropertyValue("--accent") }));
  const vinyl = page.getByRole("button", { name: "Шаблон «Тёплый винил»" });
  await vinyl.focus(); await page.keyboard.press("Enter");
  await expect(vinyl).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".template-showcase .player-template-preview")).toHaveClass(/player-skin-vinyl/);
  await page.getByRole("button", { name: "Компьютер", exact: true }).click();
  await expect(page.locator(".template-showcase .player-template-preview")).toHaveClass(/preview-desktop/);
  await page.getByRole("button", { name: /Без движения/ }).click();
  await expect(page.getByText("С вашими настройками", { exact: true })).toBeVisible();
  await expect(vinyl).toHaveAttribute("aria-pressed", "false");
  await noOverflow(page);
  const after = await page.evaluate(() => ({ ui: localStorage.getItem("pr.ui"), eq: localStorage.getItem("radio.equalizer.v1"), palette: document.documentElement.style.getPropertyValue("--accent") }));
  expect(after).toEqual(before);
  await page.reload();
  expect(await page.evaluate(async () => (await import("/src/lib/playerAppearance.ts")).getPlayerAppearance())).toMatchObject({ skin: "vinyl", motion: "none", layout: "vinyl" });
  await settings(page);
  await page.getByRole("button", { name: "По умолчанию", exact: true }).click();
  await expect(page.getByRole("button", { name: "Шаблон «Классика»" })).toHaveAttribute("aria-pressed", "true");
});

for (const [width, height] of [[320, 568], [390, 844], [768, 900], [1280, 800]]) {
  test(`all six player templates preserve controls and fit ${width}×${height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openApp(page, width, height);
    await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
    await expect(page.getByRole("heading", { name: "Что послушаем?" })).toBeVisible();
    await playTone(page);
    await page.getByRole("button", { name: width < 1024 ? "Открыть плеер" : "Открыть плеер на весь экран", exact: true }).click();
    const full = page.locator(".player-mobile:visible, .player-desktop:visible, .player-experience:not(.ex-preview)");
    for (const { id } of PLAYER_TEMPLATES) {
      await page.evaluate(async (id) => (await import("/src/lib/playerAppearance.ts")).applyPlayerTemplate(id), id);
      await expect(full).toHaveClass(new RegExp(`player-skin-${id}`));
      await expect(full.getByRole("heading", { name: /Очень длинное название/ })).toBeVisible();
      await expect(full.getByRole("button", { name: "Эквалайзер", exact: true })).toBeVisible();
      await expect(full.getByRole("slider").first()).toBeVisible();
      const pause = full.getByRole("button", { name: "Пауза", exact: true });
      await pause.scrollIntoViewIfNeeded();
      const box = await pause.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await noOverflow(page);
      const overflow = await full.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const compact = page.locator(width < 1024 ? ".player-mini" : ".player-dock");
      await expect(compact).toHaveClass(new RegExp(`player-skin-${id}`));
    }
    await full.getByRole("button", { name: "Пауза", exact: true }).click();
    await expect(full.getByRole("button", { name: "Играть", exact: true })).toBeVisible();
    await full.getByRole("button", { name: "Играть", exact: true }).click();
    await expect(full.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("decorative motion pauses with playback and obeys both reduced-motion settings", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await page.evaluate(async () => (await import("/src/lib/playerAppearance.ts")).applyPlayerTemplate("vinyl"));
  await playTone(page);
  await page.getByRole("button", { name: "Открыть плеер", exact: true }).click();
  const full = page.locator(".player-experience:not(.ex-preview)");
  const art = full.locator(".ex-record");
  await expect(art).toHaveCSS("animation-play-state", "running");
  await full.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(art).toHaveCSS("animation-play-state", "paused");
  await full.getByRole("button", { name: "Играть", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(art).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(async () => (await import("/src/lib/uiStyle.ts")).setUiPrefs({ reduceMotion: true }));
  await expect(art).toHaveCSS("animation-name", "none");
  await page.evaluate(async () => (await import("/src/lib/uiStyle.ts")).setUiPrefs({ reduceMotion: false }));
  await page.evaluate(async () => (await import("/src/lib/playerAppearance.ts")).setPlayerAppearance({ motion: "none" }));
  await expect(art).toHaveCSS("animation-name", "none");
});

test("templates change actual composition, not just palette, and all retain EQ and actions", async ({ page }) => {
  await openApp(page, 1280, 1000);
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await playTone(page);
  await page.getByRole("button", { name: "Открыть плеер на весь экран", exact: true }).click();
  const full = page.locator(".player-experience:not(.ex-preview)");
  const structures = { vinyl: "turntable", studio: "cassette", neon: "terminal", paper: "poster", aurora: "cinema" } as const;
  for (const [id, part] of Object.entries(structures)) {
    await page.evaluate(async (id) => (await import("/src/lib/playerAppearance.ts")).applyPlayerTemplate(id), id);
    await expect(full).toHaveAttribute("data-experience", id);
    await expect(full.locator(`[data-part="${part}"]`)).toBeVisible();
    const art = await full.locator(`[data-part="${part}"]`).boundingBox();
    const controls = await full.locator('[data-part="controls"]').boundingBox();
    if (id === "vinyl" || id === "studio") expect(controls!.x).toBeGreaterThan(art!.x + art!.width);
    if (id === "neon") {
      const queue = await full.locator('[data-part="queue"]').boundingBox();
      expect(queue!.x).toBeGreaterThan(art!.x + art!.width);
      expect(controls!.y).toBeGreaterThan(art!.y + art!.height);
    }
    if (id === "paper") {
      const copy = await full.locator('[data-part="copy"]').boundingBox();
      expect(art!.x).toBeGreaterThan(copy!.x + copy!.width);
    }
    if (id === "aurora") {
      const root = await full.boundingBox();
      expect(art!.width / root!.width).toBeGreaterThan(.95);
      expect(controls!.y).toBeGreaterThan(art!.y + art!.height - 50);
    }
    await full.getByRole("button", { name: "Эквалайзер", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Эквалайзер", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Эквалайзер", exact: true })).toBeHidden();
    await full.getByRole("button", { name: "Ещё", exact: true }).click();
    await expect(page.getByRole("button", { name: "Поделиться ссылкой", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Действия", exact: true }) }).getByRole("button", { name: /Таймер сна/ })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("settings previews render the real layouts and fit narrow desktop columns", async ({ page }) => {
  await openApp(page);
  await settings(page);
  await page.getByRole("button", { name: "Стиль", exact: true }).click();
  await page.getByRole("button", { name: /Шаблоны плеера/ }).click();
  for (const [id, part] of Object.entries({ vinyl: "turntable", studio: "cassette", neon: "terminal", paper: "poster", aurora: "cinema" })) {
    await expect(page.locator(`.player-template-card .experience-${id} [data-part="${part}"]`)).toBeVisible();
  }
  await page.getByRole("button", { name: "Шаблон «Кассетник»" }).click();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const showcase = page.locator(".template-showcase");
    const thumb = showcase.locator(".experience-thumbnail");
    await expect.poll(async () => (await thumb.boundingBox())?.width ?? 0).toBeGreaterThan(140);
    const scale = await showcase.locator(".ex-preview-stage").evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(scale).toBeGreaterThan(.1);
    await noOverflow(page);
    expect(await showcase.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }
});
