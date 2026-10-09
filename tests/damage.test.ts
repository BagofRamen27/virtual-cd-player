import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDamageEvents,
  eventsForTrack,
  generateConditionStrokes,
  newDamageProfile,
  radiusToTime,
  timeToRadius,
  DATA_R0,
  DATA_R1,
} from '../src/audio/damage.ts';

const TOTAL = 40 * 60;

test('mint disc has no damage events', () => {
  assert.deepEqual(computeDamageEvents(newDamageProfile('album-a'), TOTAL), []);
});

test('the same scratched disc fails at the same positions every time', () => {
  const p = { ...newDamageProfile('album-a'), condition: 3 as const };
  const a = computeDamageEvents(p, TOTAL);
  const b = computeDamageEvents(structuredClone(p), TOTAL);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
});

test('different discs get different damage', () => {
  const a = computeDamageEvents({ ...newDamageProfile('album-a'), condition: 3 }, TOTAL);
  const b = computeDamageEvents({ ...newDamageProfile('album-b'), condition: 3 }, TOTAL);
  assert.notDeepEqual(a, b);
});

test('worse condition means more problems', () => {
  const count = (c: 1 | 3 | 5) => computeDamageEvents({ ...newDamageProfile('album-a'), condition: c }, TOTAL).length;
  assert.ok(count(1) < count(3));
  assert.ok(count(3) < count(5));
});

test('an arced scratch damages audio near its radius on the timeline', () => {
  const r = 0.7;
  const stroke = { id: 'x', depth: 0.9, points: Array.from({ length: 10 }, (_, i) => ({ r, a: i * 0.08 })) };
  const events = computeDamageEvents({ ...newDamageProfile('album-a'), strokes: [stroke] }, TOTAL);
  const t = radiusToTime(r, TOTAL);
  assert.ok(events.length > 0);
  for (const e of events) assert.ok(Math.abs(e.t - t) < 2, `event at ${e.t} far from ${t}`);
});

test('scratches outside the program area are cosmetic only', () => {
  const stroke = { id: 'rim', depth: 1, points: [{ r: 0.99, a: 0 }, { r: 0.99, a: 0.5 }] };
  assert.equal(computeDamageEvents({ ...newDamageProfile('album-a'), strokes: [stroke] }, TOTAL).length, 0);
});

test('events are sorted, non-overlapping and bounded for hearing comfort', () => {
  const events = computeDamageEvents({ ...newDamageProfile('album-z'), condition: 5 }, TOTAL);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].t >= events[i - 1].t);
  for (const e of events) {
    if (e.type === 'dropout') assert.ok(e.len <= 0.6);
    if (e.type === 'skip') assert.ok(e.len <= 3);
    assert.ok(e.count <= 4);
  }
});

test('radius ↔ time mapping is monotonic and invertible', () => {
  assert.equal(radiusToTime(DATA_R0, TOTAL), 0);
  assert.ok(Math.abs(radiusToTime(DATA_R1, TOTAL) - TOTAL) < 1e-6);
  for (const t of [0, 100, 1200, 2399]) assert.ok(Math.abs(radiusToTime(timeToRadius(t, TOTAL), TOTAL) - t) < 1e-6);
});

test('track slicing shifts events into track-local time', () => {
  const events = [
    { type: 'click' as const, t: 10, len: 0.01, count: 0 },
    { type: 'skip' as const, t: 130, len: 1, count: 0 },
  ];
  assert.deepEqual(eventsForTrack(events, [120, 200], 1), [{ type: 'skip', t: 10, len: 1, count: 0 }]);
});

test('condition wear strokes are deterministic', () => {
  assert.deepEqual(generateConditionStrokes(42, 4), generateConditionStrokes(42, 4));
  assert.equal(generateConditionStrokes(42, 0).length, 0);
});
