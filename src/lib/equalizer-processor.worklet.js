/* Runs on the audio thread. No imports, fetches, timers or per-sample allocations.
 * Stereo-linked sample-peak protection (not a true-peak/LUFS processor).
 * Meter inputs remain live while A/B is switched; matching itself is NOT an AGC.
 */
class PocketEqualizerOutput extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'revision', defaultValue: 0, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.delay = Math.max(1, Math.round(sampleRate * 0.005));
    this.size = this.delay + 1;
    this.left = new Float32Array(this.size);
    this.right = new Float32Array(this.size);
    this.peaks = new Float32Array(this.size + 1);
    this.indices = new Float64Array(this.size + 1);
    this.head = 0;
    this.tail = 0;
    this.frame = 0;
    this.gain = 1;
    this.attack = Math.exp(-1 / (sampleRate * 0.0005));
    this.release = Math.exp(-1 / (sampleRate * 0.08));
    // Ten 100-ms blocks: an exact, bounded rolling 1-second RMS window.
    this.blockSize = Math.round(sampleRate * 0.1);
    this.dryBlocks = new Float64Array(10);
    this.wetBlocks = new Float64Array(10);
    this.revision = 0;
    this.resetMeter();

  }

  resetMeter() {
    this.dryBlocks.fill(0);
    this.wetBlocks.fill(0);
    this.blockIndex = 0;
    this.blocks = 0;
    this.blockSamples = 0;
    this.drySum = 0;
    this.wetSum = 0;
    // Exclude filter/gain transitions from the comparison measurement.
    this.warmup = Math.round(sampleRate * 0.25);
  }

  process(inputs, outputs, parameters) {
    // AudioParam, not a reset message: the revision changes on the audio timeline,
    // even during fast OfflineAudioContext rendering or a busy main thread.
    const revision = parameters.revision[0];
    if (revision !== this.revision) {
      this.revision = revision;
      this.resetMeter();
    }
    const output = outputs[0];
    if (!output?.length) return true;
    const mixed = inputs[0];
    const dry = inputs[1];
    const wet = inputs[2];
    const outL = output[0];
    const outR = output[1] || output[0];
    const queueSize = this.peaks.length;
    for (let i = 0; i < outL.length; i++) {
      const l = Number.isFinite(mixed?.[0]?.[i]) ? mixed[0][i] : 0;
      const r = Number.isFinite(mixed?.[1]?.[i]) ? mixed[1][i] : l;
      const peak = Math.max(Math.abs(l), Math.abs(r));
      // Monotonic deque: max of the delayed sample and its look-ahead window.
      while (this.head !== this.tail && this.indices[this.head] < this.frame - this.delay) {
        this.head = (this.head + 1) % queueSize;
      }
      while (this.head !== this.tail) {
        const previous = (this.tail + queueSize - 1) % queueSize;
        if (this.peaks[previous] > peak) break;
        this.tail = previous;
      }
      this.peaks[this.tail] = peak;
      this.indices[this.tail] = this.frame;
      this.tail = (this.tail + 1) % queueSize;
      const write = this.frame % this.size;
      this.left[write] = l;
      this.right[write] = r;
      const read = (write + 1) % this.size;
      const delayedL = this.frame >= this.delay ? this.left[read] : 0;
      const delayedR = this.frame >= this.delay ? this.right[read] : 0;
      const desired = Math.min(1, 0.999 / Math.max(this.peaks[this.head], 1e-20));
      const coefficient = desired < this.gain ? this.attack : this.release;
      this.gain = desired + (this.gain - desired) * coefficient;
      // A final linked gain bound catches even an abrupt peak while the envelope
      // is approaching its target. Neither channel is clipped independently.
      const safeGain = Math.min(this.gain, 0.999 / Math.max(Math.abs(delayedL), Math.abs(delayedR), 1e-20));
      outL[i] = delayedL * safeGain;
      outR[i] = delayedR * safeGain;
      this.frame++;

      if (this.warmup > 0) {
        this.warmup--;
        continue;
      }
      const dl = dry?.[0]?.[i] || 0;
      const dr = dry?.[1]?.[i] ?? dl;
      const wl = wet?.[0]?.[i] || 0;
      const wr = wet?.[1]?.[i] ?? wl;
      this.drySum += (dl * dl + dr * dr) * 0.5;
      this.wetSum += (wl * wl + wr * wr) * 0.5;
      if (++this.blockSamples >= this.blockSize) {
        this.dryBlocks[this.blockIndex] = this.drySum / this.blockSamples;
        this.wetBlocks[this.blockIndex] = this.wetSum / this.blockSamples;
        this.blockIndex = (this.blockIndex + 1) % 10;
        this.blocks = Math.min(10, this.blocks + 1);
        let dryPower = 0;
        let wetPower = 0;
        for (let j = 0; j < 10; j++) {
          dryPower += this.dryBlocks[j];
          wetPower += this.wetBlocks[j];
        }
        this.port.postMessage({
          revision: this.revision,
          complete: this.blocks === 10,
          dryPower: dryPower / this.blocks,
          wetPower: wetPower / this.blocks,
        });
        this.blockSamples = 0;
        this.drySum = 0;
        this.wetSum = 0;
      }
    }
    return true;
  }
}
registerProcessor('pocket-equalizer-output-v1', PocketEqualizerOutput);
