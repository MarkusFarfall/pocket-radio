import { expect, test, type Page } from "@playwright/test";

async function openAsGuest(page: Page) {
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}

async function installStarter(page: Page) {
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await expect(page.getByRole("heading", { name: "Что послушаем?" })).toBeVisible();
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const { viewport, document } = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(document, `document width ${document}px should fit viewport ${viewport}px`).toBeLessThanOrEqual(viewport + 1);
}

test("development auth mode loads and password visibility is keyboard accessible", async ({ page }) => {
  const cloudRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith(".supabase.co")) cloudRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  const localLogin = page.getByLabel("Логин", { exact: true });
  const cloudLogin = page.getByLabel("Email", { exact: true });
  const localAuth = (await localLogin.count()) > 0;
  await expect(localAuth ? localLogin : cloudLogin).toBeVisible();

  const password = page.getByLabel("Пароль", { exact: true });
  const reveal = page.getByRole("button", { name: "Показать пароль" });
  await password.focus();
  await expect(reveal).toHaveJSProperty("tabIndex", 0);
  await page.keyboard.press("Tab");
  await expect(reveal).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Скрыть пароль" })).toHaveAttribute("aria-pressed", "true");
  if (localAuth) expect(cloudRequests).toEqual([]);
});

test("mobile catalog and Discover fit narrow viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAsGuest(page);
  await installStarter(page);

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Каталог", exact: true }).click();

    const search = page.locator("input[data-search]");
    await expect(search).toBeVisible();
    const searchBox = await search.boundingBox();
    expect(searchBox?.width ?? 0, `search field should span the phone width (${width}px)`).toBeGreaterThan(width - 72);

    await page.getByRole("button", { name: /Фильтры/ }).click();
    await expect(page.getByRole("button", { name: /Избранные/ })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    await page.getByRole("button", { name: "Обзор", exact: true }).click();
    const sectionSelect = page.getByLabel("Раздел обзора");
    await expect(sectionSelect).toBeVisible();
    const selectBox = await sectionSelect.boundingBox();
    expect(selectBox?.width ?? 0).toBeGreaterThan(width - 72);
    await expectNoHorizontalPageOverflow(page);
  }
});

test("desktop home hero adapts to the center column and does not clip its controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openAsGuest(page);
  await installStarter(page);

  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const hero = page.locator("[data-home-hero]");
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("button", { name: "Слушать" })).toBeVisible();
    await expect(hero.getByRole("button", { name: "Весь каталог" })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>("[data-home-hero]")!;
      const grid = document.querySelector<HTMLElement>("[data-home-feature]")!;
      const cover = hero.querySelector<HTMLElement>(".cover")!.getBoundingClientRect();
      const copy = hero.querySelector<HTMLElement>("[data-home-hero-copy]")!.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const buttons = [...hero.querySelectorAll("button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      const stats = grid.children[1].getBoundingClientRect();
      const heroBox = grid.children[0].getBoundingClientRect();
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        heroLeft: heroRect.left,
        heroRight: heroRect.right,
        coverRight: cover.right,
        copyLeft: copy.left,
        copyRight: copy.right,
        buttons,
        featureWidth: grid.clientWidth,
        sameRow: Math.abs(stats.top - heroBox.top) < 1,
      };
    });

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.coverRight).toBeLessThanOrEqual(geometry.copyLeft + 1);
    expect(geometry.copyRight).toBeLessThanOrEqual(geometry.heroRight + 1);
    for (const button of geometry.buttons) {
      expect(button.left).toBeGreaterThanOrEqual(geometry.heroLeft - 1);
      expect(button.right).toBeLessThanOrEqual(geometry.heroRight + 1);
    }

    const expectedTwoColumns = geometry.featureWidth >= 900;
    expect(geometry.sameRow).toBe(expectedTwoColumns);

    if (width >= 1280) {
      await expect(page.getByRole("button", { name: "Панель «Сейчас играет»" })).toBeDisabled();
      await expect(page.getByText("Тишина в эфире")).toHaveCount(0);
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "media") await route.abort();
    else await route.continue();
  });
  await page.getByRole("button", { name: "Слушать" }).click();
  await expect(page.getByRole("button", { name: "Панель «Сейчас играет»" })).toBeEnabled();
  await expect(page.getByText("Тишина в эфире")).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page);
});

test("Discover tabs remain reachable on tablet and a narrow desktop", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await openAsGuest(page);

  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: /Обзор/ }).click();

    const tabs = page.locator("[data-discover-tabs]");
    await expect(tabs).toBeVisible();
    await tabs.evaluate((element) => ((element as HTMLElement).scrollLeft = 0));
    const before = await tabs.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(before.scroll).toBeGreaterThan(before.client);

    await tabs.evaluate((element) => ((element as HTMLElement).scrollLeft = element.scrollWidth));
    const lastTab = page.getByRole("button", { name: "Каталоги M3U" });
    const [containerBox, tabBox] = await Promise.all([tabs.boundingBox(), lastTab.boundingBox()]);
    expect(containerBox).not.toBeNull();
    expect(tabBox).not.toBeNull();
    expect(tabBox!.x).toBeGreaterThanOrEqual(containerBox!.x - 1);
    expect(tabBox!.x + tabBox!.width).toBeLessThanOrEqual(containerBox!.x + containerBox!.width + 1);
    await expectNoHorizontalPageOverflow(page);
  }
});

test("mobile navigation, statistics, settings, and full player stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openAsGuest(page);
  await installStarter(page);

  const mainTabs: [string, RegExp][] = [
    ["Каталог", /Каталог/],
    ["Плейлисты", /Плейлисты/],
    ["Обзор", /Обзор/],
  ];
  for (const [nav, heading] of mainTabs) {
    await page.getByRole("button", { name: nav, exact: true }).click();
    await expect(page.locator("main h1").first()).toContainText(heading);
    await expectNoHorizontalPageOverflow(page);
  }

  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Статистика/ }).click();
  await expect(page.locator("main h1").first()).toHaveText("Статистика");
  await expectNoHorizontalPageOverflow(page);

  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Настройки/ }).click();
  await expect(page.locator("main h1").first()).toHaveText("Настройки");
  await expectNoHorizontalPageOverflow(page);

  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "media") await route.abort();
    else await route.continue();
  });
  await page.locator('button[aria-label="Играть"]').first().click();
  const miniPlayer = page.getByRole("button", { name: "Открыть плеер" });
  await expect(miniPlayer).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  await miniPlayer.click();
  await expect(page.getByRole("button", { name: "Свернуть" })).toBeVisible();
  await expect(page.locator(".player-mobile")).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await page.getByRole("button", { name: "Свернуть" }).click();
  await expect(miniPlayer).toBeVisible();
});
