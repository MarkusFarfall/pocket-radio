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
  /** Match measured RMS for A/B, using attenuation only; never continuous AGC. */
  matchLevel: boolean;
  savedPresets: SavedEqualizerPreset[];
}

const zeros = () => EQUALIZER_BANDS.map(() => 0);

/** Умеренные, но заметные стартовые кривые; их можно дополнительно подстроить под свои наушники. */
export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { id: "flat", name: "Ровный", description: "Без изменения тембра", gainsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass", name: "Больше баса", description: "Выразительный низ без гулкой середины", gainsDb: [3, 6, 5, 3.5, 1, 0, -1, -1, 0, 0] },
  { id: "pop", name: "Поп", description: "Плотный бас и более заметный вокал", gainsDb: [2.5, 4, 3, 1.5, -1, 0, 2, 3.5, 3, 1.5] },
  { id: "rock", name: "Рок", description: "Плотная атака гитар и ударных", gainsDb: [4, 5, 3, 0, -2.5, 1, 3.5, 4.5, 3, 2] },
  { id: "jazz", name: "Джаз", description: "Тёплый низ, ясная середина и тарелки", gainsDb: [3, 2.5, 1, -0.5, -2, 0, 1.5, 3, 4, 3] },
  { id: "classical", name: "Классика", description: "Немного глубины и воздуха без резкости", gainsDb: [2.5, 2, 0.5, -1, -1, 0, 1, 2.5, 3.5, 3] },
  { id: "voice", name: "Голос", description: "Подчёркнутая разборчивость речи и вокала", gainsDb: [-5, -4, -2, 0, 2, 4.5, 5.5, 4, 1.5, -1] },
  { id: "electronic", name: "Электроника", description: "Упругий низ и яркие детали", gainsDb: [5.5, 4.5, 2, 0, 0.5, 1.5, 3, 4, 3, 2] },
];

export function defaultEqualizerSettings(): EqualizerSettings {
  return {
    enabled: false,
    presetId: "flat",
    gainsDb: zeros(),
    preampDb: 0,
    autoHeadroom: true,
    matchLevel: true,
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
    matchLevel: value.matchLevel !== false,
    savedPresets,
  };
}

export function loadEqualizerSettings(): EqualizerSettings {
  try {
    const raw = localStorage.getItem(EQUALIZER_STORAGE_KEY);
    if (!raw) return defaultEqualizerSettings();
    const settings = normalizeEqualizerSettings(JSON.parse(raw));
    const preset = EQUALIZER_PRESETS.find((item) => item.id === settings.presetId);
    if (!preset || settings.gainsDb.every((gain, index) => gain === preset.gainsDb[index])) return settings;
    // Built-in profiles may be revised between app versions. A selected built-in preset
    // can't be a manual edit (those become "custom"), so refresh it to the new curve.
    const updated = { ...settings, gainsDb: [...preset.gainsDb] };
    saveEqualizerSettings(updated);
    return updated;
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

export interface EqualizerComparison {
  ready: boolean;
  locked: boolean;
  dryDb: number;
  wetDb: number;
}

export const emptyEqualizerComparison = (): EqualizerComparison => ({ ready: false, locked: false, dryDb: 0, wetDb: 0 });

/** Both coefficients are <= 1: the louder branch is attenuated, never boosted. */
export function comparisonGains(dryPower: number, wetPower: number): { dry: number; wet: number } | null {
  if (!Number.isFinite(dryPower) || !Number.isFinite(wetPower) || dryPower < 1e-9 || wetPower < 1e-9) return null;
  const ratio = Math.sqrt(wetPower / dryPower);
  return { dry: Math.min(1, ratio), wet: Math.min(1, 1 / ratio) };
}

export function equalizerHeadroomDb(peakDb: number, preampDb: number, automatic: boolean): number {
  // Keep Flat/0 exactly unity. Include positive preamp, not just band boosts.
  const totalPeak = peakDb + preampDb;
  return preampDb - (automatic && totalPeak > 1e-6 ? totalPeak + 0.8 : 0);
}

type EqContext = AudioContext | OfflineAudioContext;
export interface EqualizerGraph {
  filters: BiquadFilterNode[];
  responseFilters: BiquadFilterNode[];
  bypassGain: GainNode;
  processedGain: GainNode;
  dryMatchGain: GainNode;
  wetMatchGain: GainNode;
  headroomGain: GainNode;
  outputGain: GainNode;
  /** Nothing is sent to the destination until the safety processor is ready. */
  ready: Promise<void>;
  processor: AudioWorkletNode | null;
  failed: boolean;
  comparison: EqualizerComparison;
  onComparisonChange?: (comparison: EqualizerComparison) => void;
  onFailure?: () => void;
  powers: { dry: number; wet: number } | null;
  revision: number;
  signature: string;
  dispose(): void;
}

const workletLoads = new WeakMap<BaseAudioContext, Promise<void>>();
function loadOutputProcessor(context: EqContext): Promise<void> {
  let promise = workletLoads.get(context);
  if (!promise) {
    // Vite emits this local JS asset with a content hash; no CDN/blob/CSP exception.
    let timer: ReturnType<typeof setTimeout>;
    promise = Promise.race([
      context.audioWorklet.addModule(new URL('./equalizer-processor.worklet.js', import.meta.url).href),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('EQ processor load timed out')), 8_000); }),
    ]).finally(() => clearTimeout(timer));
    workletLoads.set(context, promise);
  }
  return promise;
}

