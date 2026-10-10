import { useEffect, useState } from 'react';

const GLITCH_LABEL = { click: 'Click', dropout: 'Dropout', stutter: 'Stuttered', repeat: 'Repeated', skip: 'Skipped', skipburst: 'Skipped' } as const;
import { usePlayer, useInsertedAlbum, useSelectedAlbum } from '../state/store';
import { CONDITION_LABELS, type ConditionLevel } from '../types';
import { formatTime } from '../lib/art';
import { Button, Icon, Pill } from './ui';

function Progress() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const state = usePlayer((s) => s.state);
  const seek = usePlayer((s) => s.seek);
  const [scrub, setScrub] = useState<number | null>(null);
  const glitch = usePlayer((s) => s.lastGlitch);
  const glitchPos = usePlayer((s) => s.lastGlitchPosition);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!glitch) return;
    const id = setTimeout(() => tick((n) => n + 1), 1800);
    return () => clearTimeout(id);
  }, [glitch]);
  const showGlitch = glitch && performance.now() - glitch.at < 1800;
  const value = scrub ?? position;
  const disabled = !['PLAYING', 'PAUSED', 'READY', 'STOPPED'].includes(state) || duration <= 0;
  const commit = () => {
    if (scrub !== null) void seek(scrub);
    setScrub(null);
  };
  const fill = duration > 0 ? `${(value / duration) * 100}%` : '0%';
  return (
    <div>
      <input
        type="range"
        className="dd-range"
        style={{ ['--fill' as string]: fill }}
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.1}
        value={Math.min(value, duration)}
        disabled={disabled}
        aria-label="Seek"
        aria-valuetext={`${formatTime(value)} of ${formatTime(duration)}`}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
        <span>{formatTime(value)}</span>
        <span>-{formatTime(Math.max(0, duration - value))}</span>
      </div>
      <p className="mt-1 h-4 text-[11px] font-medium text-accent-ink" aria-live="polite">
        {showGlitch ? `${GLITCH_LABEL[glitch.kind]} at ${formatTime(glitchPos)}` : ''}
      </p>
    </div>
  );
}

function Volume() {
  const volume = usePlayer((s) => s.settings.volume);
  const setVolume = usePlayer((s) => s.setVolume);
  return (
    <label className="flex items-center gap-3">
      <Icon name="volume" className="shrink-0 text-muted" />
      <span className="sr-only">Volume</span>
      <input
        type="range"
        className="dd-range"
        style={{ ['--fill' as string]: `${volume * 100}%` }}
        min={0}
        max={1}
        step={0.01}
        value={volume}
        aria-valuetext={`${Math.round(volume * 100)}%`}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </label>
  );
}

function DiscCondition({ albumId }: { albumId: string }) {
  const profile = usePlayer((s) => s.damage[albumId]);
  const { setCondition, cleanDisc, setUi } = usePlayer.getState();
  const condition = profile?.condition ?? 0;
  const strokes = profile?.strokes.length ?? 0;

  return (
    <section aria-labelledby="condition-h" className="rounded-2xl border border-line p-4">
      <div className="flex items-baseline justify-between">
        <h3 id="condition-h" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Disc condition
        </h3>
        {condition > 0 || strokes > 0 ? <Pill tone="accent">Visible · audible</Pill> : <Pill>Clean</Pill>}
      </div>
      <div role="radiogroup" aria-labelledby="condition-h" className="mt-3 grid grid-cols-3 gap-1.5">
        {([0, 1, 2, 3, 4, 5] as ConditionLevel[]).map((lvl) => (
          <button
            key={lvl}
            type="button"
            role="radio"
            aria-checked={condition === lvl}
            onClick={() => setCondition(albumId, lvl)}
            className={`h-8 rounded-lg text-xs font-medium transition-colors ${condition === lvl ? 'bg-ink text-bg' : 'bg-surface-2/60 text-ink-soft hover:bg-surface-2'}`}
          >
            {CONDITION_LABELS[lvl]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Scratched discs stutter, skip and drop out at the same places every time you play them.
        {strokes > 0 && ` ${strokes} hand-made scratch${strokes > 1 ? 'es' : ''}.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setUi({ scratchEditorAlbumId: albumId })}>
          <Icon name="brush" size={14} /> Scratch editor
        </Button>
        <Button size="sm" variant="ghost" onClick={() => cleanDisc(albumId)} disabled={condition === 0 && strokes === 0}>
          <Icon name="sparkle" size={14} /> Clean disc
        </Button>
      </div>
    </section>
  );
}

export function NowPlaying() {
  const inserted = useInsertedAlbum();
  const selected = useSelectedAlbum();
  const trackIndex = usePlayer((s) => s.trackIndex);
  const state = usePlayer((s) => s.state);
  const selectTrack = usePlayer((s) => s.selectTrack);
  const album = inserted ?? selected;
  const isInserted = !!inserted;
  const track = inserted?.tracks[trackIndex];

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-6 pt-5">
      <h2 id="now-playing" tabIndex={-1} className="mb-4 font-display text-xl font-light tracking-tight">
        Now playing
      </h2>
      {!album ? (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing in the player yet. Choose a CD from your shelf.</div>
      ) : (
        <>
          <div className="flex gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md shadow-[0_10px_24px_-12px_rgba(37,31,27,0.55)]" style={{ background: album.tint }}>
              {album.coverUrl && <img src={album.coverUrl} alt={`Cover art for ${album.title}`} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              {!isInserted && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Selected · not inserted</p>}
              <p className="truncate font-display text-lg leading-snug">{track?.title ?? album.title}</p>
              <p className="truncate text-sm text-ink-soft">{track?.artist ?? album.artist}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {album.title}
                {album.year ? ` · ${album.year}` : ''}
              </p>
            </div>
          </div>

          {isInserted && (
            <div className="mt-5 space-y-4">
              <Progress />
              <Volume />
            </div>
          )}

          {album.source === 'demo' && (
            <p className="mt-4 text-[11px] leading-relaxed text-muted">Demo disc: original ambient sketches synthesized in your browser.</p>
          )}

          <section aria-label="Track list" className="mt-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Tracks</h3>
            <ol className="space-y-0.5">
              {album.tracks.map((t, i) => {
                const current = isInserted && i === trackIndex;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={!isInserted || state === 'LOADING' || state === 'EJECTING'}
                      onClick={() => void selectTrack(i, true)}
                      aria-current={current ? 'true' : undefined}
                      aria-label={`Play track ${i + 1}, ${t.title}, ${formatTime(t.duration)}`}
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-default ${current ? 'bg-surface-2/80' : 'enabled:hover:bg-surface-2/50'}`}
                    >
                      <span className={`w-5 shrink-0 text-right font-mono text-[11px] ${current ? 'text-accent-ink' : 'text-muted'}`}>
                        {current && state === 'PLAYING' ? <Icon name="wave" size={14} className="ml-auto" /> : i + 1}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${current ? 'font-medium text-ink' : 'text-ink-soft'}`}>{t.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">{formatTime(t.duration)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {!isInserted && <p className="mt-2 px-2.5 text-xs text-muted">Insert the disc to play these tracks.</p>}
          </section>

          <div className="mt-6">
            <DiscCondition albumId={album.id} />
          </div>
        </>
      )}
    </div>
  );
}
