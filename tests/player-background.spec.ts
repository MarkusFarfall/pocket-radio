import { expect, test, type Page } from "@playwright/test";

async function openAsGuest(page: Page) {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("pr.guest", "1");
    const media = HTMLMediaElement.prototype;
    media.load = function () {
      try {
        Object.defineProperty(this, "ended", { configurable: true, value: false });
      } catch {
        /* native property may be non-configurable in some browsers */
      }
    };
    media.play = function () {
      const w = window as Window & { __radioPlayCount?: number; __radioLastMedia?: HTMLAudioElement };
      w.__radioPlayCount = (w.__radioPlayCount ?? 0) + 1;
      w.__radioLastMedia = this as HTMLAudioElement;
      queueMicrotask(() => this.dispatchEvent(new Event("playing")));
      return Promise.resolve();
    };
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await expect(page.getByRole("heading", { name: "Что послушаем?" })).toBeVisible();
}

test("a finite playlist track advances after the browser defers its ended event in background", async ({ page }) => {
  await openAsGuest(page);
  const state = await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    const { db } = await import("/src/lib/db.ts");
    await db.stations.clear();
    const makeTrack = (id: string, name: string, kind: "vod" | "http" = "vod") => ({
      id: `pli:${id}`,
      name,
      url: `https://example.test/${id}.mp3`,
      kind,
      genre: "Музыка",
      mood: "",
      city: "",
      tags: [],
      icon: "",
      note: "",
      bitrate: 128,
      favorite: false,
      createdAt: 1,
      updatedAt: 1,
      plays: 0,
      totalSeconds: 0,
    });
    const first = makeTrack("background-first", "Background first", "http");
    const second = makeTrack("background-second", "Background second");
    player.pin([first, second]);
    await player.play(first, [first.id, second.id], { sourcePlaylistId: "background-test" });
    const audio = document.querySelector("audio") ?? (window as Window & { __playerAudio?: HTMLAudioElement }).__playerAudio;
    // Engine creates its media element with `new Audio()`; the play spy captures it below.
    const media = audio ?? (window as Window & { __radioLastMedia?: HTMLAudioElement }).__radioLastMedia;
    if (!media) throw new Error("Player audio element was not captured");
    Object.defineProperty(media, "ended", { configurable: true, value: false });
    Object.defineProperty(media, "duration", { configurable: true, value: 180 });

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    // Simulate the browser suspending the page before it dispatches `ended`.
    Object.defineProperty(media, "ended", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      stationId: player.getState().station?.id,
      status: player.getState().status,
      playCount: (window as Window & { __radioPlayCount?: number }).__radioPlayCount ?? 0,
    };
  });

  expect(state.stationId).toBe("pli:background-second");
  expect(state.status).toBe("playing");
  expect(state.playCount).toBeGreaterThanOrEqual(2);
});

test("restores the last playlist track, queue, and position after a PWA reload", async ({ page }) => {
  await openAsGuest(page);
  await page.evaluate(async () => {
    const { db, setSetting } = await import("/src/lib/db.ts");
    await Promise.all([db.stations.clear(), db.settings.clear()]);
    const playlist = {
      id: "reload-playlist",
      name: "Reload Mix",
      desc: "",
      items: [
        { id: "reload-first", title: "First podcast", url: "https://example.test/first.mp3", kind: "vod", addedAt: 1 },
        { id: "reload-second", title: "Second podcast", url: "https://example.test/second.mp3", kind: "vod", addedAt: 2 },
      ],
      createdAt: 1,
      updatedAt: 2,
    };
    await db.settings.put({ key: "pl:reload-playlist", value: playlist });
    await setSetting("pp:pli:reload-second", { position: 87, updatedAt: 10 });
    await setSetting("lastStationId", "pli:reload-second");
    await setSetting("lastQueue", ["pli:reload-first", "pli:reload-second"]);
    await setSetting("lastSourcePlaylistId", "reload-playlist");
  });

  await page.reload();
  await page.waitForFunction(async () => {
    const { player } = await import("/src/lib/player.ts");
    return player.getState().station?.id === "pli:reload-second";
  });
  const restored = await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    return {
      stationId: player.getState().station?.id,
      status: player.getState().status,
      sourcePlaylistId: player.getState().sourcePlaylistId,
      queue: player.queueItems().map((station) => station.name),
      position: player.getTime().position,
    };
  });

  expect(restored).toEqual({
    stationId: "pli:reload-second",
    status: "paused",
    sourcePlaylistId: "reload-playlist",
    queue: ["First podcast", "Second podcast"],
    position: 87,
  });
});
