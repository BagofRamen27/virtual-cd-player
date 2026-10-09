/**
 * ConnectionManager core: typed-port validation and signal-route resolution.
 * Pure functions (no DOM, no Web Audio) so they can be unit-tested in Node.
 */
import type { AmpDevice, AmpState, CableKind, Connection, Device, OutputDevice, PortDef, Slot, SourceDevice } from './types';

export interface Rack {
  source: SourceDevice | undefined;
  amp: AmpDevice | undefined;
  speakers: OutputDevice | undefined;
  headphones: OutputDevice | undefined;
}

export type ValidationResult = { ok: true; cable: CableKind; note?: string } | { ok: false; reason: string };

const LEVEL_NAME = { line: 'line-level', speaker: 'speaker-level', headphone: 'headphone', digital: 'digital' } as const;

/** Can a cable join `a` (an output) to `b` (an input)? Order-insensitive. */
export function validatePorts(a: PortDef, b: PortDef): ValidationResult {
  const [out, inp] = a.direction === 'out' ? [a, b] : [b, a];
  if (out.direction === inp.direction) {
    return {
      ok: false,
      reason:
        out.direction === 'out'
          ? `Both ends are outputs (${a.label} → ${b.label}). Connecting two outputs together can damage equipment.`
          : `Both ends are inputs (${a.label} and ${b.label}). Connect an output to an input.`,
    };
  }
  if (out.level === 'speaker' && inp.level === 'headphone') {
    return { ok: false, reason: 'That’s a speaker-level output. It would blast and could damage headphones — use the amplifier’s Phones jack instead.' };
  }
  if (out.level === 'speaker' && inp.level === 'line') {
    return { ok: false, reason: 'Speaker-level output into a line input would badly overload it. Line inputs take signals from sources, not amplifier outputs.' };
  }
  if ((out.level === 'line' || out.level === 'headphone') && inp.level === 'speaker') {
    return {
      ok: false,
      reason: `Passive speakers need an amplifier: a ${LEVEL_NAME[out.level]} output can’t drive them. Connect the source to an amp, then the amp to the speakers.`,
    };
  }
  if (out.level === 'line' && inp.level === 'headphone') {
    return { ok: false, reason: 'Line outputs are fixed-level and not meant to drive headphones. Use a Phones jack.' };
  }
  if (out.level === 'headphone' && inp.level === 'line') {
    return { ok: false, reason: 'Use the Line out for amplifier inputs — the headphone jack’s level changes with the volume control.' };
  }
  // Same level: check connectors
  if (out.level === 'line' && inp.level === 'line') {
    if (out.connector === 'rca' && inp.connector === 'rca') return { ok: true, cable: 'rca' };
    if (out.connector === 'trs35' && inp.connector === 'rca') return { ok: true, cable: 'trs35-rca', note: '3.5 mm to stereo RCA cable' };
    return { ok: false, reason: `No standard cable joins ${out.connector.toUpperCase()} to ${inp.connector.toUpperCase()} here.` };
  }
  if (out.level === 'speaker' && inp.level === 'speaker') return { ok: true, cable: 'speaker', note: 'Speaker wire, red to red (+), black to black (−)' };
  if (out.level === 'headphone' && inp.level === 'headphone') {
    if (out.connector === inp.connector) return { ok: true, cable: 'headphone' };
    if (out.connector === 'trs635' && inp.connector === 'trs35') return { ok: true, cable: 'headphone-adapter', note: 'Using the 6.35 mm adapter' };
    return { ok: false, reason: 'This plug doesn’t fit that jack.' };
  }
  return { ok: false, reason: 'Those ports aren’t compatible.' };
}

export function deviceInSlot(rack: Rack, slot: Slot): Device | undefined {
  return rack[slot];
}

export function portOf(rack: Rack, slot: Slot, portId: string): PortDef | undefined {
  return deviceInSlot(rack, slot)?.ports.find((p) => p.id === portId);
}

/** Validate a proposed connection against the rack and existing cables. */
export function validateConnection(rack: Rack, connections: Connection[], a: { slot: Slot; port: string }, b: { slot: Slot; port: string }): ValidationResult {
  if (a.slot === b.slot) return { ok: false, reason: 'Both ends are on the same device.' };
  const pa = portOf(rack, a.slot, a.port);
  const pb = portOf(rack, b.slot, b.port);
  if (!pa || !pb) return { ok: false, reason: 'That jack isn’t on the current equipment.' };
  const res = validatePorts(pa, pb);
  if (!res.ok) return res;
  const busy = (e: { slot: Slot; port: string }) =>
    connections.some((c) => (c.from.slot === e.slot && c.from.port === e.port) || (c.to.slot === e.slot && c.to.port === e.port));
  if (busy(a) || busy(b)) return { ok: false, reason: 'One of those jacks already has a cable. Unplug it first.' };
  return res;
}

/** Normalise so `from` is always the output end. */
export function makeConnection(rack: Rack, a: { slot: Slot; port: string }, b: { slot: Slot; port: string }, cable: CableKind): Connection {
  const pa = portOf(rack, a.slot, a.port)!;
  const [from, to] = pa.direction === 'out' ? [a, b] : [b, a];
  return { id: `${from.slot}.${from.port}->${to.slot}.${to.port}`, from, to, cable };
}

