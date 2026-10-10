/**
 * Pure DSP math shared by the audio graph and the UI (EQ curve plots, tests).
 * No Web Audio objects here.
 */
import type { AmpDevice, AmpState, FilterSpec, OutputProfile } from './types';
import type { Route } from './routing';

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(g, 1e-9));

/** Measure the actual waveform; RMS drives VU needles, peak drives clipping meters. */
export function signalLevels(samples: Float32Array): { peak: number; rms: number } {
  let peak = 0; let squares = 0;
  for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); squares += sample * sample; }
  return { peak, rms: samples.length ? Math.sqrt(squares / samples.length) : 0 };
}

/** Volume knob audio taper: 0 → silence, 0.5 → −20 dB, 1 → 0 dB (never above unity). */
export function volumeTaper(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  if (x <= 0.001) return 0;
  return dbToGain(-40 * (1 - x));
}

export const TONE_RANGE_DB = 12;

/**
 * Loudness compensation: as volume drops below ~−10 dB, lift lows and (less) highs, following
 * the general shape of equal-loudness contours. Off → 0 dB.
 */
export function loudnessBoost(on: boolean, ampVolume: number): { lowDb: number; highDb: number } {
  if (!on) return { lowDb: 0, highDb: 0 };
  const attenuationDb = -gainToDb(Math.max(volumeTaper(ampVolume), 1e-4)); // 0..80
  const amount = Math.min(1, Math.max(0, (attenuationDb - 6) / 30));
  return { lowDb: 10 * amount, highDb: 4 * amount };
}

