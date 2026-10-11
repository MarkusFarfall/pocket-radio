import { expect, test } from "@playwright/test";
import {
  CUSTOM_EQUALIZER_ID,
  EQUALIZER_BANDS,
  EQUALIZER_MAX_DB,
  EQUALIZER_MIN_DB,
  EQUALIZER_PRESETS,
  defaultEqualizerSettings,
  deleteEqualizerPreset,
  equalizerPresetName,
  normalizeEqualizerSettings,
  saveEqualizerPreset,
  selectEqualizerPreset,
  setEqualizerBand,
} from "../src/lib/equalizer";

test("equalizer presets are flat by default and provide a comfortable range of bands", () => {
  const defaults = defaultEqualizerSettings();
  expect(defaults.enabled).toBe(false);
  expect(defaults.gainsDb).toEqual(Array(10).fill(0));
  expect(EQUALIZER_BANDS.map((band) => band.hz)).toEqual([31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
  expect(EQUALIZER_MIN_DB).toBe(-12);
  expect(EQUALIZER_MAX_DB).toBe(12);

  const bass = selectEqualizerPreset(defaults, "bass");
  expect(equalizerPresetName(bass)).toBe("Больше баса");
  expect(bass.gainsDb[1]).toBe(6);
  expect(defaults.gainsDb).toEqual(Array(10).fill(0));
});

test("non-flat built-in profiles have a clearly shaped, distinct response", () => {
  const sculpted = EQUALIZER_PRESETS.filter((preset) => preset.id !== "flat");
  expect(sculpted).toHaveLength(7);
  for (const preset of sculpted) {
    expect(Math.max(...preset.gainsDb) - Math.min(...preset.gainsDb), preset.name).toBeGreaterThanOrEqual(4.5);
  }
});

test("manual edits are bounded and saved profiles round-trip without changing the source curve", () => {
  const bass = selectEqualizerPreset(defaultEqualizerSettings(), "bass");
  const edited = setEqualizerBand(bass, 1, 18);
  expect(edited.gainsDb[1]).toBe(12);
  expect(edited.presetId).toBe(CUSTOM_EQUALIZER_ID);
  expect(bass.gainsDb[1]).toBe(6);

  const saved = saveEqualizerPreset(edited, "  My   headphones  ");
  expect(saved.savedPresets).toHaveLength(1);
  expect(saved.savedPresets[0].name).toBe("My headphones");
  expect(equalizerPresetName(saved)).toBe("My headphones");
  const restored = selectEqualizerPreset({ ...defaultEqualizerSettings(), savedPresets: saved.savedPresets }, saved.savedPresets[0].id);
  expect(restored.gainsDb).toEqual(edited.gainsDb);
  expect(deleteEqualizerPreset(saved, saved.presetId).presetId).toBe(CUSTOM_EQUALIZER_ID);
  expect(deleteEqualizerPreset(saved, saved.presetId).savedPresets).toEqual([]);
});

test("saved configuration is normalized before it reaches the audio graph", () => {
  const normalized = normalizeEqualizerSettings({
    enabled: true,
    presetId: "removed-profile",
    gainsDb: [99, -99, 2.26],
    preampDb: 99,
    autoHeadroom: false,
    savedPresets: [{ id: "x", name: "Safe", gainsDb: [0, "loud", 1.26] }],
  });
  expect(normalized.enabled).toBe(true);
  expect(normalized.presetId).toBe(CUSTOM_EQUALIZER_ID);
  expect(normalized.gainsDb.slice(0, 4)).toEqual([12, -12, 2.5, 0]);
  expect(normalized.preampDb).toBe(6);
  expect(normalized.autoHeadroom).toBe(false);
  expect(normalized.savedPresets[0].gainsDb.slice(0, 3)).toEqual([0, 0, 1.5]);
});
