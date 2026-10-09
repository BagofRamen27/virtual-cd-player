import workletUrl from './scratch-worklet.js?url';
import type { DamageEvent } from '../types';
import { HifiChain, type MeterReading } from '../hifi/HifiChain';
import { FLAT_PARAMS, type DspParams } from '../hifi/dsp';

export type EngineMessage =
  | { type: 'pos'; seconds: number }
  | { type: 'ended' }
  | { type: 'glitch'; kind: DamageEvent['type'] };

/**
 * Web Audio graph for local audio:
 *   AudioWorklet (decoded track + scratch simulation) → hi-fi chain (route, amp, speaker /
 *   headphone emulation, volume) → gentle limiter → speakers.
 * The limiter keeps glitch transients and loud masters within a comfortable range.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private chain: HifiChain | null = null;
  private params: DspParams = FLAT_PARAMS;
  private starting: Promise<void> | null = null;
  private listeners = new Set<(m: EngineMessage) => void>();

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window && 'AudioWorkletNode' in window;
  }

  async ensure(): Promise<AudioContext> {
    if (!this.starting) {
      this.starting = (async () => {
        const ctx = new AudioContext({ latencyHint: 'playback' });
        await ctx.audioWorklet.addModule(workletUrl);
        const node = new AudioWorkletNode(ctx, 'discdeck-scratch', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        const chain = new HifiChain(ctx);
        chain.apply(this.params);
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 6;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.15;
        node.connect(chain.input);
        chain.output.connect(limiter).connect(ctx.destination);
        node.port.onmessage = (e) => this.handle(e.data);
        this.ctx = ctx;
        this.node = node;
        this.chain = chain;
      })();
    }
    await this.starting;
    return this.ctx!;
  }

  private handle(msg: { type: string; frame?: number; kind?: DamageEvent['type'] }) {
    let out: EngineMessage | null = null;
    if (msg.type === 'pos') out = { type: 'pos', seconds: (msg.frame ?? 0) / this.sampleRate };
    else if (msg.type === 'ended') out = { type: 'ended' };
    else if (msg.type === 'glitch' && msg.kind) out = { type: 'glitch', kind: msg.kind };
    if (out) for (const l of this.listeners) l(out);
  }

  subscribe(listener: (m: EngineMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = await this.ensure();
    return ctx.decodeAudioData(data);
  }

  async loadBuffer(buffer: AudioBuffer): Promise<void> {
    await this.ensure();
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c).slice());
    this.node!.port.postMessage({ type: 'load', channels }, channels.map((c) => c.buffer));
  }

  /** Events are in track-local seconds. */
  setEvents(events: DamageEvent[]): void {
    if (!this.node) return;
    const sr = this.sampleRate;
    this.node.port.postMessage({
      type: 'events',
      events: events.map((e) => ({
        type: e.type,
        start: Math.round(e.t * sr),
        len: Math.max(1, Math.round(e.len * sr)),
        count: e.count,
        jump: Math.round((e.jump ?? 0) * sr),
      })),
    });
  }

  async play(): Promise<void> {
    const ctx = await this.ensure();
    if (ctx.state !== 'running') await ctx.resume();
    this.node!.port.postMessage({ type: 'play' });
  }

  pause(): void {
    this.node?.port.postMessage({ type: 'pause' });
  }

  seek(seconds: number): void {
    this.node?.port.postMessage({ type: 'seek', frame: Math.max(0, seconds) * this.sampleRate });
  }

  unload(): void {
    this.node?.port.postMessage({ type: 'unload' });
  }

  /** Volume, routing and hi-fi emulation all live in the DSP chain. */
  setDsp(params: DspParams): void {
    this.params = params;
    this.chain?.apply(params);
  }

  readMeters(): MeterReading | null {
    return this.chain?.readMeters() ?? null;
  }
}

export const audioEngine = new AudioEngine();
