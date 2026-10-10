import { create } from 'zustand';
import { usePlayer } from '../state/store';
import { persist } from 'zustand/middleware';
import { AMPS, defaultAmpState, deviceById, HEADPHONES, PROFILES, SOURCES, SPEAKERS } from './catalog';
import { makeConnection, pruneConnections, resolveRoute, validateConnection, type Rack, type Route } from './routing';
import type { AmpDevice, AmpState, Connection, OutputDevice, Slot, SourceDevice } from './types';

export type PortRef = { slot: Slot; port: string };

export interface HifiPreset {
  id: string;
  name: string;
  blurb: string;
  rack: { source: string; amp: string | null; speakers: string | null; headphones: string | null };
  wires: [PortRef, PortRef][];
  amp?: Partial<AmpState>;
}

export const PRESETS: HifiPreset[] = [
  {
    id: 'vintage-marantz', name: '1970s Marantz + JBL', blurb: 'Sony CDP-101 → Marantz 2270 AUX → JBL L100',
    rack: { source: 'sony-cdp101', amp: 'marantz-2270', speakers: 'jbl-l100', headphones: 'studio-closed' },
    wires: [[{ slot: 'source', port: 'line-out' }, { slot: 'amp', port: 'in-cd' }], [{ slot: 'amp', port: 'spk-a' }, { slot: 'speakers', port: 'terminals' }]],
    amp: { power: true, input: 'AUX', speakersA: true },
  },
  {
    id: 'vintage-yamaha', name: '1970s Yamaha separates', blurb: 'Philips CD100 → Yamaha CA-1000 AUX → NS-1000M',
    rack: { source: 'philips-cd100', amp: 'yamaha-ca1000', speakers: 'yamaha-ns1000m', headphones: 'studio-closed' },
    wires: [[{ slot: 'source', port: 'line-out' }, { slot: 'amp', port: 'in-cd' }], [{ slot: 'amp', port: 'spk-a' }, { slot: 'speakers', port: 'terminals' }]],
    amp: { power: true, input: 'AUX', speakersA: true },
  },
  {
    id: 'vintage-studio', name: '1980s Yamaha studio', blurb: 'Yamaha CD-1 → R-9 AUX → NS-10M Studio',
    rack: { source: 'yamaha-cd1', amp: 'yamaha-r9', speakers: 'yamaha-ns10m', headphones: 'studio-closed' },
    wires: [[{ slot: 'source', port: 'line-out' }, { slot: 'amp', port: 'in-cd' }], [{ slot: 'amp', port: 'spk-a' }, { slot: 'speakers', port: 'terminals' }]],
    amp: { power: true, input: 'AUX', speakersA: true },
  },
  {
    id: 'living-room',
    name: 'Living-room hi-fi',
    blurb: 'DD-1 → 1980s integrated amp → premium bookshelf speakers',
    rack: { source: 'dd1', amp: 'amp-1986', speakers: 'bookshelf-premium', headphones: 'studio-closed' },
    wires: [
      [{ slot: 'source', port: 'line-out' }, { slot: 'amp', port: 'in-cd' }],
      [{ slot: 'amp', port: 'spk-a' }, { slot: 'speakers', port: 'terminals' }],
    ],
    amp: { power: true, input: 'CD' },
  },
  {
    id: 'bedroom-boombox',
    name: '2003 Bedroom Boombox',
    blurb: 'Boombox on its own built-in speakers',
    rack: { source: 'boombox-2003', amp: 'amp-1986', speakers: 'mini-cheap', headphones: 'earbuds-cheap' },
    wires: [],
  },
  {
    id: 'budget-dorm',
    name: 'Budget 1998 Dorm',
    blurb: 'DD-1 → amp → cheap mini speakers',
    rack: { source: 'dd1', amp: 'amp-1986', speakers: 'mini-cheap', headphones: 'earbuds-cheap' },
    wires: [
      [{ slot: 'source', port: 'line-out' }, { slot: 'amp', port: 'in-aux' }],
      [{ slot: 'amp', port: 'spk-a' }, { slot: 'speakers', port: 'terminals' }],
    ],
    amp: { power: true, input: 'AUX' },
  },
  {
    id: 'late-night',
    name: 'Late-night headphones',
    blurb: 'DD-1 → amp → studio headphones (speakers muted)',
    rack: { source: 'dd1', amp: 'amp-1986', speakers: 'bookshelf-premium', headphones: 'studio-closed' },
    wires: [
      [{ slot: 'source', port: 'line-out' }, { slot: 'amp', port: 'in-cd' }],
      [{ slot: 'amp', port: 'spk-a' }, { slot: 'speakers', port: 'terminals' }],
      [{ slot: 'amp', port: 'phones' }, { slot: 'headphones', port: 'plug' }],
    ],
    amp: { power: true, input: 'CD' },
  },
  {
    id: 'walkman-earbuds',
    name: 'Portable + earbuds',
    blurb: 'Earbuds straight into the DD-1',
    rack: { source: 'dd1', amp: 'amp-1986', speakers: 'bookshelf-premium', headphones: 'earbuds-cheap' },
    wires: [[{ slot: 'source', port: 'phones' }, { slot: 'headphones', port: 'plug' }]],
  },
];

