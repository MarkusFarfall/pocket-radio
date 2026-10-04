/**
 * Генеративный эмбиент на Web Audio: звучит без интернета, ничего не скачивает.
 * Сцены подбираются по жанру и настроению станции, к которой пропала связь.
 */

export type SceneId = "drift" | "lofi" | "lounge" | "pulse" | "piano" | "rain" | "waves";

export interface SceneInfo {
  id: SceneId;
  title: string;
  desc: string;
  /** ключ значка из glyphs.ts */
  glyph: string;
}

export const SCENES: SceneInfo[] = [
  { id: "drift", title: "Дрейф", desc: "Медленные пады и далёкие колокольчики", glyph: "waves" },
  { id: "lofi", title: "Lo-Fi кафе", desc: "Тёплые аккорды, винил и неспешный бит", glyph: "coffee" },
  { id: "lounge", title: "Джаз-лаунж", desc: "Контрабас, щётки и электропиано", glyph: "piano" },
  { id: "pulse", title: "Ночной пульс", desc: "Мягкий синтвейв с арпеджио", glyph: "audio" },
  { id: "piano", title: "Тихое пианино", desc: "Медленные аккорды в большом зале", glyph: "music2" },
  { id: "rain", title: "Дождь", desc: "Шум дождя за окном и далёкий гром", glyph: "cloud" },
  { id: "waves", title: "Прибой", desc: "Накат волн и тёплый дрон", glyph: "wind" },
];

export function sceneInfo(id: string): SceneInfo {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}

/** Какая сцена подходит станции по жанру, тегам и настроению. */
export function sceneFor(s: { genre?: string; mood?: string; tags?: string[]; name?: string }): SceneId {
  const text = `${s.genre ?? ""} ${(s.tags ?? []).join(" ")} ${s.name ?? ""}`.toLowerCase();
  const mood = (s.mood ?? "").toLowerCase();
  if (/lo-?fi|chillhop|study|coffee|кофе/.test(text)) return "lofi";
  if (/джаз|jazz|блюз|blues|swing|lounge|лаунж/.test(text)) return "lounge";
  if (/классик|classical|opera|опера|детям|kids/.test(text)) return "piano";
  if (/электрон|electro|techno|house|trance|dance|dnb|synth|phonk|vapor|рок|rock|метал|metal/.test(text) || mood === "энергия") return "pulse";
  if (/хип|hip|rap|ретро|retro|инди|indie|поп|pop|кантри|country|регги|reggae/.test(text) || mood === "ностальгия") return "lofi";
  if (/новост|news|разговор|talk|подкаст|podcast/.test(text)) return "rain";
  if (mood === "ночное") return "waves";
  return "drift";
}

/* ------------------------------ звуковые кирпичики ------------------------------ */

type Noise = "white" | "pink" | "brown";

interface Env {
  ac: AudioContext;
  dry: GainNode;
  send: GainNode;
  noise: Record<Noise, AudioBuffer>;
  stops: Array<() => void>;
}
type Runner = (e: Env) => { tick(until: number): void };

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = Math.random;
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

function makeNoise(ac: AudioContext, type: Noise, seconds = 4): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  if (type === "white") {
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
  } else if (type === "pink") {
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  // плавно сводим концы, чтобы при зацикливании не было щелчка
  const n = Math.min(2048, len >> 2);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    d[len - n + i] = d[len - n + i] * (1 - k) + d[i] * k;
  }
  return buf;
}

