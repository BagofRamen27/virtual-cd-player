import type { Album } from '../types';
import { mulberry32 } from './damage';
import { generateCover } from '../lib/art';

/**
 * Demo album: original, procedurally synthesized ambient pieces rendered offline in the
 * browser. Nothing is downloaded and there are no licensing questions.
 */
interface DemoSpec {
  title: string;
  bpm: number;
  seconds: number;
  /** Chord roots as MIDI notes; each chord gets a major/minor 7th voicing. */
  chords: { root: number; minor: boolean }[];
  wave: OscillatorType;
  cutoff: number;
  seed: number;
}

const SPECS: DemoSpec[] = [
  {
    title: 'Lamplight',
    bpm: 68,
    seconds: 62,
    chords: [
      { root: 50, minor: false },
      { root: 57, minor: false },
      { root: 47, minor: true },
      { root: 55, minor: false },
    ],
    wave: 'triangle',
    cutoff: 1400,
    seed: 11,
  },
  {
    title: 'Oat Milk Morning',
    bpm: 82,
    seconds: 56,
    chords: [
      { root: 53, minor: false },
      { root: 50, minor: true },
      { root: 46, minor: false },
      { root: 48, minor: false },
    ],
    wave: 'sine',
    cutoff: 2200,
    seed: 23,
  },
  {
    title: 'Walnut Grain',
    bpm: 60,
    seconds: 66,
    chords: [
      { root: 45, minor: true },
      { root: 53, minor: false },
      { root: 48, minor: false },
      { root: 55, minor: false },
    ],
    wave: 'triangle',
    cutoff: 1000,
    seed: 37,
  },
];

export const DEMO_ALBUM_ID = 'demo-evening-session';

export function demoAlbum(): Album {
  const title = 'Evening Session';
  const artist = 'DiscDeck Demo Ensemble';
  return {
    id: DEMO_ALBUM_ID,
    source: 'demo',
    title,
    artist,
    year: '2026',
    tint: '#B77B56',
    coverUrl: typeof document !== 'undefined' ? generateCover(title, artist, '#B77B56') : undefined,
    tracks: SPECS.map((s, i) => ({ id: `demo-${i}`, title: s.title, artist: 'DiscDeck Demo Ensemble', duration: s.seconds })),
    addedAt: 0,
  };
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const rendered = new Map<string, Promise<AudioBuffer>>();

/** Rendered demo tracks are cached, so replays and pre-warmed tracks start instantly. */
export function renderDemoTrack(index: number, sampleRate: number): Promise<AudioBuffer> {
  const key = `${index}@${sampleRate}`;
  let p = rendered.get(key);
  if (!p) {
    p = synthesize(index, sampleRate);
    p.catch(() => rendered.delete(key));
    rendered.set(key, p);
  }
  return p;
}

/**
 * Render the first demo song in the background once the page is idle, at the sample rate this
 * device's audio output will use, so "Insert → Play" on the demo disc is immediate even on
 * slow phones.
 */
export function prewarmDemo(): void {
  if (typeof window === 'undefined' || !('OfflineAudioContext' in window) || !('AudioContext' in window)) return;
  const run = () => {
    try {
      const probe = new AudioContext();
      const rate = probe.sampleRate;
      void probe.close();
      void renderDemoTrack(0, rate);
    } catch {
      /* best effort */
    }
  };
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

async function synthesize(index: number, sampleRate: number): Promise<AudioBuffer> {
  const spec = SPECS[index];
  const ctx = new OfflineAudioContext(2, Math.ceil(spec.seconds * sampleRate), sampleRate);
  const rng = mulberry32(spec.seed);
  const beat = 60 / spec.bpm;
  const bar = beat * 4;

  const master = ctx.createGain();
  master.gain.value = 0.55;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = spec.cutoff;
  lp.Q.value = 0.5;

  // A short feedback delay for warmth and space.
  const delay = ctx.createDelay(2);
  delay.delayTime.value = beat * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  lp.connect(master);
  lp.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(master);
  master.connect(ctx.destination);

  const voice = (freq: number, start: number, dur: number, peak: number, type: OscillatorType, pan: number, attack: number) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = (rng() - 0.5) * 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.setTargetAtTime(0, start + Math.max(attack, dur - 0.4), 0.35);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(lp);
    osc.start(start);
    osc.stop(Math.min(spec.seconds, start + dur + 2));
  };

  const bars = Math.floor((spec.seconds - 3) / bar);
  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const chord = spec.chords[b % spec.chords.length];
    const third = chord.minor ? 3 : 4;
    const notes = [chord.root, chord.root + third, chord.root + 7, chord.root + (chord.minor ? 10 : 11)];
    // Pad
    notes.forEach((n, i) => voice(midiHz(n + 12), t, bar + 0.6, 0.05, spec.wave, (i - 1.5) * 0.35, 0.9));
    // Bass
    voice(midiHz(chord.root - 12), t, bar, 0.12, 'sine', 0, 0.05);
    // Full-spectrum percussion bypasses the pad's low-pass. Bright, alternating
    // hats and bass transients make bandwidth and stereo changes audible.
    for (let step = 0; step < 8; step++) {
      const start = t + step * beat / 2;
      const hat = ctx.createBuffer(1, Math.ceil(sampleRate * 0.09), sampleRate);
      const samples = hat.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (rng() * 2 - 1) * Math.exp(-i / (sampleRate * 0.018));
      const noise = ctx.createBufferSource();
      noise.buffer = hat;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      const level = ctx.createGain();
      level.gain.value = 0.075;
      const pan = ctx.createStereoPanner();
      pan.pan.value = step % 2 ? 0.8 : -0.8;
      noise.connect(hp).connect(level).connect(pan).connect(master);
      noise.start(start);
      if (step % 4 === 0) {
        const kick = ctx.createOscillator();
        kick.frequency.setValueAtTime(110, start);
        kick.frequency.exponentialRampToValueAtTime(45, start + 0.12);
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(0.2, start + 0.005);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        kick.connect(envelope).connect(master);
        kick.start(start);
        kick.stop(start + 0.3);
      }
    }
    // Gentle arpeggio, sparser in the intro and outro
    const density = b === 0 || b === bars - 1 ? 0.35 : 0.8;
    for (let s = 0; s < 8; s++) {
      if (rng() > density) continue;
      const n = notes[Math.floor(rng() * notes.length)] + 24 + (rng() < 0.2 ? 12 : 0);
      voice(midiHz(n), t + s * (beat / 2), beat * 1.2, 0.045, 'sine', (rng() - 0.5) * 0.8, 0.01);
    }
  }
  return ctx.startRendering();
}