interface HifiState {
  enabled: boolean;
  view: 'player' | 'room';
  rackIds: { source: string; amp: string | null; speakers: string | null; headphones: string | null };
  connections: Connection[];
  /** Per-amplifier settings, kept when gear is swapped. */
  amps: Record<string, AmpState>;
  /** Volume for sources other than the DD-1 (which uses the main player volume). */
  sourceVolumes: Record<string, number>;
  bypass: boolean;
  levelMatch: boolean;
  intensity: number;
  pending: PortRef | null;
  message: { id: number; text: string; tone: 'info' | 'error' } | null;
  tutorialDone: boolean;

  setView(view: 'player' | 'room'): void;
  setEnabled(on: boolean): void;
  selectDevice(slot: Slot, id: string | null): void;
  pickPort(ref: PortRef): void;
  connect(a: PortRef, b: PortRef): boolean;
  disconnectAt(ref: PortRef): void;
  disconnect(id: string): void;
  autoConnect(): void;
  applyPreset(id: string): void;
  setAmp(patch: Partial<AmpState>): void;
  resetAmp(): void;
  setSourceVolume(v: number): void;
  setLab(patch: Partial<Pick<HifiState, 'bypass' | 'levelMatch' | 'intensity' | 'tutorialDone'>>): void;
  say(text: string, tone?: 'info' | 'error'): void;
  clearMessage(): void;
}

let msgId = 0;

export function rackOf(ids: HifiState['rackIds']): Rack {
  return {
    source: deviceById(ids.source) as SourceDevice | undefined,
    amp: deviceById(ids.amp) as AmpDevice | undefined,
    speakers: deviceById(ids.speakers) as OutputDevice | undefined,
    headphones: deviceById(ids.headphones) as OutputDevice | undefined,
  };
}

