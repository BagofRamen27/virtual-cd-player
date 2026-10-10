import { useRef, useState } from 'react';
import { Button, Dialog, Icon } from './ui';
import { isAudioFile, probeDuration } from '../lib/importAudio';
import { readTags } from '../lib/id3';
import { generateCover, tintFor } from '../lib/art';
import { discSeconds, safeName, validateDisc } from '../lib/burnPlan';
import { discZip } from '../lib/discZip';
import { requestPersistence, store } from '../db/idb';
import { usePlayer } from '../state/store';
import type { Album } from '../types';

interface BurnTrack { id: string; file: File; title: string; artist: string; duration: number }
const time = (seconds: number) => `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;

export function BurnCD() {
  const [open, setOpen] = useState(false), [title, setTitle] = useState('My mixtape');
  const [artist, setArtist] = useState('Various artists'), [minutes, setMinutes] = useState(80);
  const [tracks, setTracks] = useState<BurnTrack[]>([]), [busy, setBusy] = useState('');
  const [message, setMessage] = useState(''), [burned, setBurned] = useState<Album | null>(null);
  const input = useRef<HTMLInputElement>(null), folder = useRef<HTMLInputElement>(null);
  const duration = discSeconds(tracks.map(t => t.duration));
  const issue = validateDisc(title, tracks.map(t => t.duration), minutes);
  async function addFiles(files: File[]) {
    if (!files.length || busy) return;
    setBusy('Reading tracks…'); setMessage('');
    try {
      const added: BurnTrack[] = [], skipped: string[] = [];
      for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
        if (!isAudioFile(file)) { skipped.push(file.name); continue; }
        const duration = await probeDuration(file);
        if (!duration) { skipped.push(file.name); continue; }
        const tags = await readTags(file);
        added.push({ id: crypto.randomUUID(), file, title: tags.title || file.name.replace(/\.[^.]+$/, ''), artist: tags.artist || artist, duration });
      }
      setTracks(previous => [...previous, ...added]);
      if (skipped.length) setMessage(`Skipped ${skipped.length} unsupported or unreadable file(s): ${skipped.join(', ')}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read those files.'); }
    finally { setBusy(''); }
  }
  function move(index: number, delta: number) {
    setTracks(previous => { const next = [...previous]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  async function burn() {
    if (issue || busy) return;
    setBusy('Burning virtual disc…'); setMessage('');
    const id = `local-${crypto.randomUUID()}`, tint = tintFor(title + artist);
    const album: Album = { id, source: 'local', title: title.trim(), artist: artist.trim() || 'Various artists', tint,
      coverUrl: generateCover(title.trim(), artist.trim(), tint), tracks: [], addedAt: Date.now() };
    try {
      await requestPersistence();
      for (const track of tracks) {
        const key = `${id}/${track.id}`;
        album.tracks.push({ id: key, fileKey: key, title: track.title, artist: track.artist, duration: track.duration });
        if (!await store.saveAudio(key, track.file)) album.sessionOnly = true;
      }
      await store.saveAlbum(album);
      usePlayer.setState(state => ({ albums: [...state.albums, album], selectedAlbumId: id }));
      setBurned(album);
      setMessage(album.sessionOnly ? 'Disc created. Storage is limited; audio is available for this session. Download a backup below.' : 'Disc burned and added to your shelf. Download a backup or insert it when you’re ready.');
    } catch (error) {
      await store.deleteAlbum(album);
      setMessage(error instanceof Error ? error.message : 'Burn failed. Your original files are unchanged.');
    } finally { setBusy(''); }
  }
  async function download() {
    if (!burned || busy) return;
    setBusy('Preparing album ZIP…');
    try {
      const root = safeName(burned.title);
      const names = tracks.map((t, i) => `${String(i + 1).padStart(2, '0')} - ${safeName(t.file.name)}`);
      const playlist = '#EXTM3U\n' + tracks.map((t, i) => `#EXTINF:${Math.round(t.duration)},${t.artist.replace(/[\r\n]/g, ' ')} - ${t.title.replace(/[\r\n]/g, ' ')}\n${names[i]}`).join('\n') + '\n';
      const zip = await discZip([
        ...tracks.map((t, i) => ({ name: `${root}/${names[i]}`, data: t.file })),
        { name: `${root}/playlist.m3u8`, data: new Blob([playlist]) },
        { name: `${root}/disc.json`, data: new Blob([JSON.stringify({ title: burned.title, artist: burned.artist, tracks: tracks.map((t, i) => ({ file: names[i], title: t.title, artist: t.artist, duration: t.duration })) }, null, 2)]) },
      ]);
      const url = URL.createObjectURL(zip), link = document.createElement('a');
      link.href = url; link.download = `${root}.zip`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not export the album.'); }
    finally { setBusy(''); }
  }
  return <>
    <Button size="sm" onClick={() => setOpen(true)}><Icon name="disc" size={15} />Burn CD</Button>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} title="Burn a CD" wide dismissible={!busy}>
      <p className="mb-4 text-sm text-ink-soft">Make a virtual disc from your audio files. Mix albums, arrange tracks, then burn it to your shelf. Local audio supports hi-fi effects and live meters.</p>
      <p className="mb-5 text-xs text-muted">Spotify and YouTube links cannot supply audio here. This creates a virtual disc and optional ZIP of your original files; it does not write a physical CD.</p>
      {!burned && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Disc name<input className="mt-1 w-full rounded-xl border border-line bg-surface-2 p-2" value={title} disabled={!!busy} onChange={e => setTitle(e.target.value)} maxLength={100} /></label>
          <label className="text-sm">Artist / mix label<input className="mt-1 w-full rounded-xl border border-line bg-surface-2 p-2" value={artist} disabled={!!busy} onChange={e => setArtist(e.target.value)} maxLength={100} /></label>
        </div>
        <div className="my-4 flex flex-wrap items-center gap-2">
          <Button disabled={!!busy} onClick={() => input.current?.click()}>Add audio files</Button>
          <Button disabled={!!busy} onClick={() => folder.current?.click()}>Add folder</Button>
          <label className="text-sm">Disc size <select value={minutes} disabled={!!busy} onChange={e => setMinutes(Number(e.target.value))} className="rounded-lg border border-line bg-surface p-2"><option value={74}>74 minutes</option><option value={80}>80 minutes</option></select></label>
        </div>
        <input ref={input} type="file" multiple accept="audio/*,.flac,.mp3,.wav,.m4a,.ogg,.opus" hidden onChange={e => { void addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <input ref={folder} type="file" multiple hidden {...({ webkitdirectory: '' } as Record<string, string>)} onChange={e => { void addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <ol className="space-y-2" aria-label="CD track order">{tracks.map((t, i) => <li key={t.id} className="flex items-center gap-2 rounded-xl border border-line p-2">
          <span className="w-6 text-xs text-muted">{i + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm">{t.title}</p><p className="truncate text-xs text-muted">{t.artist} · {time(t.duration)}</p></div>
          <Button size="sm" disabled={!!busy || i === 0} aria-label={`Move ${t.title} up`} onClick={() => move(i, -1)}>↑</Button>
          <Button size="sm" disabled={!!busy || i === tracks.length - 1} aria-label={`Move ${t.title} down`} onClick={() => move(i, 1)}>↓</Button>
          <Button size="sm" disabled={!!busy} aria-label={`Remove ${t.title}`} onClick={() => setTracks(previous => previous.filter(x => x.id !== t.id))}>×</Button>
        </li>)}</ol>
        <p className="my-3 text-sm">{tracks.length} tracks · {time(duration)} / {minutes}:00</p>
        <progress className="w-full accent-accent" max={minutes * 60} value={duration} aria-label="Disc capacity used" />
        <p className="mb-4 text-xs text-muted">Capacity reserves two seconds between tracks. Playback uses the player’s normal track transitions.</p>
        {issue && <p className="mb-3 text-sm text-ink-soft">{issue}</p>}
        <Button variant="solid" disabled={!!busy || !!issue} onClick={() => void burn()}>Burn to shelf</Button>
      </>}
      <p role="status" className="my-4 text-sm text-ink-soft">{busy || message}</p>
      {burned && <div className="flex flex-wrap gap-2">
        <Button variant="solid" disabled={!!busy} onClick={() => void download()}>Download album ZIP</Button>
        <Button disabled={!!busy} onClick={() => { setOpen(false); void usePlayer.getState().insertDisc(burned.id); }}>Insert disc</Button>
        <Button disabled={!!busy} onClick={() => { setBurned(null); setTracks([]); setMessage(''); }}>Make another CD</Button>
      </div>}
    </Dialog>
  </>;
}
