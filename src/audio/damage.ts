/**
 * Deterministic disc-damage model.
 *
 * A CD is read from the inside out at constant linear velocity, so the playback time
 * reached at radius r grows with r². Scratches are stored in polar coordinates and
 * mapped onto the album timeline:
 *  - circumferential (arced) scratches run along the spiral track and destroy a short,
 *    dense stretch of audio → repeats, skips and dropouts in a narrow window;
 *  - radial scratches cross many turns of the spiral but only briefly each turn, so error
 *    correction mostly copes → sparse micro-clicks spread over a longer stretch.
 *
 * Every random choice is seeded from the profile seed + stroke id, so the same virtual
 * disc always fails at the same positions.
 *
 * This file must stay free of DOM / runtime imports so it can be unit-tested in Node.
 */
import type { ConditionLevel, DamageEvent, DamageEventType, DamageProfile, ScratchStroke } from '../types';

/** Normalized radius where the program area starts / ends (≈23 mm and 58 mm on a 120 mm disc). */
export const DATA_R0 = 0.383;
export const DATA_R1 = 0.967;

export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function radiusToTime(r: number, total: number): number {
  const rc = clamp(r, DATA_R0, DATA_R1);
  return (total * (rc * rc - DATA_R0 * DATA_R0)) / (DATA_R1 * DATA_R1 - DATA_R0 * DATA_R0);
}

export function timeToRadius(t: number, total: number): number {
  if (total <= 0) return DATA_R0;
  const f = clamp(t / total, 0, 1);
  return Math.sqrt(DATA_R0 * DATA_R0 + f * (DATA_R1 * DATA_R1 - DATA_R0 * DATA_R0));
}

function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const TRACKING: Record<ConditionLevel, { every: [number, number]; types: readonly DamageEventType[]; severity: number } | null> = {
  0: null,
  1: { every: [40, 90], types: ['click', 'stutter', 'click'], severity: 0.2 },
  2: { every: [20, 40], types: ['stutter', 'skipburst', 'click'], severity: 0.35 },
  3: { every: [10, 20], types: ['skipburst', 'stutter', 'repeat', 'skipburst'], severity: 0.55 },
  4: { every: [5, 10], types: ['skipburst', 'repeat', 'skip', 'dropout', 'skipburst'], severity: 0.75 },
  5: { every: [2, 4.5], types: ['skipburst', 'skip', 'repeat', 'dropout'], severity: 0.95 },
};

const STROKE_COUNTS: Record<ConditionLevel, number> = { 0: 0, 1: 4, 2: 10, 3: 18, 4: 30, 5: 46 };

/** Visual + audible wear implied by a condition level. Deterministic for a seed. */
export function generateConditionStrokes(seed: number, level: ConditionLevel): ScratchStroke[] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const strokes: ScratchStroke[] = [];
  const count = STROKE_COUNTS[level];
  for (let i = 0; i < count; i++) {
    const r = DATA_R0 + rng() * (DATA_R1 - DATA_R0);
    const a = rng() * Math.PI * 2;
    // Heavier conditions produce deeper and more circumferential damage.
    const depth = clamp(0.12 + rng() * 0.25 + level * 0.1, 0.1, 1);
    const arced = rng() < 0.35 + level * 0.08;
    const points: { r: number; a: number }[] = [];
    const steps = 6;
    if (arced) {
      const span = 0.15 + rng() * (0.25 + level * 0.12);
      const drift = (rng() - 0.5) * 0.04;
      for (let s = 0; s <= steps; s++) points.push({ r: r + (drift * s) / steps, a: a + (span * s) / steps });
    } else {
      const len = 0.05 + rng() * 0.3;
      const bend = (rng() - 0.5) * 0.15;
      for (let s = 0; s <= steps; s++) points.push({ r: clamp(r + (len * s) / steps, 0.2, 0.99), a: a + (bend * s) / steps });
    }
    strokes.push({ id: `wear-${seed}-${i}`, points, depth, generated: true });
  }
  return strokes;
}

interface StrokeShape {
  rMin: number;
  rMax: number;
  /** 0 = purely radial, 1 = purely circumferential */
  arcness: number;
}

