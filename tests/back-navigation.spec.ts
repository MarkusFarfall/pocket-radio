import { expect, test, type Page } from "@playwright/test";

/** Системная «назад» на телефоне должна работать внутри приложения, а не закрывать его. */

interface Probe {
  __prAlive?: string;
}

async function boot(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as Probe).__prAlive = "same-document";
  });
}

const back = (page: Page) => page.evaluate(() => history.back());
const forward = (page: Page) => page.evaluate(() => history.forward());
const alive = (page: Page) => page.evaluate(() => (window as unknown as Probe).__prAlive ?? null);
const visibleTabs = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-tab-panel]")]
      .filter((panel) => !panel.hasAttribute("hidden"))
      .map((panel) => panel.getAttribute("data-tab-panel"))
  );
const tabButton = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}(?: \\d)?$`) }).first();

test("«назад» возвращает предыдущий раздел и не перезагружает приложение", async ({ page }) => {
  await boot(page);
  await tabButton(page, "Каталог").click();
  await tabButton(page, "Обзор").click();
  await expect.poll(() => visibleTabs(page)).toEqual(["discover"]);

  await back(page);
  await expect.poll(() => visibleTabs(page)).toEqual(["catalog"]);
  expect(await alive(page)).toBe("same-document");

  await back(page);
  await expect.poll(() => visibleTabs(page)).toEqual(["home"]);
  expect(await alive(page)).toBe("same-document");

  await forward(page);
  await expect.poll(() => visibleTabs(page)).toEqual(["catalog"]);
  expect(await alive(page)).toBe("same-document");
});

test("«назад» закрывает окно и не меняет раздел", async ({ page }) => {
  await boot(page);
  await tabButton(page, "Каталог").click();
  await page.getByRole("button", { name: "Добавить станцию" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await back(page);
  await expect(dialog).toBeHidden();
  await expect.poll(() => visibleTabs(page)).toEqual(["catalog"]);
  expect(await alive(page)).toBe("same-document");

  // Второе нажатие возвращает предыдущий раздел.
  await back(page);
  await expect.poll(() => visibleTabs(page)).toEqual(["home"]);
  expect(await alive(page)).toBe("same-document");
});

test("закрытое крестиком окно не съедает нажатие «назад»", async ({ page }) => {
  await boot(page);
  await tabButton(page, "Каталог").click();
  await page.getByRole("button", { name: "Добавить станцию" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await back(page);
  await expect.poll(() => visibleTabs(page)).toEqual(["home"]);
  expect(await alive(page)).toBe("same-document");
});

test("окно, закрытое переходом в другой раздел, не съедает нажатие «назад»", async ({ page }) => {
  await boot(page);
  await tabButton(page, "Обзор").click();
  await expect.poll(() => visibleTabs(page)).toEqual(["discover"]);

  if (await page.getByLabel("Раздел обзора").isVisible()) await page.getByLabel("Раздел обзора").selectOption("collections");
  await page.getByRole("button", { name: "Добавить станцию" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Смена подраздела обзора закрывает открытое окно (событие pr:tabchange).
  await page.getByLabel("Раздел обзора").selectOption("packs");
  await expect(page.getByRole("dialog")).toBeHidden();

  await back(page);
  await expect.poll(() => visibleTabs(page)).toEqual(["home"]);
  expect(await alive(page)).toBe("same-document");
});

test("на корневом экране первая «назад» остаётся в приложении и объясняет выход", async ({ page }) => {
  await boot(page);
  await expect.poll(() => visibleTabs(page)).toEqual(["home"]);

  await back(page);
  await expect(page.getByText("Нажмите «назад» ещё раз, чтобы закрыть приложение")).toBeVisible();
  expect(await alive(page)).toBe("same-document");
  await expect.poll(() => visibleTabs(page)).toEqual(["home"]);
});
