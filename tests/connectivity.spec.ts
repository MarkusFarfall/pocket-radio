import { expect, test, type Route } from "@playwright/test";

test("network status verifies the app heartbeat, rejects a portal, then recovers while navigator.onLine stays false", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("pr.guest", "1");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });

  let mode: "offline" | "portal" | "online" = "offline";
  let resolvePortal!: () => void;
  let resolveOnline!: () => void;
  let resolveExternalFailures!: () => void;
  let externalFailures = 0;
  const portalServed = new Promise<void>((resolve) => (resolvePortal = resolve));
  const onlineServed = new Promise<void>((resolve) => (resolveOnline = resolve));
  let externalFailureBatch = new Promise<void>((resolve) => (resolveExternalFailures = resolve));
  const armExternalFailureBatch = () => {
    externalFailures = 0;
    externalFailureBatch = new Promise<void>((resolve) => (resolveExternalFailures = resolve));
  };
  const noteExternalProbe = () => {
    externalFailures += 1;
    if (externalFailures === 3) resolveExternalFailures();
  };
  const blockExternalProbe = async (route: Route) => {
    noteExternalProbe();
    await route.abort();
  };

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
  await page.route("https://connectivitycheck.gstatic.com/**", blockExternalProbe);
  await page.route("https://cp.cloudflare.com/**", blockExternalProbe);
  await page.route("https://connectivity-check.ubuntu.com/**", blockExternalProbe);

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await externalFailureBatch;
  await expect(page.getByText("Офлайн", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // HTTP 200 от captive portal с чужим содержимым не принимается за интернет.
  armExternalFailureBatch();
  mode = "portal";
  const portalProbe = await page.evaluate(async () => {
    const { connectivity } = await import("/src/lib/connectivity.ts");
    document.dispatchEvent(new Event("visibilitychange"));
    return connectivity.probe();
  });
  await portalServed;
  await externalFailureBatch;
  expect(portalProbe).toBe(false);
  await expect(page.getByText("Офлайн", { exact: true })).toBeVisible();
  await expect(page.getByText("Онлайн", { exact: true })).toHaveCount(0);

  // Собственный heartbeat проходит — браузерный navigator.onLine всё ещё может сообщать false.
  mode = "online";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await onlineServed;
  await expect(page.getByText("Онлайн", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // Событие offline при смене VPN само по себе больше не сбрасывает подтверждённую связь.
  const immediateStatus = await page.evaluate(async () => {
    const { connectivity } = await import("/src/lib/connectivity.ts");
    window.dispatchEvent(new Event("offline"));
    return connectivity.isOnline();
  });
  expect(immediateStatus).toBe(true);
});

test("independent connectivity probes recover when the app origin is unreachable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("pr.guest", "1");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });

  let resolveExternal!: () => void;
  const externalServed = new Promise<void>((resolve) => (resolveExternal = resolve));
  await page.route("**/connectivity.txt**", (route) => route.abort());
  await page.route("https://connectivitycheck.gstatic.com/**", async (route) => {
    await route.fulfill({ status: 204 });
    resolveExternal();
  });
  await page.route("https://cp.cloudflare.com/**", (route) => route.abort());
  await page.route("https://connectivity-check.ubuntu.com/**", (route) => route.abort());

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await externalServed;
  await expect(page.getByText("Онлайн", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  const stillOnline = await page.evaluate(async () => {
    const { connectivity } = await import("/src/lib/connectivity.ts");
    window.dispatchEvent(new Event("offline"));
    return connectivity.isOnline();
  });
  expect(stillOnline).toBe(true);
});

test("a captive portal redirect from a fallback endpoint is not counted as online", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("pr.guest", "1");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });

  let resolveRedirect!: () => void;
  const redirectServed = new Promise<void>((resolve) => (resolveRedirect = resolve));
  await page.route("**/connectivity.txt**", (route) => route.abort());
  await page.route("https://connectivitycheck.gstatic.com/**", async (route) => {
    await route.fulfill({ status: 302, headers: { location: "https://portal.example.test/login" } });
    resolveRedirect();
  });
  await page.route("https://cp.cloudflare.com/**", (route) => route.abort());
  await page.route("https://connectivity-check.ubuntu.com/**", (route) => route.abort());

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await redirectServed;
  const online = await page.evaluate(async () => {
    const { connectivity } = await import("/src/lib/connectivity.ts");
    return connectivity.probe();
  });
  expect(online).toBe(false);
  await expect(page.getByText("Офлайн", { exact: true })).toBeVisible();
});

test("a live stream still retries when navigator.onLine is false but the app heartbeat succeeds", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("pr.guest", "1");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    const media = HTMLMediaElement.prototype;
    media.load = function () {};
    media.play = function () {
      const w = window as Window & { __radioPlayCount?: number; __radioLastMedia?: HTMLAudioElement };
      w.__radioPlayCount = (w.__radioPlayCount ?? 0) + 1;
      w.__radioLastMedia = this as HTMLAudioElement;
      queueMicrotask(() => this.dispatchEvent(new Event("playing")));
      return Promise.resolve();
    };
  });
  await page.route("**/connectivity.txt**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "pocket-radio-online" }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.waitForFunction(async () => {
    const { connectivity } = await import("/src/lib/connectivity.ts");
    return connectivity.isOnline();
  });

  await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    const station = {
      id: "vpn-retry-fixture",
      name: "VPN retry fixture",
      url: "https://stream.example.test/live.mp3",
      kind: "http",
      genre: "Test",
      mood: "",
      city: "",
      tags: [],
      icon: "",
      note: "",
      bitrate: 128,
    };
    await player.play(station, [station.id]);
    const win = window as Window & { __radioLastMedia?: HTMLAudioElement };
    if (!win.__radioLastMedia) throw new Error("Player media element was not captured");
    Object.defineProperty(win.__radioLastMedia, "error", { configurable: true, value: { code: 2 } });
    win.__radioLastMedia.dispatchEvent(new Event("error"));
  });

  await expect.poll(() => page.evaluate(() => (window as Window & { __radioPlayCount?: number }).__radioPlayCount ?? 0), { timeout: 5000 }).toBeGreaterThan(1);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
});