function publishComparison(graph: EqualizerGraph, next: EqualizerComparison) {
  const old = graph.comparison;
  if (old.ready === next.ready && old.locked === next.locked && old.dryDb === next.dryDb && old.wetDb === next.wetDb) return;
  graph.comparison = next;
  graph.onComparisonChange?.(next);
}

/** Invalidates old-source/old-curve measurements, including queued port messages. */
export function resetEqualizerComparison(graph: EqualizerGraph): void {
  graph.revision = (graph.revision + 1) % 1_000_000;
  graph.powers = null;
  graph.processor?.parameters.get('revision')?.setValueAtTime(graph.revision, graph.processor.context.currentTime);
  publishComparison(graph, emptyEqualizerComparison());
}

export function createEqualizerGraph(context: EqContext, input: AudioNode, destination: AudioNode): EqualizerGraph {
  if (!context.audioWorklet) throw new Error('Безопасная обработка EQ требует AudioWorklet');
  const bypassGain = context.createGain();
  const processedGain = context.createGain();
  const dryMatchGain = context.createGain();
  const wetMatchGain = context.createGain();
  const headroomGain = context.createGain();
  const outputGain = context.createGain();
  const makeFilter = ({ hz }: (typeof EQUALIZER_BANDS)[number], index: number) => {
    const filter = context.createBiquadFilter();
    filter.type = index === 0 ? 'lowshelf' : index === EQUALIZER_BANDS.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = Math.min(hz, context.sampleRate * 0.46);
    if (filter.type === 'peaking') filter.Q.value = 1.4;
    filter.gain.value = 0;
    return filter;
  };
  const filters = EQUALIZER_BANDS.map(makeFilter);
  const responseFilters = EQUALIZER_BANDS.map(makeFilter);
  input.connect(dryMatchGain);
  dryMatchGain.connect(bypassGain);
  bypassGain.connect(outputGain);
  input.connect(filters[0]);
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  filters[filters.length - 1].connect(headroomGain);
  headroomGain.connect(wetMatchGain);
  wetMatchGain.connect(processedGain);
  processedGain.connect(outputGain);
  bypassGain.gain.value = 1;
  processedGain.gain.value = 0;
  let disposed = false;
  const graph: EqualizerGraph = {
    filters, responseFilters, bypassGain, processedGain, dryMatchGain, wetMatchGain, headroomGain, outputGain,
    ready: Promise.resolve(), processor: null, failed: false, comparison: emptyEqualizerComparison(), powers: null, revision: 0, signature: '',
    dispose() {
      disposed = true;
      for (const node of [dryMatchGain, filters[0], graph.processor]) {
        if (node) { try { input.disconnect(node); } catch { /* already detached */ } }
      }
      [...filters, bypassGain, processedGain, dryMatchGain, wetMatchGain, headroomGain, outputGain].forEach((node) => node.disconnect());
      graph.processor?.disconnect();
      graph.processor?.port.close();
    },
  };
  graph.ready = loadOutputProcessor(context).then(() => {
    if (disposed) throw new Error('EQ graph was disposed');
    const processor = new AudioWorkletNode(context, 'pocket-equalizer-output-v1', {
      numberOfInputs: 3, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit',
    });
    graph.processor = processor;
    processor.onprocessorerror = () => { graph.failed = true; graph.onFailure?.(); };
    processor.port.onmessage = ({ data }: MessageEvent<{ revision: number; complete: boolean; dryPower: number; wetPower: number }>) => {
      if (disposed || data.revision !== graph.revision || graph.comparison.locked) return;
      const gains = data.complete ? comparisonGains(data.dryPower, data.wetPower) : null;
      graph.powers = gains ? { dry: data.dryPower, wet: data.wetPower } : null;
      publishComparison(graph, { ready: !!gains, locked: false, dryDb: 0, wetDb: 0 });
    };
    processor.parameters.get('revision')!.value = graph.revision;
    outputGain.connect(processor, 0, 0);
    input.connect(processor, 0, 1);
    headroomGain.connect(processor, 0, 2);
    processor.connect(destination);
  });
  // Callers await the original promise; prevent an unhandled rejection before attach().
  void graph.ready.catch(() => { graph.failed = true; });
  return graph;
}

