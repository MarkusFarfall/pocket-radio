import { expect, test, type Page } from "@playwright/test";
import type { AppDesign } from "../src/lib/appDesign";
const designs: AppDesign[] = ["panorama", "focus", "atelier", "nocturne", "editorial", "library", "console"];
const full = (page: Page) => page.locator(".app-player-experience:not(.ap-preview)");
const state = (page: Page) => page.evaluate(async () => {
  const { player } = await import("/src/lib/player.ts");
  const p = player.getState();
  return { id: p.station?.id, queue: p.queue, source: p.sourcePlaylistId, status: p.status, time: player.getTime().position };
});
async function apply(page: Page, id: AppDesign) {
  await page.evaluate(async id => (await import("/src/lib/appDesign.ts")).applyAppDesign(id), id);
  await expect(page.locator("html")).toHaveAttribute("data-app-design", id);
}
async function boot(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}
async function seed(page: Page) {
  await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    const { draftToStation, db } = await import("/src/lib/db.ts");
    const { createPlaylist } = await import("/src/lib/playlists.ts");
    const sr = 8000, samples = sr * 180, buffer = new ArrayBuffer(44 + samples * 2), v = new DataView(buffer);
    const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) v.setUint8(at + i, value.charCodeAt(i)); };
    text(0, "RIFF"); v.setUint32(4, 36 + samples * 2, true); text(8, "WAVE"); text(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, "data"); v.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 1800, true);
    const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    const stations = ["Там, где тише.", "Медленный свет", "После полуночи"].map(name => ({ ...draftToStation({ name, url: "https://example.test/test.wav", kind: "vod", genre: "Проверочный WAV · Вечерняя коллекция" }), url }));
    await db.stations.bulkPut(stations);
    const playlist = await createPlaylist("Вечерняя коллекция");
    player.pin(stations);
    await player.play(stations[0], stations.map(s => s.id), { sourcePlaylistId: playlist.id, sourceContext: { kind: "playlist", title: playlist.name } });
  });
  await expect.poll(async () => (await state(page)).status).toBe("playing");
}
async function expand(page: Page) {
  await page.getByRole("button", { name: await page.locator(".app-player-mini").count() ? "Открыть плеер" : "Открыть плеер на весь экран", exact: true }).click();
  await expect(full(page)).toBeVisible();
}
async function settings(page: Page) {
  const nav = page.getByRole("navigation", { name: "Разделы", exact: true });
  if (!await nav.getByRole("button", { name: /^Настройки/ }).isVisible()) await nav.getByRole("button", { name: "Ещё", exact: true }).click();
  await nav.getByRole("button", { name: /^Настройки/ }).click();
  const appearance = page.getByRole("navigation", { name: "Разделы настроек" }).getByRole("button", { name: /Оформление/ });
  if (await appearance.isVisible()) await appearance.click();
  await page.getByRole("button", { name: "Плеер", exact: true }).click();
}

