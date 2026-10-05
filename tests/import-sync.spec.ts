import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

async function openApp(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
}

test("JSON import restores events and is idempotent for stations, sessions, tracks, and playlists", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const { db, exportJSON, importJSON } = await import("/src/lib/db.ts");
    await Promise.all([db.stations.clear(), db.sessions.clear(), db.events.clear(), db.tracks.clear(), db.settings.clear()]);

    const snapshot = {
      app: "pocket-radio",
      version: 4,
      stations: [
        {
          id: "station-a",
          name: "Example Radio",
          url: "https://example.test/live.mp3",
          kind: "http",
          genre: "Rock",
          mood: "",
          city: "",
          tags: [],
          icon: "",
          note: "",
          bitrate: 128,
          favorite: true,
          createdAt: 10,
          updatedAt: 20,
          plays: 3,
          totalSeconds: 180,
        },
        { id: "bad-url", name: "Bad", url: "javascript:alert(1)" },
      ],
      sessions: [
        {
          syncId: "session-a",
          stationId: "station-a",
          stationName: "Example Radio",
          genre: "Rock",
          mood: "",
          kind: "http",
          startedAt: 100,
          endedAt: 160,
          seconds: 60,
        },
        {
          syncId: "session-deleted-station",
          stationId: "removed-station",
          stationName: "Removed Radio",
          genre: "Jazz",
          mood: "Night",
          kind: "icecast",
          startedAt: 200,
          endedAt: 260,
          seconds: 60,
        },
      ],
      events: [
        { stationId: "removed-station", stationName: "Removed Radio", type: "error", ts: 300, message: "Network error" },
      ],
      tracks: [{ title: "Saved Song", artist: "Artist", station: "Example Radio", stationId: "station-a", ts: 5 }],
      playlists: [
        {
          id: "mix-a",
          name: "Imported Mix",
          desc: "",
          items: [{ id: "item-a", title: "Episode A", url: "https://example.test/a.mp3", kind: "vod", addedAt: 1 }],
          createdAt: 10,
          updatedAt: 20,
        },
      ],
      playlistProgress: [{ key: "pp:pli:item-a", value: { position: 42, updatedAt: 25 } }],
    };

    const first = await importJSON(JSON.stringify(snapshot));
    const second = await importJSON(JSON.stringify(snapshot));
    const exported = await exportJSON(true);
    const third = await importJSON(exported);
    const playlist = (await db.settings.get("pl:mix-a"))?.value as { items: { id: string }[] } | undefined;
    const progress = (await db.settings.get("pp:pli:item-a"))?.value as { position?: number } | number | undefined;
    return {
      first,
      second,
      third,
      stations: await db.stations.count(),
      sessions: await db.sessions.count(),
      events: await db.events.count(),
      tracks: await db.tracks.count(),
      playlistItems: playlist?.items.map((item) => item.id) ?? [],
      progress,
    };
  });

  expect(result.first).toEqual({ added: 1, sessions: 2, events: 1, tracks: 1, playlists: 1, progress: 1 });
  expect(result.second).toEqual({ added: 0, sessions: 0, events: 0, tracks: 0, playlists: 0, progress: 0 });
  expect(result.third).toEqual({ added: 0, sessions: 0, events: 0, tracks: 0, playlists: 0, progress: 0 });
  expect(result.stations).toBe(1);
  expect(result.sessions).toBe(2);
  expect(result.events).toBe(1);
  expect(result.tracks).toBe(1);
  expect(result.playlistItems).toEqual(["item-a"]);
  expect(result.progress).toEqual({ position: 42, updatedAt: 25 });
});