function hold(param: AudioParam, at: number) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
  else {
    const value = param.value;
    param.cancelScheduledValues(at);
    param.setValueAtTime(value, at);
  }
}
function ramp(param: AudioParam, value: number, context: EqContext, seconds = 0.025) {
  hold(param, context.currentTime);
  param.linearRampToValueAtTime(value, context.currentTime + seconds);
}

function peakResponseDb(filters: BiquadFilterNode[], context: EqContext): number {
  const count = 1024;
  const upper = context.sampleRate / 2;
  const frequencies = new Float32Array(count);
  const magnitudes = new Float32Array(count);
  const phases = new Float32Array(count);
  // Include DC and Nyquist: shelf maxima can be outside 20 Hz .. 20 kHz.
  frequencies[0] = 0;
  for (let i = 1; i < count; i++) frequencies[i] = 10 * (upper / 10) ** ((i - 1) / (count - 2));
  const totalDb = new Float32Array(count);
  for (const filter of filters) {
    filter.getFrequencyResponse(frequencies, magnitudes, phases);
    for (let i = 0; i < count; i++) totalDb[i] += 20 * Math.log10(Math.max(magnitudes[i], 0.000001));
  }
  let peak = -Infinity;
  for (const db of totalDb) if (Number.isFinite(db)) peak = Math.max(peak, db);
  return Number.isFinite(peak) ? peak : 0;
}

export function applyEqualizerGraph(
  graph: EqualizerGraph,
  context: EqContext,
  settings: EqualizerSettings,
  bypass = false,
  outputVolume = 1,
): void {
  const signature = JSON.stringify([settings.enabled, settings.gainsDb, settings.preampDb, settings.autoHeadroom, settings.matchLevel]);
  if (signature !== graph.signature) {
    graph.signature = signature;
    resetEqualizerComparison(graph);
    // Keep the processed branch alive, even in bypass: no filter morph during A/B.
    graph.responseFilters.forEach((filter, index) => { filter.gain.value = settings.gainsDb[index] ?? 0; });
    const peak = peakResponseDb(graph.responseFilters, context);
    const gain = 10 ** (equalizerHeadroomDb(peak, settings.preampDb, settings.autoHeadroom) / 20);
    // Attenuate first, then change coefficients, then release to the final gain.
    // The audio-thread protector also covers rapid edits and filter transients.
    const now = context.currentTime;
    const guard = Math.min(graph.headroomGain.gain.value, gain);
    hold(graph.headroomGain.gain, now);
    graph.headroomGain.gain.linearRampToValueAtTime(guard, now + 0.005);
    graph.headroomGain.gain.setValueAtTime(guard, now + 0.04);
    graph.headroomGain.gain.linearRampToValueAtTime(gain, now + 0.15);
    graph.filters.forEach((filter, index) => {
      hold(filter.gain, now);
      filter.gain.setValueAtTime(filter.gain.value, now + 0.005);
      filter.gain.linearRampToValueAtTime(settings.gainsDb[index] ?? 0, now + 0.03);
    });
  }
  if (settings.enabled && settings.matchLevel && bypass && !graph.comparison.locked && graph.powers) {
    const gains = comparisonGains(graph.powers.dry, graph.powers.wet);
    if (gains) publishComparison(graph, { ready: true, locked: true, dryDb: 20 * Math.log10(gains.dry), wetDb: 20 * Math.log10(gains.wet) });
  }
  const matched = settings.enabled && settings.matchLevel && graph.comparison.locked;
  const dryGain = matched ? 10 ** (graph.comparison.dryDb / 20) : 1;
  const wetGain = matched ? 10 ** (graph.comparison.wetDb / 20) : 1;
  // If there is no reliable measurement, do not silently offer an unmatched A/B.
  const comparing = bypass && (!settings.matchLevel || matched);
  const active = settings.enabled && !comparing;
  ramp(graph.dryMatchGain.gain, dryGain, context);
  ramp(graph.wetMatchGain.gain, wetGain, context);
  // Linear (not equal-power) crossfade: correlated dry/wet must not get a +3 dB boost.
  ramp(graph.bypassGain.gain, active ? 0 : 1, context);
  ramp(graph.processedGain.gain, active ? 1 : 0, context);
  ramp(graph.outputGain.gain, Math.max(0, Math.min(1, outputVolume)), context);
}
