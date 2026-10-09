import type { DspParams } from './dsp';
import type { FilterSpec } from './types';

const SMOOTH = 0.025; // seconds — fast enough to feel immediate, slow enough to avoid zipper noise
const PROFILE_SLOTS = 6;
const TONE_SLOTS = 4;

export interface MeterReading {
  inL: number;
  inR: number;
  outL: number;
  outR: number;
  /** True if any output sample reached ≥ 0.98 since the last read. */
  clip: boolean;
}

/**
 * AudioGraphEngine — the real Web Audio processing chain for the virtual hi-fi:
 *
 *   input ─ route/source gain ─▶ amp tone (bass, treble, loudness) ─▶ balance ─▶ amp volume
 *     ├─▶ [emulation] output-profile EQ ─▶ level-dependent soft clipper ─▶ width/mismatch/trim ─▶ wet
 *     └─▶ [bypass] ───────────────────────────────────────────────────────────────────────────▶ dry
 *   wet + dry ─▶ output meter ─▶ output
 *
 * All nodes exist up front; changing gear only retunes parameters, so swaps never tear the
 * graph down mid-playback.
 */
export class HifiChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private ctx: BaseAudioContext;
  private source: GainNode;
  private tone: BiquadFilterNode[] = [];
  private balL: GainNode;
  private balR: GainNode;
  private ampGain: GainNode;
  private profile: BiquadFilterNode[] = [];
  private driveIn: GainNode;
  private shaper: WaveShaperNode;
  private driveOut: GainNode;
  private mLL: GainNode;
  private mRL: GainNode;
  private mLR: GainNode;
  private mRR: GainNode;
  private wet: GainNode;
  private dry: GainNode;
  private inL: AnalyserNode;
  private inR: AnalyserNode;
  private outL: AnalyserNode;
  private outR: AnalyserNode;
  private buf = new Float32Array(1024);
  private lastTypes = '';

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const analyser = () => {
      const a = ctx.createAnalyser();
      a.fftSize = 1024;
      return a;
    };
    this.input = g();
    // Always process in stereo: a mono source is upmixed so balance/width/meters behave.
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'speakers';
    this.source = g();
    this.output = g();

    // Input meter
    const inSplit = ctx.createChannelSplitter(2);
    this.inL = analyser();
    this.inR = analyser();
    this.input.connect(this.source);
    this.source.connect(inSplit);
    inSplit.connect(this.inL, 0);
    inSplit.connect(this.inR, 1);

    // Amplifier tone stack
    let node: AudioNode = this.source;
    for (let i = 0; i < TONE_SLOTS; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.gain.value = 0;
      node.connect(f);
      node = f;
      this.tone.push(f);
    }
    // Balance
    const balSplit = ctx.createChannelSplitter(2);
    const balMerge = ctx.createChannelMerger(2);
    this.balL = g();
    this.balR = g();
    node.connect(balSplit);
    balSplit.connect(this.balL, 0);
    balSplit.connect(this.balR, 1);
    this.balL.connect(balMerge, 0, 0);
    this.balR.connect(balMerge, 0, 1);
    this.ampGain = g();
    balMerge.connect(this.ampGain);

    // Emulation (wet) path
    node = this.ampGain;
    for (let i = 0; i < PROFILE_SLOTS; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.gain.value = 0;
      node.connect(f);
      node = f;
      this.profile.push(f);
    }
    this.driveIn = g(0.5);
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = softClipCurve();
    this.shaper.oversample = '2x';
    // WaveShaper maps ±1 input onto the ±2 curve: y = tanh(2u). With u = 0.5·d·s and output ÷ d,
    // small signals pass at unity while loud ones compress as drive rises.
    this.driveOut = g(1);
    node.connect(this.driveIn).connect(this.shaper).connect(this.driveOut);

    // Width + channel mismatch + trim as a 2×2 matrix
    const mSplit = ctx.createChannelSplitter(2);
    const mMerge = ctx.createChannelMerger(2);
    this.mLL = g();
    this.mRL = g(0);
    this.mLR = g(0);
    this.mRR = g();
    this.driveOut.connect(mSplit);
    mSplit.connect(this.mLL, 0);
    mSplit.connect(this.mLR, 0);
    mSplit.connect(this.mRL, 1);
    mSplit.connect(this.mRR, 1);
    this.mLL.connect(mMerge, 0, 0);
    this.mRL.connect(mMerge, 0, 0);
    this.mLR.connect(mMerge, 0, 1);
    this.mRR.connect(mMerge, 0, 1);
    this.wet = g(0);
    mMerge.connect(this.wet).connect(this.output);

    // Bypass (dry) path
    this.dry = g(1);
    this.ampGain.connect(this.dry).connect(this.output);

    // Output meter
    const outSplit = ctx.createChannelSplitter(2);
    this.outL = analyser();
    this.outR = analyser();
    this.output.connect(outSplit);
    outSplit.connect(this.outL, 0);
    outSplit.connect(this.outR, 1);
  }

  private set(param: AudioParam, value: number) {
    param.setTargetAtTime(value, this.ctx.currentTime, SMOOTH);
  }

  private setFilters(nodes: BiquadFilterNode[], specs: FilterSpec[]) {
    nodes.forEach((n, i) => {
      const s = specs[i];
      if (!s) {
        n.type = 'peaking';
        this.set(n.gain, 0);
        return;
      }
      if (n.type !== s.type) n.type = s.type;
      this.set(n.frequency, s.freq);
      this.set(n.Q, s.q ?? (s.type === 'peaking' ? 1 : 0.7071));
      this.set(n.gain, s.gain ?? 0);
    });
  }

  apply(p: DspParams) {
    const types = p.profileFilters.map((f) => f.type).join(',');
    const swapping = types !== this.lastTypes && this.lastTypes !== '';
    this.lastTypes = types;
    this.set(this.source.gain, p.routeGain * p.sourceGain);
    this.setFilters(this.tone, p.ampTone);
    this.set(this.balL.gain, p.balance[0]);
    this.set(this.balR.gain, p.balance[1]);
    this.set(this.ampGain.gain, p.ampGain);

    const commitProfile = () => {
      this.setFilters(this.profile, p.profileFilters);
      this.set(this.driveIn.gain, 0.5 * p.drive);
      this.set(this.driveOut.gain, 1 / p.drive);
      const w = p.stereoWidth;
      const [tl, tr] = p.outGains;
      this.set(this.mLL.gain, (tl * (1 + w)) / 2);
      this.set(this.mRL.gain, (tl * (1 - w)) / 2);
      this.set(this.mLR.gain, (tr * (1 - w)) / 2);
      this.set(this.mRR.gain, (tr * (1 + w)) / 2);
      this.set(this.wet.gain, p.bypass ? 0 : 1);
    };
    this.set(this.dry.gain, p.bypass ? 1 : 0);
    if (swapping && !p.bypass) {
      // Changing filter types abruptly can click: duck the wet path, retune, bring it back.
      this.set(this.wet.gain, 0);
      setTimeout(commitProfile, 90);
    } else {
      commitProfile();
    }
  }

  private peak(a: AnalyserNode): number {
    a.getFloatTimeDomainData(this.buf);
    let m = 0;
    for (let i = 0; i < this.buf.length; i++) m = Math.max(m, Math.abs(this.buf[i]));
    return m;
  }

  readMeters(): MeterReading {
    const outL = this.peak(this.outL);
    const outR = this.peak(this.outR);
    return { inL: this.peak(this.inL), inR: this.peak(this.inR), outL, outR, clip: Math.max(outL, outR) >= 0.98 };
  }
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2; // −2..2
    curve[i] = Math.tanh(x);
  }
  return curve;
}
