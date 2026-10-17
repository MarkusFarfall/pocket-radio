import { expect, test } from "@playwright/test";

async function open(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
}

test("document hashes ignore key order and track keys normalize ё/case/spacing", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { hashDoc, stableStringify, trackDocKey } = await import("/src/lib/syncKeys.ts");
    return {
      stable: stableStringify({ b: 1, a: { d: 2, c: 3 } }) === stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
      hash: hashDoc({ a: 1, b: 2 }) === hashDoc({ b: 2, a: 1 }),
      different: hashDoc({ a: 1 }) !== hashDoc({ a: 2 }),
      track: trackDocKey("Ёлка — Песня", "ArTist") === trackDocKey("елка песня", "artist"),
    };
  });
  expect(result).toEqual({ stable: true, hash: true, different: true, track: true });
});

test("buildAllDocs assigns stable ids, keeps user covers and manifests offline audio", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { db, saveStation, setSetting } = await import("/src/lib/db.ts");
    const { buildAllDocs, buildDoc } = await import("/src/lib/syncDocs.ts");
    await Promise.all([db.stations.clear(), db.sessions.clear(), db.events.clear(), db.tracks.clear(), db.settings.clear(), db.syncMeta.clear()]);
    await db.offline.clear();
    const station = await saveStation({ name: "Волна", url: "https://example.test/a.mp3", kind: "http" });
    await setSetting("pl:cover-check", {
      id: "cover-check",
      name: "Обложка",
      desc: "",
      cover: "data:image/png;base64,AAAA",
      items: [],
      createdAt: 1,
      updatedAt: 2,
    });
    const legacy = await db.sessions.add({
      stationId: station.id,
      genre: "",
      mood: "",
      kind: "http",
      startedAt: 1,
      endedAt: 2,
      seconds: 1,
    });
    await db.offline.put({ stationId: station.id, size: 1234, ts: 5 });
    const docs = await buildAllDocs();
    const session = await db.sessions.get(legacy);
    const playlistDoc = docs.get("playlist:cover-check");
    const byLocalId = await buildDoc(`station:${station.id}`);
    return {
      hasStation: !!docs.get(`station:${station.syncId ?? station.id}`),
      sessionSyncId: session?.syncId,
      cover: (playlistDoc?.data as { cover?: string })?.cover,
      audio: docs.get(`audio:${station.id}`)?.data,
      resolvedKey: byLocalId?.key,
      docs: docs.size,
    };
  });

  expect(result.hasStation).toBe(true);
  expect(result.sessionSyncId).toMatch(/^s-[0-9a-f]{8}$/);
  expect(result.cover).toBe("data:image/png;base64,AAAA");
  expect(result.audio).toMatchObject({ size: 1234, ts: 5 });
  expect(result.resolvedKey).toContain("station:");
  expect(result.docs).toBeGreaterThan(5);
});

test("pref documents round-trip theme, player and layout through the real setters", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { buildPrefDocs, applyPrefDoc } = await import("/src/lib/syncPrefs.ts");
    const { getThemePrefs, setThemePrefs } = await import("/src/lib/themes.ts");
    const { getPlayerAppearance, setPlayerAppearance } = await import("/src/lib/playerAppearance.ts");
    const { getUiPrefs, setUiPrefs } = await import("/src/lib/uiStyle.ts");
    setThemePrefs({ mode: "dark", light: "mint", dark: "forest", accent: "#123456" });
    setPlayerAppearance({ skin: "vinyl", layout: "vinyl", motion: "vinyl", colorWash: false });
    setUiPrefs({ density: "compact", radius: "sharp" });
    const docs = buildPrefDocs();
    const theme = docs.find((doc) => doc.name === "theme")!.data as Record<string, unknown>;

    // Сбрасываем и применяем облачные значения обратно.
    setThemePrefs({ mode: "light", light: "paper", dark: "charcoal", accent: null });
    setPlayerAppearance({ skin: "classic", layout: "focus", motion: "calm", colorWash: true });
    setUiPrefs({ density: "normal", radius: "normal" });
    const applied = applyPrefDoc("theme", theme);
    const playerApplied = applyPrefDoc("player", docs.find((doc) => doc.name === "player")!.data);
    const uiApplied = applyPrefDoc("ui", docs.find((doc) => doc.name === "ui")!.data);
    return {
      applied,
      playerApplied,
      uiApplied,
      theme: getThemePrefs(),
      player: getPlayerAppearance(),
      density: getUiPrefs().density,
      radius: getUiPrefs().radius,
      storage: localStorage.getItem("radio.theme"),
    };
  });

  expect(result.applied).toBe(true);
  expect(result.playerApplied).toBe(true);
  expect(result.uiApplied).toBe(true);
  expect(result.theme).toEqual({ mode: "dark", light: "mint", dark: "forest", accent: "#123456" });
  expect(result.player).toMatchObject({ skin: "vinyl", layout: "vinyl", motion: "vinyl", colorWash: false });
  expect(result.density).toBe("compact");
  expect(result.radius).toBe("sharp");
  expect(result.storage).toBe("dark");
});

test("unknown or broken pref payloads are rejected instead of corrupting local settings", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { applyPrefDoc } = await import("/src/lib/syncPrefs.ts");
    return {
      theme: applyPrefDoc("theme", { mode: "neon", light: "nope", dark: "nope" }),
      design: applyPrefDoc("design", "unknown-design"),
      desktop: applyPrefDoc("desktop", { shell: 42 }),
      missing: applyPrefDoc("nope", {}),
    };
  });
  // design нормализуется в classic — это допустимое значение, остальное отвергается.
  expect(result).toEqual({ theme: false, design: true, desktop: false, missing: false });
});
