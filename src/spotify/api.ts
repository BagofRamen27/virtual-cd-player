import type { Album } from '../types';
import { tintFor } from '../lib/art';
import { getAccessToken } from './auth';

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

export async function spotifyFetch<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new SpotifyApiError('Your Spotify session has ended. Please reconnect.', 401);
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 401 && !retried) {
    await getAccessToken(true);
    return spotifyFetch<T>(path, init, true);
  }
  if (res.status === 429 && !retried) {
    const wait = Number(res.headers.get('Retry-After') ?? '1');
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return spotifyFetch<T>(path, init, true);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason: string | undefined = body?.error?.reason;
    const msg: string = body?.error?.message ?? `Spotify request failed (${res.status})`;
    throw new SpotifyApiError(friendly(res.status, reason, msg), res.status, reason);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function friendly(status: number, reason: string | undefined, msg: string): string {
  if (reason === 'PREMIUM_REQUIRED') return 'Spotify playback control requires a Spotify Premium account.';
  if (reason === 'NO_ACTIVE_DEVICE') return 'No active Spotify device. The DiscDeck player may not be ready yet.';
  if (status === 403) return `Spotify refused this request: ${msg}. If your app is in development mode, make sure your account is added under “Users and Access” in the Spotify dashboard.`;
  if (status === 404) return `Spotify could not find that item: ${msg}`;
  return msg;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  product?: string;
  country?: string;
}

export const getMe = () => spotifyFetch<SpotifyUser>('/me');

interface SpImage {
  url: string;
  width: number | null;
}
interface SpAlbum {
  id: string;
  uri: string;
  name: string;
  release_date?: string;
  images: SpImage[];
  artists: { name: string }[];
  external_urls?: { spotify?: string };
  tracks?: { items: SpTrack[]; next: string | null };
}
interface SpTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  is_playable?: boolean;
}

function toAlbum(a: SpAlbum, tracks: SpTrack[]): Album {
  const artist = a.artists.map((x) => x.name).join(', ');
  const img = [...a.images].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0];
  return {
    id: `spotify-${a.id}`,
    source: 'spotify',
    title: a.name,
    artist,
    year: a.release_date?.slice(0, 4),
    coverUrl: img?.url,
    tint: tintFor(a.id),
    spotifyUri: a.uri,
    spotifyUrl: a.external_urls?.spotify,
    tracks: tracks.map((t) => ({
      id: t.id,
      uri: t.uri,
      title: t.name,
      artist: t.artists.map((x) => x.name).join(', '),
      duration: t.duration_ms / 1000,
    })),
    addedAt: Date.now(),
  };
}

export async function getSavedAlbums(limit = 50): Promise<Album[]> {
  const data = await spotifyFetch<{ items: { album: SpAlbum }[] }>(`/me/albums?limit=${limit}`);
  return data.items.map(({ album }) => toAlbum(album, album.tracks?.items ?? []));
}

export async function searchAlbums(query: string): Promise<Album[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const data = await spotifyFetch<{ albums: { items: SpAlbum[] } }>(`/search?type=album&limit=12&q=${q}`);
  // Search results omit tracks; fetch full albums (tracks included) individually.
  const full = await Promise.all(
    data.albums.items.filter(Boolean).map((a) => spotifyFetch<SpAlbum>(`/albums/${a.id}`).catch(() => null)),
  );
  return full.filter((a): a is SpAlbum => a !== null).map((a) => toAlbum(a, a.tracks?.items ?? []));
}
