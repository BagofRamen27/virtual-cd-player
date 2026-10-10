import { signalLevels } from './dsp.ts';
import type { MeterReading } from './HifiChain';

export interface CaptureStatus {
  state: 'idle' | 'requesting' | 'active' | 'error';
  message: string;
}
export interface CaptureDependencies {
  request: () => Promise<MediaStream>;
  context: () => AudioContext;
}

const browserDependencies: CaptureDependencies = {
  request: () => navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: { suppressLocalAudioPlayback: false },
    preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'include',
  } as DisplayMediaStreamOptions),
  context: () => new AudioContext(),
};

/** User-selected audio is measured locally. The graph can never replay its stream. */
export class TabAudioMeter {
  private status: CaptureStatus = { state: 'idle', message: '' };
  private listeners = new Set<() => void>();
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analysers: [AnalyserNode, AnalyserNode] | null = null;
  private generation = 0;
  private buffer = new Float32Array(1024);
  private dependencies: CaptureDependencies;
  constructor(dependencies = browserDependencies) { this.dependencies = dependencies; }

  getSnapshot = () => this.status;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private setStatus(status: CaptureStatus) { this.status = status; for (const listener of this.listeners) listener(); }
  private release(stream: MediaStream | null, ctx: AudioContext | null) {
    stream?.getTracks().forEach(track => track.stop());
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }
  stop = () => {
    this.generation++;
    const stream = this.stream, ctx = this.ctx;
    this.stream = null; this.ctx = null; this.analysers = null;
    this.release(stream, ctx);
    this.setStatus({ state: 'idle', message: '' });
  };
  start = async () => {
    if (this.status.state === 'active' || this.status.state === 'requesting') return;
    const generation = ++this.generation;
    let stream: MediaStream | null = null, ctx: AudioContext | null = null;
    this.setStatus({ state: 'requesting', message: 'Choose the playing tab and enable Share tab audio.' });
    try {
      // Both calls occur directly in the click gesture, before any await.
      ctx = this.dependencies.context(); this.ctx = ctx;
      const resume = ctx.resume().catch(() => {});
      stream = await this.dependencies.request();
      if (generation !== this.generation) { this.release(stream, ctx); return; }
      this.stream = stream;
      if (!stream.getAudioTracks().length) throw new Error('No audio was shared. Choose a browser tab and enable Share tab audio.');
      await resume;
      if (generation !== this.generation) { this.release(stream, ctx); return; }
      const source = ctx.createMediaStreamSource(stream);
      const splitter = ctx.createChannelSplitter(2);
      const left = ctx.createAnalyser(), right = ctx.createAnalyser(), mute = ctx.createGain();
      left.fftSize = right.fftSize = 1024;
      // Upmix mono sources so either input type produces sensible stereo meters.
      const stereo = ctx.createGain(); stereo.channelCount = 2; stereo.channelCountMode = 'explicit';
      source.connect(stereo).connect(splitter);
      splitter.connect(left, 0); splitter.connect(right, 1);
      mute.gain.value = 0;
      left.connect(mute); right.connect(mute); mute.connect(ctx.destination);
      this.analysers = [left, right];
      stream.getTracks().forEach(track => track.addEventListener('ended', () => {
        if (generation === this.generation) this.stop();
      }, { once: true }));
      this.setStatus({ state: 'active', message: 'Meters are reading shared audio, not the hi-fi processing chain.' });
    } catch (error) {
      this.release(stream, ctx);
      if (generation !== this.generation) return;
      this.stream = null; this.ctx = null; this.analysers = null;
      const denied = error instanceof Error && error.name === 'NotAllowedError';
      this.setStatus({ state: 'error', message: denied ? 'Sharing was cancelled or denied. Click again to choose an audio source.' : error instanceof Error ? error.message : 'Audio sharing is unavailable in this browser.' });
    }
  };
  readMeters(): MeterReading | null {
    if (!this.analysers || this.ctx?.state !== 'running') return null;
    this.analysers[0].getFloatTimeDomainData(this.buffer); const left = signalLevels(this.buffer);
    this.analysers[1].getFloatTimeDomainData(this.buffer); const right = signalLevels(this.buffer);
    return { inL: left.peak, inR: right.peak, outL: left.peak, outR: right.peak,
      outRmsL: left.rms, outRmsR: right.rms, clip: Math.max(left.peak, right.peak) >= 0.98 };
  }
}

export const tabAudioMeter = new TabAudioMeter();
if (typeof window !== 'undefined') window.addEventListener('pagehide', tabAudioMeter.stop);
