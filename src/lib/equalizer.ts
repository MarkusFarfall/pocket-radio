export const EQUALIZER_STORAGE_KEY = "radio.equalizer.v1";
export const EQUALIZER_BANDS = [
  { hz: 31, label: "31" },
  { hz: 62, label: "62" },
  { hz: 125, label: "125" },
  { hz: 250, label: "250" },
  { hz: 500, label: "500" },
  { hz: 1_000, label: "1k" },
  { hz: 2_000, label: "2k" },
  { hz: 4_000, label: "4k" },
  { hz: 8_000, label: "8k" },
  { hz: 16_000, label: "16k" },
] as const;

export const EQUALIZER_MIN_DB = -12;
export const EQUALIZER_MAX_DB = 12;
export const EQUALIZER_PREAMP_MIN_DB = -12;
export const EQUALIZER_PREAMP_MAX_DB = 6;
export const CUSTOM_EQUALIZER_ID = "custom";

export interface EqualizerPreset {
  id: string;
  name: string;
  description: string;
  gainsDb: number[];
}

export interface SavedEqualizerPreset {
  id: string;
  name: string;
  gainsDb: number[];
  preampDb: number;
  autoHeadroom: boolean;
}

export interface EqualizerSettings {
  enabled: boolean;
  presetId: string;
  gainsDb: number[];
  preampDb: number;
  autoHeadroom: boolean;
  savedPresets: SavedEqualizerPreset[];
}

const zeros = () => EQUALIZER_BANDS.map(() => 0);

/** Небольшие стартовые кривые: слух и наушники у всех разные, поэтому подъёмы намеренно умеренные. */
export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { id: "flat", name: "Ровный", description: "Без изменения тембра", gainsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass", name: "Больше баса", description: "Мягкий подъём низких частот", gainsDb: [2, 3.5, 3, 1.5, 0.5, 0, 0, 0, 0, 0] },
  { id: "pop", name: "Поп", description: "Чуть плотнее низ и яснее вокал", gainsDb: [1, 1.5, 1, 1.5, 0.5, 0, 1, 1.5, 1, 0.5] },
  { id: "rock", name: "Рок", description: "Гитары и ударные без резкого верха", gainsDb: [2.5, 2, 1, 0, -1, 1, 2, 2.5, 2, 1] },
  { id: "jazz", name: "Джаз", description: "Тёплый низ и воздушные тарелки", gainsDb: [2, 1.5, 0.5, 1, -1, 0, 1, 1.5, 2, 1.5] },
  { id: "classical", name: "Классика", description: "Широкая сцена и мягкий баланс", gainsDb: [2, 1, 0, 0, -0.5, -0.5, 0, 1, 1.5, 1.5] },
  { id: "voice", name: "Голос", description: "Разборчивее речь и вокал", gainsDb: [-4, -3, -1.5, 0, 1.5, 2.5, 3, 2, 0.5, -1] },
  { id: "electronic", name: "Электроника", description: "Плотный бас и детальный верх", gainsDb: [3, 2, 0.5, -1, 0, 1, 2, 2, 1.5, 1] },
];

export function defaultEqualizerSettings(): EqualizerSettings {
  return {
    enabled: false,
    presetId: "flat",
    gainsDb: zeros(),
    preampDb: 0,
    autoHeadroom: true,
    savedPresets: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, Math.round(value * 2) / 2));
}

function normalizeGains(value: unknown): number[] {
  if (!Array.isArray(value)) return zeros();
  return EQUALIZER_BANDS.map((_, index) => {
    const gain = value[index];
    return typeof gain === "number" ? clamp(gain, EQUALIZER_MIN_DB, EQUALIZER_MAX_DB) : 0;
  });
}

