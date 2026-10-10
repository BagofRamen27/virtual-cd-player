import { create } from 'zustand';
import type { Album, ConditionLevel, DamageEventType, DamageProfile, PlayerState, ScratchStroke, Settings } from '../types';
import { computeDamageEvents, newDamageProfile } from '../audio/damage';
import { demoAlbum } from '../audio/demoAlbum';
import { sfx } from '../audio/sfx';
import { store as db } from '../db/idb';
import { importFiles } from '../lib/importAudio';
import { LocalAudioPlaybackAdapter } from '../playback/LocalAudioPlaybackAdapter';
import { SpotifyPlaybackAdapter } from '../playback/SpotifyPlaybackAdapter';
import type { AdapterEvent, PlaybackAdapter } from '../playback/PlaybackAdapter';
import * as spotifyAuth from '../spotify/auth';
import { SPOTIFY_ENABLED } from '../spotify/config';
import { getMe, getSavedAlbums, searchAlbums, type SpotifyUser } from '../spotify/api';

export type DiscPhase = 'none' | 'inserting' | 'seated' | 'ejecting';
export type SpotifyStatus = 'unconfigured' | 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

/** Valid player state transitions. Anything else is rejected and logged. */
const TRANSITIONS: Record<PlayerState, PlayerState[]> = {
  EMPTY: ['LOADING'],
  LOADING: ['READY', 'PLAYING', 'ERROR', 'EJECTING'],
  READY: ['PLAYING', 'STOPPED', 'LOADING', 'EJECTING', 'ERROR'],
  PLAYING: ['PAUSED', 'STOPPED', 'LOADING', 'EJECTING', 'ERROR'],
  PAUSED: ['PLAYING', 'STOPPED', 'LOADING', 'EJECTING', 'ERROR'],
  STOPPED: ['PLAYING', 'READY', 'LOADING', 'EJECTING', 'ERROR'],
  EJECTING: ['EMPTY'],
  ERROR: ['LOADING', 'EJECTING', 'EMPTY'],
};

export function canTransition(from: PlayerState, to: PlayerState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

const DEFAULT_SETTINGS: Settings = {
  theme: typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  quality: 'high',
  force2D: false,
  sounds: false,
  volume: 0.8,
};

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, prefersReducedMotion() ? Math.min(ms, 150) : ms));
const LID_MS = 650;
const INSERT_MS = 1150;
const EJECT_MS = 900;

interface PlayerStore {
  ready: boolean;
  settings: Settings;
  albums: Album[];
  spotifyAlbums: Album[];
  spotifyResults: Album[];
  selectedAlbumId: string | null;
  insertedAlbumId: string | null;
  state: PlayerState;
  powered: boolean;
  lidOpen: boolean;
  discPhase: DiscPhase;
  trackIndex: number;
  position: number;
  duration: number;
  errorMessage: string | null;
  notice: Notice | null;
  damage: Record<string, DamageProfile>;
  lastGlitch: { kind: DamageEventType; at: number } | null;
  lastGlitchPosition: number;
  spotify: { status: SpotifyStatus; user?: SpotifyUser; message?: string; searching?: boolean };
  importing: boolean;
  settingsOpen: boolean;
  scratchEditorAlbumId: string | null;
  mobileTab: 'library' | 'playing';
  viewResetToken: number;

  init(): Promise<void>;
  notify(text: string, tone?: Notice['tone']): void;
  clearNotice(): void;
  updateSettings(patch: Partial<Settings>): void;
  setUi(patch: Partial<Pick<PlayerStore, 'settingsOpen' | 'scratchEditorAlbumId' | 'mobileTab'>>): void;
  resetView(): void;

