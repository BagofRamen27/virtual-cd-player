import type { Album, DamageEvent } from '../types';
import { eventsForTrack } from '../audio/damage';
import { spotifyFetch, SpotifyApiError } from '../spotify/api';
import { getAccessToken } from '../spotify/auth';
import { Emitter, type AdapterEvent, type PlaybackAdapter } from './PlaybackAdapter';

/* Minimal typings for the official Spotify Web Playback SDK. */
interface SdkTrack {
  uri: string;
  id: string | null;
  name: string;
  duration_ms: number;
  linked_from?: { uri: string | null; id: string | null };
}
interface SdkState {
  paused: boolean;
  position: number;
  duration: number;
  context: { uri: string | null };
  track_window: { current_track: SdkTrack | null };
}
interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (arg: never) => void): boolean;
  getCurrentState(): Promise<SdkState | null>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  activateElement(): Promise<void>;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number }) => SdkPlayer };
  }
}

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  sdkPromise ??= new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error('The Spotify Web Playback SDK could not be loaded (network or content blocker).'));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/**
 * Controls real Spotify playback through the official Web Playback SDK. All state shown in
 * the UI comes from the SDK's own player_state_changed events. Spotify audio is never
 * captured, processed, or altered. Disc damage is expressed only through the SDK's own
 * seek control — the same thing a listener does when scrubbing — so a scratched Spotify disc
 * skips and repeats, but clicks and dropouts (which would require altering audio) are not used.
 */
export class SpotifyPlaybackAdapter implements PlaybackAdapter {
  readonly kind = 'spotify' as const;
  readonly supportsDamage = true;

  private player: SdkPlayer | null = null;
  private ready: Promise<string> | null = null;
  private album: Album | null = null;
  private index = 0;
  private volume = 0.8;
  private last: { playing: boolean; position: number; duration: number; at: number } = { playing: false, position: 0, duration: 0, at: 0 };
  private poll: number | null = null;
  private damage: DamageEvent[] = [];
  private trackDamage: { index: number; events: DamageEvent[] } | null = null;
  private fired = new Set<string>();
  private checkedPos = 0;
  private checkedTrack = -1;
  private seeking = false;
  private events = new Emitter<AdapterEvent>();
  private startedContext = false;

  subscribe(listener: (e: AdapterEvent) => void) {
    return this.events.on(listener);
  }

