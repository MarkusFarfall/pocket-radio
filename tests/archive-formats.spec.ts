import { expect, test } from "@playwright/test";
import {
  CDDA_SECTOR_BYTES,
  cddaPcmToWav,
  makeCddaTrackUrl,
  parseCddaTrackUrl,
  parseCueSheet,
} from "../src/lib/cdda";

const sectors = (count: number) => count * CDDA_SECTOR_BYTES;

test("CUE parsing extracts AUDIO ranges, respects pregaps, skips data tracks, and reads endianness", () => {
  const files = [{ name: "disc.img", format: "ISO Image", size: sectors(2_400) }];
  const cue = [
    'FILE "disc.img" BINARY',
    "  TRACK 01 AUDIO",
    '    TITLE "Summer Rain"',
    "    INDEX 00 00:00:00",
    "    INDEX 01 00:00:05",
    "  TRACK 02 AUDIO",
    "    INDEX 00 00:10:00",
    "    INDEX 01 00:10:05",
    "  TRACK 03 MODE1/2352",
    "    INDEX 01 00:20:00",
    "  TRACK 04 AUDIO",
    "    INDEX 01 00:30:00",
  ].join("\r\n");

  const tracks = parseCueSheet(cue, files);
  expect(tracks).toHaveLength(3);
  expect(tracks[0]).toMatchObject({ number: 1, title: "Summer Rain", byteOrder: "little", startSector: 5, endSector: 750 });
  expect(tracks[1]).toMatchObject({ number: 2, startSector: 755, endSector: 1_500 });
  expect(tracks[2]).toMatchObject({ number: 4, startSector: 2_250, endSector: 2_400 });

  const motorola = parseCueSheet(["FILE \"disc.img\" MOTOROLA", "  TRACK 01 AUDIO", "    INDEX 01 00:00:00"].join(String.fromCharCode(10)), files);
  expect(motorola[0].byteOrder).toBe("big");
});

test("rejects ambiguous 2448-byte raw sectors unless a matching separate CDG file confirms 2352-byte audio sectors", () => {
  const cue = ['FILE "disc.img" BINARY', "  TRACK 01 AUDIO", "    INDEX 01 00:00:00"].join(String.fromCharCode(10));
  const ambiguous = [{ name: "disc.img", size: 2_448 * 49 }];
  expect(parseCueSheet(cue, ambiguous)).toEqual([]);

  const splitSubchannel = [
    { name: "disc.img", size: sectors(51) },
    { name: "disc.cdg", size: 51 * 96 },
  ];
  expect(parseCueSheet(cue, splitSubchannel)).toHaveLength(1);
});

test("CDDA samples are wrapped as little-endian WAV PCM, swapping only MOTOROLA input", async () => {
  const littleEndianRaw = new Uint8Array(CDDA_SECTOR_BYTES);
  littleEndianRaw.set([0x34, 0x12, 0xcd, 0xab]);
  const wav = cddaPcmToWav(littleEndianRaw.buffer);
  const bytes = new Uint8Array(await wav.arrayBuffer());
  const view = new DataView(bytes.buffer);

  expect(wav.type).toBe("audio/wav");
  expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
  expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
  expect(view.getUint32(24, true)).toBe(44_100);
  expect(view.getUint16(22, true)).toBe(2);
  expect(view.getUint32(40, true)).toBe(CDDA_SECTOR_BYTES);
  expect([...bytes.slice(44, 48)]).toEqual([0x34, 0x12, 0xcd, 0xab]);

  const motorolaRaw = new Uint8Array(CDDA_SECTOR_BYTES);
  motorolaRaw.set([0x12, 0x34, 0xab, 0xcd]);
  const swapped = new Uint8Array(await cddaPcmToWav(motorolaRaw.buffer, "big").arrayBuffer());
  expect([...swapped.slice(44, 48)]).toEqual([0x34, 0x12, 0xcd, 0xab]);
});

test("CD track URLs keep their byte source, byte order, and validated sector boundaries", () => {
  const url = makeCddaTrackUrl("https://archive.org/download/example/disc.img", 7, 75, 150);
  expect(parseCddaTrackUrl(url)).toEqual({
    sourceUrl: "https://archive.org/download/example/disc.img",
    identifier: "example",
    file: "disc.img",
    trackNumber: 7,
    byteOrder: "little",
    startSector: 75,
    endSector: 150,
  });
  expect(parseCddaTrackUrl(makeCddaTrackUrl("https://archive.org/download/example/disc.img", 7, 75, 150, "big"))?.byteOrder).toBe("big");
  expect(parseCddaTrackUrl("https://example.invalid/disc.img#pocket-radio-cdda=1,0,75")).toBeNull();
  expect(parseCddaTrackUrl("https://archive.org/download/example/disc.img#pocket-radio-cdda=1,9,8")).toBeNull();
});

test("ready-made browser-supported Archive audio formats are kept and duplicate encodings are de-duplicated", async ({ page }) => {
  const files = [
    { name: "cover.jpg", format: "JPEG", size: "5000" },
    { name: "01-track.mp3", format: "MP3", track: "1", title: "Song in MP3", size: "1000" },
    { name: "01-track.m4a", format: "MPEG4 Audio", track: "1", title: "Duplicate AAC version", size: "1200" },
    { name: "02-track.ogg", format: "Ogg Vorbis", track: "2", title: "Ogg track", size: "1300" },
    { name: "03-track.opus", format: "Opus", track: "3", title: "Opus track", size: "1400" },
    { name: "04-track.flac", format: "FLAC", track: "4", title: "FLAC track", size: "1500" },
    { name: "05-track.wav", format: "WAVE", track: "5", title: "WAV track", size: "1600" },
    { name: "06-track.wma", format: "Windows Media Audio", track: "6", title: "Unsupported WMA", size: "1700" },
    { name: "07-bonus.mp3", format: "MP3", track: "7", title: "Bonus track", size: "1800" },
    { name: "07-bonus.ogg", format: "Ogg Vorbis", size: "1900" },
  ];
  await page.route("https://archive.org/metadata/format-fixture", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ metadata: { title: "Format fixture", creator: "Fixture Artist" }, files }),
    })
  );
  await page.goto("/");
  const tracks = await page.evaluate(async () => {
    const { albumTracks } = await import("/src/lib/archive.ts");
    const result = await albumTracks("format-fixture");
    return result.tracks.map((track) => ({ title: track.title, file: new URL(track.url).pathname.split("/").at(-1) }));
  });

  expect(tracks.map((track) => track.title)).toEqual(["Song in MP3", "Ogg track", "Opus track", "FLAC track", "WAV track", "Bonus track"]);
  expect(tracks.map((track) => track.file)).toEqual(["01-track.mp3", "02-track.ogg", "03-track.opus", "04-track.flac", "05-track.wav", "07-bonus.mp3"]);
  expect(tracks.some((track) => track.title.includes("Duplicate"))).toBe(false);
  expect(tracks.some((track) => track.title.includes("Unsupported"))).toBe(false);
});