export function normalizeEqualizerSettings(value: unknown): EqualizerSettings {
  const fallback = defaultEqualizerSettings();
  if (!isRecord(value)) return fallback;
  const savedPresets: SavedEqualizerPreset[] = [];
  if (Array.isArray(value.savedPresets)) {
    const ids = new Set<string>();
    for (const item of value.savedPresets) {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") continue;
      const id = item.id.trim().slice(0, 80);
      const name = item.name.trim().replace(/\s+/g, " ").slice(0, 32);
      if (!id || !name || ids.has(id)) continue;
      ids.add(id);
      savedPresets.push({
        id,
        name,
        gainsDb: normalizeGains(item.gainsDb),
        preampDb: typeof item.preampDb === "number" ? clamp(item.preampDb, EQUALIZER_PREAMP_MIN_DB, EQUALIZER_PREAMP_MAX_DB) : 0,
        autoHeadroom: item.autoHeadroom !== false,
      });
      if (savedPresets.length >= 24) break;
    }
  }
  const gainsDb = normalizeGains(value.gainsDb);
  const presetId = typeof value.presetId === "string" ? value.presetId : "flat";
  const validPreset = EQUALIZER_PRESETS.some((preset) => preset.id === presetId) ||
    presetId === CUSTOM_EQUALIZER_ID || savedPresets.some((preset) => preset.id === presetId);
  return {
    enabled: value.enabled === true,
    presetId: validPreset ? presetId : CUSTOM_EQUALIZER_ID,
    gainsDb,
    preampDb: typeof value.preampDb === "number" ? clamp(value.preampDb, EQUALIZER_PREAMP_MIN_DB, EQUALIZER_PREAMP_MAX_DB) : 0,
    autoHeadroom: value.autoHeadroom !== false,
    savedPresets,
  };
}

export function loadEqualizerSettings(): EqualizerSettings {
  try {
    const raw = localStorage.getItem(EQUALIZER_STORAGE_KEY);
    return raw ? normalizeEqualizerSettings(JSON.parse(raw)) : defaultEqualizerSettings();
  } catch {
    return defaultEqualizerSettings();
  }
}

export function saveEqualizerSettings(settings: EqualizerSettings): void {
  try {
    localStorage.setItem(EQUALIZER_STORAGE_KEY, JSON.stringify(normalizeEqualizerSettings(settings)));
  } catch {
    // Storage may be unavailable in private browsing; audio controls must keep working regardless.
  }
}

export function equalizerPresetName(settings: EqualizerSettings): string {
  return EQUALIZER_PRESETS.find((preset) => preset.id === settings.presetId)?.name ??
    settings.savedPresets.find((preset) => preset.id === settings.presetId)?.name ??
    "Свой профиль";
}

export function selectEqualizerPreset(settings: EqualizerSettings, id: string): EqualizerSettings {
  const builtIn = EQUALIZER_PRESETS.find((preset) => preset.id === id);
  if (builtIn) return { ...settings, presetId: builtIn.id, gainsDb: [...builtIn.gainsDb], preampDb: 0, autoHeadroom: true };
  const saved = settings.savedPresets.find((preset) => preset.id === id);
  if (saved) return { ...settings, presetId: saved.id, gainsDb: [...saved.gainsDb], preampDb: saved.preampDb, autoHeadroom: saved.autoHeadroom };
  return settings;
}

export function setEqualizerBand(settings: EqualizerSettings, index: number, gainDb: number): EqualizerSettings {
  if (!Number.isInteger(index) || index < 0 || index >= EQUALIZER_BANDS.length) return settings;
  const gainsDb = [...settings.gainsDb];
  gainsDb[index] = clamp(gainDb, EQUALIZER_MIN_DB, EQUALIZER_MAX_DB);
  return { ...settings, presetId: CUSTOM_EQUALIZER_ID, gainsDb };
}

export function setEqualizerPreamp(settings: EqualizerSettings, preampDb: number): EqualizerSettings {
  return {
    ...settings,
    presetId: CUSTOM_EQUALIZER_ID,
    preampDb: clamp(preampDb, EQUALIZER_PREAMP_MIN_DB, EQUALIZER_PREAMP_MAX_DB),
  };
}

export function saveEqualizerPreset(settings: EqualizerSettings, name: string): EqualizerSettings {
  const cleanedName = name.trim().replace(/\s+/g, " ").slice(0, 32);
  if (!cleanedName) return settings;
  const id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const savedPresets = [
    ...settings.savedPresets,
    { id, name: cleanedName, gainsDb: [...settings.gainsDb], preampDb: settings.preampDb, autoHeadroom: settings.autoHeadroom },
  ].slice(-24);
  return { ...settings, presetId: id, savedPresets };
}

