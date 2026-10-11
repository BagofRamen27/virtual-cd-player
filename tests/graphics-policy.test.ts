import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptGraphics, initialGraphics, migrateGraphics, GRAPHICS } from '../src/lib/graphicsPolicy.ts';
const desktop = { webgl: true, software: false, lowPower: false, mobile: false };
test('unknown devices start balanced and unsupported or constrained devices start light', () => {
  assert.equal(initialGraphics(desktop), 'balanced');
  assert.equal(initialGraphics(desktop, 16, 8), 'high');
  assert.equal(initialGraphics({ ...desktop, lowPower: true }, 16, 8), 'low');
  assert.equal(initialGraphics({ ...desktop, webgl: false }), '2d');
  assert.equal(initialGraphics({ ...desktop, software: true }), '2d');
  assert.equal(initialGraphics({ ...desktop, mobile: true }), 'low');
  assert.ok(GRAPHICS.low.dpr <= GRAPHICS.balanced.dpr && GRAPHICS.balanced.dpr < GRAPHICS.high.dpr);
});
test('persisted user overrides survive migration while new users get automatic graphics', () => {
  assert.equal(migrateGraphics(), 'auto');
  assert.equal(migrateGraphics({ quality: 'high' }), 'high');
  assert.equal(migrateGraphics({ quality: 'high', force2D: true }), '2d');
  assert.equal(migrateGraphics({ graphicsMode: 'balanced', quality: 'low' }), 'balanced');
});
test('downgrades require sustained poor samples and cooldown; recovery has stronger hysteresis', () => {
  let history = { slow: 0, fast: 0, changedAt: 0 };
  let step = adaptGraphics('high', 'high', 45, 21000, history);
  assert.equal(step.profile, 'high'); history = step.history;
  step = adaptGraphics('high', 'high', 45, 23000, history); history = step.history;
  step = adaptGraphics('high', 'high', 45, 25000, history);
  assert.equal(step.profile, 'balanced');
  assert.equal(adaptGraphics('balanced', 'high', 60, 26000, { ...step.history, slow: 20 }).profile, 'balanced');
  assert.equal(adaptGraphics('balanced', 'high', 16, 50000, { slow: 0, fast: 6, changedAt: 25000 }).profile, 'balanced');
  assert.equal(adaptGraphics('balanced', 'high', 16, 50000, { slow: 0, fast: 7, changedAt: 25000 }).profile, 'high');
  assert.equal(adaptGraphics('balanced', 'balanced', 16, 50000, { slow: 0, fast: 7, changedAt: 0 }).profile, 'balanced');
  assert.equal(adaptGraphics('low', 'balanced', 33, 50000, { slow: 0, fast: 7, changedAt: 0 }).profile, 'balanced');
  assert.equal(adaptGraphics('low', 'low', 33, 50000, { slow: 0, fast: 7, changedAt: 0 }).profile, 'low');
});