test("cloud-style import merges playlist items and selects newer progress and station data", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const { db, importJSON } = await import("/src/lib/db.ts");
    await Promise.all([db.stations.clear(), db.sessions.clear(), db.events.clear(), db.tracks.clear(), db.settings.clear()]);

    const station = {
      id: "local-station",
      name: "Local Name",
      url: "https://example.test/live.mp3",
      kind: "http",
      genre: "Rock",
      mood: "",
      city: "",
      tags: [],
      icon: "",
      note: "",
      bitrate: 128,
      favorite: false,
      createdAt: 10,
      updatedAt: 100,
      plays: 2,
      totalSeconds: 90,
    };
    const localPlaylist = {
      id: "mix-a",
      name: "Local Mix",
      desc: "Local description",
      items: [
        { id: "shared", title: "Local version", url: "https://example.test/shared.mp3", kind: "vod", addedAt: 1 },
        { id: "local-only", title: "Local only", url: "https://example.test/local.mp3", kind: "vod", addedAt: 2 },
      ],
      createdAt: 10,
      updatedAt: 150,
    };
    await importJSON(JSON.stringify({ stations: [station], playlists: [localPlaylist], playlistProgress: [{ key: "pp:pli:shared", value: { position: 120, updatedAt: 150 } }] }));

    const newerSnapshot = {
      stations: [{ ...station, id: "cloud-station", name: "Cloud Name", favorite: true, updatedAt: 200, plays: 5, totalSeconds: 120 }],
      sessions: [
        { syncId: "played-on-device", stationId: "cloud-station", stationName: "Cloud Name", kind: "http", genre: "Rock", mood: "", startedAt: 1, endedAt: 10, seconds: 5 },
      ],
      playlists: [{
        ...localPlaylist,
        name: "Cloud Mix",
        updatedAt: 300,
        items: [
          { id: "shared", title: "Cloud version", url: "https://example.test/shared.mp3", kind: "vod", addedAt: 1 },
          { id: "cloud-only", title: "Cloud only", url: "https://example.test/cloud.mp3", kind: "vod", addedAt: 3 },
        ],
      }],
      playlistProgress: [{ key: "pp:pli:shared", value: { position: 80, updatedAt: 90 } }],
    };
    const merged = await importJSON(JSON.stringify(newerSnapshot), { updateExisting: true });
    const sessionUpdate = await importJSON(JSON.stringify({
      stations: [],
      sessions: [{ syncId: "played-on-device", stationId: "local-station", stationName: "Updated snapshot", kind: "http", genre: "Rock", mood: "", startedAt: 1, endedAt: 20, seconds: 4 }],
    }), { updateExisting: true });
    const statsMerge = await importJSON(JSON.stringify({
      stations: [{ ...station, id: "cloud-station", name: "Stale stats snapshot", updatedAt: 180, plays: 8, totalSeconds: 300, lastPlayedAt: 800 }],
    }), { updateExisting: true });
    const resumeProgress = await importJSON(JSON.stringify({
      stations: [{ ...station, id: "cloud-station", url: "https://example.test/live.mp3", name: "Stale metadata", updatedAt: 190, resumePos: 75, resumeUpdatedAt: 400 }],
    }), { updateExisting: true });
    const afterResume = await db.stations.get("local-station");
    const movedStation = await importJSON(JSON.stringify({
      stations: [{ ...station, id: "cloud-station", url: "https://example.test/new-live.mp3", name: "New endpoint", favorite: true, updatedAt: 250, resumePos: 180, resumeUpdatedAt: 500 }],
    }), { updateExisting: true });

    const staleSnapshot = {
      stations: [],
      playlists: [{ ...localPlaylist, name: "Stale name", updatedAt: 250, items: [
        { id: "stale-only", title: "Older unique item", url: "https://example.test/stale.mp3", kind: "vod", addedAt: 4 },
        { id: "shared", title: "Stale version", url: "https://example.test/shared.mp3", kind: "vod", addedAt: 1 },
      ] }],
      playlistProgress: [{ key: "pp:pli:shared", value: { position: 200, updatedAt: 400 } }],
    };
    await importJSON(JSON.stringify(staleSnapshot), { updateExisting: true });

    const storedStation = await db.stations.get("local-station");
    const storedPlaylist = (await db.settings.get("pl:mix-a"))?.value as { name: string; items: { id: string; title: string }[] };
    const storedProgress = (await db.settings.get("pp:pli:shared"))?.value as { position: number; updatedAt: number };
    const storedSession = (await db.sessions.toArray())[0];
    return {
      merged,
      sessionUpdate,
      movedStation,
      statsMerge,
      resumeProgress,
      afterResume: { name: afterResume?.name, updatedAt: afterResume?.updatedAt, plays: afterResume?.plays, totalSeconds: afterResume?.totalSeconds, lastPlayedAt: afterResume?.lastPlayedAt, resumePos: afterResume?.resumePos, resumeUpdatedAt: afterResume?.resumeUpdatedAt },
      session: { endedAt: storedSession?.endedAt, seconds: storedSession?.seconds, stationName: storedSession?.stationName },
      station: { id: storedStation?.id, name: storedStation?.name, url: storedStation?.url, favorite: storedStation?.favorite, plays: storedStation?.plays, totalSeconds: storedStation?.totalSeconds, lastPlayedAt: storedStation?.lastPlayedAt, resumePos: storedStation?.resumePos, resumeUpdatedAt: storedStation?.resumeUpdatedAt },
      playlist: { name: storedPlaylist.name, items: storedPlaylist.items.map(({ id, title }) => ({ id, title })) },
      progress: storedProgress,
      sessions: await db.sessions.count(),
    };
  });

  expect(result.merged).toEqual({ added: 0, sessions: 1, events: 0, tracks: 0, playlists: 1, progress: 0 });
  expect(result.sessionUpdate).toEqual({ added: 0, sessions: 1, events: 0, tracks: 0, playlists: 0, progress: 0 });
  expect(result.session).toEqual({ endedAt: 20, seconds: 5, stationName: "Updated snapshot" });
  expect(result.statsMerge).toEqual({ added: 0, sessions: 0, events: 0, tracks: 0, playlists: 0, progress: 0 });
  expect(result.resumeProgress).toEqual({ added: 0, sessions: 0, events: 0, tracks: 0, playlists: 0, progress: 0 });
  expect(result.afterResume).toEqual({ name: "Cloud Name", updatedAt: 200, plays: 8, totalSeconds: 300, lastPlayedAt: 800, resumePos: 75, resumeUpdatedAt: 400 });
  expect(result.movedStation.added).toBe(0);
  expect(result.station).toEqual({ id: "local-station", name: "New endpoint", url: "https://example.test/new-live.mp3", favorite: true, plays: 8, totalSeconds: 300, lastPlayedAt: 800, resumePos: undefined, resumeUpdatedAt: undefined });
  expect(result.playlist.name).toBe("Cloud Mix");
  expect(result.playlist.items).toEqual([
    { id: "shared", title: "Cloud version" },
    { id: "cloud-only", title: "Cloud only" },
    { id: "local-only", title: "Local only" },
    { id: "stale-only", title: "Older unique item" },
  ]);
  expect(result.progress).toEqual({ position: 200, updatedAt: 400 });
  expect(result.sessions).toBe(1);
});

