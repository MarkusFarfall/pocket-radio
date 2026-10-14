import { expect, test } from "@playwright/test";

// Exercise the production graph and its real AudioWorklet, not a mock of AudioParam.
for (const sampleRate of [44_100, 48_000]) {
  test(`Flat/0 and disabled EQ are transparent with a fixed 5 ms latency at ${sampleRate} Hz`, async ({ page }) => {
    await page.goto("/");
    const results = await page.evaluate(async (sr) => {
      const eq = await import("/src/lib/equalizer.ts");
      const results = [];
      for (const enabled of [true, false]) {
        const ctx = new OfflineAudioContext(2, sr, sr);
        const input = ctx.createBuffer(2, sr, sr);
        for (let ch = 0; ch < 2; ch++) {
          const data = input.getChannelData(ch);
          for (let i = 0; i < sr; i++) data[i] = 0.3 * Math.sin(2 * Math.PI * (ch ? 743 : 431) * i / sr);
        }
        const source = ctx.createBufferSource();
        source.buffer = input;
        const graph = eq.createEqualizerGraph(ctx, source, ctx.destination);
        await graph.ready;
        eq.applyEqualizerGraph(graph, ctx, { ...eq.defaultEqualizerSettings(), enabled });
        source.start();
        const output = await ctx.startRendering();
        const delay = Math.round(sr * 0.005);
        let error = 0;
        for (let ch = 0; ch < 2; ch++) {
          const data = output.getChannelData(ch);
          const original = input.getChannelData(ch);
          for (let i = sr / 2; i < sr; i++) error = Math.max(error, Math.abs(data[i] - original[i - delay]));
        }
        graph.dispose();
        results.push({ enabled, error });
      }
      return results;
    }, sampleRate);
    for (const result of results) expect(result.error, JSON.stringify(result)).toBeLessThan(1e-6);
  });

  test(`positive preamp, presets and rapid transitions stay within sample full scale at ${sampleRate} Hz`, async ({ page }) => {
    await page.goto("/");
    const results = await page.evaluate(async (sr) => {
      const eq = await import("/src/lib/equalizer.ts");
      const results = [];
      const variants = [
        { id: "flat", hz: 1000, preamp: 6, automatic: true },
        { id: "flat", hz: 1000, preamp: 6, automatic: false },
        ...eq.EQUALIZER_PRESETS.map((p) => ({ id: p.id, hz: p.id === "voice" ? 1990.5 : 63.45, preamp: 0, automatic: true })),
      ];
      for (const variant of variants) {
        const ctx = new OfflineAudioContext(2, sr, sr);
        const input = ctx.createBuffer(2, sr, sr);
        for (let i = 0; i < sr; i++) {
          const sample = 0.99 * Math.sin(2 * Math.PI * variant.hz * i / sr);
          input.getChannelData(0)[i] = sample;
          input.getChannelData(1)[i] = sample * 0.5;
        }
        const source = ctx.createBufferSource();
        source.buffer = input;
        const graph = eq.createEqualizerGraph(ctx, source, ctx.destination);
        await graph.ready;
        eq.applyEqualizerGraph(graph, ctx, eq.defaultEqualizerSettings());
        const pause = ctx.suspend(0.25);
        source.start();
        const rendering = ctx.startRendering();
        await pause;
        const preset = eq.selectEqualizerPreset(eq.defaultEqualizerSettings(), variant.id);
        eq.applyEqualizerGraph(graph, ctx, { ...preset, enabled: true, preampDb: variant.preamp, autoHeadroom: variant.automatic });
        await ctx.resume();
        const output = await rendering;
        let peak = 0;
        let linkedError = 0;
        const left = output.getChannelData(0);
        const right = output.getChannelData(1);
        for (let i = 0; i < sr; i++) {
          peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
          linkedError = Math.max(linkedError, Math.abs(left[i] * 0.5 - right[i]));
        }
        graph.dispose();
        results.push({ variant, peak, linkedError });
      }
      // Repeated edits faster than the ramp duration + a bypass transition.
      const ctx = new OfflineAudioContext(2, sr, sr);
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1990;
      const graph = eq.createEqualizerGraph(ctx, osc, ctx.destination);
      await graph.ready;
      osc.start();
      const rendering = ctx.suspend(0.1);
      const finished = ctx.startRendering();
      await rendering;
      for (let i = 0; i < 8; i++) {
        const nextTime = ctx.currentTime + 0.012;
        const paused = i < 7 ? ctx.suspend(nextTime) : null;
        eq.applyEqualizerGraph(graph, ctx, { ...eq.defaultEqualizerSettings(), enabled: true, gainsDb: Array(10).fill(i % 2 ? 12 : -12), preampDb: 6, autoHeadroom: false, matchLevel: false }, i === 7);
        await ctx.resume();
        if (paused) await paused;
      }
      const output = (await finished).getChannelData(0);
      let peak = 0;
      for (const sample of output) peak = Math.max(peak, Math.abs(sample));
      results.push({ variant: { id: "rapid extremes" }, peak, linkedError: 0 });
      graph.dispose();
      return results;
    }, sampleRate);
    for (const result of results) {
      expect(Number.isFinite(result.peak), JSON.stringify(result)).toBe(true);
      expect(result.peak, JSON.stringify(result)).toBeLessThanOrEqual(1);
      expect(result.linkedError, JSON.stringify(result)).toBeLessThan(1e-6);
      expect(result.peak, "The safety processor must not simply mute audio").toBeGreaterThan(0.1);
    }
  });
}