export function deleteEqualizerPreset(settings: EqualizerSettings, id: string): EqualizerSettings {
  const savedPresets = settings.savedPresets.filter((preset) => preset.id !== id);
  return settings.presetId === id
    ? { ...settings, presetId: CUSTOM_EQUALIZER_ID, savedPresets }
    : { ...settings, savedPresets };
}

export interface EqualizerGraph {
  filters: BiquadFilterNode[];
  /** Unconnected mirrors allow precise headroom calculation without audible parameter jumps. */
  responseFilters: BiquadFilterNode[];
  bypassGain: GainNode;
  processedGain: GainNode;
  headroomGain: GainNode;
  outputGain: GainNode;
}

/** Two parallel paths make A/B comparison instant and keep the unprocessed path available. */
export function createEqualizerGraph(context: AudioContext, input: AudioNode, destination: AudioNode): EqualizerGraph {
  const bypassGain = context.createGain();
  const processedGain = context.createGain();
  const headroomGain = context.createGain();
  const outputGain = context.createGain();
  const makeFilter = ({ hz }: (typeof EQUALIZER_BANDS)[number], index: number) => {
    const filter = context.createBiquadFilter();
    filter.type = index === 0 ? "lowshelf" : index === EQUALIZER_BANDS.length - 1 ? "highshelf" : "peaking";
    filter.frequency.value = Math.min(hz, context.sampleRate * 0.46);
    if (filter.type === "peaking") filter.Q.value = 1.4;
    filter.gain.value = 0;
    return filter;
  };
  const filters = EQUALIZER_BANDS.map(makeFilter);
  const responseFilters = EQUALIZER_BANDS.map(makeFilter);

  input.connect(bypassGain);
  bypassGain.connect(outputGain);
  input.connect(filters[0]);
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  filters[filters.length - 1].connect(headroomGain);
  headroomGain.connect(processedGain);
  processedGain.connect(outputGain);
  outputGain.connect(destination);
  bypassGain.gain.value = 1;
  processedGain.gain.value = 0;
  headroomGain.gain.value = 1;
  outputGain.gain.value = 1;
  return { filters, responseFilters, bypassGain, processedGain, headroomGain, outputGain };
}

function smooth(param: AudioParam, value: number, context: AudioContext) {
  try {
    param.cancelScheduledValues(context.currentTime);
    param.setTargetAtTime(value, context.currentTime, 0.025);
  } catch {
    param.value = value;
  }
}

function peakResponseDb(filters: BiquadFilterNode[], context: AudioContext): number {
  const count = 512;
  const upper = Math.max(40, Math.min(20_000, context.sampleRate * 0.46));
  const frequencies = new Float32Array(count);
  const magnitudes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) frequencies[i] = 20 * (upper / 20) ** (i / (count - 1));
  const totalDb = new Float32Array(count);
  for (const filter of filters) {
    filter.getFrequencyResponse(frequencies, magnitudes, phases);
    for (let i = 0; i < count; i++) totalDb[i] += 20 * Math.log10(Math.max(magnitudes[i], 0.000001));
  }
  let peak = 0;
  for (const db of totalDb) peak = Math.max(peak, db);
  return peak;
}

export function applyEqualizerGraph(
  graph: EqualizerGraph,
  context: AudioContext,
  settings: EqualizerSettings,
  bypass = false,
  outputVolume = 1,
): void {
  const active = settings.enabled && !bypass;
  const gains = active ? settings.gainsDb : zeros();
  graph.responseFilters.forEach((filter, index) => { filter.gain.value = gains[index] ?? 0; });
  graph.filters.forEach((filter, index) => smooth(filter.gain, gains[index] ?? 0, context));
  const peak = active && settings.autoHeadroom ? peakResponseDb(graph.responseFilters, context) : 0;
  const reserveDb = peak > 0.25 ? peak + 0.8 : 0;
  const preampDb = active ? settings.preampDb - reserveDb : 0;
  smooth(graph.headroomGain.gain, 10 ** (preampDb / 20), context);
  smooth(graph.bypassGain.gain, active ? 0 : 1, context);
  smooth(graph.processedGain.gain, active ? 1 : 0, context);
  smooth(graph.outputGain.gain, Math.max(0, Math.min(1, outputVolume)), context);
}
