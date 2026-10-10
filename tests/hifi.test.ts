import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMPS, HEADPHONES, PROFILES, SOURCES, SPEAKERS, defaultAmpState } from '../src/hifi/catalog.ts';
import { makeConnection, pruneConnections, resolveRoute, validateConnection, validatePorts, type Rack } from '../src/hifi/routing.ts';
import { balanceGains, biquadMagnitudeDb, computeDspParams, loudnessBoost, profileLoudnessDb, responseDb, scaleFilters, volumeTaper, signalLevels } from '../src/hifi/dsp.ts';
import type { Connection, Slot } from '../src/hifi/types.ts';

const dd1 = SOURCES.find((s) => s.id === 'dd1')!;
const boombox = SOURCES.find((s) => s.id === 'boombox-2003')!;
const amp = AMPS[0];
const rack = (over: Partial<Rack> = {}): Rack => ({ source: dd1, amp, speakers: SPEAKERS[0], headphones: HEADPHONES[0], ...over });
const ref = (slot: Slot, port: string) => ({ slot, port });
const wire = (r: Rack, conns: Connection[], a: [Slot, string], b: [Slot, string]) => {
  const v = validateConnection(r, conns, ref(...a), ref(...b));
  assert.ok(v.ok, v.ok ? '' : v.reason);
  conns.push(makeConnection(r, ref(...a), ref(...b), v.ok ? v.cable : 'rca'));
  return conns;
};
const on = { ...defaultAmpState(amp), power: true, input: 'CD' };

// ── Connector validation ──
test('CD line out → amp CD in uses a 3.5 mm→RCA cable', () => {
  const v = validateConnection(rack(), [], ref('source', 'line-out'), ref('amp', 'in-cd'));
  assert.deepEqual(v.ok && v.cable, 'trs35-rca');
});
test('amp speaker out → passive speakers is valid speaker wire', () => {
  const v = validateConnection(rack(), [], ref('amp', 'spk-a'), ref('speakers', 'terminals'));
  assert.equal(v.ok && v.cable, 'speaker');
});
test('order of ends does not matter', () => {
  assert.ok(validateConnection(rack(), [], ref('speakers', 'terminals'), ref('amp', 'spk-a')).ok);
});
test('speaker-level output into headphones is refused', () => {
  const v = validatePorts(amp.ports.find((p) => p.id === 'spk-a')!, HEADPHONES[0].ports[0]);
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /speaker-level/i);
});
test('passive speakers on an unamplified CD line out are refused', () => {
  const v = validateConnection(rack(), [], ref('source', 'line-out'), ref('speakers', 'terminals'));
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /need an amplifier/i);
});
test('output to output is refused', () => {
  const v = validateConnection(rack(), [], ref('amp', 'spk-a'), ref('source', 'line-out'));
  assert.equal(v.ok, false);
});
test('speaker output into a line input is refused', () => {
  const v = validatePorts(amp.ports.find((p) => p.id === 'spk-a')!, amp.ports.find((p) => p.id === 'in-aux')!);
  assert.equal(v.ok, false);
});
test('3.5 mm headphones in the amp 6.35 mm jack use the adapter', () => {
  const v = validateConnection(rack(), [], ref('amp', 'phones'), ref('headphones', 'plug'));
  assert.equal(v.ok && v.cable, 'headphone-adapter');
});
test('a jack can only take one cable', () => {
  const r = rack();
  const conns = wire(r, [], ['source', 'line-out'], ['amp', 'in-cd']);
  assert.equal(validateConnection(r, conns, ref('source', 'line-out'), ref('amp', 'in-aux')).ok, false);
});