for (const width of [320, 390, 768, 1440]) {
  test(`all seven linked players inherit app tokens and fit ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await boot(page, width); await seed(page);
    if (width === 320) await page.evaluate(async () => (await import("/src/lib/uiStyle.ts")).setUiPrefs({ scale: 125, reduceMotion: true }));
    // A saved independent skin must not leak through an application design.
    await page.evaluate(async () => (await import("/src/lib/playerAppearance.ts")).applyPlayerTemplate("vinyl"));
    for (const design of designs) {
      await apply(page, design);
      const compact = page.locator(".app-player-mini, .app-player-dock");
      await expect(compact).toHaveAttribute("data-app-player", design);
      await expect(compact).not.toHaveClass(/player-skin/);
      await expand(page);
      await expect(full(page)).toHaveAttribute("data-app-player", design);
      await expect(full(page).locator("[data-player-composition]")).toHaveAttribute("data-player-composition", design);
      expect(await page.locator(".player-scene, .ex-disc, .ex-cassette").count()).toBe(0);
      const result = await full(page).evaluate(e => {
        const app = getComputedStyle(document.documentElement), player = getComputedStyle(e);
        const tokens = ["--bg", "--surface", "--surface-2", "--ink", "--muted", "--accent", "--ui-font", "--ui-display"];
        return { tokensMatch: tokens.every(t => app.getPropertyValue(t) === player.getPropertyValue(t)), overflow: e.scrollWidth - e.clientWidth,
          outside: [...e.querySelectorAll("button,input")].filter(x => {const r=x.getBoundingClientRect();return r.width && (r.left < e.getBoundingClientRect().left-1 || r.right > e.getBoundingClientRect().right+1);}).map(x=>x.getAttribute("aria-label")||x.textContent) };
      });
      expect(result.tokensMatch).toBe(true); expect(result.overflow, design).toBeLessThanOrEqual(1); expect(result.outside, design).toEqual([]);
      await full(page).getByRole("button", { name: "Эквалайзер", exact: true }).scrollIntoViewIfNeeded();
      await expect(full(page).getByRole("button", { name: "Эквалайзер", exact: true })).toBeVisible();
      await full(page).getByRole("button", { name: "Свернуть плеер", exact: true }).click();
      await expect(full(page)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`linked players preserve live playback and working controls at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page, width); await seed(page); await apply(page, "panorama"); await expand(page);
    const baseline = await state(page);
    for (const design of designs) {
      await apply(page, design);
      const current = await state(page);
      expect(current.id).toBe(baseline.id); expect(current.queue).toEqual(baseline.queue); expect(current.source).toBe(baseline.source); expect(current.status).toBe("playing"); expect(current.time).toBeGreaterThanOrEqual(baseline.time);
      await full(page).getByRole("button", { name: "Пауза", exact: true }).click();
      await expect.poll(async () => (await state(page)).status).toBe("paused");
      await full(page).getByRole("button", { name: "Играть", exact: true }).click();
      await expect.poll(async () => (await state(page)).status).toBe("playing");
      await full(page).getByRole("button", { name: "Эквалайзер", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Эквалайзер", exact: true })).toBeVisible();
      await page.getByRole("dialog").last().getByRole("button", { name: "Закрыть", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Эквалайзер", exact: true })).toHaveCount(0);
    }
    await full(page).getByRole("button", { name: "Избранное", exact: true }).click();
    await expect(full(page).getByRole("button", { name: "Избранное", exact: true })).toHaveAttribute("aria-pressed", "true");
    await full(page).getByRole("button", { name: "Громкость", exact: true }).click();
    await expect(page.locator(".volume-pop").getByRole("slider", { name: "Громкость", exact: true })).toBeVisible();
    await full(page).getByRole("button", { name: "Громкость", exact: true }).click();
    await full(page).getByRole("region", { name: "Далее в очереди" }).getByRole("button", { name: /Медленный свет/ }).click();
    await expect(full(page).getByRole("heading", { name: "Медленный свет", exact: true })).toBeVisible();
    expect((await state(page)).source).toBe(baseline.source);
    await full(page).getByRole("button", { name: "Вернуться к плейлисту", exact: true }).click();
    await expect(page.locator(".playlist-detail-header")).toContainText("Вечерняя коллекция");
    await expect(full(page)).toHaveCount(0);
  });
}

test("player settings reflect the selected app, share its real compositions and restore Classic", async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page); await seed(page);
  await page.evaluate(async () => (await import("/src/lib/playerAppearance.ts")).applyPlayerTemplate("vinyl"));
  await settings(page);
  for (const design of designs) {
    await apply(page, design);
    await expect(page.getByText("Единый интерфейс", { exact: true })).toBeVisible();
    await expect(page.locator(".app-player-preview .app-player-experience")).toHaveAttribute("data-app-player", design);
    await expect(page.getByRole("button", { name: /Шаблон «/ })).toHaveCount(0);
    for (const format of ["Компьютер", "Телефон"]) {
      await page.getByRole("button", { name: format, exact: true }).click();
      const sizes = await page.locator(".app-player-preview").evaluate(e => {
        const stage=e.querySelector(".app-player-preview-stage")!.getBoundingClientRect(),r=e.getBoundingClientRect();
        return {left:stage.left-r.left,right:stage.right-r.right,bottom:stage.bottom-r.bottom,top:stage.top-r.top};
      });
      expect(sizes.left).toBeGreaterThanOrEqual(0);expect(sizes.top).toBeGreaterThanOrEqual(0);expect(sizes.right).toBeLessThanOrEqual(1);expect(sizes.bottom).toBeLessThanOrEqual(1);
    }
  }
  await page.reload();
  await settings(page);
  await expect(page.locator(".app-player-preview .app-player-experience")).toHaveAttribute("data-app-player", "console");
  await page.getByRole("button", { name: "Перейти в Классику для отдельного плеера", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-app-design", "classic");
  expect(await page.evaluate(async () => (await import("/src/lib/playerAppearance.ts")).getPlayerAppearance().skin)).toBe("vinyl");
  await expect(page.locator(".player-appearance-settings")).toBeVisible();
});

test("existing saved app identities immediately override obsolete player mappings without a reset", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("migration-test")) {
      localStorage.setItem("pr.appDesign", "atelier");
      localStorage.setItem("pr.playerAppearance", JSON.stringify({ skin: "vinyl", layout: "immersive", motion: "reactive", colorWash: true }));
      localStorage.setItem("migration-test", "1");
    }
  });
  await boot(page); await seed(page); await expand(page);
  await expect(full(page)).toHaveAttribute("data-app-player", "atelier");
  await expect(page.locator(".player-skin-vinyl")).toHaveCount(0);
  await page.evaluate(async () => (await import("/src/lib/themes.ts")).setThemePrefs({mode:"dark",dark:"midnight",accent:"#b5d4ff"}));
  expect(await full(page).evaluate(e => getComputedStyle(e).getPropertyValue("--accent").trim())).toBe("#b5d4ff");
  expect(await full(page).evaluate(e => getComputedStyle(e).backgroundColor)).toBe(await page.locator("body").evaluate(e => getComputedStyle(e).backgroundColor));
  await page.evaluate(async () => (await import("/src/lib/uiStyle.ts")).setUiPrefs({font:"mono"}));
  expect(await full(page).evaluate(e => getComputedStyle(e).fontFamily)).toBe(await page.locator("body").evaluate(e => getComputedStyle(e).fontFamily));
});
