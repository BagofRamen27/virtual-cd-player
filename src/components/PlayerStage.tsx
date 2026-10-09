import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { usePlayer, useInsertedAlbum, useSelectedAlbum } from '../state/store';
import { hasWebGL } from '../lib/webgl';
import { statusText } from '../lib/lcd';
import { DRAG_TYPE } from './JewelCase';
import { Player2D } from './Player2D';
import { TransportControls } from './TransportControls';
import { Icon } from './ui';
import { currentRoute, useHifi } from '../hifi/store';

const Stage = lazy(() => import('../three/Stage'));

class WebGLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[discdeck] 3D stage failed, falling back to 2D', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Hint() {
  const state = usePlayer((s) => s.state);
  const lidOpen = usePlayer((s) => s.lidOpen);
  const selected = useSelectedAlbum();
  let text = '';
  if (state === 'EMPTY') text = selected ? `Drag “${selected.title}” onto the player, or press Insert.` : 'Pick a CD from your shelf.';
  else if (state === 'READY' && lidOpen) text = 'Close the lid or press play.';
  else if (state === 'READY') text = 'Press play.';
  if (!text) return null;
  return <p className="pointer-events-none hidden text-center text-[13px] text-muted sm:block">{text}</p>;
}

function RackBanner() {
  const h = useHifi();
  const route = currentRoute(h);
  if (!h.enabled) return null;
  const out = route.output;
  return (
    <div className="absolute left-3 top-3 z-10 max-w-[min(420px,calc(100%-9rem))] rounded-2xl border border-line bg-surface/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
      <p className={out.kind === 'silent' ? 'text-ink' : 'text-ink-soft'}>
        {out.kind === 'silent' ? <>Hi-Fi rack is silent: {out.reason}</> : out.kind === 'direct' ? 'Direct output' : <>Playing through the Hi-Fi rack → {out.deviceName}</>}
      </p>
      <div className="mt-1 flex gap-3">
        <button type="button" className="font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => h.setView('room')}>
          Open Hi-Fi Room
        </button>
        <button type="button" className="text-muted underline-offset-2 hover:underline" onClick={() => h.setEnabled(false)}>
          Play directly instead
        </button>
      </div>
    </div>
  );
}

export function PlayerStage() {
  const force2D = usePlayer((s) => s.settings.force2D);
  const state = usePlayer((s) => s.state);
  const lidOpen = usePlayer((s) => s.lidOpen);
  const trackIndex = usePlayer((s) => s.trackIndex);
  const errorMessage = usePlayer((s) => s.errorMessage);
  const album = useInsertedAlbum();
  const { insertDisc, resetView, eject } = usePlayer.getState();
  const webgl = useMemo(() => hasWebGL(), []);
  const [dropping, setDropping] = useState(false);
  const use3D = webgl && !force2D;

  return (
    <section aria-label="CD player" className="relative flex h-full min-h-0 flex-col" style={{ background: 'var(--stage)' }}>
      {/* Screen reader announcement of real player state */}
      <p className="sr-only" aria-live="polite">
        {statusText(state, lidOpen, album, trackIndex)}
      </p>

      <div
        className="relative min-h-0 flex-1"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(DRAG_TYPE);
          setDropping(false);
          if (id) {
            e.preventDefault();
            void insertDisc(id);
          }
        }}
      >
        {use3D ? (
          <WebGLBoundary fallback={<Player2D />}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Warming up the listening room…</div>}>
              <Stage />
            </Suspense>
          </WebGLBoundary>
        ) : (
          <Player2D />
        )}

        {dropping && (
          <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent/60 bg-accent/5">
            <span className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink shadow">Release to insert disc</span>
          </div>
        )}

        <div className="absolute right-3 top-3 flex items-center gap-2">
          {!use3D && <span className="rounded-full bg-surface/80 px-2.5 py-1 text-[11px] text-muted">{webgl ? '2D mode' : '2D mode · WebGL unavailable'}</span>}
          {use3D && (
            <button
              type="button"
              onClick={resetView}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface/75 px-3 text-xs font-medium text-ink-soft backdrop-blur hover:bg-surface"
            >
              <Icon name="reset" size={14} /> Reset view
            </button>
          )}
        </div>

        <RackBanner />
        {state === 'ERROR' && errorMessage && (
          <div role="alert" className="absolute inset-x-4 top-3 mx-auto max-w-md rounded-2xl border border-line bg-surface/95 p-4 text-sm shadow-lg sm:top-4">
            <p className="font-medium text-ink">This disc can’t be played</p>
            <p className="mt-1 text-ink-soft">{errorMessage}</p>
            <button type="button" onClick={() => void eject()} className="mt-3 text-sm font-medium text-accent-ink underline underline-offset-2">
              Eject disc
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3 px-4 pb-5 pt-2">
        <Hint />
        <TransportControls />
      </div>
    </section>
  );
}
