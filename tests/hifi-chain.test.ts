import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HifiChain } from '../src/hifi/HifiChain.ts';
import { FLAT_PARAMS } from '../src/hifi/dsp.ts';

class Param {
  value = 1;
  setTargetAtTime(value: number) { this.value = value; }
}
class Node {
  samples = new Float32Array(1024);
  getFloatTimeDomainData(buffer: Float32Array) { buffer.set(this.samples); }
  gain = new Param();
  frequency = new Param();
  Q = new Param();
  type = 'peaking';
  connect(node: Node) { return node; }
}
function context() {
  return {
    currentTime: 0,
    createGain: () => new Node(), createBiquadFilter: () => new Node(),
    createAnalyser: () => new Node(), createWaveShaper: () => new Node(),
    createChannelSplitter: () => new Node(), createChannelMerger: () => new Node(),
  };
}

test('quick gear swap then bypass cannot be undone by a stale timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const chain = new HifiChain(context() as unknown as BaseAudioContext);
  chain.apply({ ...FLAT_PARAMS, bypass: false, profileFilters: [{ type: 'highpass', freq: 45 }] });
  chain.apply({ ...FLAT_PARAMS, bypass: false, profileFilters: [{ type: 'lowpass', freq: 4200 }] });
  chain.apply({ ...FLAT_PARAMS, bypass: true, profileFilters: [{ type: 'lowpass', freq: 6000 }] });
  t.mock.timers.tick(100);
  const graph = chain as unknown as { wet: Node; dry: Node; profile: Node[] };
  assert.equal(graph.wet.gain.value, 0);
  assert.equal(graph.dry.gain.value, 1);
  assert.equal(graph.profile[0].frequency.value, 6000);
});

test('meters measure independent output RMS and peaks, then return to silence', () => {
  const chain = new HifiChain(context() as unknown as BaseAudioContext);
  const graph = chain as unknown as { inL: Node; inR: Node; outL: Node; outR: Node };
  for (let i = 0; i < 1024; i++) {
    const sine = Math.sin(i * Math.PI / 16);
    graph.outL.samples[i] = 0.5 * sine;
    graph.outR.samples[i] = 0.25 * sine;
  }
  const signal = chain.readMeters();
  assert.ok(Math.abs(signal.outRmsL - 0.5 / Math.sqrt(2)) < 1e-6);
  assert.ok(Math.abs(signal.outRmsR - 0.25 / Math.sqrt(2)) < 1e-6);
  assert.equal(signal.outL, 0.5);
  assert.equal(signal.clip, false);
  graph.outR.samples[0] = 1;
  assert.equal(chain.readMeters().clip, true);
  graph.outL.samples.fill(0);
  graph.outR.samples.fill(0);
  assert.equal(chain.readMeters().outRmsL, 0);
  assert.equal(chain.readMeters().outRmsR, 0);
  assert.equal(chain.readMeters().clip, false);
});
