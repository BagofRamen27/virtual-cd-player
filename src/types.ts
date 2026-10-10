export type SourceKind = 'local' | 'demo';

export interface Track {
  id: string;
  title: string;
  artist: string;
  /** Duration in seconds; 0 when not yet known. */
  duration: number;
  /** Key of the stored audio blob in IndexedDB (local source only). */
  fileKey?: string;
}

export interface Album {
  id: string;
  source: SourceKind;
  title: string;
  artist: string;
  year?: string;
  /** Cover image: http(s) URL, data URL, or object URL. */
  coverUrl?: string;
  /** Warm accent used for generated covers and labels. */
  tint: string;
  tracks: Track[];
  /** Local albums: true when audio blobs could not be persisted (session-only). */
  sessionOnly?: boolean;
  addedAt: number;
}

export type PlayerState =
  | 'EMPTY'
  | 'LOADING'
  | 'READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'STOPPED'
  | 'EJECTING'
  | 'ERROR';

/** A scratch stroke in polar disc coordinates. r is normalized 0..1 of disc radius, a is radians. */
export interface ScratchStroke {
  id: string;
  points: { r: number; a: number }[];
  /** 0.1 (hairline) .. 1 (deep gouge) */
  depth: number;
  /** Strokes generated from the condition level, rather than painted by hand. */
  generated?: boolean;
}

export type ConditionLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const CONDITION_LABELS: Record<ConditionLevel, string> = {
  0: 'Mint',
  1: 'Light',
  2: 'Used',
  3: 'Scratched',
  4: 'Damaged',
  5: 'Unplayable',
};

export interface DamageProfile {
  albumId: string;
  condition: ConditionLevel;
  strokes: ScratchStroke[];
  seed: number;
  updatedAt: number;
}

/** skipburst = the classic CD skip: a tiny fragment stutters a few times, then the laser jumps ahead. */
export type DamageEventType = 'click' | 'dropout' | 'stutter' | 'repeat' | 'skip' | 'skipburst';

/** A playback glitch in seconds, relative to the album timeline or a track. */
export interface DamageEvent {
  type: DamageEventType;
  /** Start time in seconds. */
  t: number;
  /** For click/dropout: silence length. For stutter/repeat: fragment length. For skip: jump distance. */
  len: number;
  /** For stutter/repeat/skipburst: number of repeats. */
  count: number;
  /** For skipburst: how far to jump ahead (seconds) after stuttering. */
  jump?: number;
}

export interface Settings {
  theme: 'light' | 'dark';
  quality: 'high' | 'low';
  force2D: boolean;
  sounds: boolean;
  volume: number;
}