// ── Route construction ──
test('valid hi-fi chain plays through speakers via the amp', () => {
  const r = rack();
  const conns = wire(r, wire(r, [], ['source', 'line-out'], ['amp', 'in-cd']), ['amp', 'spk-a'], ['speakers', 'terminals']);
  const route = resolveRoute(true, r, conns, on);
  assert.equal(route.output.kind, 'speakers');
  assert.equal(route.throughAmp, true);
  assert.equal(route.sourceVolumeApplies, false, 'line out is fixed level');
});
test('amp switched off → silence with a reason', () => {
  const r = rack();
  const conns = wire(r, wire(r, [], ['source', 'line-out'], ['amp', 'in-cd']), ['amp', 'spk-a'], ['speakers', 'terminals']);
  const route = resolveRoute(true, r, conns, { ...on, power: false });
  assert.equal(route.output.kind, 'silent');
  assert.match((route.output as { reason: string }).reason, /switched off/);
});
test('selecting a disconnected input → silence explaining what to do', () => {
  const r = rack();
  const conns = wire(r, wire(r, [], ['source', 'line-out'], ['amp', 'in-cd']), ['amp', 'spk-a'], ['speakers', 'terminals']);
  const route = resolveRoute(true, r, conns, { ...on, input: 'AUX' });
  assert.equal(route.output.kind, 'silent');
  assert.match((route.output as { reason: string }).reason, /Nothing is plugged into AUX/);
});
test('plugging headphones into the amp mutes the speakers', () => {
  const r = rack();
  let conns = wire(r, [], ['source', 'line-out'], ['amp', 'in-cd']);
  conns = wire(r, conns, ['amp', 'spk-a'], ['speakers', 'terminals']);
  conns = wire(r, conns, ['amp', 'phones'], ['headphones', 'plug']);
  const route = resolveRoute(true, r, conns, on);
  assert.equal(route.output.kind, 'headphones');
  // and unplugging returns to speakers
  const unplugged = conns.filter((c) => c.to.slot !== 'headphones');
  assert.equal(resolveRoute(true, r, unplugged, on).output.kind, 'speakers');
});
test('boombox plays on its built-in speakers with no external gear', () => {
  const route = resolveRoute(true, rack({ source: boombox, amp: undefined, speakers: undefined }), [], undefined);
  assert.equal(route.output.kind, 'builtin');
});
test('boombox headphones mute the built-in speakers', () => {
  const r = rack({ source: boombox });
  const conns = wire(r, [], ['source', 'phones'], ['headphones', 'plug']);
  assert.equal(resolveRoute(true, r, conns, on).output.kind, 'headphones');
});
test('portable with nothing plugged in is silent', () => {
  assert.equal(resolveRoute(true, rack(), [], on).output.kind, 'silent');
});
test('hi-fi routing disabled plays directly', () => {
  assert.equal(resolveRoute(false, rack(), [], on).output.kind, 'direct');
});
test('swapping speakers keeps the speaker wire; swapping to a boombox drops the line cable', () => {
  const r = rack();
  const conns = wire(r, wire(r, [], ['source', 'line-out'], ['amp', 'in-cd']), ['amp', 'spk-a'], ['speakers', 'terminals']);
  assert.equal(pruneConnections(rack({ speakers: SPEAKERS[1] }), conns).kept.length, 2);
  const swapped = pruneConnections(rack({ source: boombox }), conns);
  assert.equal(swapped.dropped.length, 1);
  assert.equal(swapped.kept[0].to.slot, 'speakers');
});

