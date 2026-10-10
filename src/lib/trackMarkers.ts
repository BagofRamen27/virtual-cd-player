export interface TrackMarker { title: string; start: number; duration: number }

/** One timestamp and song title per line, as commonly used in album descriptions. */
export function parseTrackMarkers(text: string, total: number): TrackMarker[] {
  if (!Number.isFinite(total) || total <= 0) throw new Error('The audio duration is unavailable.');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2 || lines.length > 99) throw new Error('Enter between 2 and 99 songs.');
  const markers = lines.map((line, i) => {
    const match = /^(\d+:\d{2}(?::\d{2})?)\s+(.+)$/.exec(line);
    if (!match) throw new Error(`Line ${i + 1}: use a timestamp followed by a song name, for example 0:00 First song.`);
    const parts = match[1].split(':').map(Number);
    if (parts.slice(1).some(value => value >= 60)) throw new Error(`Line ${i + 1}: seconds and minutes must be below 60.`);
    const start = parts.reduce((sum, value) => sum * 60 + value, 0);
    if (start >= total) throw new Error(`Line ${i + 1}: the start time must be before the end of the audio.`);
    return { title: match[2].trim(), start, duration: 0 };
  });
  if (markers[0].start !== 0) throw new Error('Start the first song at 0:00.');
  for (let i = 0; i < markers.length; i++) {
    const end = markers[i + 1]?.start ?? total;
    if (end <= markers[i].start) throw new Error('Song start times must be in increasing order.');
    markers[i].duration = end - markers[i].start;
  }
  return markers;
}

/** Round both boundaries the same way so adjacent songs share exactly one boundary. */
export function segmentFrames(start: number, duration: number, rate: number, length: number) {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0) throw new Error('Invalid song boundaries.');
  const from = Math.round(start * rate), to = Math.min(length, Math.round((start + duration) * rate));
  if (from >= to) throw new Error('This song starts beyond the decoded audio.');
  return { from, to };
}

export function cueTime(seconds: number): string {
  const frames = Math.round(seconds * 75);
  return `${String(Math.floor(frames / 4500)).padStart(2, '0')}:${String(Math.floor(frames / 75) % 60).padStart(2, '0')}:${String(frames % 75).padStart(2, '0')}`;
}

export function markerTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
}

/** Standard CUE cannot express arbitrary reordering within a shared source file. */
export function buildCueSheet(tracks: { file: string; title: string; artist: string; start: number }[]): string | null {
  const seen = new Set<string>();
  const quote = (text: string) => text.replace(/["\r\n]/g, ' ');
  const lines: string[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i], previous = tracks[i - 1];
    if (!/\.(mp3|wav)$/i.test(track.file)) return null;
    if (track.file !== previous?.file) {
      if (seen.has(track.file)) return null;
      seen.add(track.file);
      lines.push(`FILE "${quote(track.file)}" ${/\.mp3$/i.test(track.file) ? 'MP3' : 'WAVE'}`);
    } else if (track.start <= previous.start) return null;
    lines.push(`  TRACK ${String(i + 1).padStart(2, '0')} AUDIO`, `    TITLE "${quote(track.title)}"`, `    PERFORMER "${quote(track.artist)}"`, `    INDEX 01 ${cueTime(track.start)}`);
  }
  return lines.join('\n') + '\n';
}