export const useHifi = create<HifiState>()(
  persist(
    (set, get) => {
      const ampState = (): AmpState | undefined => {
        const amp = rackOf(get().rackIds).amp;
        return amp ? (get().amps[amp.id] ?? defaultAmpState(amp)) : undefined;
      };
      return {
        enabled: false,
        view: 'player',
        rackIds: { source: 'dd1', amp: 'amp-1986', speakers: 'bookshelf-premium', headphones: 'studio-closed' },
        connections: [],
        amps: {},
        sourceVolumes: { 'boombox-2003': 0.6 },
        bypass: false,
        levelMatch: true,
        intensity: 1,
        pending: null,
        message: null,
        tutorialDone: false,

        setView(view) {
          set({ view });
          // Opening the listening room switches playback over to the rack.
          if (view === 'room' && !get().enabled) set({ enabled: true });
        },
        setEnabled(enabled) {
          set({ enabled });
        },
        selectDevice(slot, id) {
          const rackIds = { ...get().rackIds, [slot]: id } as HifiState['rackIds'];
          if (slot === 'source' && !id) return;
          const { kept, dropped } = pruneConnections(rackOf(rackIds), get().connections);
          set({ rackIds, connections: kept, pending: null });
          if (dropped.length) get().say(`Unplugged ${dropped.length} cable${dropped.length > 1 ? 's' : ''} that the new equipment can’t accept.`);
        },
        pickPort(ref) {
          const { pending } = get();
          if (!pending) {
            const existing = get().connections.find(
              (c) => (c.from.slot === ref.slot && c.from.port === ref.port) || (c.to.slot === ref.slot && c.to.port === ref.port),
            );
            if (existing) {
              get().disconnect(existing.id);
              return;
            }
            set({ pending: ref });
            return;
          }
          if (pending.slot === ref.slot && pending.port === ref.port) {
            set({ pending: null });
            return;
          }
          get().connect(pending, ref);
          set({ pending: null });
        },
        connect(a, b) {
          const rack = rackOf(get().rackIds);
          const v = validateConnection(rack, get().connections, a, b);
          if (!v.ok) {
            get().say(v.reason, 'error');
            return false;
          }
          set({ connections: [...get().connections, makeConnection(rack, a, b, v.cable)] });
          if (v.note) get().say(`Connected — ${v.note}.`);
          return true;
        },
        disconnectAt(ref) {
          const c = get().connections.find(
            (c) => (c.from.slot === ref.slot && c.from.port === ref.port) || (c.to.slot === ref.slot && c.to.port === ref.port),
          );
          if (c) get().disconnect(c.id);
        },
        disconnect(id) {
          set({ connections: get().connections.filter((c) => c.id !== id) });
        },
        autoConnect() {
          const rack = rackOf(get().rackIds);
          if (!rack.source) return;
          if (rack.source.builtInSpeakerProfileId) {
            get().say(`${rack.source.displayName} plays through its own speakers — no cables needed.`);
            return;
          }
          set({ connections: [] });
          const amp = rack.amp;
          if (!amp) {
            if (rack.headphones) get().connect({ slot: 'source', port: 'phones' }, { slot: 'headphones', port: 'plug' });
            return;
          }
          get().connect({ slot: 'source', port: 'line-out' }, { slot: 'amp', port: 'in-cd' });
          if (rack.speakers) get().connect({ slot: 'amp', port: 'spk-a' }, { slot: 'speakers', port: 'terminals' });
          const input = amp.ports.find((p) => p.id === 'in-cd')?.inputName ?? amp.inputs[0];
          get().setAmp({ power: true, input, speakersA: true });
          get().say(`Wired: CD player → amp ${input} input → speakers. Amp switched on and set to ${input}.`);
        },
        applyPreset(id) {
          const p = PRESETS.find((x) => x.id === id);
          if (!p) return;
          set({ rackIds: { ...p.rack }, connections: [], pending: null, enabled: true, bypass: false, intensity: 1 });
          const rack = rackOf(p.rack);
          const conns: Connection[] = [];
          for (const [a, b] of p.wires) {
            const v = validateConnection(rack, conns, a, b);
            if (v.ok) conns.push(makeConnection(rack, a, b, v.cable));
          }
          set({ connections: conns });
          if (p.amp) get().setAmp(p.amp);
          get().say(`Loaded “${p.name}”.`);
        },
        setAmp(patch) {
          const amp = rackOf(get().rackIds).amp;
          if (!amp) return;
          set({ amps: { ...get().amps, [amp.id]: { ...(ampState() ?? defaultAmpState(amp)), ...patch } } });
        },
        resetAmp() {
          const amp = rackOf(get().rackIds).amp;
          if (amp) set({ amps: { ...get().amps, [amp.id]: defaultAmpState(amp) } });
        },
        setSourceVolume(v) {
          set({ sourceVolumes: { ...get().sourceVolumes, [get().rackIds.source]: v } });
        },
        setLab(patch) {
          set(patch);
        },
        say(text, tone = 'info') {
          set({ message: { id: ++msgId, text, tone } });
          usePlayer.getState().notify(text, tone);
        },
        clearMessage() {
          set({ message: null });
        },
      };
    },
    {
      name: 'discdeck.hifi',
      version: 1,
      partialize: (s) => ({
        enabled: s.enabled,
        rackIds: s.rackIds,
        connections: s.connections,
        amps: s.amps,
        sourceVolumes: s.sourceVolumes,
        bypass: s.bypass,
        levelMatch: s.levelMatch,
        intensity: s.intensity,
        tutorialDone: s.tutorialDone,
      }),
    },
  ),
);

export function currentAmpState(s: Pick<HifiState, 'rackIds' | 'amps'>): AmpState | undefined {
  const amp = rackOf(s.rackIds).amp;
  return amp ? (s.amps[amp.id] ?? defaultAmpState(amp)) : undefined;
}

export function currentRoute(s: Pick<HifiState, 'enabled' | 'rackIds' | 'connections' | 'amps'>): Route {
  return resolveRoute(s.enabled, rackOf(s.rackIds), s.connections, currentAmpState(s));
}

export function profileFor(route: Route) {
  return 'profileId' in route.output ? PROFILES[route.output.profileId] : undefined;
}

export const CATALOG = { sources: SOURCES, amps: AMPS, speakers: SPEAKERS, headphones: HEADPHONES };
