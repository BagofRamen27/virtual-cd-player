import type { Album, DamageEvent } from '../types';

export interface AdapterStatus {
  /** True only when audio is actually advancing according to the underlying engine. */
  playing: boolean;
  position: number;
  duration: number;
  trackIndex: number;
}

export type AdapterEvent =
  | { type: 'status'; status: AdapterStatus }
  /** Reached the end of the last track. */
  | { type: 'albumEnded' }
  | { type: 'glitch'; kind: DamageEvent['type'] }
  | { type: 'error'; message: string };

/** Shared interface so the player UI never needs to know where audio comes from. */
export interface PlaybackAdapter {
  readonly kind: 'local' | 'spotify';
  /** Whether audible damage simulation is allowed for this source. */
  readonly supportsDamage: boolean;
  /** Prepare an album without starting playback. */
  load(album: Album, trackIndex: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(seconds: number): Promise<void>;
  selectTrack(index: number, autoplay: boolean): Promise<void>;
  setVolume(volume: number): void;
  /** Album-timeline damage events (local only). */
  setDamage?(events: DamageEvent[]): void;
  unload(): Promise<void>;
  subscribe(listener: (e: AdapterEvent) => void): () => void;
}

export class Emitter<T> {
  private listeners = new Set<(e: T) => void>();
  on(l: (e: T) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(e: T) {
    for (const l of this.listeners) l(e);
  }
}