  private ensurePlayer(): Promise<string> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      await loadSdk();
      if (!window.Spotify) throw new Error('Spotify SDK unavailable.');
      const player = new window.Spotify.Player({
        name: 'DiscDeck',
        volume: this.volume,
        getOAuthToken: (cb) => void getAccessToken().then((t) => t && cb(t)),
      });
      this.player = player;
      const device = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Spotify player did not become ready. Check your connection and try again.')), 15000);
        player.addListener('ready', (({ device_id }: { device_id: string }) => {
          clearTimeout(timer);
          resolve(device_id);
        }) as (a: never) => void);
        const fail = (prefix: string) =>
          (({ message }: { message: string }) => {
            clearTimeout(timer);
            const err = new Error(`${prefix}${message}`);
            reject(err);
            this.events.emit({ type: 'error', message: err.message });
          }) as (a: never) => void;
        player.addListener('initialization_error', fail('This browser cannot run Spotify playback: '));
        player.addListener('authentication_error', fail('Spotify authentication failed: '));
        player.addListener('account_error', fail('Spotify playback requires a Premium account. '));
        player.addListener('playback_error', (({ message }: { message: string }) =>
          this.events.emit({ type: 'error', message: `Spotify playback error: ${message}` })) as (a: never) => void);
        player.addListener('not_ready', (() => this.events.emit({ type: 'error', message: 'Spotify player went offline.' })) as (a: never) => void);
        player.addListener('player_state_changed', ((s: SdkState | null) => this.onState(s)) as (a: never) => void);
        void player.connect().then((ok) => {
          if (!ok) {
            clearTimeout(timer);
            reject(new Error('Could not connect to Spotify.'));
          }
        });
      });
      return device;
    })();
    this.ready.catch(() => (this.ready = null));
    return this.ready;
  }

  private trackIndexFor(track: SdkTrack | null): number {
    if (!this.album || !track) return this.index;
    const uris = [track.uri, track.linked_from?.uri].filter(Boolean);
    const i = this.album.tracks.findIndex((t) => uris.includes(t.uri ?? ''));
    return i >= 0 ? i : this.index;
  }

  private onState(s: SdkState | null) {
    if (!s || !this.album) return;
    const ours = s.context.uri === this.album.spotifyUri;
    if (!ours && this.startedContext) {
      // Playback moved to something else (e.g. from another Spotify app). Reflect that truthfully.
      this.last = { playing: false, position: 0, duration: 0, at: performance.now() };
      this.emit();
      return;
    }
    if (!ours) return;
    const wasPlaying = this.last.playing;
    this.index = this.trackIndexFor(s.track_window.current_track);
    this.last = { playing: !s.paused, position: s.position / 1000, duration: s.duration / 1000, at: performance.now() };
    this.emit();
    if (this.last.playing) this.startPolling();
    else this.stopPolling();
    // End of album: Spotify pauses at position 0 on the first track after the last one finishes.
    if (wasPlaying && s.paused && s.position === 0 && this.index === this.album.tracks.length - 1) {
      this.events.emit({ type: 'albumEnded' });
    }
  }

  private emit() {
    const elapsed = this.last.playing ? (performance.now() - this.last.at) / 1000 : 0;
    const position = Math.min(this.last.position + elapsed, this.last.duration || Infinity);
    this.events.emit({
      type: 'status',
      status: {
        playing: this.last.playing,
        position,
        duration: this.last.duration || this.album?.tracks[this.index]?.duration || 0,
        trackIndex: this.index,
      },
    });
    if (this.last.playing) this.checkDamage(position);
  }

  private eventsForCurrentTrack(): DamageEvent[] {
    if (!this.album || !this.damage.length) return [];
    if (this.trackDamage?.index !== this.index) {
      const durations = this.album.tracks.map((t) => t.duration || 0);
      this.trackDamage = { index: this.index, events: eventsForTrack(this.damage, durations, this.index) };
    }
    return this.trackDamage.events;
  }

  /** Fire skip-type damage events as playback passes them, using only SDK seeks. */
  private checkDamage(pos: number) {
    if (this.seeking || !this.player) return;
    if (this.checkedTrack !== this.index || pos < this.checkedPos - 2.5) {
      // New track or the listener seeked backwards: let damage happen again from here.
      if (this.checkedTrack !== this.index) this.fired.clear();
      else for (const k of [...this.fired]) if (Number(k.split(':')[1]) > pos) this.fired.delete(k);
      this.checkedTrack = this.index;
      this.checkedPos = pos;
      return;
    }
    const from = this.checkedPos;
    this.checkedPos = pos;
    const ev = this.eventsForCurrentTrack().find(
      (e) => e.t > from && e.t <= pos && e.type !== 'click' && e.type !== 'dropout' && !this.fired.has(`${this.index}:${e.t}`),
    );
    if (!ev) return;
    this.fired.add(`${this.index}:${ev.t}`);
    void this.performGlitch(ev);
  }

  private async performGlitch(ev: DamageEvent) {
    const player = this.player;
    if (!player) return;
    this.seeking = true;
    this.events.emit({ type: 'glitch', kind: ev.type });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const seekTo = async (sec: number) => {
      const s = Math.max(0, Math.min(sec, (this.last.duration || Infinity) - 1));
      await player.seek(Math.round(s * 1000));
      this.last = { ...this.last, position: s, at: performance.now() };
    };
    try {
      switch (ev.type) {
        case 'skip':
          await seekTo(ev.t + ev.len);
          break;
        case 'repeat':
          await seekTo(ev.t);
          break;
        case 'stutter':
          for (let i = 0; i < Math.min(ev.count, 3); i++) {
            await seekTo(ev.t);
            await wait(170);
          }
          break;
        case 'skipburst':
          for (let i = 0; i < Math.min(ev.count, 3); i++) {
            await seekTo(ev.t);
            await wait(160);
          }
          await seekTo(ev.t + (ev.jump ?? 1));
          break;
      }
    } catch {
      /* the next state update reflects whatever Spotify actually did */
    } finally {
      this.checkedPos = this.last.position;
      this.seeking = false;
    }
  }

  setDamage(events: DamageEvent[]) {
    this.damage = events;
    this.trackDamage = null;
  }

  private startPolling() {
    if (this.poll !== null) return;
    this.poll = window.setInterval(() => this.emit(), 150);
  }
  private stopPolling() {
    if (this.poll !== null) window.clearInterval(this.poll);
    this.poll = null;
  }

  async load(album: Album, trackIndex: number) {
    if (!album.spotifyUri || album.tracks.length === 0) throw new Error('This Spotify album has no playable tracks.');
    this.album = album;
    this.index = trackIndex;
    this.startedContext = false;
    this.last = { playing: false, position: 0, duration: album.tracks[trackIndex]?.duration ?? 0, at: performance.now() };
    await this.ensurePlayer();
    this.emit();
  }

  private async startContext(index: number, positionMs = 0) {
    const device = await this.ensurePlayer();
    await this.player?.activateElement().catch(() => undefined);
    try {
      await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(device)}`, {
        method: 'PUT',
        body: JSON.stringify({ context_uri: this.album!.spotifyUri, offset: { position: index }, position_ms: Math.round(positionMs) }),
      });
      this.startedContext = true;
    } catch (err) {
      if (err instanceof SpotifyApiError && err.status === 404) {
        throw new Error('Spotify could not reach the DiscDeck device. Try ejecting and inserting the disc again.');
      }
      throw err;
    }
  }

  async play() {
    if (!this.album) throw new Error('No Spotify album loaded.');
    const state = await this.player?.getCurrentState();
    if (state && state.context.uri === this.album.spotifyUri && this.startedContext) {
      await this.player!.resume();
    } else {
      await this.startContext(this.index, this.last.position * 1000);
    }
  }

  async pause() {
    await this.player?.pause();
  }

  async stop() {
    await this.player?.pause();
    if (this.startedContext) await this.player?.seek(0);
    this.last = { ...this.last, playing: false, position: 0, at: performance.now() };
    this.emit();
  }

  async seek(seconds: number) {
    if (this.startedContext) await this.player?.seek(Math.round(seconds * 1000));
    else {
      this.last = { ...this.last, position: seconds, at: performance.now() };
      this.emit();
    }
  }

  async selectTrack(index: number, autoplay: boolean) {
    this.index = index;
    if (autoplay) {
      await this.startContext(index, 0);
    } else {
      if (this.startedContext) await this.player?.pause();
      this.startedContext = false;
      this.last = { playing: false, position: 0, duration: this.album?.tracks[index]?.duration ?? 0, at: performance.now() };
      this.emit();
    }
  }

  setVolume(v: number) {
    this.volume = v;
    void this.player?.setVolume(v);
  }

  async unload() {
    this.stopPolling();
    if (this.startedContext) await this.player?.pause().catch(() => undefined);
    this.album = null;
    this.startedContext = false;
  }
}