function makeImpulse(ac: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function filt(ac: AudioContext, from: AudioNode, type: BiquadFilterType, f: number, q?: number): BiquadFilterNode {
  const b = ac.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  if (q !== undefined) b.Q.value = q;
  from.connect(b);
  return b;
}

interface ToneOpts {
  f: number;
  t: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  a?: number;
  r?: number;
  lp?: number;
  det?: number;
  pan?: number;
  wet?: number;
  harm?: [number, number][];
}

/** Нота: осциллятор(ы) с огибающей, фильтром, панорамой и отправкой в реверберацию. */
function tone(e: Env, o: ToneOpts) {
  const { ac } = e;
  const a = o.a ?? 0.01;
  const r = o.r ?? 0.5;
  const vol = o.vol ?? 0.1;
  const hold = o.t + Math.max(a, o.dur);
  const end = hold + r;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(vol, o.t + a);
  g.gain.setValueAtTime(vol, hold);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  let last: AudioNode = g;
  if (o.lp) last = filt(ac, last, "lowpass", o.lp);
  if (o.pan !== undefined && typeof ac.createStereoPanner === "function") {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    last.connect(p);
    last = p;
  }
  last.connect(e.dry);
  if (o.wet) {
    const s = ac.createGain();
    s.gain.value = o.wet;
    last.connect(s);
    s.connect(e.send);
  }
  for (const d of o.det ? [-o.det, o.det] : [0]) {
    const osc = ac.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.value = o.f;
    osc.detune.value = d;
    osc.connect(g);
    osc.start(o.t);
    osc.stop(end + 0.05);
  }
  for (const [mult, amp] of o.harm ?? []) {
    const osc = ac.createOscillator();
    osc.frequency.value = o.f * mult;
    const hg = ac.createGain();
    hg.gain.value = amp;
    osc.connect(hg);
    hg.connect(g);
    osc.start(o.t);
    osc.stop(end + 0.05);
  }
}

interface HitOpts {
  t: number;
  dur: number;
  vol: number;
  noise?: Noise;
  hp?: number;
  lp?: number;
  bp?: number;
  q?: number;
  pan?: number;
  wet?: number;
  a?: number;
}

/** Шумовой «удар»: хэт, щётка, капля дождя, гром. */
function hit(e: Env, o: HitOpts) {
  const { ac } = e;
  const src = ac.createBufferSource();
  src.buffer = e.noise[o.noise ?? "white"];
  src.loop = true;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(o.vol, o.t + (o.a ?? 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  let last: AudioNode = src;
  if (o.hp) last = filt(ac, last, "highpass", o.hp);
  if (o.lp) last = filt(ac, last, "lowpass", o.lp);
  if (o.bp) last = filt(ac, last, "bandpass", o.bp, o.q ?? 1);
  last.connect(g);
  last = g;
  if (o.pan !== undefined && typeof ac.createStereoPanner === "function") {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    last.connect(p);
    last = p;
  }
  last.connect(e.dry);
  if (o.wet) {
    const s = ac.createGain();
    s.gain.value = o.wet;
    last.connect(s);
    s.connect(e.send);
  }
  src.start(o.t, rnd() * 3);
  src.stop(o.t + o.dur + 0.05);
}

function kick(e: Env, t: number, vol: number) {
  const { ac } = e;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g);
  g.connect(e.dry);
  o.start(t);
  o.stop(t + 0.45);
}

/** Непрерывный шумовой слой (дождь, море, винил). */
function loop(e: Env, type: Noise, build: (src: AudioNode) => AudioNode, vol: number, fadeIn = 3): GainNode {
  const { ac } = e;
  const src = ac.createBufferSource();
  src.buffer = e.noise[type];
  src.loop = true;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.linearRampToValueAtTime(vol, ac.currentTime + fadeIn);
  build(src).connect(g);
  g.connect(e.dry);
  src.start();
  e.stops.push(() => {
    try {
      src.stop();
    } catch {
      /* уже остановлен */
    }
  });
  return g;
}

function lfo(e: Env, freq: number, depth: number, param: AudioParam, startAfter = 0) {
  const { ac } = e;
  const o = ac.createOscillator();
  o.frequency.value = freq;
  const d = ac.createGain();
  d.gain.value = depth;
  o.connect(d);
  d.connect(param);
  o.start(ac.currentTime + startAfter);
  e.stops.push(() => {
    try {
      o.stop();
    } catch {
      /* уже остановлен */
    }
  });
}

/* ----------------------------------- сцены ----------------------------------- */

const drift: Runner = (e) => {
  const { ac } = e;
  const prog = [
    [57, 60, 64, 67, 71],
    [53, 57, 60, 64, 67],
    [48, 55, 59, 64, 67],
    [55, 59, 62, 64, 69],
  ];
  const roots = [45, 41, 36, 43];
  const pent = [69, 72, 74, 76, 79, 81];
  const dur = 16;
  let next = ac.currentTime + 0.3;
  let i = 0;
  return {
    tick(until) {
      while (next < until) {
        const c = prog[i % prog.length];
        const root = roots[i % roots.length];
        c.forEach((m, k) =>
          tone(e, { f: mtof(m), t: next + k * 0.15, dur, a: 5, r: 6, type: "sawtooth", det: 7, vol: 0.011, lp: 800 + rnd() * 500, pan: (k / (c.length - 1)) * 1.2 - 0.6, wet: 0.7 })
        );
        tone(e, { f: mtof(root), t: next, dur, a: 4, r: 6, vol: 0.05, wet: 0.2 });
        tone(e, { f: mtof(root + 12), t: next + 0.5, dur, a: 5, r: 6, type: "triangle", vol: 0.02, lp: 500, wet: 0.4 });
        const bells = 2 + Math.floor(rnd() * 3);
        for (let b = 0; b < bells; b++)
          tone(e, { f: mtof(pick(pent)), t: next + 1 + rnd() * (dur - 3), dur: 0.05, a: 0.02, r: 5, vol: 0.026, harm: [[2.76, 0.35], [5.4, 0.12]], pan: rnd() * 1.6 - 0.8, wet: 0.95 });
        next += dur;
        i++;
      }
    },
  };
};

const lofi: Runner = (e) => {
  const { ac } = e;
  const bpm = 70 + Math.floor(rnd() * 10);
  const step = 60 / bpm / 4;
  const prog = [
    { root: 38, n: [53, 57, 60, 64] },
    { root: 43, n: [59, 64, 65, 69] },
    { root: 36, n: [52, 55, 59, 62] },
    { root: 45, n: [60, 64, 67, 71] },
  ];
  const scale = [74, 77, 79, 81, 84, 86];
  loop(e, "pink", (s) => filt(ac, s, "highpass", 2800), 0.012);
  let t = ac.currentTime + 0.3;
  let n = 0;
  return {
    tick(until) {
      while (t < until) {
        const s = n % 16;
        const ch = prog[Math.floor(n / 16) % prog.length];
        const tt = t + (s % 2 === 1 ? step * 0.24 : 0);
        if (s === 0 || (s === 10 && rnd() < 0.7)) kick(e, tt, s === 0 ? 0.24 : 0.16);
        if (s === 4 || s === 12) hit(e, { t: tt, dur: 0.18, vol: 0.07, noise: "pink", bp: 1800, q: 0.8, wet: 0.25 });
        if (s % 2 === 0 ? rnd() < 0.9 : rnd() < 0.35) hit(e, { t: tt, dur: 0.05, vol: s % 4 === 2 ? 0.032 : 0.018, hp: 7000, pan: rnd() * 0.6 - 0.3 });
        if (s === 0) {
          ch.n.forEach((m, k) => tone(e, { f: mtof(m), t: tt + k * 0.014, dur: 1.4, a: 0.012, r: 1.4, type: "triangle", vol: 0.04, harm: [[2, 0.3], [3, 0.08]], lp: 3000, pan: -0.2 + k * 0.12, wet: 0.35 }));
          tone(e, { f: mtof(ch.root), t: tt, dur: step * 5, a: 0.01, r: 0.3, vol: 0.14, lp: 400 });
        } else if (s === 6 && rnd() < 0.5) {
          ch.n.slice(1).forEach((m, k) => tone(e, { f: mtof(m), t: tt + k * 0.012, dur: 0.4, a: 0.01, r: 0.8, type: "triangle", vol: 0.026, harm: [[2, 0.3]], lp: 2800, wet: 0.3 }));
        }
        if (s === 10) tone(e, { f: mtof(ch.root + 7), t: tt, dur: step * 3, a: 0.01, r: 0.25, vol: 0.1, lp: 420 });
        if (s % 2 === 0 && rnd() < 0.1) tone(e, { f: mtof(pick(scale)), t: tt, dur: 0.22, a: 0.01, r: 0.9, type: "triangle", vol: 0.04, lp: 2600, pan: rnd() - 0.5, wet: 0.6 });
        if (rnd() < 0.05) hit(e, { t: t + rnd() * step, dur: 0.015, vol: 0.05, hp: 1800 });
        t += step;
        n++;
      }
    },
  };
};

const lounge: Runner = (e) => {
  const { ac } = e;
  const bpm = 82 + Math.floor(rnd() * 8);
  const beat = 60 / bpm;
  const eighth = beat / 2;
  const prog = [
    { root: 38, n: [53, 57, 60, 64], sc: [62, 65, 67, 69, 72, 74] },
    { root: 43, n: [59, 64, 65, 69], sc: [67, 69, 71, 72, 74, 77] },
    { root: 36, n: [52, 55, 59, 62], sc: [64, 67, 69, 71, 72, 76] },
    { root: 45, n: [61, 64, 67, 71], sc: [64, 67, 69, 71, 73, 76] },
  ];
  let t = ac.currentTime + 0.3;
  let n = 0;
  return {
    tick(until) {
      while (t < until) {
        const s = n % 8;
        const bar = Math.floor(n / 8);
        const ch = prog[bar % prog.length];
        const nextRoot = prog[(bar + 1) % prog.length].root;
        const tt = t + (s % 2 === 1 ? eighth * 0.32 : 0);
        if (s % 2 === 0) hit(e, { t: tt, dur: 0.12, vol: 0.04, hp: 6500, pan: 0.3 });
        else if (rnd() < 0.8) hit(e, { t: tt, dur: 0.1, vol: 0.022, hp: 6500, pan: 0.3 });
        if (s === 2 || s === 6) hit(e, { t: tt, dur: 0.22, vol: 0.05, noise: "pink", bp: 2200, q: 0.7, wet: 0.2, pan: -0.2 });
        if (s % 2 === 0) {
          const idx = s / 2;
          const note = idx === 0 ? ch.root : idx === 3 ? nextRoot + (rnd() < 0.5 ? 1 : -1) : ch.root + pick([2, 4, 7, 9]);
          tone(e, { f: mtof(note), t: tt, dur: beat * 0.9, a: 0.012, r: 0.12, type: "triangle", vol: 0.17, lp: 520 });
        }
        if (s === 0) ch.n.forEach((m, k) => tone(e, { f: mtof(m), t: tt + k * 0.018, dur: beat * 3, a: 0.02, r: 1.2, type: "triangle", vol: 0.03, harm: [[2, 0.35], [4, 0.1]], lp: 2600, pan: -0.25 + k * 0.15, wet: 0.35 }));
        if (s === 5 && rnd() < 0.55) ch.n.slice(1).forEach((m, k) => tone(e, { f: mtof(m), t: tt + k * 0.012, dur: 0.25, a: 0.01, r: 0.7, type: "triangle", vol: 0.026, harm: [[2, 0.3]], lp: 2400, wet: 0.3 }));
        if (s % 2 === 0 && rnd() < 0.26) tone(e, { f: mtof(pick(ch.sc)), t: tt, dur: eighth * 1.5, a: 0.025, r: 0.8, type: "triangle", vol: 0.045, lp: 2200, pan: rnd() * 0.8 - 0.4, wet: 0.5 });
        t += eighth;
        n++;
      }
    },
  };
};

const pulse: Runner = (e) => {
  const { ac } = e;
  const bpm = 98 + Math.floor(rnd() * 10);
  const step = 60 / bpm / 4;
  const prog = [
    { root: 45, c: [57, 60, 64, 69] },
    { root: 41, c: [53, 57, 60, 65] },
    { root: 36, c: [60, 64, 67, 72] },
    { root: 43, c: [55, 59, 62, 67] },
  ];
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 3, 2];
  let t = ac.currentTime + 0.3;
  let n = 0;
  return {
    tick(until) {
      while (t < until) {
        const s = n % 16;
        const ch = prog[Math.floor(n / 16) % prog.length];
        if (s % 4 === 0) kick(e, t, 0.2);
        if (s % 4 === 2) hit(e, { t, dur: 0.06, vol: 0.035, hp: 8000, pan: 0.25 });
        else if (rnd() < 0.2) hit(e, { t, dur: 0.03, vol: 0.016, hp: 8000, pan: -0.25 });
        if (s === 4 || s === 12) hit(e, { t, dur: 0.15, vol: 0.05, noise: "pink", bp: 1500, q: 0.8, wet: 0.3 });
        if (s === 0 || s === 10 || (s === 6 && rnd() < 0.5)) tone(e, { f: mtof(ch.root), t, dur: step * 3, a: 0.01, r: 0.1, type: "sawtooth", vol: 0.06, lp: 320 });
        if (rnd() < 0.92) {
          const cut = 700 + 1500 * (0.5 + 0.5 * Math.sin(t * 0.35));
          tone(e, { f: mtof(ch.c[pattern[s]]), t, dur: step * 0.8, a: 0.005, r: 0.12, type: "sawtooth", vol: 0.028, lp: cut, pan: Math.sin(t * 0.5) * 0.5, wet: 0.3 });
        }
        if (s === 0) ch.c.forEach((m) => tone(e, { f: mtof(m - 12), t, dur: step * 16, a: 1.2, r: 1.5, type: "sawtooth", det: 6, vol: 0.008, lp: 600, wet: 0.6 }));
        t += step;
        n++;
      }
    },
  };
};

const piano: Runner = (e) => {
  const { ac } = e;
  const beat = 60 / (52 + Math.floor(rnd() * 6));
  const prog = [
    { b: 43, c: [59, 62, 66, 67] },
    { b: 38, c: [54, 57, 61, 66] },
    { b: 40, c: [55, 59, 62, 67] },
    { b: 36, c: [52, 55, 59, 64] },
  ];
  const scale = [74, 76, 78, 81, 83, 86];
  const key = (f: number, t: number, vol: number, r: number, pan: number) =>
    tone(e, { f, t, dur: 0.08, a: 0.004, r, type: "triangle", vol, harm: [[2, 0.45], [3, 0.2], [4, 0.1]], lp: 3200, pan, wet: 0.55 });
  let t = ac.currentTime + 0.4;
  let n = 0;
  return {
    tick(until) {
      while (t < until) {
        const s = n % 3;
        const ch = prog[Math.floor(n / 3) % prog.length];
        if (s === 0) key(mtof(ch.b), t, 0.12, 2.8, -0.3);
        else (s === 1 ? ch.c : ch.c.slice(1)).forEach((m, k) => key(mtof(m), t + k * 0.022, 0.05, 2.2, -0.2 + k * 0.15));
        if ((s === 0 || s === 2) && rnd() < 0.45) key(mtof(pick(scale)), t + 0.02, 0.07, 3.2, rnd() * 0.6 - 0.2);
        t += beat;
        n++;
      }
    },
  };
};

const rain: Runner = (e) => {
  const { ac } = e;
  loop(e, "pink", (s) => filt(ac, filt(ac, s, "highpass", 400), "lowpass", 7500), 0.42);
  const gust = loop(e, "white", (s) => filt(ac, s, "bandpass", 3200, 0.6), 0.05);
  lfo(e, 0.06, 0.03, gust.gain);
  loop(e, "brown", (s) => filt(ac, s, "lowpass", 220), 0.08);
  let next = ac.currentTime + 0.2;
  let thunder = ac.currentTime + 20 + rnd() * 40;
  return {
    tick(until) {
      while (next < until) {
        hit(e, { t: next, dur: 0.04 + rnd() * 0.04, vol: 0.05 + rnd() * 0.07, bp: 1800 + rnd() * 3500, q: 3, pan: rnd() * 1.8 - 0.9, wet: 0.4 });
        next += 0.04 + rnd() * 0.22;
      }
      if (thunder < until) {
        hit(e, { t: thunder, dur: 7, vol: 0.5, noise: "brown", lp: 160, a: 2.5, wet: 0.5 });
        thunder += 45 + rnd() * 60;
      }
    },
  };
};

const waves: Runner = (e) => {
  const { ac } = e;
  const body = loop(e, "brown", (s) => filt(ac, s, "lowpass", 600), 0.28, 4);
  lfo(e, 0.105, 0.2, body.gain);
  const foam = loop(e, "white", (s) => filt(ac, s, "bandpass", 2400, 0.5), 0.02, 4);
  lfo(e, 0.105, 0.018, foam.gain, 1.4);
  const swell = loop(e, "pink", (s) => filt(ac, s, "lowpass", 900), 0.1, 5);
  lfo(e, 0.07, 0.08, swell.gain, 2);
  const chord = [57, 64, 67, 71];
  let next = ac.currentTime + 0.5;
  return {
    tick(until) {
      while (next < until) {
        chord.forEach((m, k) => tone(e, { f: mtof(m), t: next + k * 0.4, dur: 18, a: 6, r: 8, vol: 0.014, wet: 0.8, pan: k * 0.4 - 0.6 }));
        next += 22;
      }
    },
  };
};

const RUNNERS: Record<SceneId, Runner> = { drift, lofi, lounge, pulse, piano, rain, waves };

/* ----------------------------------- движок ----------------------------------- */

const LOOKAHEAD = 4;

class AmbientEngine {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private ir: AudioBuffer | null = null;
  private noise: Record<Noise, AudioBuffer> | null = null;
  private bus: GainNode | null = null;
  private cleanup: (() => void) | null = null;
  private timer: number | null = null;
  private idle: number | null = null;
  private current: SceneId | null = null;
  private volume = 0.6;
  private gen = 0;

  get scene(): SceneId | null {
    return this.current;
  }
  get playing(): boolean {
    return this.current !== null;
  }

  private ctx(): AudioContext {
    if (this.ac) return this.ac;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio не поддерживается этим браузером");
    const ac = new Ctor();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    const master = ac.createGain();
    master.gain.value = this.volume;
    master.connect(comp);
    comp.connect(ac.destination);
    this.ac = ac;
    this.master = master;
    return ac;
  }

  private assets(ac: AudioContext) {
    if (this.noise) return;
    this.noise = { white: makeNoise(ac, "white"), pink: makeNoise(ac, "pink"), brown: makeNoise(ac, "brown") };
    this.ir = makeImpulse(ac, 3.6, 2.4);
  }

  /** Вызывать из пользовательского жеста (нажатие «играть»): на iOS иначе звук потом не запустится. */
  prime() {
    try {
      const ac = this.ctx();
      if (ac.state === "suspended") void ac.resume().catch(() => undefined);
    } catch {
      /* Web Audio недоступен — эмбиент просто не включится */
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ac && this.master) this.master.gain.setTargetAtTime(v, this.ac.currentTime, 0.08);
  }

  async start(scene: SceneId, volume: number): Promise<void> {
    const ac = this.ctx();
    this.assets(ac);
    const my = ++this.gen;
    this.halt(0.35);
    if (this.idle) {
      clearTimeout(this.idle);
      this.idle = null;
    }
    this.volume = volume;
    this.master!.gain.setTargetAtTime(volume, ac.currentTime, 0.05);
    const running = () => ac.state === "running";
    if (!running()) {
      try {
        await ac.resume();
      } catch {
        /* ждём жеста пользователя */
      }
      if (!running()) this.resumeOnGesture();
    }
    if (my !== this.gen) return;

    const bus = ac.createGain();
    bus.gain.setValueAtTime(0.0001, ac.currentTime);
    bus.gain.linearRampToValueAtTime(1, ac.currentTime + 2.5);
    bus.connect(this.master!);
    const dry = ac.createGain();
    dry.connect(bus);
    const conv = ac.createConvolver();
    conv.buffer = this.ir;
    const wet = ac.createGain();
    wet.gain.value = 0.8;
    const send = ac.createGain();
    send.connect(conv);
    conv.connect(wet);
    wet.connect(bus);

    const env: Env = { ac, dry, send, noise: this.noise!, stops: [] };
    const runner = RUNNERS[scene](env);
    runner.tick(ac.currentTime + LOOKAHEAD);
    this.timer = window.setInterval(() => runner.tick(ac.currentTime + LOOKAHEAD), 400);
    this.cleanup = () => {
      env.stops.forEach((f) => f());
      try {
        bus.disconnect();
        conv.disconnect();
      } catch {
        /* уже отключено */
      }
    };
    this.bus = bus;
    this.current = scene;
  }

  stop(fade = 1.8) {
    this.gen++;
    this.halt(fade);
  }

  private halt(fade: number) {
    const ac = this.ac;
    if (!ac || !this.current) return;
    const bus = this.bus;
    const cleanup = this.cleanup;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.current = null;
    this.bus = null;
    this.cleanup = null;
    if (bus) {
      bus.gain.cancelScheduledValues(ac.currentTime);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), ac.currentTime);
      bus.gain.linearRampToValueAtTime(0.0001, ac.currentTime + fade);
    }
    setTimeout(() => cleanup?.(), fade * 1000 + 200);
    // без звука контекст усыпляем, чтобы не тратить батарею
    if (this.idle) clearTimeout(this.idle);
    this.idle = window.setTimeout(() => {
      if (!this.current && this.ac) void this.ac.suspend().catch(() => undefined);
    }, fade * 1000 + 800);
  }

  private resumeOnGesture() {
    const go = () => {
      void this.ac?.resume().catch(() => undefined);
      document.removeEventListener("pointerdown", go);
      document.removeEventListener("keydown", go);
    };
    document.addEventListener("pointerdown", go);
    document.addEventListener("keydown", go);
  }
}

export const ambient = new AmbientEngine();