function strokeShape(stroke: ScratchStroke): StrokeShape {
  let rMin = Infinity;
  let rMax = -Infinity;
  let arc = 0;
  let radial = 0;
  for (let i = 0; i < stroke.points.length; i++) {
    const p = stroke.points[i];
    rMin = Math.min(rMin, p.r);
    rMax = Math.max(rMax, p.r);
    if (i > 0) {
      const q = stroke.points[i - 1];
      arc += Math.abs(angleDelta(q.a, p.a)) * ((p.r + q.r) / 2);
      radial += Math.abs(p.r - q.r);
    }
  }
  return { rMin, rMax, arcness: arc / (arc + radial + 1e-6) };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

function makeEvent(rng: () => number, type: DamageEventType, t: number, severity: number): DamageEvent {
  switch (type) {
    case 'click':
      return { type, t, len: 0.004 + rng() * 0.014, count: 0 };
    case 'dropout':
      return { type, t, len: 0.08 + rng() * (0.15 + severity * 0.35), count: 0 };
    case 'stutter':
      return { type, t, len: 0.06 + rng() * 0.07, count: 3 + Math.floor(rng() * (2 + severity * 3)) };
    case 'skipburst':
      return { type, t, len: 0.07 + rng() * 0.05, count: 3 + Math.floor(rng() * (2 + severity * 3)), jump: 0.4 + rng() * (0.6 + severity * 1.9) };
    case 'repeat':
      return { type, t, len: 0.25 + rng() * (0.25 + severity * 0.4), count: 1 + Math.floor(rng() * (1 + severity * 2.5)) };
    case 'skip':
      return { type, t, len: 0.3 + rng() * (0.5 + severity * 2.2), count: 0 };
  }
}

/**
 * Convert a damage profile into a sorted list of glitches on the album timeline (seconds).
 * `total` is the album running time in seconds.
 */
export function computeDamageEvents(profile: DamageProfile, total: number): DamageEvent[] {
  if (total <= 0) return [];
  const strokes = [...generateConditionStrokes(profile.seed, profile.condition), ...profile.strokes];
  const events: DamageEvent[] = [];

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const rng = mulberry32(hashString(`${profile.seed}:${stroke.id}`));
    const shape = strokeShape(stroke);
    if (shape.rMax < DATA_R0 || shape.rMin > DATA_R1) continue; // outside program area: cosmetic only
    let t0 = radiusToTime(shape.rMin, total);
    let t1 = radiusToTime(shape.rMax, total);
    if (t1 - t0 < 1.2) {
      const mid = (t0 + t1) / 2;
      t0 = Math.max(0, mid - 0.6);
      t1 = Math.min(total, mid + 0.6);
    }
    const depth = clamp(stroke.depth, 0.05, 1);
    const severity = depth * (0.35 + 0.65 * shape.arcness);

    // Radial component: sparse micro clicks across the crossed region.
    const radialWeight = 1 - shape.arcness;
    if (radialWeight > 0.25) {
      const spacing = 7 - depth * 4.5;
      const n = clamp(Math.round(((t1 - t0) / spacing) * radialWeight), 1, 40);
      for (let i = 0; i < n; i++) {
        const t = t0 + ((i + rng()) / n) * (t1 - t0);
        events.push(makeEvent(rng, depth > 0.7 && rng() < 0.3 ? 'stutter' : 'click', t, severity));
      }
    }

    // Circumferential component: dense damage in the window.
    if (shape.arcness > 0.35) {
      const n = 1 + Math.floor(severity * 3.2);
      const types: readonly DamageEventType[] =
        severity < 0.3 ? ['click', 'stutter'] : severity < 0.6 ? ['stutter', 'skipburst', 'dropout', 'repeat'] : ['skipburst', 'repeat', 'skip', 'dropout'];
      for (let i = 0; i < n; i++) {
        const t = t0 + rng() * (t1 - t0);
        events.push(makeEvent(rng, pick(rng, types), t, severity));
      }
    }
  }

  // Worn discs also lose tracking periodically across the whole program, so every condition
  // above Mint is clearly audible. The first problem always arrives within ~15 seconds.
  const tracking = TRACKING[profile.condition];
  if (tracking) {
    const rng = mulberry32(hashString(`${profile.seed}:tracking`));
    const [lo, hi] = tracking.every;
    for (let t = Math.min(lo * rng(), 4 + rng() * 10); t < total; t += lo + rng() * (hi - lo)) {
      events.push(makeEvent(rng, pick(rng, tracking.types), t, tracking.severity));
    }
  }

  events.sort((a, b) => a.t - b.t);
  return dedupe(events);
}

function eventSpan(e: DamageEvent): number {
  switch (e.type) {
    case 'stutter':
    case 'repeat':
      return e.len * (e.count + 1);
    case 'skipburst':
      return e.len * (e.count + 1) + 0.05;
    case 'skip':
      return 0.05;
    default:
      return e.len;
  }
}

/** Keep events from overlapping so the audio engine never stacks glitches into harsh noise. */
function dedupe(events: DamageEvent[]): DamageEvent[] {
  const out: DamageEvent[] = [];
  let freeAt = -Infinity;
  for (const e of events) {
    if (e.t < freeAt) continue;
    out.push(e);
    freeAt = e.t + eventSpan(e) + 0.2;
  }
  return out;
}

/** Slice album-timeline events down to one track, in track-local seconds. */
export function eventsForTrack(events: DamageEvent[], durations: number[], index: number): DamageEvent[] {
  let start = 0;
  for (let i = 0; i < index; i++) start += durations[i] ?? 0;
  const end = start + (durations[index] ?? 0);
  return events.filter((e) => e.t >= start && e.t < end).map((e) => ({ ...e, t: e.t - start }));
}

export function newDamageProfile(albumId: string): DamageProfile {
  return { albumId, condition: 0, strokes: [], seed: hashString(albumId), updatedAt: Date.now() };
}
