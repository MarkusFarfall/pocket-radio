import { expect, test } from "@playwright/test";

test("network status verifies probe content, then recovers while navigator.onLine stays false", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("pr.guest", "1");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });

  let mode: "offline" | "portal" | "online" = "offline";
  let resolvePortal!: () => void;
  let resolveOnline!: () => void;
  const portalServed = new Promise<void>((resolve) => (resolvePortal = resolve));
  const onlineServed = new Promise<void>((resolve) => (resolveOnline = resolve));
  await page.route("**/connectivity.txt**", async (route) => {
    if (mode === "offline") return route.abort();
    if (mode === "portal") {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html>Sign in to the network</html>" });
      resolvePortal();
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/plain", body: "pocket-radio-online\n" });
    resolveOnline();
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await expect(page.getByText("Офлайн", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // HTTP 200 от captive portal не должен приниматься за доступ в интернет.
  mode = "portal";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await portalServed;
  await expect(page.getByText("Офлайн", { exact: true })).toBeVisible();
  await expect(page.getByText("Онлайн", { exact: true })).toHaveCount(0);

  // Возвращаем правильный heartbeat, не меняя navigator.onLine и не посылая событие online.
  mode = "online";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await onlineServed;
  await expect(page.getByText("Онлайн", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
});
