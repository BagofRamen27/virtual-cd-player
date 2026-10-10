import { useState } from 'react';
import { parseTrackMarkers, type TrackMarker } from '../lib/trackMarkers';
import { Button } from './ui';

export function TrackMarkers({ duration, disabled, initialValue = '', onApply }: { duration: number; disabled?: boolean; initialValue?: string; onApply: (markers: TrackMarker[]) => void | Promise<void> }) {
  const [text, setText] = useState(initialValue), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  return <div className="my-3 rounded-xl border border-line p-3">
    <p className="text-sm">Give each song its start time and name. Paste timestamps from the album description or enter your own. The last song ends at the end of the file.</p>
    <label className="mt-2 block text-sm">Song start times
      <textarea className="mt-1 w-full rounded-xl border border-line bg-surface-2 p-2 font-mono text-sm" rows={5} value={text} disabled={disabled || busy} placeholder={'0:00 First song\n3:42 Second song\n7:15 Third song'} onChange={event => { setText(event.target.value); setError(''); }} />
    </label>
    {error && <p role="alert" className="my-2 text-sm text-ink-soft">{error}</p>}
    <Button size="sm" disabled={disabled || busy} onClick={async () => {
      setError(''); setBusy(true); setSaved(false);
      try { await onApply(parseTrackMarkers(text, duration)); setSaved(true); }
      catch (err) { setError(err instanceof Error ? err.message : 'Could not save the tracks.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Saving tracks…' : 'Apply song tracks'}</Button>
    {saved && <p role="status" className="mt-2 text-xs text-ink-soft">Song tracks saved. Insert the disc to play them.</p>}
  </div>;
}
