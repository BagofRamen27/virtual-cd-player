import { AudioEngine, audioEngine } from '../audio/AudioEngine';
import { eventsForTrack } from '../audio/damage';
import { renderDemoTrack } from '../audio/demoAlbum';
import { store } from '../db/idb';
import { segmentFrames } from '../lib/trackMarkers';
import type { Album, DamageEvent } from '../types';
import { Emitter, type AdapterEvent, type PlaybackAdapter } from './PlaybackAdapter';

/** Plays user-uploaded files (and the synthesized demo album) through the scratch-capable engine. */
export class LocalAudioPlaybackAdapter implements PlaybackAdapter {
  readonly kind = 'local' as const;
  readonly supportsDamage = true;

  private album: Album | null = null;
  private index = 0;
  private duration = 0;
  private position = 0;
  private playing = false;
  private loaded = false;
  private damage: DamageEvent[] = [];
  private token = 0;
  private decodedFile: { key: string; buffer: AudioBuffer } | null = null;
  private events = new Emitter<AdapterEvent>();

  constructor() {
    audioEngine.subscribe((m) => {
      if (!this.album || !this.loaded) return;
      if (m.type === 'pos') {
        this.position = Math.min(m.seconds, this.duration);
        this.emitStatus();
      } else if (m.type === 'ended') {
        void this.onTrackEnded().catch((err: unknown) => {
          this.playing = false;
          this.emitStatus();
          this.events.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        });
      } else if (m.type === 'glitch') {
        this.events.emit({ type: 'glitch', kind: m.kind });
      }
    });
  }

  subscribe(listener: (e: AdapterEvent) => void) {
    return this.events.on(listener);
  }

  private emitStatus() {
    this.events.emit({
      type: 'status',
      status: { playing: this.playing, position: this.position, duration: this.duration, trackIndex: this.index },
    });
  }

  private durations(): number[] {
    return this.album?.tracks.map((t) => t.duration || 0) ?? [];
  }

  private async onTrackEnded() {
    if (!this.album) return;
    if (this.index < this.album.tracks.length - 1) {
      await this.selectTrack(this.index + 1, true);
    } else {
      this.playing = false;
      await this.loadTrack(0);
      this.events.emit({ type: 'albumEnded' });
    }
  }

  private async decodeTrack(album: Album, i: number): Promise<AudioBuffer> {
    await audioEngine.ensure();
    if (album.source === 'demo') return renderDemoTrack(i, audioEngine.sampleRate);
    const key = album.tracks[i]?.fileKey;
    const blob = key ? await store.loadAudio(key) : undefined;
    if (!blob) {
      throw new Error(
        album.sessionOnly
          ? 'This album’s audio was only kept for the previous session (storage was unavailable). Please import the files again.'
          : 'The audio file for this track could not be found in local storage.',
      );
    }
    try {
      const track = album.tracks[i];
      const cached = this.decodedFile;
      const buffer = cached && cached.key === key ? cached.buffer : await audioEngine.decode(await blob.arrayBuffer());
      // Keep only one whole-album decode so skipping songs doesn't decode it repeatedly.
      if (this.album === album) this.decodedFile = track.startOffset === undefined ? null : { key: key!, buffer };
      if (track.startOffset === undefined) return buffer;
      const { from, to } = segmentFrames(track.startOffset, track.duration, buffer.sampleRate, buffer.length);
      const context = await audioEngine.ensure();
      const song = context.createBuffer(buffer.numberOfChannels, to - from, buffer.sampleRate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) song.copyToChannel(buffer.getChannelData(channel).subarray(from, to), channel);
      return song;
    } catch {
      throw new Error(`“${album.tracks[i].title}” could not be decoded by this browser.`);
    }
  }

  private async loadTrack(i: number) {
    if (!this.album) return;
    const token = ++this.token;
    this.loaded = false;
    const buffer = await this.decodeTrack(this.album, i);
    if (token !== this.token || !this.album) return;
    await audioEngine.loadBuffer(buffer);
    this.index = i;
    this.duration = buffer.duration;
    this.position = 0;
    this.loaded = true;
    audioEngine.setEvents(eventsForTrack(this.damage, this.durations(), i));
    this.emitStatus();
  }

  async load(album: Album, trackIndex: number) {
    if (!AudioEngine.isSupported()) throw new Error('This browser does not support the Web Audio features DiscDeck needs.');
    this.decodedFile = null;
    this.album = album;
    this.playing = false;
    await this.loadTrack(trackIndex);
  }

  async play() {
    if (!this.album || !this.loaded) throw new Error('No track is loaded yet.');
    await audioEngine.play();
    this.playing = true;
    this.emitStatus();
  }

  async pause() {
    audioEngine.pause();
    this.playing = false;
    this.emitStatus();
  }

  async stop() {
    audioEngine.pause();
    this.playing = false;
    audioEngine.seek(0);
    this.position = 0;
    this.emitStatus();
  }

  async seek(seconds: number) {
    const s = Math.max(0, Math.min(seconds, Math.max(0, this.duration - 0.05)));
    audioEngine.seek(s);
    this.position = s;
    this.emitStatus();
  }

  async selectTrack(index: number, autoplay: boolean) {
    if (!this.album) return;
    audioEngine.pause();
    this.playing = false;
    await this.loadTrack(index);
    if (autoplay) await this.play();
  }

  setVolume() {
    // Output level is owned by the hi-fi DSP chain (see hifi/bridge.ts).
  }

  setDamage(events: DamageEvent[]) {
    this.damage = events;
    if (this.loaded) audioEngine.setEvents(eventsForTrack(events, this.durations(), this.index));
  }

  async unload() {
    this.token++;
    this.decodedFile = null;
    audioEngine.unload();
    this.album = null;
    this.loaded = false;
    this.playing = false;
    this.position = 0;
    this.duration = 0;
  }
}