/** Magnitude in dB of an RBJ-cookbook biquad (as implemented by Web Audio BiquadFilterNode). */
export function biquadMagnitudeDb(f: FilterSpec, freq: number, sampleRate = 48000): number {
  const w0 = (2 * Math.PI * f.freq) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const gain = f.gain ?? 0;
  const A = Math.pow(10, gain / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (f.type) {
    case 'lowpass':
    case 'highpass': {
      // Web Audio's Q for LP/HP is in dB; convert to linear.
      const qLin = Math.pow(10, (f.q ?? 0.7071) / 20);
      const alpha = sin / (2 * qLin);
      if (f.type === 'lowpass') {
        b0 = (1 - cos) / 2;
        b1 = 1 - cos;
        b2 = (1 - cos) / 2;
      } else {
        b0 = (1 + cos) / 2;
        b1 = -(1 + cos);
        b2 = (1 + cos) / 2;
      }
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'peaking': {
      const alpha = sin / (2 * (f.q ?? 1));
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    }
    case 'lowshelf':
    case 'highshelf': {
      // Web Audio shelves use S = 1.
      const alpha = (sin / 2) * Math.sqrt(2);
      const sq = 2 * Math.sqrt(A) * alpha;
      if (f.type === 'lowshelf') {
        b0 = A * (A + 1 - (A - 1) * cos + sq);
        b1 = 2 * A * (A - 1 - (A + 1) * cos);
        b2 = A * (A + 1 - (A - 1) * cos - sq);
        a0 = A + 1 + (A - 1) * cos + sq;
        a1 = -2 * (A - 1 + (A + 1) * cos);
        a2 = A + 1 + (A - 1) * cos - sq;
      } else {
        b0 = A * (A + 1 + (A - 1) * cos + sq);
        b1 = -2 * A * (A - 1 + (A + 1) * cos);
        b2 = A * (A + 1 + (A - 1) * cos - sq);
        a0 = A + 1 - (A - 1) * cos + sq;
        a1 = 2 * (A - 1 - (A + 1) * cos);
        a2 = A + 1 - (A - 1) * cos - sq;
      }
      break;
    }
  }
  const w = (2 * Math.PI * freq) / sampleRate;
  const re = (c0: number, c1: number, c2: number) => c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w);
  const im = (c1: number, c2: number) => -(c1 * Math.sin(w) + c2 * Math.sin(2 * w));
  const num = Math.hypot(re(b0, b1, b2), im(b1, b2));
  const den = Math.hypot(re(a0, a1, a2), im(a1, a2));
  return gainToDb(num / den);
}

export function responseDb(filters: FilterSpec[], freq: number): number {
  return filters.reduce((sum, f) => sum + biquadMagnitudeDb(f, freq), 0);
}

/** Scale a profile's filters toward flat for the "emulation intensity" control. */
export function scaleFilters(filters: FilterSpec[], intensity: number): FilterSpec[] {
  const k = Math.min(1, Math.max(0, intensity));
  return filters.map((f) => {
    if (f.type === 'highpass') return { ...f, freq: 10 + (f.freq - 10) * k };
    if (f.type === 'lowpass') return { ...f, freq: 22000 - (22000 - f.freq) * k };
    return { ...f, gain: (f.gain ?? 0) * k };
  });
}

export function ampToneFilters(amp: AmpDevice, state: AmpState): FilterSpec[] {
  const loud = loudnessBoost(state.loudness, state.volume);
  return [
    { type: 'lowshelf', freq: amp.bassHz, gain: state.bass * TONE_RANGE_DB },
    { type: 'highshelf', freq: amp.trebleHz, gain: state.treble * TONE_RANGE_DB },
    { type: 'lowshelf', freq: 70, gain: loud.lowDb },
    { type: 'highshelf', freq: 10000, gain: loud.highDb },
  ];
}

/** Constant-power-ish balance: centre = unity both sides, full turn mutes the other side. */
export function balanceGains(balance: number): [number, number] {
  const b = Math.min(1, Math.max(-1, balance));
  return [b > 0 ? 1 - b : 1, b < 0 ? 1 + b : 1];
}

export interface HifiSettings {
  bypass: boolean;
  levelMatch: boolean;
  intensity: number;
}

/** Everything the audio graph needs, computed from state. */
export interface DspParams {
  /** 0 when the route is silent. */
  routeGain: number;
  sourceGain: number;
  throughAmp: boolean;
  ampTone: FilterSpec[];
  ampGain: number;
  balance: [number, number];
  profileFilters: FilterSpec[];
  /** Drive into the soft clipper (1 = clean). */
  drive: number;
  stereoWidth: number;
  /** [left, right] linear gains for channel mismatch and level trim. */
  outGains: [number, number];
  bypass: boolean;
}

export const FLAT_PARAMS: DspParams = {
  routeGain: 1,
  sourceGain: 1,
  throughAmp: false,
  ampTone: [],
  ampGain: 1,
  balance: [1, 1],
  profileFilters: [],
  drive: 1,
  stereoWidth: 1,
  outGains: [1, 1],
  bypass: true,
};

/**
 * Approximate loudness change a profile causes on typical music (pink-ish spectrum),
 * used for volume-matched A/B comparisons.
 */
export function profileLoudnessDb(filters: FilterSpec[]): number {
  const freqs = [60, 120, 250, 500, 1000, 2000, 4000, 8000];
  const weights = [0.7, 1, 1, 1, 1, 1, 0.8, 0.5];
  let sum = 0;
  let wsum = 0;
  freqs.forEach((f, i) => {
    sum += dbToGain(responseDb(filters, f)) ** 2 * weights[i];
    wsum += weights[i];
  });
  return 10 * Math.log10(sum / wsum);
}

export function computeDspParams(input: {
  route: Route;
  amp?: AmpDevice;
  ampState?: AmpState;
  profile?: OutputProfile;
  sourceVolume: number;
  settings: HifiSettings;
}): DspParams {
  const { route, amp, ampState, profile, sourceVolume, settings } = input;
  if (route.output.kind === 'direct') return { ...FLAT_PARAMS, sourceGain: volumeTaper(sourceVolume) };
  if (route.output.kind === 'silent') return { ...FLAT_PARAMS, routeGain: 0, sourceGain: 0 };

  const throughAmp = route.throughAmp && !!amp && !!ampState;
  const ampGain = throughAmp ? volumeTaper(ampState!.volume) : 1;
  const sourceGain = route.sourceVolumeApplies ? volumeTaper(sourceVolume) : 1;
  const filters = profile ? scaleFilters(profile.filters, settings.intensity) : [];
  const k = settings.intensity;
  // Output level: louder drive pushes cheap drivers into compression/distortion.
  const level = sourceGain * ampGain;
  const drive = 1 + (profile?.distortion ?? 0) * k * 6 * level;
  const mismatch = (profile?.channelMismatchDb ?? 0) * k;
  const trimDb = profile ? (settings.levelMatch ? -profileLoudnessDb(filters) : (profile.sensitivityDb ?? 0) * k) : 0;
  const trim = dbToGain(trimDb);
  return {
    routeGain: 1,
    sourceGain,
    throughAmp,
    ampTone: throughAmp ? ampToneFilters(amp!, ampState!) : [],
    ampGain,
    balance: throughAmp ? balanceGains(ampState!.balance) : [1, 1],
    profileFilters: filters,
    drive,
    stereoWidth: 1 + ((profile?.stereoWidth ?? 1) - 1) * k,
    outGains: [trim, trim * dbToGain(-mismatch)],
    bypass: settings.bypass,
  };
}