/** Drop connections that are no longer valid after a device swap. */
export function pruneConnections(rack: Rack, connections: Connection[]): { kept: Connection[]; dropped: Connection[] } {
  const kept: Connection[] = [];
  const dropped: Connection[] = [];
  for (const c of connections) {
    const pa = portOf(rack, c.from.slot, c.from.port);
    const pb = portOf(rack, c.to.slot, c.to.port);
    const v = pa && pb ? validatePorts(pa, pb) : null;
    if (v?.ok) kept.push({ ...c, cable: v.cable });
    else dropped.push(c);
  }
  return { kept, dropped };
}

export type RouteOutput =
  | { kind: 'direct' }
  | { kind: 'silent'; reason: string }
  | { kind: 'speakers' | 'headphones' | 'builtin'; profileId: string; deviceName: string };

export interface Route {
  output: RouteOutput;
  /** Whether the amplifier stage (tone, balance, amp volume) is in the path. */
  throughAmp: boolean;
  /** Source volume applies (headphone jack / boombox) rather than fixed line level. */
  sourceVolumeApplies: boolean;
  /** Human-readable chain, e.g. ["DD-1 line out", "3.5 mm→RCA", "A-60 CD in", …] */
  chain: string[];
}

function linked(connections: Connection[], from: { slot: Slot; port?: string }, toSlot?: Slot): Connection | undefined {
  return connections.find((c) => c.from.slot === from.slot && (!from.port || c.from.port === from.port) && (!toSlot || c.to.slot === toSlot));
}

/**
 * Resolve what the listener hears. When hi-fi routing is disabled the source plays directly
 * (the original DiscDeck behaviour).
 */
export function resolveRoute(enabled: boolean, rack: Rack, connections: Connection[], amp: AmpState | undefined): Route {
  const silent = (reason: string, chain: string[] = []): Route => ({ output: { kind: 'silent', reason }, throughAmp: false, sourceVolumeApplies: false, chain });
  if (!enabled) return { output: { kind: 'direct' }, throughAmp: false, sourceVolumeApplies: true, chain: ['Direct output'] };
  const src = rack.source;
  if (!src) return silent('Choose a CD player or boombox.');

  // Headphones plugged straight into the source
  const srcPhones = linked(connections, { slot: 'source', port: 'phones' }, 'headphones');
  if (srcPhones && rack.headphones) {
    return {
      output: { kind: 'headphones', profileId: rack.headphones.profileId, deviceName: rack.headphones.displayName },
      throughAmp: false,
      sourceVolumeApplies: true,
      chain: [`${src.displayName} phones`, rack.headphones.displayName],
    };
  }

  // Boombox: built-in speakers unless headphones mute them
  if (src.builtInSpeakerProfileId) {
    return {
      output: { kind: 'builtin', profileId: src.builtInSpeakerProfileId, deviceName: `${src.displayName} speakers` },
      throughAmp: false,
      sourceVolumeApplies: true,
      chain: [src.displayName, 'Built-in speakers'],
    };
  }

  const toAmp = linked(connections, { slot: 'source' }, 'amp');
  if (!toAmp) {
    return silent(`${src.displayName} isn’t connected to anything. Plug headphones into its Phones jack, or run a cable from its Line out to the amplifier.`);
  }
  const ampDev = rack.amp;
  if (!ampDev || !amp) return silent('No amplifier in the rack.');
  const inPort = ampDev.ports.find((p) => p.id === toAmp.to.port);
  const chain = [`${src.displayName} ${toAmp.from.port === 'line-out' ? 'line out' : toAmp.from.port}`, `${ampDev.displayName} ${inPort?.label ?? ''}`.trim()];
  if (!amp.power) return silent(`${ampDev.displayName} is switched off. Press its power button.`, chain);
  if (inPort?.inputName !== amp.input) {
    const feeding = ampDev.ports.find((p) => p.inputName === amp.input);
    const hasCable = feeding && connections.some((c) => c.to.slot === 'amp' && c.to.port === feeding.id);
    return silent(
      hasCable
        ? `The input selector is on ${amp.input}. Turn it to ${inPort?.inputName} to hear the CD player.`
        : `Nothing is plugged into ${amp.input}. Turn the input selector to ${inPort?.inputName ?? 'the connected input'}.`,
      chain,
    );
  }

  const ampPhones = linked(connections, { slot: 'amp', port: 'phones' }, 'headphones');
  if (ampPhones && rack.headphones) {
    return {
      output: { kind: 'headphones', profileId: rack.headphones.profileId, deviceName: rack.headphones.displayName },
      throughAmp: true,
      sourceVolumeApplies: false,
      chain: [...chain, `${ampDev.displayName} phones`, rack.headphones.displayName],
    };
  }
  const spk = linked(connections, { slot: 'amp' }, 'speakers');
  if (spk && rack.speakers) {
    if (!amp.speakersA) return silent('Speakers A is switched off on the amplifier.', chain);
    return {
      output: { kind: 'speakers', profileId: rack.speakers.profileId, deviceName: rack.speakers.displayName },
      throughAmp: true,
      sourceVolumeApplies: false,
      chain: [...chain, 'Speaker wire', rack.speakers.displayName],
    };
  }
  return silent('The amplifier’s outputs aren’t connected. Wire its Speakers A terminals to speakers, or plug headphones into its Phones jack.', chain);
}
