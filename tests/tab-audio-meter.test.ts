import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TabAudioMeter } from '../src/hifi/TabAudioMeter.ts';

class Track {
  stopped = false;
  ended: (() => void) | null = null;
  stop() { this.stopped = true; }
  addEventListener(_event: string, callback: () => void) { this.ended = callback; }
}
class Node {
  gain = { value: 1 };
  connected: Node[] = [];
  sample = 0;
  connect(node: Node) { this.connected.push(node); return node; }
  getFloatTimeDomainData(buffer: Float32Array) { buffer.fill(this.sample); }
}
function setup(withAudio = true) {
  const audio = new Track(), video = new Track();
  const stream = { getAudioTracks: () => withAudio ? [audio] : [], getTracks: () => withAudio ? [audio, video] : [video] };
  const destination = new Node(), gains: Node[] = [], analysers: Node[] = [];
  const ctx = {
    state: 'running', destination,
    resume: async () => {}, close: async () => { ctx.state = 'closed'; },
    createGain: () => { const n = new Node(); gains.push(n); return n; },
    createAnalyser: () => { const n = new Node(); analysers.push(n); return n; },
    createMediaStreamSource: () => new Node(), createChannelSplitter: () => new Node(),
  };
  const deps = { context: () => ctx as unknown as AudioContext, request: async () => stream as unknown as MediaStream };
  return { audio, video, stream, ctx, deps, destination, gains, analysers };
}

test('shared audio produces real stereo levels and cannot replay through its destination', async () => {
  const env = setup(), meter = new TabAudioMeter(env.deps);
  await meter.start();
  env.analysers[0].sample = 0.1; env.analysers[1].sample = 0.2;
  const levels = meter.readMeters()!;
  assert.ok(Math.abs(levels.outRmsL - 0.1) < 1e-6);
  assert.ok(Math.abs(levels.outRmsR - 0.2) < 1e-6);
  const toDestination = env.gains.filter(node => node.connected.includes(env.destination));
  assert.equal(toDestination.length, 1);
  assert.equal(toDestination[0].gain.value, 0);
  meter.stop();
  assert.ok(env.audio.stopped && env.video.stopped);
  assert.equal(env.ctx.state, 'closed');
  assert.equal(meter.readMeters(), null);
});

test('sharing without audio is rejected and every track/context is released', async () => {
  const env = setup(false), meter = new TabAudioMeter(env.deps);
  await meter.start();
  assert.equal(meter.getSnapshot().state, 'error');
  assert.match(meter.getSnapshot().message, /Share tab audio/);
  assert.ok(env.video.stopped);
  assert.equal(env.ctx.state, 'closed');
});

test('cancelling a pending chooser releases a late stream instead of starting capture', async () => {
  const env = setup(); let resolve!: (stream: MediaStream) => void;
  const meter = new TabAudioMeter({ ...env.deps, request: () => new Promise(r => { resolve = r; }) });
  const starting = meter.start(); meter.stop();
  resolve(env.stream as unknown as MediaStream); await starting;
  assert.equal(meter.getSnapshot().state, 'idle');
  assert.ok(env.audio.stopped && env.video.stopped);
  assert.equal(meter.readMeters(), null);
});

test('ending browser sharing stops audio/video tracks and clears measured levels', async () => {
  const env = setup(), meter = new TabAudioMeter(env.deps);
  await meter.start(); env.video.ended!();
  assert.equal(meter.getSnapshot().state, 'idle');
  assert.ok(env.audio.stopped && env.video.stopped);
  assert.equal(meter.readMeters(), null);
});

test('denied permission returns an actionable message and closes the context', async () => {
  const env = setup(); const denied = new Error('Denied'); denied.name = 'NotAllowedError';
  const meter = new TabAudioMeter({ ...env.deps, request: async () => { throw denied; } });
  await meter.start();
  assert.equal(meter.getSnapshot().state, 'error');
  assert.match(meter.getSnapshot().message, /cancelled or denied/);
  assert.equal(env.ctx.state, 'closed');
});
