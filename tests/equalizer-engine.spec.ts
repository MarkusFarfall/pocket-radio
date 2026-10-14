import { expect, test, type Page } from "@playwright/test";

// This suite checks the engine, not browser autoplay policy. UI gesture coverage
// is in equalizer-ui.spec.ts, with the browser's normal autoplay settings.
test.use({ launchOptions: { args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
});

async function playTone(page: Page) {
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    const eq = await import("/src/lib/equalizer.ts");
    const { draftToStation } = await import("/src/lib/db.ts");
    const sr = 8000;
    const samples = sr * 30;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const v = new DataView(buffer);
    const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) v.setUint8(at + i, value.charCodeAt(i)); };
    text(0, "RIFF"); v.setUint32(4, 36 + samples * 2, true); text(8, "WAVE"); text(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, "data"); v.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 5000, true);
    const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    if (!player.getState().equalizer.enabled) player.updateEqualizer({ ...eq.defaultEqualizerSettings(), enabled: true });
    const station = { ...draftToStation({ name: "EQ regression tone", url: "https://example.test/tone.wav", kind: "vod" }), url };
    player.pin([station]); // Just like a real playlist: catalog refresh must not remove the test source.
    await player.play(station);
  });
}

async function state(page: Page) {
  return page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    const s = player.getState();
    return { status: s.status, availability: s.equalizerAvailability, bypass: s.equalizerBypass, comparison: s.equalizerComparison };
  });
}

for (const failure of ["abort", "network", "timeout"] as const) {
  test(`worklet ${failure} failure falls back to native playback without an unhandled error`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Worklet fetches do not consistently pass through Playwright page routing.
    // Reject/stall the real loading API, as network/CSP and timeout failures do.
    await page.addInitScript((mode) => {
      AudioWorklet.prototype.addModule = () => mode === "timeout"
        ? new Promise(() => undefined)
        : Promise.reject(mode === "abort" ? new DOMException("Simulated download failure", "AbortError") : new TypeError("Failed to fetch"));
    }, failure);
    await page.goto("/");
    await playTone(page);
    await expect.poll(async () => (await state(page)).status).toBe("playing");
    expect((await state(page)).availability).toBe("unavailable");
    await playTone(page); // A failed graph must not silently mute the next source.
    await expect.poll(async () => (await state(page)).status).toBe("playing");
    expect((await state(page)).availability).toBe("unsupported");
    expect(errors).toEqual([]);
  });
}

test("missing AudioWorklet preserves the native path", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(AudioContext.prototype, "audioWorklet", { get: () => undefined }));
  await page.goto("/");
  await playTone(page);
  await expect.poll(async () => (await state(page)).status).toBe("playing");
  expect((await state(page)).availability).toBe("unsupported");
});

test("editing a paused EQ source preserves availability and a new source invalidates the A/B snapshot", async ({ page }) => {
  await page.goto("/");
  await playTone(page);
  await expect.poll(async () => (await state(page)).comparison.ready).toBe(true);
  await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    player.setEqualizerBypass(true);
    player.pause();
    player.selectEqualizerPreset("bass");
  });
  let s = await state(page);
  expect(s.status).toBe("paused");
  expect(s.availability).toBe("available");
  expect(s.bypass).toBe(false);
  expect(s.comparison.locked).toBe(false);
  await page.evaluate(async () => (await import("/src/lib/player.ts")).player.resume());
  await expect.poll(async () => (await state(page)).comparison.ready).toBe(true);
  await page.evaluate(async () => (await import("/src/lib/player.ts")).player.setEqualizerBypass(true));
  expect((await state(page)).comparison.locked).toBe(true);
  await playTone(page);
  s = await state(page);
  expect(s.bypass).toBe(false);
  expect(s.comparison.locked).toBe(false);
  expect(s.comparison.ready).toBe(false);
  await expect.poll(async () => (await state(page)).comparison.ready).toBe(true);
});

test("ambient processing reports ready state and uses the same frozen level comparison", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    const { ambient } = await import("/src/lib/ambient.ts");
    const eq = await import("/src/lib/equalizer.ts");
    player.updateEqualizer({ ...eq.selectEqualizerPreset(eq.defaultEqualizerSettings(), "bass"), enabled: true });
    player.enterFallback({ kind: "ambient", scene: "rain", title: "EQ test", original: null, since: Date.now(), manual: true });
    await ambient.start("rain", 0.4);
  });
  await expect.poll(async () => (await state(page)).availability).toBe("available");
  await expect.poll(async () => (await state(page)).comparison.ready).toBe(true);
  await page.evaluate(async () => (await import("/src/lib/player.ts")).player.setEqualizerBypass(true));
  expect((await state(page)).comparison.locked).toBe(true);
  await page.evaluate(async () => {
    const { player } = await import("/src/lib/player.ts");
    player.setEqualizerBand(1, 2);
  });
  const s = await state(page);
  expect(s.bypass).toBe(false);
  expect(s.availability).toBe("available");
  expect(s.comparison.locked).toBe(false);
});
