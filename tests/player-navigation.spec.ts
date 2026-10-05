import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";

function wav(seconds = 30, sampleRate = 8_000): Buffer {
  const samples = seconds * sampleRate;
  const dataBytes = samples * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples; i++) {
    out.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 440) / sampleRate) * 3_500), 44 + i * 2);
  }
  return out;
}

async function openAsGuest(page: Page) {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await expect(page.getByRole("heading", { name: "Что послушаем?" })).toBeVisible();
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const { viewport, document } = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(document, `document width ${document}px should fit viewport ${viewport}px`).toBeLessThanOrEqual(viewport + 1);
}

test("full player returns directly to the playlist that started the current track", async ({ page }) => {
  await openAsGuest(page);
  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  await page.getByRole("button", { name: "Новый плейлист" }).click();
  await page.getByLabel("Название").fill("Other Mix");
  await page.getByRole("dialog").getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Other Mix" })).toBeVisible();
  await page.getByRole("button", { name: "Все плейлисты", exact: true }).click();

  await page.getByRole("button", { name: "Новый плейлист" }).click();
  await page.getByLabel("Название").fill("Weekend Mix");
  await page.getByRole("dialog").getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Weekend Mix" })).toBeVisible();

  await page.locator('input[type="file"][multiple][accept*=".wav"]').setInputFiles([
    { name: "01 - Return Song.wav", mimeType: "audio/wav", buffer: wav() },
    { name: "02 - Middle Song.wav", mimeType: "audio/wav", buffer: wav() },
    { name: "03 - Final Song.wav", mimeType: "audio/wav", buffer: wav() },
  ]);
  await expect(page.getByText("Return Song", { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Middle Song", { exact: true })).toBeVisible();
  await expect(page.getByText("Final Song", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: 'Включить «Return Song»' }).click();

  await page.getByRole("button", { name: "Открыть плеер" }).click();
  await expect(page.getByRole("heading", { name: "Return Song" })).toBeVisible();
  const playerPage = page.locator(".player-mobile");
  const returnButton = page.getByRole("button", { name: "Вернуться к плейлисту" });
  await expect(returnButton).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await playerPage.getByRole("button", { name: /Middle Song/ }).click();
  await expect(page.getByRole("heading", { name: "Middle Song" })).toBeVisible();
  await expect(playerPage.getByRole("button", { name: /Final Song/ })).toBeVisible();
  await expect(playerPage.getByRole("button", { name: /Return Song/ })).toHaveCount(0);
  await returnButton.click();

  await expect(page.getByRole("main").getByRole("heading", { name: "Weekend Mix" })).toBeVisible();
  await expect(page.getByRole("button", { name: 'Включить «Return Song»' })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
});
