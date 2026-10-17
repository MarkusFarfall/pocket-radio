import { expect, test, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:4175";
const USER = "11111111-1111-4111-8111-111111111111";
const SB = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: USER, email: "sync@example.test" },
};

async function openAsCloud(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(
    ({ user, sb }) => {
      localStorage.setItem("pr.guest", "1");
      localStorage.setItem("pr.sb", JSON.stringify(sb));
      localStorage.setItem(`pr.sync.legacy:${user}`, "1");
    },
    { user: USER, sb: SB }
  );
  await page.goto(BASE);
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
}

function mockSupabase(page: Page, onDocs: (rows: unknown[]) => Promise<unknown[]>, audios?: string[]) {
  return page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "zcohgsqefkygwvyzrico.supabase.co") return route.continue();
    const path = url.pathname;
    if (path === "/rest/v1/sync_docs") {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() ?? "[]");
        const written = await onDocs(body);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(written.map((row: any) => ({ key: row.key, updated_at: "2026-10-17T12:00:00.000Z" }))),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    // Любой запрос к Storage означает, что аудио снова пытаются отправить в облако.
    if (path.startsWith("/storage/v1/")) {
      audios?.push(path);
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (path.startsWith("/rest/v1/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

test("first sync uploads stations, playlists with custom covers, stats and prefs but never audio", async ({ page }) => {
  await openAsCloud(page);
  const docs: any[] = [];
  const storageCalls: string[] = [];
  await mockSupabase(
    page,
    async (body) => {
      docs.push(...body);
      return body;
    },
    storageCalls
  );

  const seeded = await page.evaluate(async () => {
    const { db, saveStation, setSetting } = await import("/src/lib/db.ts");
    const { putOfflineBlob } = await import("/src/lib/offline.ts");
    await Promise.all([db.stations.clear(), db.sessions.clear(), db.events.clear(), db.tracks.clear(), db.settings.clear(), db.syncMeta.clear()]);
    await db.offline.clear();
    const station = await saveStation({ name: "Своя волна", url: "https://example.test/live.mp3", kind: "http", genre: "Jazz" });
    const cover = "data:image/jpeg;base64,custom-cover";
    await setSetting("pl:pl-1", {
      id: "pl-1",
      name: "Мой плейлист",
      desc: "",
      cover,
      items: [{ id: "t1", title: "Трек один", url: "https://example.test/t1.mp3", kind: "vod", addedAt: 1 }],
      createdAt: 10,
      updatedAt: 20,
    });
    await db.sessions.add({
      syncId: "session-1",
      stationId: station.id,
      stationName: station.name,
      genre: "Jazz",
      mood: "",
      kind: "http",
      startedAt: 100,
      endedAt: 160,
      seconds: 60,
    });
    const audio = new Blob([new Uint8Array(4096)], { type: "audio/mpeg" });
    await putOfflineBlob(station.id, station.url, audio, "audio/mpeg", audio.size);
    return { stationId: station.id, cover };
  });

  await page.evaluate(async (user) => {
    const { startSync } = await import("/src/lib/sync.ts");
    startSync(user, true);
  }, USER);

  await expect.poll(() => docs.length, { timeout: 25_000 }).toBeGreaterThan(0);

  const keys = docs.map((doc) => doc.key);
  expect(keys).toContain(`station:${seeded.stationId}`);
  expect(keys).toContain("playlist:pl-1");
  expect(keys).toContain("session:session-1");
  expect(keys).toContain("pref:theme");
  expect(keys.some((key) => key.startsWith("audio:"))).toBe(false);

  const playlist = docs.find((doc) => doc.key === "playlist:pl-1");
  expect(playlist.data.cover).toBe(seeded.cover);
  expect(playlist.data.items[0].title).toBe("Трек один");

  // Скачанное аудио остаётся локальным: Storage не вызывается вовсе.
  expect(storageCalls).toEqual([]);
  const localAudio = await page.evaluate(async (stationId) => {
    const { db } = await import("/src/lib/db.ts");
    return db.offline.get(stationId);
  }, seeded.stationId);
  expect(localAudio?.size).toBe(4096);
});

test("pull restores a playlist with its user cover, stats and theme on another device", async ({ page }) => {
  await openAsCloud(page);
  const remote = [
    {
      key: "station:sync-a",
      data: {
        id: "remote-station",
        syncId: "sync-a",
        name: "Remote FM",
        url: "https://example.test/live.mp3",
        kind: "http",
        genre: "Jazz",
        mood: "",
        city: "",
        tags: [],
        icon: "",
        note: "",
        bitrate: 128,
        favorite: true,
        createdAt: 1,
        updatedAt: 1000,
        plays: 2,
        totalSeconds: 120,
      },
      deleted: false,
      updated_at: "2026-10-17T10:00:00.000Z",
    },
    {
      key: "playlist:pl-remote",
      data: {
        id: "pl-remote",
        name: "Мой микс",
        desc: "с другого компьютера",
        cover: "data:image/jpeg;base64,user-cover",
        items: [{ id: "t1", title: "Трек издалека", url: "https://example.test/t1.mp3", kind: "vod", addedAt: 1 }],
        createdAt: 1,
        updatedAt: 2000,
      },
      deleted: false,
      updated_at: "2026-10-17T10:00:01.000Z",
    },
    {
      key: "session:s1",
      data: {
        syncId: "s1",
        stationId: "sync-a",
        stationName: "Remote FM",
        genre: "Jazz",
        mood: "",
        kind: "http",
        startedAt: 10,
        endedAt: 70,
        seconds: 60,
      },
      deleted: false,
      updated_at: "2026-10-17T10:00:02.000Z",
    },
    {
      key: "pref:theme",
      data: { mode: "dark", light: "paper", dark: "charcoal", accent: "#e4532b" },
      deleted: false,
      updated_at: "2026-10-17T10:00:03.000Z",
    },
  ];

  const storageCalls: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "zcohgsqefkygwvyzrico.supabase.co") return route.continue();
    const path = url.pathname;
    if (path === "/rest/v1/sync_docs") {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() ?? "[]");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(body.map((row: any) => ({ key: row.key, updated_at: "2026-10-17T11:00:00.000Z" }))),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(remote) });
      return;
    }
    if (path.startsWith("/storage/v1/")) {
      storageCalls.push(path);
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (path.startsWith("/rest/v1/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.evaluate(async () => {
    const { db } = await import("/src/lib/db.ts");
    await Promise.all([db.stations.clear(), db.sessions.clear(), db.events.clear(), db.tracks.clear(), db.settings.clear(), db.syncMeta.clear()]);
    await db.offline.clear();
  });

  await page.evaluate(async (user) => {
    const { startSync } = await import("/src/lib/sync.ts");
    startSync(user, true);
  }, USER);

  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { db } = await import("/src/lib/db.ts");
          return db.settings.get("pl:pl-remote").then((row) => !!row);
        }),
      { timeout: 25_000 }
    )
    .toBe(true);

  const state = await page.evaluate(async () => {
    const { db } = await import("/src/lib/db.ts");
    const station = (await db.stations.toArray()).find((item) => item.syncId === "sync-a");
    const playlist = (await db.settings.get("pl:pl-remote"))?.value as { name: string; cover?: string; items: { title: string }[] } | undefined;
    return {
      station: station?.name,
      playlist,
      sessions: await db.sessions.count(),
      offline: await db.offline.count(),
      theme: localStorage.getItem("radio.theme"),
    };
  });

  expect(state.station).toBe("Remote FM");
  expect(state.playlist?.name).toBe("Мой микс");
  expect(state.playlist?.cover).toBe("data:image/jpeg;base64,user-cover");
  expect(state.playlist?.items[0]?.title).toBe("Трек издалека");
  expect(state.sessions).toBe(1);
  // Аудио не приходит из облака: плейлист есть, файлов нет.
  expect(state.offline).toBe(0);
  expect(storageCalls).toEqual([]);
  expect(state.theme).toBe("dark");
});

