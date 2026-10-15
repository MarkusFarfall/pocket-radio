import { expect, test, type Page } from "@playwright/test";
import type { AppDesign as Design } from "../src/lib/appDesign";
const designs: Design[] = ["panorama", "focus", "atelier", "nocturne"];
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
for (const width of [320, 768, 1024, 1440]) {
  test(`premium interfaces navigate all pages without clipping at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await open(page, width);
    await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
    for (const design of designs) {
      await apply(page, design);
      await nav(page, "Главная");
      await expect(page.locator(`[data-premium-home="${design}"]`)).toBeVisible();
      await fit(page);
      expect(await page.locator("#app-shell > .premium-shell > .premium-header").evaluate(e => e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
      for (const [label,id] of [["Каталог","catalog"],["Плейлисты","playlists"],["Обзор","discover"],["Статистика","stats"],["Настройки","settings"]]) {
        await nav(page,label);
        await expect(page.locator(`[data-tab-panel="${id}"]`)).toBeVisible();
        await fit(page);
      }
      await appearance(page);
      await expect(page.getByRole("button", { name: /^Интерфейс «/ })).toHaveCount(8);
      for (const card of await page.locator(".premium-design-group").first().locator(".app-design-card").all()) {
        await card.scrollIntoViewIfNeeded();
        expect(await card.evaluate(e => e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
      }
      await fit(page);
    }
    expect(errors).toEqual([]);
  });
}

test("premium shells and previews have four distinct, isolated compositions", async ({ page }) => {
  await open(page);
  await appearance(page);
  const layouts = new Set<string>();
  const previews = new Map<string,string>();
  for (const outer of ["classic", ...designs, "editorial", "library", "console"] as Design[]) {
    await apply(page, outer);
    if (designs.includes(outer)) layouts.add(await page.locator("#app-shell > .premium-shell").evaluate(e => getComputedStyle(e).gridTemplateAreas));
    for (const inner of designs) {
      const value = await page.locator(`.preview-design-${inner} .app-layout-grid`).evaluate(e => {
        const s = getComputedStyle(e); return `${s.gridTemplateAreas}/${s.gridTemplateColumns}`;
      });
      if (outer === "classic") previews.set(inner,value);
      else expect(value).toBe(previews.get(inner));
    }
  }
  expect(layouts.size).toBe(4);
  await apply(page,"focus"); await nav(page,"Каталог");
  await expect(page.getByText("Каталог пуст", { exact:true })).toBeVisible();
});

test("all eight choices preserve playback, search, portal, preferences and full player", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await toneQueue(page);
  await expect.poll(() => page.evaluate(async () => (await import("/src/lib/player.ts")).player.getState().status)).toBe("playing");
  await nav(page,"Каталог");
  const search=page.locator('[data-tab-panel="catalog"] input[data-search]');
  await search.fill("SomaFM");
  await appearance(page);
  const host=await page.locator(".global-page-host").elementHandle();
  const baseline=await page.evaluate(async()=>{
    const {player}=await import("/src/lib/player.ts");const p=player.getState();
    const ui=await import("/src/lib/uiStyle.ts");ui.setUiPrefs({scale:112,reduceMotion:true});
    return {queue:p.queue,id:p.station?.id,source:p.sourcePlaylistId,ui:ui.getUiPrefs(),theme:(await import("/src/lib/themes.ts")).getThemePrefs()};
  });
  for (const name of ["Панорама","Фокус","Ателье","Ноктюрн","Редакция","Медиатека","Пульт","Классика"]) {
    const card=page.getByRole("button",{name:`Интерфейс «${name}»`});
    await card.focus();await page.keyboard.press("Enter");await expect(card).toHaveAttribute("aria-pressed","true");await expect(card).toBeFocused();
    expect(await host!.evaluate(e=>e===document.querySelector(".global-page-host") && e.isConnected)).toBe(true);
    const state=await page.evaluate(async()=>{const {player}=await import("/src/lib/player.ts");const p=player.getState();return {queue:p.queue,id:p.station?.id,source:p.sourcePlaylistId,status:p.status};});
    expect(state).toEqual({queue:baseline.queue,id:baseline.id,source:baseline.source,status:"playing"});
    await nav(page,"Каталог");await expect(search).toHaveValue("SomaFM");await nav(page,"Настройки");
  }
  expect(await page.evaluate(async()=>(await import("/src/lib/uiStyle.ts")).getUiPrefs())).toEqual(baseline.ui);
  expect(await page.evaluate(async()=>(await import("/src/lib/themes.ts")).getThemePrefs())).toEqual(baseline.theme);
  await page.getByRole("button",{name:"Открыть плеер на весь экран",exact:true}).click();
  for (const design of designs) {
    await apply(page,design);
    await expect(page.getByRole("button",{name:/^Свернуть(?: плеер)?$/,exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Эквалайзер",exact:true}).last()).toBeVisible();
  }
  await page.getByRole("button",{name:/^Свернуть(?: плеер)?$/,exact:true}).click();
  await page.reload();await expect(page.locator("#app-shell")).toHaveAttribute("data-app-layout","nocturne");
  await apply(page,"classic");
  expect(await page.evaluate(async()=>(await import("/src/lib/themes.ts")).getThemePrefs())).toEqual(baseline.theme);
});

test("premium empty states and enlarged phone controls remain usable", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page,320,740);
  await page.evaluate(async()=>(await import("/src/lib/uiStyle.ts")).setUiPrefs({scale:125,reduceMotion:true}));
  for (const design of designs) {
    await apply(page,design);
    await expect(page.getByRole("button",{name:/Быстрый старт/}).first()).toBeVisible();
    await fit(page);
    for(const label of ["Каталог","Плейлисты","Обзор","Статистика"]){await nav(page,label);await fit(page);}
    await nav(page,"Главная");
  }
  await page.getByRole("button",{name:/Быстрый старт/}).first().click();
  await toneQueue(page);
  for (const design of designs) {
    await apply(page,design);
    const mini=page.getByRole("button",{name:"Открыть плеер",exact:true});await expect(mini).toBeVisible();
    await fit(page);
    const header=page.locator("#app-shell > .premium-shell > .premium-header");
    expect(await header.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
    await mini.click();await expect(page.getByRole("button",{name:/^Свернуть(?: плеер)?$/,exact:true})).toBeVisible();
    await page.getByRole("button",{name:/^Свернуть(?: плеер)?$/,exact:true}).click();
  }
});

test("Focus filters real stations and Atelier sidebar opens the selected real playlist", async ({ page }) => {
  await open(page);
  await page.getByRole("button",{name:/Быстрый старт/}).first().click();
  await apply(page,"focus");
  await page.getByRole("textbox",{name:"Найти в своей коллекции"}).fill("SomaFM");
  await expect(page.locator(".premium-track-list > button").first()).toContainText("SomaFM");
  await page.getByRole("button",{name:"Избранное",exact:true}).click();
  await expect(page.locator(".premium-track-list > button")).toHaveCount(0);
  await page.evaluate(async()=>{const {createPlaylist}=await import("/src/lib/playlists.ts");await createPlaylist("Моя тихая коллекция");});
  await apply(page,"atelier");
  await expect(page.locator(".atelier-recent .premium-track-list > button")).toHaveCount(8);
  await page.locator(".premium-sidebar-collection").getByRole("button",{name:/Моя тихая коллекция/}).click();
  await expect(page.locator(".playlist-detail-header")).toContainText("Моя тихая коллекция");
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const design of designs){await apply(page,design);await fit(page);await expect(page.locator(".playlist-detail-header")).toContainText("Моя тихая коллекция");}
  }
});

test("premium per-design catalog modes persist across reload and decorative assets are local", async ({ page }) => {
  await open(page);
  await page.getByRole("button",{name:/Быстрый старт/}).first().click();
  for(const design of designs){
    await apply(page,design);await nav(page,"Каталог");
    await expect(page.locator(design==="focus"?".catalog-list":".catalog-grid")).toBeVisible();
    await page.getByRole("button",{name:design==="focus"?"Плитка":"Список",exact:true}).click();
  }
  await page.reload();
  for(const design of designs){await apply(page,design);await nav(page,"Каталог");await expect(page.locator(design==="focus"?".catalog-grid":".catalog-list")).toBeVisible();}
  for(const name of ["panorama","nocturne"]){const r=await page.request.get(`/designs/${name}.jpg`);expect(r.ok()).toBe(true);expect(r.headers()["content-type"]).toContain("image/jpeg");}
});
