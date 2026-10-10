import { useShallow } from 'zustand/react/shallow';
import { useInsertedAlbum, usePlayer } from '../state/store';
import { Icon } from './ui';

/** Accessible DOM twin of the player's physical buttons. */
export function TransportControls({ compact = false }: { compact?: boolean }) {
  const { state, powered, lidOpen, hasDisc, selected } = usePlayer(
    useShallow((s) => ({ state: s.state, powered: s.powered, lidOpen: s.lidOpen, hasDisc: !!s.insertedAlbumId, selected: s.selectedAlbumId })),
  );
  const a = usePlayer.getState();
  const album = useInsertedAlbum();
  const trackIndex = usePlayer(s => s.trackIndex);
  const playing = state === 'PLAYING';
  const busy = state === 'LOADING' || state === 'EJECTING';
  const btn =
    'inline-flex items-center justify-center rounded-full border border-line bg-surface text-ink-soft shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_2px_6px_-3px_rgba(37,31,27,0.3)] transition-all duration-150 hover:text-ink active:translate-y-px active:shadow-none disabled:opacity-40';
  const size = compact ? 'h-10 w-10' : 'h-11 w-11';

  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Player controls">
      <button type="button" className={`${btn} ${size} ${powered ? 'text-accent-ink' : ''}`} aria-pressed={powered} aria-label="Power" onClick={() => void a.togglePower()}>
        <Icon name="power" />
      </button>
      <button type="button" className={`${btn} ${size}`} aria-label="Previous track" onClick={() => void a.prev()} disabled={!hasDisc || busy}>
        <Icon name="prev" />
      </button>
      <button
        type="button"
        className={`${btn} ${compact ? 'h-12 w-12' : 'h-14 w-14'} border-transparent !bg-accent !text-ivory dark:!text-espresso ${playing ? 'ring-4 ring-amber/30' : ''}`}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => void a.togglePlay()}
        disabled={state === 'EJECTING'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <button type="button" className={`${btn} ${size}`} aria-label="Stop" onClick={() => void a.stop()} disabled={!hasDisc || busy}>
        <Icon name="stop" />
      </button>
      <button type="button" className={`${btn} ${size}`} aria-label="Next track" onClick={() => void a.next()} disabled={!hasDisc || busy}>
        <Icon name="next" />
      </button>
      <button type="button" className={`${btn} ${size}`} aria-label={hasDisc ? 'Eject disc' : 'Open lid'} onClick={() => void a.eject()} disabled={busy}>
        <Icon name="eject" />
      </button>
      {album && <label className="flex min-w-0 items-center gap-2 text-xs text-ink-soft">
        <span>Track</span>
        <select aria-label="Play a track" value={trackIndex} disabled={busy} onChange={event => void a.selectTrack(Number(event.target.value), true)} className="h-10 max-w-[220px] rounded-xl border border-line bg-surface px-2 text-sm text-ink">
          {album.tracks.map((track, index) => <option key={track.id} value={index}>{index + 1}. {track.title}</option>)}
        </select>
      </label>}
      {!compact && (
        <>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <button
            type="button"
            className={`${btn} h-11 px-4 text-sm font-medium`}
            aria-pressed={lidOpen}
            onClick={() => a.toggleLid()}
            disabled={busy}
          >
            <Icon name="lid" /> {lidOpen ? 'Close lid' : 'Open lid'}
          </button>
          {!hasDisc && (
            <button type="button" className={`${btn} h-11 px-4 text-sm font-medium`} onClick={() => void a.insertDisc()} disabled={!selected || busy}>
              <Icon name="disc" /> Insert selected
            </button>
          )}
        </>
      )}
    </div>
  );
}
