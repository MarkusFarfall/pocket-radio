import { expect, test } from "@playwright/test";
import { fixText } from "../src/lib/text";

test("repairs Russian titles whose CP1251 bytes were displayed as Latin-1", () => {
  expect(fixText("Ðîìàíñ - Ïåðâàÿ ëþáîâü")).toBe("Романс - Первая любовь");
});

test("repairs UTF-8 text decoded as Windows-1252 without damaging readable titles", () => {
  expect(fixText("ÐŸÑ€Ð¸Ð²ÐµÑ‚")).toBe("Привет");
  expect(fixText("Björk — Легенда")).toBe("Björk — Легенда");
});