test("A/B matches measured RMS by attenuation only, freezes it, and resets it on edits", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const eq = await import("/src/lib/equalizer.ts");
    const sr = 48_000;
    const ctx = new OfflineAudioContext(2, sr * 4, sr);
    const buffer = ctx.createBuffer(1, sr / 2, sr);
    const data = buffer.getChannelData(0);
    // Periodic multitone with one tone per octave: exactly repeatable comparisons.
    for (let i = 0; i < data.length; i++) {
      for (const f of [32, 64, 126, 250, 500, 1000, 2000, 4000, 8000]) data[i] += 0.035 * Math.sin(2 * Math.PI * f * i / sr + f);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const graph = eq.createEqualizerGraph(ctx, source, ctx.destination);
    await graph.ready;
    const settings = { ...eq.selectEqualizerPreset(eq.defaultEqualizerSettings(), "bass"), enabled: true };
    eq.applyEqualizerGraph(graph, ctx, settings);
    source.start();
    const firstPause = ctx.suspend(1.6);
    const rendering = ctx.startRendering();
    await firstPause;
    // Wait for the actual meter event, not an arbitrary main-thread sleep.
    await new Promise<void>((resolve, reject) => {
      if (graph.comparison.ready) return resolve();
      const timeout = setTimeout(() => reject(new Error("No completed RMS window")), 2000);
      graph.onComparisonChange = (value) => {
        if (value.ready) { clearTimeout(timeout); resolve(); }
      };
    });
    const ready = graph.comparison.ready;
    const coefficientsBefore = graph.filters.map((f) => f.gain.value);
    eq.applyEqualizerGraph(graph, ctx, settings, true);
    const firstLock = { ...graph.comparison };
    const secondPause = ctx.suspend(2.6);
    await ctx.resume();
    await secondPause;
    await new Promise((resolve) => setTimeout(resolve, 50));
    eq.applyEqualizerGraph(graph, ctx, settings, false);
    const secondLock = { ...graph.comparison };
    const coefficientsAfter = graph.filters.map((f) => f.gain.value);
    const thirdPause = ctx.suspend(3.5);
    await ctx.resume();
    await thirdPause;
    eq.applyEqualizerGraph(graph, ctx, { ...settings, preampDb: -3 });
    const reset = { ...graph.comparison };
    await ctx.resume();
    const output = (await rendering).getChannelData(0);
    function rms(start: number, end: number) {
      let sum = 0;
      for (let i = start * sr; i < end * sr; i++) sum += output[i] ** 2;
      return Math.sqrt(sum / ((end - start) * sr));
    }
    const dryVsWetDb = 20 * Math.log10(rms(1.9, 2.4) / rms(2.9, 3.4));
    graph.dispose();
    return { ready, firstLock, secondLock, reset, coefficientsBefore, coefficientsAfter, dryVsWetDb };
  });
  expect(result.ready).toBe(true);
  expect(result.firstLock.locked).toBe(true);
  expect(result.firstLock.dryDb).toBeLessThan(-1);
  expect(result.firstLock.dryDb).toBeLessThanOrEqual(0);
  expect(result.firstLock.wetDb).toBeLessThanOrEqual(0);
  expect(result.secondLock).toEqual(result.firstLock);
  expect(result.coefficientsAfter).toEqual(result.coefficientsBefore);
  expect(Math.abs(result.dryVsWetDb)).toBeLessThan(0.2);
  expect(result.reset.ready).toBe(false);
  expect(result.reset.locked).toBe(false);
});

test("silence cannot produce a spurious level match or non-finite audio", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const eq = await import("/src/lib/equalizer.ts");
    const sr = 48000;
    const ctx = new OfflineAudioContext(2, sr * 2, sr);
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, sr * 2, sr);
    const graph = eq.createEqualizerGraph(ctx, source, ctx.destination);
    await graph.ready;
    eq.applyEqualizerGraph(graph, ctx, { ...eq.defaultEqualizerSettings(), enabled: true });
    source.start();
    const output = (await ctx.startRendering()).getChannelData(0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = { comparison: graph.comparison, silent: output.every((sample) => sample === 0) };
    graph.dispose();
    return result;
  });
  expect(result.comparison.ready).toBe(false);
  expect(result.comparison.locked).toBe(false);
  expect(result.silent).toBe(true);
});
