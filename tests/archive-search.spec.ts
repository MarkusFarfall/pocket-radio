import { expect, test, type Page } from "@playwright/test";

async function openCollections(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.getByLabel("Раздел обзора").selectOption("collections");
}

async function archiveDocs(page: Page, docs: Record<string, unknown>[]) {
  const queries: string[] = [];
  await page.route("https://archive.org/advancedsearch.php**", async (route) => {
    const url = new URL(route.request().url());
    queries.push(url.searchParams.get("q") ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ response: { numFound: docs.length, docs } }),
    });
  });
  await page.route("https://archive.org/metadata/**", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1) ?? "fixture";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ metadata: { title: id, creator: "" }, files: [] }),
    });
  });
  return queries;
}

test("artist search keeps A-ha results precise and drops noisy Archive metadata", async ({ page }) => {
  const queries = await archiveDocs(page, [
    { identifier: "aha-good", title: "Stay on These Roads", creator: "A-Ha", year: 1988, downloads: 30, collection: ["hifidelity"] },
    { identifier: "aha-jamendo-noise", title: "a-ha - Gorgon City All Four Walls", creator: "a-ha", year: 2025, downloads: 900, collection: ["jamendo-albums"] },
    { identifier: "aha-cover", title: "Take On Me", creator: "Written by A-Ha, covered by Asteroid M", downloads: 80, collection: ["opensource_audio"] },
    { identifier: "aha-giant-mix", title: "ForSaken Borders Townsfolk Music", creator: "A-ha, Coldplay, Don McLean, Imagine Dragons, Jason Mraz", downloads: 40, collection: ["opensource_audio"] },
    { identifier: "false-artist", title: "A Ha Llegado", creator: "Someone Else", downloads: 1, collection: ["opensource_audio"] },
  ]);

  await openCollections(page);
  await expect(page.getByRole("button", { name: "По исполнителю" })).toHaveAttribute("aria-pressed", "true");
  await page.getByPlaceholder("Например: a-ha, Talk Talk").fill("a-ha");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "«a-ha»" })).toBeVisible();
  await expect(page.getByText("Stay on These Roads", { exact: true })).toBeVisible();
  await expect(page.getByText("a-ha - Gorgon City All Four Walls", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Written by A-Ha, covered by Asteroid M", { exact: true })).toHaveCount(0);
  await expect(page.getByText("ForSaken Borders Townsfolk Music", { exact: true })).toHaveCount(0);
  await expect(page.getByText("A Ha Llegado", { exact: true })).toHaveCount(0);
  expect(queries[0]).toContain('creator:"a-ha"');
  expect(queries[0]).not.toContain(" OR title:(a ha)");
});

test("all-fields search uses an exact phrase rather than matching isolated words", async ({ page }) => {
  const queries = await archiveDocs(page, [
    { identifier: "talk-talk-album", title: "Spirit of Eden", creator: "Talk Talk", year: 1988, downloads: 100, collection: ["opensource_audio"] },
    { identifier: "talk-talk-by-title", title: "Talk Talk", creator: "Various artists", downloads: 20, collection: ["opensource_audio"] },
    { identifier: "talk-only", title: "Talk to Me", creator: "Another Artist", downloads: 999, collection: ["opensource_audio"] },
    { identifier: "talking-heads", title: "Talking Heads", creator: "Talking Heads", downloads: 500, collection: ["opensource_audio"] },
  ]);

  await openCollections(page);
  await page.getByRole("button", { name: "По названию / жанру" }).click();
  await page.getByPlaceholder("Название альбома, песни или жанр").fill("Talk Talk");
  await page.getByRole("button", { name: "Найти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "«Talk Talk»" })).toBeVisible();
  await expect(page.getByText("Spirit of Eden", { exact: true })).toBeVisible();
  await expect(page.getByText("Talk Talk", { exact: true })).toBeVisible();
  await expect(page.getByText("Talk to Me", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Talking Heads", { exact: true })).toHaveCount(0);
  expect(queries[0]).toContain('title:"Talk Talk"');
  expect(queries[0]).toContain('creator:"Talk Talk"');
});