test("cloud push refuses to overwrite a snapshot newer than this account's checkpoint", async ({ page }) => {
  await openApp(page);
  let writes = 0;
  await page.route("**/rest/v1/user_data**", async (route) => {
    if (route.request().method() === "POST") {
      writes++;
      await route.fulfill({ status: 201, body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ data: { stations: [] }, updated_at: "2026-10-05T10:00:00.000Z" }]),
    });
  });
  await page.evaluate(() => {
    const userId = "test-user-id";
    localStorage.setItem("pr.sb", JSON.stringify({
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, email: "test@example.test" },
    }));
    localStorage.setItem(`pr.lastSync:${userId}`, String(Date.parse("2026-10-05T09:00:00.000Z")));
  });

  const message = await page.evaluate(async () => {
    const { pushToCloud } = await import("/src/lib/sync.ts");
    try {
      await pushToCloud();
      return "unexpected success";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });

  expect(message).toContain("Сначала нажмите «Из облака»");
  expect(writes).toBe(0);
});

test("URL import rejects oversized responses and aborts a stalled response body", async ({ page }) => {
  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (request.url === "/large") {
      response.writeHead(200, { "Content-Type": "text/plain", "Content-Length": String(20 * 1024 * 1024 + 1) });
      response.end("too large");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.flushHeaders();
    const timer = setInterval(() => response.write("#EXTM3U\n"), 5);
    response.on("close", () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await openApp(page);
    const result = await page.evaluate(async ({ oversizedUrl, stalledUrl }) => {
      const originalTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        originalTimeout(handler, timeout === 12000 ? 80 : timeout, ...args)) as typeof window.setTimeout;
      const { importUrl } = await import("/src/lib/importer.ts");
      const oversized = await importUrl(oversizedUrl);
      const stalled = await importUrl(stalledUrl);
      return {
        oversized,
        stalled,
        timeoutMessageVisible: document.body.innerText.includes("Импорт по ссылке занял слишком много времени"),
      };
    }, { oversizedUrl: `http://127.0.0.1:${port}/large`, stalledUrl: `http://127.0.0.1:${port}/stall` });

    expect(result.oversized).toBe(false);
    expect(result.stalled).toBe(false);
    expect(result.timeoutMessageVisible).toBe(true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("the first cloud upload inserts a row when no snapshot exists", async ({ page }) => {
  await openApp(page);
  let writeMethod = "";
  let responseBody: Record<string, unknown> | null = null;
  await page.route("**/rest/v1/user_data**", async (route) => {
    if (route.request().method() === "POST") {
      writeMethod = "POST";
      responseBody = JSON.parse(route.request().postData() ?? "null");
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ user_id: "first-upload-user" }]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.evaluate(() => {
    localStorage.setItem("pr.sb", JSON.stringify({
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "first-upload-user", email: "first@example.test" },
    }));
  });

  const checkpoint = await page.evaluate(async () => {
    const { pushToCloud, lastSyncAt } = await import("/src/lib/sync.ts");
    await pushToCloud();
    return lastSyncAt("first-upload-user");
  });

  expect(writeMethod).toBe("POST");
  expect(responseBody).toMatchObject({ user_id: "first-upload-user" });
  expect(checkpoint).toBeGreaterThan(0);
});

test("cloud push does not overwrite a snapshot changed during the upload", async ({ page }) => {
  await openApp(page);
  const checkpoint = new Date(Date.now() - 60_000).toISOString();
  let updateUrl = "";
  await page.route("**/rest/v1/user_data**", async (route) => {
    if (route.request().method() === "PATCH") {
      updateUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ data: { stations: [] }, updated_at: checkpoint }]),
    });
  });
  await page.evaluate((syncCheckpoint) => {
    const userId = "concurrent-user";
    localStorage.setItem("pr.sb", JSON.stringify({
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, email: "concurrent@example.test" },
    }));
    localStorage.setItem(`pr.lastSync:${userId}`, String(Date.parse(syncCheckpoint)));
  }, checkpoint);

  const result = await page.evaluate(async () => {
    const { pushToCloud, lastSyncAt } = await import("/src/lib/sync.ts");
    try {
      await pushToCloud();
      return { message: "unexpected success", checkpoint: lastSyncAt("concurrent-user") };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error), checkpoint: lastSyncAt("concurrent-user") };
    }
  });

  expect(updateUrl).toContain("user_id=eq.concurrent-user");
  expect(updateUrl).toContain(`updated_at=eq.${encodeURIComponent(checkpoint)}`);
  expect(result.message).toContain("изменилась во время отправки");
  expect(result.checkpoint).toBe(Date.parse(checkpoint));
});

