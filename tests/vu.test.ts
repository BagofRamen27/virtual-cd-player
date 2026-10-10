import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VuDisplay } from '../src/hifi/vu.ts';

test('quiet demo output has visible needle travel and responds to musical transients', () => {
  const display = new VuDisplay();
  let reading = display.update(0.0022, 0.0022, 0.05);
  for (let i = 0; i < 20; i++) reading = display.update(0.0022, 0.0022, 0.05);
  assert.ok(reading.vuL > -15 && reading.vuL < 0);
  const quiet = reading.vuL;
  for (let i = 0; i < 3; i++) reading = display.update(0.0048, 0.0048, 0.05);
  assert.ok(reading.vuL - quiet > 4);
});

test('auto ranging preserves stereo level differences', () => {
  const display = new VuDisplay();
  let reading;
  for (let i = 0; i < 40; i++) reading = display.update(0.01, 0.005, 0.05);
  assert.ok(Math.abs(reading!.vuL - reading!.vuR - 6.0206) < 0.02);
});

test('stopped and muted audio settle at the meter floor without invented movement', () => {
  const display = new VuDisplay();
  for (let i = 0; i < 20; i++) display.update(0.02, 0.02, 0.05);
  let reading;
  for (let i = 0; i < 40; i++) reading = display.update(0, 0, 0.05);
  assert.ok(reading!.vuL < -59 && reading!.vuR < -59);
});
