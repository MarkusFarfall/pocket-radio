import { expect, test } from "@playwright/test";
import { fixText } from "../src/lib/text";
import { isPlaceholderArtwork } from "../src/lib/artwork";

test("repairs Russian titles whose CP1251 bytes were displayed as Latin-1", () => {
  expect(fixText("Ðîìàíñ - Ïåðâàÿ ëþáîâü")).toBe("Романс - Первая любовь");
});

test("repairs UTF-8 text decoded as Windows-1252 without damaging readable titles", () => {
  expect(fixText("ÐŸÑ€Ð¸Ð²ÐµÑ‚")).toBe("Привет");
  expect(fixText("Björk — Легенда")).toBe("Björk — Легенда");
});

test("repairs CP1251 text decoded as plain Latin-1 without obvious mojibake markers", () => {
  expect(fixText("Íàóòèëóñ Ïîìïèëèóñ")).toBe("Наутилус Помпилиус");
  expect(fixText("Björk")).toBe("Björk");
});

test("recognizes generated archive audio thumbnails as placeholders, not cover art", () => {
  expect(isPlaceholderArtwork("https://archive.org/services/img/example-album")).toBe(true);
  expect(isPlaceholderArtwork("https://archive.org/download/example-album/__ia_thumb.jpg")).toBe(true);
  expect(isPlaceholderArtwork("https://archive.org/download/example-album/cover.jpg")).toBe(false);
});