test("cloud push keeps snapshot timestamps monotonic when this device clock is behind", async ({ page }) => {
  await openApp(page);
  const checkpoint = Date.now() + 60_000;
  let postedAt: string | null = null;
  let writeMethod = "";
  await page.route("**/rest/v1/user_data**", async (route) => {
    if (["POST", "PATCH"].includes(route.request().method())) {
      writeMethod = route.request().method();
      postedAt = JSON.parse(route.request().postData() ?? "{}").updated_at ?? null;
      await route.fulfill({ status: writeMethod === "POST" ? 201 : 200, contentType: "application/json", body: JSON.stringify([{ user_id: "clock-skew-user" }]) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ data: { stations: [] }, updated_at: new Date(checkpoint).toISOString() }]),
    });
  });
  await page.evaluate((syncCheckpoint) => {
    const userId = "clock-skew-user";
    localStorage.setItem("pr.sb", JSON.stringify({
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, email: "clock@example.test" },
    }));
    localStorage.setItem(`pr.lastSync:${userId}`, String(syncCheckpoint));
  }, checkpoint);

  const result = await page.evaluate(async () => {
    const { pushToCloud, lastSyncAt } = await import("/src/lib/sync.ts");
    await pushToCloud();
    return lastSyncAt("clock-skew-user");
  });

  expect(writeMethod).toBe("PATCH");
  expect(postedAt).not.toBeNull();
  expect(Date.parse(postedAt!)).toBeGreaterThan(checkpoint);
  expect(result).toBe(Date.parse(postedAt!));
});
