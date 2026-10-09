import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Album, DamageProfile, Settings } from '../types';

interface DiscDeckDB extends DBSchema {
  albums: { key: string; value: Album };
  audio: { key: string; value: Blob };
  damage: { key: string; value: DamageProfile };
  settings: { key: string; value: Settings };
}

let dbPromise: Promise<IDBPDatabase<DiscDeckDB>> | null = null;
/** Audio that could not be persisted (quota, private browsing) lives here for the session. */
const sessionAudio = new Map<string, Blob>();

function db(): Promise<IDBPDatabase<DiscDeckDB>> {
  dbPromise ??= openDB<DiscDeckDB>('discdeck', 1, {
    upgrade(d) {
      d.createObjectStore('albums', { keyPath: 'id' });
      d.createObjectStore('audio');
      d.createObjectStore('damage', { keyPath: 'albumId' });
      d.createObjectStore('settings');
    },
  });
  return dbPromise;
}

export function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!idbAvailable()) return fallback;
  try {
    return await fn();
  } catch (err) {
    console.warn('[discdeck] IndexedDB operation failed', err);
    return fallback;
  }
}

export const store = {
  loadAlbums: () => safe(async () => (await db()).getAll('albums'), [] as Album[]),
  saveAlbum: (album: Album) => safe(async () => void (await db()).put('albums', album), undefined),
  deleteAlbum: (album: Album) =>
    safe(async () => {
      const d = await db();
      await d.delete('albums', album.id);
      await d.delete('damage', album.id);
      for (const t of album.tracks) if (t.fileKey) await d.delete('audio', t.fileKey);
    }, undefined),

  /** Returns true when the blob was persisted, false when it is only kept for this session. */
  async saveAudio(key: string, blob: Blob): Promise<boolean> {
    sessionAudio.set(key, blob);
    if (!idbAvailable()) return false;
    try {
      await (await db()).put('audio', blob, key);
      return true;
    } catch (err) {
      console.warn('[discdeck] Could not persist audio (quota or permissions); keeping it for this session only', err);
      return false;
    }
  },
  async loadAudio(key: string): Promise<Blob | undefined> {
    const mem = sessionAudio.get(key);
    if (mem) return mem;
    return safe(async () => (await db()).get('audio', key), undefined);
  },

  loadDamage: () => safe(async () => (await db()).getAll('damage'), [] as DamageProfile[]),
  saveDamage: (p: DamageProfile) => safe(async () => void (await db()).put('damage', p), undefined),

  loadSettings: () => safe(async () => (await db()).get('settings', 'settings'), undefined),
  saveSettings: (s: Settings) => safe(async () => void (await db()).put('settings', s, 'settings'), undefined),

  async clearAll(): Promise<void> {
    sessionAudio.clear();
    await safe(async () => {
      const d = await db();
      await Promise.all([d.clear('albums'), d.clear('audio'), d.clear('damage'), d.clear('settings')]);
    }, undefined);
  },
};

/** Ask the browser to keep our storage from being evicted. Best effort. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
