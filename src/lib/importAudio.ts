import type { Album, Track } from '../types';
import { store, requestPersistence } from '../db/idb';
import { readTags, type BasicTags } from './id3';
import { generateCover, shrinkImage, tintFor } from './art';

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|weba)$/i;

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);
}

export function probeDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    let finished = false;
    const done = (d: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      a.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    const timer = setTimeout(() => done(0), 8000);
    a.src = url;
  });
}

function canPlay(file: File): boolean {
  if (!file.type) return true; // unknown; let the decoder decide
  return new Audio().canPlayType(file.type) !== '';
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]+/, '').trim();

export interface ImportResult {
  albums: Album[];
  skipped: string[];
  sessionOnly: boolean;
}

/** Group uploaded files into albums (by tag, then folder), persist audio, build records. */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const skipped: string[] = [];
  const audio = files.filter((f) => {
    const ok = isAudioFile(f) && canPlay(f);
    if (!ok) skipped.push(f.name);
    return ok;
  });
  if (!audio.length) return { albums: [], skipped, sessionOnly: false };

  await requestPersistence();

  const groups = new Map<string, { file: File; tags: BasicTags }[]>();
  for (const file of audio) {
    const tags = await readTags(file);
    const folder = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/').slice(-2, -1)[0];
    const key = tags.album || folder || 'Uploaded tracks';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ file, tags });
  }

  const albums: Album[] = [];
  let anySessionOnly = false;
  for (const [title, entries] of groups) {
    entries.sort((a, b) => (a.tags.track ?? 999) - (b.tags.track ?? 999) || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    const id = `local-${crypto.randomUUID()}`;
    const artist = entries.find((e) => e.tags.artist)?.tags.artist ?? 'Unknown artist';
    const tint = tintFor(title + artist);
    let sessionOnly = false;
    const tracks: Track[] = [];
    for (const { file, tags } of entries) {
      const fileKey = `${id}/${crypto.randomUUID()}`;
      const persisted = await store.saveAudio(fileKey, file);
      if (!persisted) sessionOnly = true;
      tracks.push({
        id: fileKey,
        fileKey,
        title: tags.title || stripExt(file.name),
        artist: tags.artist || artist,
        duration: await probeDuration(file),
      });
    }
    const picture = entries.find((e) => e.tags.picture)?.tags.picture;
    const coverUrl = picture ? await shrinkImage(picture) : generateCover(title, artist, tint);
    const album: Album = {
      id,
      source: 'local',
      title,
      artist,
      year: entries.find((e) => e.tags.year)?.tags.year,
      coverUrl,
      tint,
      tracks,
      sessionOnly,
      addedAt: Date.now(),
    };
    if (sessionOnly) anySessionOnly = true;
    await store.saveAlbum(album);
    albums.push(album);
  }
  return { albums, skipped, sessionOnly: anySessionOnly };
}