  selectAlbum(id: string): void;
  insertDisc(id?: string): Promise<void>;
  eject(): Promise<void>;
  openLid(): void;
  closeLid(): void;
  toggleLid(): void;
  togglePower(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  togglePlay(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  selectTrack(index: number, autoplay?: boolean): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(v: number): void;

  importLocal(files: File[]): Promise<void>;
  removeAlbum(id: string): Promise<void>;

  damageFor(albumId: string): DamageProfile;
  setCondition(albumId: string, level: ConditionLevel): void;
  setStrokes(albumId: string, strokes: ScratchStroke[]): void;
  cleanDisc(albumId: string): void;

  connectSpotify(): Promise<void>;
  loginSpotify(): Promise<void>;
  logoutSpotify(): Promise<void>;
  searchSpotify(query: string): Promise<void>;

  findAlbum(id: string | null): Album | undefined;
}

const localAdapter = new LocalAudioPlaybackAdapter();
export const spotifyAdapter = new SpotifyPlaybackAdapter();
let active: PlaybackAdapter | null = null;
/** Which kind of adapter is currently playing — the hi-fi bridge needs to know if DSP applies. */
export const activeAdapterKind = () => active?.kind ?? null;
let pendingStop = false;
let noticeId = 0;
let initStarted = false;

export const usePlayer = create<PlayerStore>((set, get) => {
  const go = (to: PlayerState): boolean => {
    const from = get().state;
    if (!canTransition(from, to)) {
      console.warn(`[discdeck] ignored invalid transition ${from} → ${to}`);
      return false;
    }
    if (from !== to) set({ state: to });
    return true;
  };

  const click = () => get().settings.sounds && sfx.button();

  const fail = (message: string) => {
    if (go('ERROR')) set({ errorMessage: message });
    get().notify(message, 'error');
  };

  const applyDamage = (albumId: string) => {
    const album = get().findAlbum(albumId);
    if (!album || !active?.setDamage || get().insertedAlbumId !== albumId) return;
    const total = album.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    active.setDamage(computeDamageEvents(get().damageFor(albumId), total));
  };

  const saveDamage = (profile: DamageProfile) => {
    set((s) => ({ damage: { ...s.damage, [profile.albumId]: profile } }));
    void db.saveDamage(profile);
    applyDamage(profile.albumId);
  };

  const onAdapter = (source: PlaybackAdapter) => (e: AdapterEvent) => {
    if (source !== active) return;
    const st = get().state;
    switch (e.type) {
      case 'status': {
        const { playing, position, duration, trackIndex } = e.status;
        set({ position, duration, trackIndex });
        if (playing && st !== 'PLAYING' && st !== 'EJECTING') go('PLAYING');
        if (!playing && st === 'PLAYING') {
          go(pendingStop ? 'STOPPED' : 'PAUSED');
          pendingStop = false;
        }
        break;
      }
      case 'albumEnded':
        go('STOPPED');
        set({ trackIndex: 0, position: 0 });
        break;
      case 'glitch':
        set({ lastGlitch: { kind: e.kind, at: performance.now() }, lastGlitchPosition: get().position });
        break;
      case 'error':
        if (get().insertedAlbumId && st !== 'EJECTING') fail(e.message);
        break;
    }
  };
  localAdapter.subscribe(onAdapter(localAdapter));
  spotifyAdapter.subscribe(onAdapter(spotifyAdapter));

  return {
    ready: false,
    settings: DEFAULT_SETTINGS,
    albums: [],
    spotifyAlbums: [],
    spotifyResults: [],
    selectedAlbumId: null,
    insertedAlbumId: null,
    state: 'EMPTY',
    powered: true,
    lidOpen: false,
    discPhase: 'none',
    trackIndex: 0,
    position: 0,
    duration: 0,
    errorMessage: null,
    notice: null,
    damage: {},
    lastGlitch: null,
    lastGlitchPosition: 0,
    spotify: { status: spotifyAuth.spotifyConfigured() ? 'disconnected' : 'unconfigured' },
    importing: false,
    settingsOpen: false,
    scratchEditorAlbumId: null,
    mobileTab: 'library',
    viewResetToken: 0,

    async init() {
      if (initStarted) return;
      initStarted = true;
      const [settings, stored, damage] = await Promise.all([db.loadSettings(), db.loadAlbums(), db.loadDamage()]);
      // Albums whose audio could only be held in memory cannot survive a reload.
      const usable = stored.filter((a) => !a.sessionOnly && (a.source !== 'spotify' || SPOTIFY_ENABLED));
      for (const a of stored.filter((a) => a.sessionOnly)) void db.deleteAlbum(a);
      const demo = demoAlbum();
      set({
        settings: { ...DEFAULT_SETTINGS, ...settings },
        albums: [demo, ...usable.sort((a, b) => b.addedAt - a.addedAt)],
        damage: Object.fromEntries(damage.map((d) => [d.albumId, d])),
        selectedAlbumId: demo.id,
        ready: true,
      });

      if (spotifyAuth.spotifyConfigured()) {
        const cb = await spotifyAuth.handleCallback();
        if (cb.kind === 'error') get().notify(cb.message, 'error');
        if (spotifyAuth.hasSession()) await get().connectSpotify();
      }
    },

    notify(text, tone = 'info') {
      set({ notice: { id: ++noticeId, text, tone } });
    },
    clearNotice() {
      set({ notice: null });
    },
    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      void db.saveSettings(settings);
    },
    setUi(patch) {
      set(patch);
    },
    resetView() {
      set((s) => ({ viewResetToken: s.viewResetToken + 1 }));
    },

    selectAlbum(id) {
      set({ selectedAlbumId: id });
    },

    async insertDisc(id) {
      const albumId = id ?? get().selectedAlbumId;
      if (!albumId) return get().notify('Select an album on the shelf first.');
      const album = get().findAlbum(albumId);
      if (!album) return;
      if (get().insertedAlbumId === albumId && get().state !== 'EMPTY') return get().notify('That disc is already in the player.');
      if (get().state === 'LOADING' || get().state === 'EJECTING') return;
      if (album.source === 'spotify' && !SPOTIFY_ENABLED) return get().notify('Streaming is disabled. Choose a local or demo disc.');
      if (album.source === 'spotify' && get().spotify.status !== 'connected') {
        return get().notify('Connect Spotify before playing Spotify discs.');
      }
      if (get().insertedAlbumId) await get().eject();

      set({ powered: true });
      if (!get().lidOpen) {
        get().openLid();
        await wait(LID_MS * 0.6);
      }
      const adapter = album.source === 'spotify' ? spotifyAdapter : localAdapter;
      active = adapter;
      set({
        selectedAlbumId: albumId,
        insertedAlbumId: albumId,
        discPhase: 'inserting',
        trackIndex: 0,
        position: 0,
        duration: album.tracks[0]?.duration ?? 0,
        errorMessage: null,
      });
      go('LOADING');
      applyDamage(albumId);

      const seated = wait(INSERT_MS).then(() => {
        if (get().insertedAlbumId !== albumId) return;
        set({ discPhase: 'seated' });
        if (get().settings.sounds) sfx.seat();
      });
      try {
        await Promise.all([adapter.load(album, 0), seated]);
        if (get().insertedAlbumId === albumId && get().state === 'LOADING') go('READY');
      } catch (err) {
        await seated;
        if (get().insertedAlbumId === albumId) fail(err instanceof Error ? err.message : String(err));
      }
    },

    async eject() {
      click();
      const { insertedAlbumId } = get();
      if (!insertedAlbumId) {
        get().openLid();
        return;
      }
      if (get().state === 'EJECTING') return;
      go('EJECTING');
      pendingStop = false;
      const adapter = active;
      active = null;
      await adapter?.stop().catch(() => undefined);
      await adapter?.unload().catch(() => undefined);
      if (!get().lidOpen) {
        set({ lidOpen: true });
        if (get().settings.sounds) sfx.lidOpen();
        await wait(LID_MS * 0.7);
      }
      set({ discPhase: 'ejecting' });
      await wait(EJECT_MS);
      set({ insertedAlbumId: null, discPhase: 'none', position: 0, duration: 0, trackIndex: 0, errorMessage: null });
      go('EMPTY');
    },

    openLid() {
      if (get().lidOpen) return;
      if (get().state === 'PLAYING') {
        void active?.pause();
        get().notify('Lid opened — playback paused.');
      }
      set({ lidOpen: true });
      if (get().settings.sounds) sfx.lidOpen();
    },
    closeLid() {
      if (!get().lidOpen || get().discPhase === 'inserting' || get().discPhase === 'ejecting') return;
      set({ lidOpen: false });
      if (get().settings.sounds) sfx.lidClose();
    },
    toggleLid() {
      if (get().lidOpen) get().closeLid();
      else get().openLid();
    },

    async togglePower() {
      click();
      const powered = !get().powered;
      if (!powered && get().state === 'PLAYING') await get().pause();
      set({ powered });
    },

    async play() {
      click();
      const { insertedAlbumId, state } = get();
      if (!insertedAlbumId) return get().notify('No disc inserted. Choose a CD from the shelf and insert it — or drag it onto the player.');
      if (state === 'ERROR') return get().notify(get().errorMessage ?? 'This disc cannot be played.', 'error');
      if (state === 'LOADING' || state === 'EJECTING' || state === 'PLAYING') return;
      set({ powered: true });
      if (get().lidOpen) {
        get().closeLid();
        await wait(LID_MS);
      }
      try {
        await active?.play();
      } catch (err) {
        get().notify(err instanceof Error ? err.message : String(err), 'error');
      }
    },
    async pause() {
      click();
      if (get().state === 'PLAYING') await active?.pause();
    },
    async togglePlay() {
      if (get().state === 'PLAYING') await get().pause();
      else await get().play();
    },
    async stop() {
      click();
      const st = get().state;
      if (!['PLAYING', 'PAUSED', 'READY'].includes(st)) return;
      pendingStop = st === 'PLAYING';
      await active?.stop();
      go('STOPPED');
      set({ position: 0 });
    },
    async next() {
      click();
      const album = get().findAlbum(get().insertedAlbumId);
      if (!album) return get().notify('Insert a disc to change tracks.');
      if (get().trackIndex < album.tracks.length - 1) await get().selectTrack(get().trackIndex + 1);
    },
    async prev() {
      click();
      if (!get().insertedAlbumId) return get().notify('Insert a disc to change tracks.');
      if (get().position > 3 || get().trackIndex === 0) await get().seek(0);
      else await get().selectTrack(get().trackIndex - 1);
    },
    async selectTrack(index, autoplay) {
      const album = get().findAlbum(get().insertedAlbumId);
      const st = get().state;
      if (!album || !active || st === 'LOADING' || st === 'EJECTING') return;
      if (index < 0 || index >= album.tracks.length) return;
      const play = autoplay ?? st === 'PLAYING';
      if (play) set({ powered: true });
      if (play && get().lidOpen) {
        get().closeLid();
        await wait(LID_MS);
      }
      go('LOADING');
      set({ trackIndex: index, position: 0, duration: album.tracks[index].duration, errorMessage: null });
      try {
        await active.selectTrack(index, play);
        if (get().state === 'LOADING') go('READY');
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    },
    async seek(seconds) {
      if (!active || !['PLAYING', 'PAUSED', 'READY', 'STOPPED'].includes(get().state)) return;
      set({ position: seconds });
      await active.seek(seconds);
      if (get().state === 'STOPPED') go('READY');
    },
    setVolume(v) {
      // The hi-fi bridge turns this (plus routing and amp state) into actual output levels.
      get().updateSettings({ volume: v });
    },

    async importLocal(files) {
      set({ importing: true });
      try {
        const res = await importFiles(files);
        if (!res.albums.length) {
          get().notify(res.skipped.length ? `None of those files can be played in this browser (${res.skipped.length} skipped).` : 'No audio files found.', 'error');
          return;
        }
        set((s) => ({ albums: [s.albums[0], ...res.albums, ...s.albums.slice(1)], selectedAlbumId: res.albums[0].id }));
        const parts = [`Added ${res.albums.length} album${res.albums.length > 1 ? 's' : ''} to your shelf.`];
        if (res.skipped.length) parts.push(`${res.skipped.length} unsupported file(s) skipped.`);
        if (res.sessionOnly) parts.push('Storage is limited, so the audio is kept for this session only.');
        get().notify(parts.join(' '));
      } catch (err) {
        get().notify(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        set({ importing: false });
      }
    },
    async removeAlbum(id) {
      const album = get().findAlbum(id);
      if (!album || album.source !== 'local') return;
      if (get().insertedAlbumId === id) await get().eject();
      await db.deleteAlbum(album);
      set((s) => {
        const damage = { ...s.damage };
        delete damage[id];
        return { albums: s.albums.filter((a) => a.id !== id), damage, selectedAlbumId: s.selectedAlbumId === id ? null : s.selectedAlbumId };
      });
    },

    damageFor(albumId) {
      return get().damage[albumId] ?? newDamageProfile(albumId);
    },
    setCondition(albumId, level) {
      saveDamage({ ...get().damageFor(albumId), condition: level, updatedAt: Date.now() });
    },
    setStrokes(albumId, strokes) {
      saveDamage({ ...get().damageFor(albumId), strokes, updatedAt: Date.now() });
    },
    cleanDisc(albumId) {
      saveDamage({ ...get().damageFor(albumId), condition: 0, strokes: [], updatedAt: Date.now() });
      get().notify('Disc cleaned — it plays like new.');
    },

    async connectSpotify() {
      if (!SPOTIFY_ENABLED) return;
      set({ spotify: { status: 'connecting' } });
      try {
        const user = await getMe();
        const message =
          user.product && user.product !== 'premium'
            ? 'Browsing only: in-browser Spotify playback requires Spotify Premium.'
            : undefined;
        set({ spotify: { status: 'connected', user, message } });
        try {
          set({ spotifyAlbums: await getSavedAlbums() });
        } catch (err) {
          set((s) => ({ spotify: { ...s.spotify, message: `Could not load saved albums: ${err instanceof Error ? err.message : err}` } }));
        }
      } catch (err) {
        set({ spotify: { status: 'error', message: err instanceof Error ? err.message : String(err) } });
      }
    },
    async loginSpotify() {
      if (!SPOTIFY_ENABLED) return;
      try {
        await spotifyAuth.beginLogin();
      } catch (err) {
        get().notify(err instanceof Error ? err.message : String(err), 'error');
      }
    },
    async logoutSpotify() {
      const inserted = get().findAlbum(get().insertedAlbumId);
      if (inserted?.source === 'spotify') await get().eject();
      spotifyAuth.logout();
      set({ spotify: { status: 'disconnected' }, spotifyAlbums: [], spotifyResults: [] });
    },
    async searchSpotify(query) {
      if (get().spotify.status !== 'connected') return;
      set((s) => ({ spotify: { ...s.spotify, searching: true } }));
      try {
        set({ spotifyResults: await searchAlbums(query) });
      } catch (err) {
        get().notify(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        set((s) => ({ spotify: { ...s.spotify, searching: false } }));
      }
    },

    findAlbum(id) {
      if (!id) return undefined;
      const s = get();
      return s.albums.find((a) => a.id === id) ?? s.spotifyAlbums.find((a) => a.id === id) ?? s.spotifyResults.find((a) => a.id === id);
    },
  };
});

export const useInsertedAlbum = () => usePlayer((s) => s.findAlbum(s.insertedAlbumId));
export const useSelectedAlbum = () => usePlayer((s) => s.findAlbum(s.selectedAlbumId));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Handy for debugging and automated checks in development builds only.
  (window as unknown as { __discdeck: typeof usePlayer }).__discdeck = usePlayer;
}
