import type { Album, PlayerState } from '../types';
import type { LcdContent } from '../three/textures';

const GLITCH_TEXT = { click: 'C1 ERR', dropout: 'NO SIGNAL', stutter: 'TRACKING', repeat: 'SEARCH', skip: 'SKIP' } as const;

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function lcdContent(p: {
  state: PlayerState;
  powered: boolean;
  lidOpen: boolean;
  album?: Album;
  trackIndex: number;
  position: number;
  glitch?: { kind: keyof typeof GLITCH_TEXT; at: number } | null;
  now: number;
}): LcdContent {
  if (!p.powered) return { main: '', sub: '', on: false };
  const tr = String(p.trackIndex + 1).padStart(2, '0');
  const glitching = p.glitch && p.now - p.glitch.at < 450;
  switch (p.state) {
    case 'EMPTY':
      return { main: p.lidOpen ? ' OPEN' : 'NO DISC', sub: p.lidOpen ? 'INSERT A DISC' : 'OPEN LID TO LOAD', on: true };
    case 'LOADING':
      return { main: ' READ', sub: 'READING TOC', on: true, blink: true };
    case 'READY': {
      const total = p.album?.tracks.reduce((s, t) => s + t.duration, 0) ?? 0;
      return { main: `${String(p.album?.tracks.length ?? 0).padStart(2, '0')} ${mmss(total)}`, sub: p.lidOpen ? 'READY · LID OPEN' : 'READY', on: true };
    }
    case 'PLAYING':
      return { main: `${tr} ${mmss(p.position)}`, sub: glitching ? GLITCH_TEXT[p.glitch!.kind] : 'PLAY', on: true };
    case 'PAUSED':
      return { main: `${tr} ${mmss(p.position)}`, sub: p.lidOpen ? 'PAUSE · LID OPEN' : 'PAUSE', on: true, blink: true };
    case 'STOPPED':
      return { main: `${tr} ${mmss(0)}`, sub: 'STOP', on: true };
    case 'EJECTING':
      return { main: ' OPEN', sub: 'EJECT', on: true };
    case 'ERROR':
      return { main: '  Err', sub: 'DISC ERROR', on: true, blink: true };
  }
}

/** Plain-language status for screen readers and the 2D player. */
export function statusText(state: PlayerState, lidOpen: boolean, album?: Album, trackIndex = 0): string {
  const track = album?.tracks[trackIndex];
  switch (state) {
    case 'EMPTY':
      return lidOpen ? 'Lid open. No disc inserted.' : 'No disc inserted.';
    case 'LOADING':
      return `Loading ${album?.title ?? 'disc'}…`;
    case 'READY':
      return `${album?.title ?? 'Disc'} ready to play.`;
    case 'PLAYING':
      return `Playing track ${trackIndex + 1}${track ? `, ${track.title}` : ''}.`;
    case 'PAUSED':
      return `Paused on track ${trackIndex + 1}.`;
    case 'STOPPED':
      return 'Stopped.';
    case 'EJECTING':
      return 'Ejecting disc.';
    case 'ERROR':
      return 'The disc could not be played.';
  }
}