test("remote deletions remove the playlist and station locally and never resurrect them", async ({ page }) => {
  await openAsCloud(page);
  const result = await page.evaluate(async () => {
    const { db, saveStation, setSetting } = await import("/src/lib/db.ts");
    const { applyDocs, buildAllDocs } = await import("/src/lib/syncDocs.ts");
    await Promise.all([db.stations.clear(), db.settings.clear(), db.syncMeta.clear()]);
    const station = await saveStation({ name: "Удаляемая", url: "https://example.test/x.mp3", kind: "http" });
    await setSetting("pl:gone", { id: "gone", name: "Удаляемый", desc: "", items: [], createdAt: 1, updatedAt: 2 });

    await applyDocs([
      { key: `station:${station.syncId ?? station.id}`, data: null, deleted: true },
      { key: "playlist:gone", data: null, deleted: true },
    ]);
    return {
      stations: await db.stations.count(),
      playlists: await db.settings.where(":id").startsWith("pl:").count(),
      docs: (await buildAllDocs()).size,
    };
  });

  expect(result.stations).toBe(0);
  expect(result.playlists).toBe(0);
  expect(result.docs).toBeGreaterThan(0); // настройки оформления продолжают жить
});

test("local deletion after a successful sync is sent as a tombstone", async ({ page }) => {
  await openAsCloud(page);
  const posts: any[] = [];
  await mockSupabase(page, async (body) => {
    posts.push(...body);
    return body;
  });

  const station = await page.evaluate(async () => {
    const { db, saveStation } = await import("/src/lib/db.ts");
    await Promise.all([db.stations.clear(), db.settings.clear(), db.syncMeta.clear()]);
    return saveStation({ name: "Временная", url: "https://example.test/temp.mp3", kind: "http" });
  });

  await page.evaluate(async (user) => {
    const { startSync } = await import("/src/lib/sync.ts");
    startSync(user, true);
  }, USER);
  await expect.poll(() => posts.some((doc) => doc.key === `station:${station.syncId ?? station.id}` && !doc.deleted), { timeout: 20_000 }).toBe(true);

  await page.evaluate(async (id) => {
    const { deleteStation } = await import("/src/lib/db.ts");
    await deleteStation(id);
    const { markSyncAll } = await import("/src/lib/syncBus.ts");
    markSyncAll();
  }, station.id);

  await expect
    .poll(() => posts.some((doc) => doc.key === `station:${station.syncId ?? station.id}` && doc.deleted === true), { timeout: 20_000 })
    .toBe(true);
});
