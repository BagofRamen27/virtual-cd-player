/**
 * Spotify Authorization Code flow with PKCE. Runs entirely in the browser with a public
 * client ID — no client secret is ever needed or shipped.
 */
import { SPOTIFY_ENABLED } from './config';
const CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim() ?? '';
const REDIRECT_URI =
  (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined)?.trim() ||
  (typeof window !== 'undefined' ? `${window.location.origin}/callback` : '');

export const SCOPES = [
  'streaming', // Web Playback SDK
  'user-read-email',
  'user-read-private', // account product (Premium check)
  'user-library-read', // saved albums
  'user-read-playback-state',
  'user-modify-playback-state',
];

const TOKEN_KEY = 'discdeck.spotify.token';
const VERIFIER_KEY = 'discdeck.spotify.verifier';
const STATE_KEY = 'discdeck.spotify.state';

interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
}

export function spotifyConfigured(): boolean {
  return SPOTIFY_ENABLED && CLIENT_ID.length > 0;
}

export function redirectUri(): string {
  return REDIRECT_URI;
}

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function beginLogin(): Promise<void> {
  if (!spotifyConfigured()) throw new Error('Spotify is not configured.');
  if (!crypto.subtle) throw new Error('Spotify login needs a secure context (HTTPS or 127.0.0.1).');
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

function saveToken(json: { access_token: string; refresh_token?: string; expires_in: number; scope: string }, previous?: StoredToken) {
  const token: StoredToken = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? previous?.refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
    scope: json.scope,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

export type CallbackResult = { kind: 'none' } | { kind: 'ok' } | { kind: 'error'; message: string };

/** Completes the redirect back from Spotify, if this page load is one. */
export async function handleCallback(): Promise<CallbackResult> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');
  if (!code && !error) return { kind: 'none' };
  window.history.replaceState({}, '', '/');

  if (error) {
    return { kind: 'error', message: error === 'access_denied' ? 'Spotify access was declined.' : `Spotify returned an error: ${error}` };
  }
  if (!state || state !== sessionStorage.getItem(STATE_KEY)) {
    return { kind: 'error', message: 'Spotify login could not be verified (state mismatch). Please try again.' };
  }
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier) return { kind: 'error', message: 'Spotify login expired. Please try again.' };

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { kind: 'error', message: `Spotify token exchange failed: ${body.error_description ?? res.status}` };
  }
  saveToken(await res.json());
  return { kind: 'ok' };
}

let refreshing: Promise<string | null> | null = null;

async function refresh(token: StoredToken): Promise<string | null> {
  if (!token.refresh_token) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: CLIENT_ID }),
  });
  if (!res.ok) {
    logout();
    return null;
  }
  return saveToken(await res.json(), token).access_token;
}

/** A valid access token, refreshing if needed. Null when the user is not signed in. */
export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  const token = readToken();
  if (!token) return null;
  if (!forceRefresh && Date.now() < token.expires_at) return token.access_token;
  refreshing ??= refresh(token).finally(() => (refreshing = null));
  return refreshing;
}

export function hasSession(): boolean {
  return readToken() !== null;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}
