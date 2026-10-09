/**
 * Virtual Hi-Fi Lab data model. Devices are plain typed objects so new hardware can be added
 * to the catalog without touching the routing or DSP code.
 */

export type Era = '1980s' | '1990s' | '2000s' | '2010s' | 'modern';
export type Tier = 'entry' | 'midrange' | 'premium';

/** Physical connector on a port. */
export type Connector = 'rca' | 'trs35' | 'trs635' | 'speaker' | 'optical' | 'coax';
/** Electrical level carried by a port. */
export type SignalLevel = 'line' | 'speaker' | 'headphone' | 'digital';
export type Direction = 'out' | 'in';

export interface PortDef {
  id: string;
  label: string;
  connector: Connector;
  direction: Direction;
  level: SignalLevel;
  channels: 'stereo';
  /** For amplifier inputs: the selector position this jack feeds. */
  inputName?: string;
}

/** Rack positions. Connections are made between slots, so swapping a device keeps compatible wiring. */
export type Slot = 'source' | 'amp' | 'speakers' | 'headphones';

export type EvidenceGrade = 'measured' | 'approximate' | 'creative';

export interface Evidence {
  grade: EvidenceGrade;
  notes: string;
}

interface DeviceBase {
  id: string;
  slot: Slot;
  era: Era;
  tier: Tier;
  displayName: string;
  /** "Inspired by" a product category — never a claim to replicate a branded model. */
  manufacturerInspiration: string;
  description: string;
  ports: PortDef[];
}

export interface SourceDevice extends DeviceBase {
  slot: 'source';
  category: 'portable' | 'boombox';
  /** Visual model to render in the rack. */
  visualModel: 'dd1' | 'boombox';
  /** Profile used when the device plays through its own built-in speakers. */
  builtInSpeakerProfileId?: string;
  /** Whether plugging into the headphone jack mutes the built-in speakers. */
  phonesMuteBuiltIns: boolean;
  hasVolumeKnob: boolean;
}

export interface AmpDevice extends DeviceBase {
  slot: 'amp';
  category: 'integrated' | 'receiver';
  inputs: string[];
  /** Whether a plugged-in headphone mutes speaker outputs (model specific). */
  phonesMuteSpeakers: boolean;
  /** Bass / treble shelf corner frequencies in Hz. */
  bassHz: number;
  trebleHz: number;
}

export interface OutputDevice extends DeviceBase {
  slot: 'speakers' | 'headphones';
  profileId: string;
}

export type Device = SourceDevice | AmpDevice | OutputDevice;

export interface FilterSpec {
  type: 'highpass' | 'lowpass' | 'lowshelf' | 'highshelf' | 'peaking';
  freq: number;
  q?: number;
  gain?: number;
}

/** DSP profile for a speaker, headphone or built-in driver. */
export interface OutputProfile {
  id: string;
  kind: 'speaker' | 'headphone' | 'builtin';
  displayName: string;
  /** Filters applied in series; at most one of each shelf/pass type and up to three peaks. */
  filters: FilterSpec[];
  /** 0 = clean; 1 = heavy soft-clipping at full output. Scales with output level. */
  distortion: number;
  /** 1 = normal stereo, < 1 = narrower (mono at 0), > 1 = wider. */
  stereoWidth: number;
  /** Level difference between channels in dB (right channel quieter). */
  channelMismatchDb: number;
  /** Relative loudness at the same drive, in dB (more sensitive = louder). */
  sensitivityDb: number;
  /** Isolation / leakage for headphones, placement for speakers. */
  isolation?: string;
  traits: string[];
  evidence: Evidence;
}

/** One cable between two slot ports. */
export interface Connection {
  id: string;
  from: { slot: Slot; port: string };
  to: { slot: Slot; port: string };
  cable: CableKind;
}

export type CableKind = 'rca' | 'trs35-rca' | 'speaker' | 'headphone' | 'headphone-adapter';

export interface AmpState {
  power: boolean;
  /** 0..1 knob position (audio taper applied in DSP). */
  volume: number;
  /** -1..1 → ±12 dB */
  bass: number;
  treble: number;
  /** -1 (left) .. 1 (right) */
  balance: number;
  loudness: boolean;
  input: string;
  speakersA: boolean;
}