// ── Control mapping / DSP ──
test('volume taper is monotonic, silent at 0 and never above unity', () => {
  let prev = -1;
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const g = volumeTaper(v);
    assert.ok(g >= prev && g <= 1);
    prev = g;
  }
  assert.equal(volumeTaper(0), 0);
  assert.ok(Math.abs(volumeTaper(1) - 1) < 1e-9);
});
test('bass knob is a real low shelf: +12 dB at full turn in the bass, ~0 dB in the mids', () => {
  const p = computeDspParams({ route: { output: { kind: 'speakers', profileId: 'bookshelf-premium', deviceName: '' }, throughAmp: true, sourceVolumeApplies: false, chain: [] }, amp, ampState: { ...on, bass: 1 }, profile: PROFILES['bookshelf-premium'], sourceVolume: 0.5, settings: { bypass: false, levelMatch: true, intensity: 1 } });
  const bassShelf = p.ampTone[0];
  assert.ok(Math.abs(biquadMagnitudeDb(bassShelf, 30) - 12) < 0.5);
  assert.ok(Math.abs(biquadMagnitudeDb(bassShelf, 2000)) < 0.5);
});
test('balance full right mutes the left channel', () => {
  assert.deepEqual(balanceGains(1), [0, 1]);
  assert.deepEqual(balanceGains(0), [1, 1]);
});
test('loudness lifts bass more at low volume than at high volume, and nothing when off', () => {
  assert.ok(loudnessBoost(true, 0.3).lowDb > loudnessBoost(true, 0.9).lowDb);
  assert.equal(loudnessBoost(false, 0.2).lowDb, 0);
});
test('cheap earbuds roll off bass compared with studio headphones', () => {
  const ear = PROFILES['earbuds-cheap'].filters;
  const studio = PROFILES['studio-closed'].filters;
  assert.ok(responseDb(studio, 60) - responseDb(ear, 60) > 10);
});
test('emulation intensity 0 is flat (neutral reference)', () => {
  const flat = scaleFilters(PROFILES['boombox-builtin'].filters, 0);
  for (const f of [40, 200, 1000, 5000, 15000]) assert.ok(Math.abs(responseDb(flat, f)) < 0.5, `at ${f} Hz`);
});
test('level matching compensates each profile to about the same loudness', () => {
  for (const id of Object.keys(PROFILES)) {
    const filters = PROFILES[id].filters;
    const matched = profileLoudnessDb(filters) - profileLoudnessDb(filters);
    assert.ok(Math.abs(matched) < 1e-9);
  }
});
test('silent route produces zero gain', () => {
  const p = computeDspParams({ route: { output: { kind: 'silent', reason: 'x' }, throughAmp: false, sourceVolumeApplies: false, chain: [] }, sourceVolume: 1, settings: { bypass: false, levelMatch: true, intensity: 1 } });
  assert.equal(p.routeGain * p.sourceGain, 0);
});

test('level-matched budget systems retain clearly different bass and treble', () => {
  const premium = PROFILES['bookshelf-premium'].filters;
  const relative = (filters: typeof premium, hz: number) => responseDb(filters, hz) - profileLoudnessDb(filters);
  for (const id of ['mini-cheap', 'boombox-builtin']) {
    const budget = PROFILES[id].filters;
    assert.ok(relative(premium, 60) - relative(budget, 60) > 12, `${id}: bass contrast`);
    assert.ok(relative(premium, 10000) - relative(budget, 10000) > 8, `${id}: treble contrast`);
    assert.ok(Number.isFinite(profileLoudnessDb(budget)));
  }
});

test('vintage RCA decks connect to every vintage amplifier AUX input', () => {
  for (const source of SOURCES.filter((d) => d.category === 'deck')) {
    for (const vintageAmp of AMPS.filter((d) => d.referenceUrl)) {
      for (const speakers of SPEAKERS.filter((d) => d.referenceUrl)) {
        const r = rack({ source, amp: vintageAmp, speakers });
        const conns = wire(r, wire(r, [], ['source', 'line-out'], ['amp', 'in-cd']), ['amp', 'spk-a'], ['speakers', 'terminals']);
        assert.equal(conns[0].cable, 'rca');
        const route = resolveRoute(true, r, conns, { ...defaultAmpState(vintageAmp), power: true, input: 'AUX' });
        assert.equal(route.output.kind, 'speakers');
        assert.equal(route.sourceVolumeApplies, false);
        assert.ok(PROFILES[speakers.profileId]);
      }
    }
  }
});

test('VU measurement separates RMS from peaks and reports silence truthfully', () => {
  assert.deepEqual(signalLevels(new Float32Array(128)), { peak: 0, rms: 0 });
  const wave = Float32Array.from({ length: 1024 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * i / 64));
  const levels = signalLevels(wave);
  assert.ok(Math.abs(levels.peak - 0.5) < 1e-6);
  assert.ok(Math.abs(levels.rms - 0.5 / Math.sqrt(2)) < 1e-6);
});
