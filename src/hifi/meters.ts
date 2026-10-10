import { audioEngine } from '../audio/AudioEngine';
import type { MeterReading } from './HifiChain';
import { VuDisplay } from './vu';

const ZERO: MeterReading = { inL: 0, inR: 0, outL: 0, outR: 0, outRmsL: 0, outRmsR: 0, clip: false };
let cache: { at: number; value: MeterReading } = { at: 0, value: ZERO };
let clipUntil = 0;
const vu = new VuDisplay();
let display = { vuL: -60, vuR: -60, vuReferenceDb: -42 };

/**
 * Real signal levels from the DSP chain's analysers (peak, linear 0..1). Several components
 * read this every frame, so results are cached for ~1 frame. `clipHeld` latches a clip for 1 s.
 */
export function readMeters(): MeterReading & { clipHeld: boolean; vuL: number; vuR: number; vuReferenceDb: number } {
  const now = performance.now();
  if (now - cache.at > 14) {
    const elapsed = (now - cache.at) / 1000;
    cache = { at: now, value: audioEngine.readMeters() ?? ZERO };
    display = vu.update(cache.value.outRmsL, cache.value.outRmsR, elapsed);
    if (cache.value.clip) clipUntil = now + 1000;
  }
  return { ...cache.value, ...display, clipHeld: now < clipUntil };
}

/** Peak → dBFS, floored at −60. */
export const toDb = (x: number) => Math.max(-60, 20 * Math.log10(Math.max(x, 1e-6)));
