# Equalizer: availability, output safety and level-matched A/B

## Scope

This change fixes EQ status/A/B after edits, accounts for preamp and transitions in output protection, and adds measured level matching. Built-in frequency curves, preset migration, the ten-band UI and the native CORS fallback are deliberately unchanged.

## Signal path

`MediaElementAudioSourceNode` feeds two branches:

- dry → comparison attenuation → bypass fader;
- ten existing biquads → headroom gain → comparison attenuation → processed fader.

The branches sum through the user's output-volume gain into a local AudioWorklet, then the destination. The worklet also receives dry and pre-comparison wet signals for metering. Both channels use the same limiter gain, preserving stereo balance.

The processor is a normal Vite-emitted, content-hashed JS asset. It does not use a CDN, `eval`, a blob URL or an extra dependency. `graph.ready` must resolve before starting audio. On download/processor failure the radio engine returns to its independent native media element; ambient audio returns to its existing compressor path. Module loading has an 8-second bound.

## Output protection

- The headroom calculation samples the sum of all biquad responses at 1,024 frequencies, including DC and Nyquist.
- It considers **filter response + requested preamp**. Flat/0 keeps unity gain; a positive total response receives an additional 0.8 dB margin.
- On a curve edit, attenuation is scheduled first, then filter coefficients change, then gain is released to its final value. Repeated edits hold current automation before scheduling new ramps.
- Bypass only crossfades branches. It does not reset the filter coefficients to zero while their output is still audible.
- A stereo-linked output protector adds 5 ms look-ahead, a 0.5 ms attack and an 80 ms release. A linked instantaneous safety bound covers peaks that arrive before the envelope reaches its target. Samples remain within ±0.999; this protector also remains in the graph when automatic headroom is manually disabled.
- This is **sample-peak protection, not a certified true-peak limiter**. Intersample/DAC reconstruction peaks are not measured. Under sustained overdrive the protector necessarily changes dynamics; keep automatic headroom enabled. Below its ceiling it adds delay but does not alter samples.

## A/B semantics

`matchLevel` defaults to true and is stored with the existing device-local EQ settings. Existing settings without this field migrate to true; preset curves and saved profiles are not changed.

1. Exclude the first 250 ms after a source/curve change.
2. Measure the latest one second of stereo mean-square energy in ten 100-ms blocks.
3. Reject silence, non-finite values and incomplete windows.
4. On the first “Compare without EQ”, compute:
   - dry gain = `min(1, sqrt(wetPower / dryPower))`;
   - wet gain = `min(1, sqrt(dryPower / wetPower))`.
5. Freeze both coefficients across A/B switches. Neither branch is ever boosted; this is not a continuous AGC.
6. Reset on a processing change, new source, or explicit “End A/B”. A k-rate `revision` AudioParam resets the meter on the audio timeline; the same revision tags reports so stale worklet messages from the old source/curve are discarded.

The UI distinguishes collecting a measurement from checking whether the source supports EQ. Users can explicitly disable level matching for a raw comparison, with a warning about unequal levels. It displays the frozen attenuation of both branches.

The measurement is **RMS, not LUFS or a guarantee of identical subjective loudness**. Its wet measurement is before output protection and the ambient compressor. If a user deliberately drives the limiter/compressor hard, their dynamic gain can affect the final RMS; the normal automatic-headroom path minimizes that situation. Matching is a snapshot of recent audio, not a promise that all later, different content has identical loudness.

## Availability and fallback

Source availability and the enabled/bypass state are separate. Preset edits, saving a profile and changing preamp do not fabricate a new `checking` state. CORS-incompatible sources remain unavailable after an edit, rather than showing a check that never finishes. Paused compatible sources remain configurable. The status text explicitly identifies EQ-off and comparison modes.

If AudioWorklet is missing or fails to load, audio must still play natively without EQ. No unprotected processed-output fallback is used. The ambient engine retains its existing compressor as a non-EQ fallback.

## Verification

Run:

```sh
npm ci
npx playwright install --with-deps chromium
npm run typecheck
npm run build
npm test
```

New/extended tests cover:

- Flat/0 and disabled transparency, with latency alignment, at 44.1 and 48 kHz;
- preamp +6 dB with automatic reserve on/off;
- built-in presets and rapid extreme edits/bypass transitions;
- finite output, sample-peak ceiling and stereo-linked gain;
- measured A/B within 0.2 dB on a stationary periodic multitone;
- frozen coefficients, silence rejection and source/curve reset;
- real UI edits after playback, comparison exit, enable/disable text;
- paused sources, worklet abort/network/8-second timeout failures, missing AudioWorklet, CORS fallback and ambient comparison.

Final local verification: **85 tests passed**, TypeScript and production build passed, and the built application passed a separate local-track/level-matched-A/B smoke test. The existing Vite large-chunk warning remains outside this change's scope.

Chromium automation is not a substitute for a physical-device listening check. Before calling this hardware-validated, check Safari/iOS and Android with headphones, backgrounding and screen lock, including radio sources with and without CORS.

The full-suite run also corrected a pre-existing station-search test fixture: it
returned Jazz FM for every Cyrillic query, including the transliteration of
"No Match Radio". The fixture now models matching names; production search code
is unchanged.
