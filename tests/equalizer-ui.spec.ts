import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { expect, test, type Page } from "@playwright/test";

function wav(seconds = 20, sampleRate = 8_000): Buffer {
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
  for (let i = 0; i < samples; i++) out.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 440) / sampleRate) * 3_500), 44 + i * 2);
  return out;
}

async function openPlayerSettings(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pr.guest", "1"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Быстрый старт/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Быстрый старт/ }).first().click();
  await expect(page.getByRole("heading", { name: "Что послушаем?" })).toBeVisible();
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Настройки/ }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: "Настройки" })).toBeVisible();
  await page.getByRole("navigation", { name: "Разделы настроек" }).getByRole("button", { name: /Плеер/ }).click();
  await expect(page.locator('[data-row="Эквалайзер"]')).toBeVisible();
}

test("equalizer panel is reachable in settings, supports custom profiles, and remembers them", async ({ page }) => {
  await openPlayerSettings(page);
  await page.locator('[data-row="Эквалайзер"]').getByRole("button", { name: "Настроить эквалайзер" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Эквалайзер" })).toBeVisible();
  await dialog.getByRole("button", { name: "Больше баса", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Больше баса", exact: true })).toHaveAttribute("aria-pressed", "true");

  const bassBand = dialog.getByRole("slider", { name: "Полоса 62 Гц" });
  await expect(bassBand).toHaveValue("3.5");
  await bassBand.focus();
  await page.keyboard.press("ArrowRight");
  await expect(bassBand).toHaveValue("4");

  await dialog.getByRole("button", { name: "Сохранить как свой профиль" }).click();
  await dialog.getByLabel("Название профиля эквалайзера").fill("Мои наушники");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  const savedPreset = dialog.getByRole("button", { name: "Мои наушники", exact: true });
  await expect(savedPreset).toHaveAttribute("aria-pressed", "true");

  const enable = dialog.getByRole("switch", { name: "Включить эквалайзер" });
  await enable.click();
  await expect(enable).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Готово" }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Ещё", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Настройки/ }).click();
  await page.getByRole("navigation", { name: "Разделы настроек" }).getByRole("button", { name: /Плеер/ }).click();
  await page.locator('[data-row="Эквалайзер"]').getByRole("button", { name: "Настроить эквалайзер" }).click();

  const reopened = page.getByRole("dialog");
  await expect(reopened.getByRole("button", { name: "Мои наушники", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(reopened.getByRole("switch", { name: "Включить эквалайзер" })).toHaveAttribute("aria-checked", "true");
  await expect(reopened.getByRole("slider", { name: "Полоса 62 Гц" })).toHaveValue("4");
});

test("equalizer processes a local offline track and allows instant A/B comparison", async ({ page }) => {
  await openPlayerSettings(page);
  await page.locator('[data-row="Эквалайзер"]').getByRole("button", { name: "Настроить эквалайзер" }).click();
  const settingsDialog = page.getByRole("dialog");
  await settingsDialog.getByRole("switch", { name: "Включить эквалайзер" }).click();
  await settingsDialog.getByRole("button", { name: "Готово" }).click();

  await page.getByRole("button", { name: "Плейлисты", exact: true }).click();
  await page.getByRole("button", { name: "Новый плейлист" }).click();
  await page.getByLabel("Название").fill("EQ Test");
  await page.getByRole("dialog").getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "EQ Test" })).toBeVisible();
  await page.locator('input[type="file"][multiple][accept*=".wav"]').setInputFiles([
    { name: "01 - EQ Tone.wav", mimeType: "audio/wav", buffer: wav() },
  ]);
  await expect(page.getByText("EQ Tone", { exact: true })).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: 'Включить «EQ Tone»' }).click();
  await expect(page.getByRole("button", { name: "Открыть плеер" })).toBeVisible();
  await page.getByRole("button", { name: "Открыть плеер" }).click();
  await page.getByRole("button", { name: "Эквалайзер", exact: true }).click();

  const panel = page.getByRole("dialog").last();
  await expect(panel.locator('p[role="status"]')).toContainText("Эквалайзер применяется к текущему источнику", { timeout: 10_000 });
  const compare = panel.getByRole("button", { name: "Сравнить без EQ" });
  await expect(compare).toBeEnabled();
  await compare.click();
  await expect(panel.getByRole("button", { name: "Вернуть EQ" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Вернуть EQ" }).click();
  await expect(panel.getByRole("button", { name: "Сравнить без EQ" })).toHaveAttribute("aria-pressed", "false");
});

test("a stream without CORS keeps playing natively when EQ processing is unavailable", async ({ page }) => {
  const wavBytes = wav();
  const mediaServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wavBytes.length });
    response.end(wavBytes);
  });
  await new Promise<void>((resolve) => mediaServer.listen(0, "127.0.0.1", resolve));
  const address = mediaServer.address();
  if (!address || typeof address === "string") throw new Error("Could not start CORS test media server");
  const streamUrl = `http://127.0.0.1:${address.port}/stream.wav`;

  try {
    await openPlayerSettings(page);
    await page.locator('[data-row="Эквалайзер"]').getByRole("button", { name: "Настроить эквалайзер" }).click();
    const eqSettings = page.getByRole("dialog");
    await eqSettings.getByRole("switch", { name: "Включить эквалайзер" }).click();
    await eqSettings.getByRole("button", { name: "Готово" }).click();

    await page.getByRole("button", { name: "Главная", exact: true }).click();
    await page.getByRole("button", { name: "Добавить станцию" }).click();
    const stationDialog = page.getByRole("dialog");
    await stationDialog.getByLabel("Адрес потока *").fill(streamUrl);
    await stationDialog.getByLabel("Название").fill("No CORS station");
    await stationDialog.getByRole("button", { name: "Слушать", exact: true }).click();

    await expect(page.getByRole("button", { name: "Открыть плеер" })).toBeVisible({ timeout: 12_000 });
    await page.getByRole("button", { name: "Открыть плеер" }).click();
    await page.getByRole("button", { name: "Эквалайзер", exact: true }).click();
    const panel = page.getByRole("dialog").last();
    await expect(panel.locator('p[role="status"]')).toContainText("Этот поток не разрешает обработку звука", { timeout: 12_000 });
    await expect(page.getByRole("button", { name: "Пауза" }).first()).toBeVisible();
  } finally {
    await new Promise<void>((resolve, reject) => mediaServer.close((error) => error ? reject(error) : resolve()));
  }
});
