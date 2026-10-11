import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function processor() {
  let Processor;
  runInNewContext(readFileSync(new URL('../src/audio/scratch-worklet.js', import.meta.url), 'utf8'), {
    sampleRate: 44100,
    AudioWorkletProcessor: class { port = { postMessage() {}, onmessage: null }; },
    registerProcessor(_name, ctor) { Processor = ctor; },
  });
  return new Processor();
}

test('loading a clean track clears damage and pending skip state', () => {
  const p = processor();
  p.onMessage({ type: 'load', channels: [new Float32Array(1000).fill(1)] });
  p.trigger({ type: 'skipburst', len: 50, count: 3, jump: 400 });
  p.glitch = 0;
  p.muteKind = 'dropout';
  p.onMessage({ type: 'load', channels: [new Float32Array(1000).fill(1)] });
  assert.equal(p.afterJump, 0);
  assert.equal(p.loopsLeft, 0);
  assert.equal(p.glitch, 1);
  assert.equal(p.muteKind, null);
  p.onMessage({ type: 'events', events: [] });
  p.onMessage({ type: 'play' });
  p.process([], [[new Float32Array(128), new Float32Array(128)]]);
  assert.equal(p.pos, 128);
  assert.equal(p.pendingJump, null);
});

test('idle worklet clears every output channel without moving the playhead', () => {
  const p = processor();
  const left = new Float32Array(128).fill(1), right = new Float32Array(128).fill(1);
  p.pos = 42;
  assert.equal(p.process([], [[left, right]]), true);
  assert.equal(p.pos, 42);
  assert.ok(left.every(value => value === 0) && right.every(value => value === 0));
});

test('a paused seek replaces an old pending jump before playback resumes', () => {
  const p = processor();
  p.onMessage({ type: 'load', channels: [new Float32Array(1000)] });
  p.pendingJump = { frame: 800, reset: true };
  p.onMessage({ type: 'seek', frame: 100 });
  p.onMessage({ type: 'play' });
  p.process([], [[new Float32Array(128), new Float32Array(128)]]);
  assert.equal(p.pos, 228);
  assert.equal(p.pendingJump, null);
});
