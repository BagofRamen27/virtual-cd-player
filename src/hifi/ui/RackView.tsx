import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { usePlayer, useInsertedAlbum } from '../../state/store';
import { TransportControls } from '../../components/TransportControls';
import { hasWebGL } from '../../lib/webgl';
import { formatTime } from '../../lib/art';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { currentRoute, useHifi } from '../store';
import { Catalog } from './Catalog';
import { Inspector } from './Inspector';
import { Tutorial } from './Tutorial';
import { WiringPanel } from './WiringPanel';

const RackScene = lazy(() => import('../three/RackScene'));

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function DiscPicker() {
  const local = usePlayer((s) => s.albums);
  const saved = usePlayer((s) => s.spotifyAlbums);
  const albums = useMemo(() => [...local, ...saved], [local, saved]);
  const inserted = usePlayer((s) => s.insertedAlbumId);
  const insert = usePlayer((s) => s.insertDisc);
  return (
    <label className="flex items-center gap-2 text-xs text-ink-soft">
      <span className="sr-only">Choose a disc</span>
      <select
        value={inserted ?? ''}
        onChange={(e) => e.target.value && void insert(e.target.value)}
        className="h-9 max-w-[220px] rounded-full border border-line bg-surface px-3 text-xs text-ink"
      >
        <option value="">Insert a disc…</option>
        {albums.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title} — {a.artist}
          </option>
        ))}
      </select>
    </label>
  );
}

function MiniTransport() {
  const album = useInsertedAlbum();
  const trackIndex = usePlayer((s) => s.trackIndex);
  const position = usePlayer((s) => s.position);
  const route = currentRoute(useHifi());
  const out = route.output;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line bg-surface/80 px-4 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded" style={{ background: album?.tint ?? 'var(--surface-2)' }}>
          {album?.coverUrl && <img src={album.coverUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{album ? album.tracks[trackIndex]?.title : 'No disc'}</p>
          <p className="truncate text-[11px] text-muted">{album ? `${album.artist} · ${formatTime(position)}` : 'Pick one to start'}</p>
        </div>
      </div>
      <DiscPicker />
      <TransportControls compact />
      <p className={`min-w-0 flex-1 truncate text-right text-[11px] ${out.kind === 'silent' ? 'text-accent-ink' : 'text-muted'}`}>
        {out.kind === 'silent' ? `Silent — ${out.reason}` : out.kind === 'direct' ? 'Direct output' : `▸ ${out.deviceName}`}
      </p>
    </div>
  );
}

export function RackView() {
  const webgl = useMemo(() => hasWebGL(), []);
  const force2D = usePlayer((s) => s.settings.force2D);
  const enabled = useHifi((s) => s.enabled);
  const setEnabled = useHifi((s) => s.setEnabled);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [tab, setTab] = useState<'room' | 'wiring'>('room');
  const show3D = webgl && !force2D;

  const centre = (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div role="tablist" aria-label="Room view" className="flex gap-1">
          {(['room', 'wiring'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-8 rounded-full px-3 text-xs font-medium ${tab === t ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-surface-2/60'}`}
            >
              {t === 'room' ? 'Listening room' : 'Wiring (back panels)'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-[var(--accent)]" />
          Play through this rack
        </label>
      </div>
      <div className="relative min-h-0 flex-1" style={{ background: 'var(--stage)' }}>
        {tab === 'room' && show3D ? (
          <Boundary fallback={<div className="p-6"><WiringPanel /></div>}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Setting up the room…</div>}>
              <div className="absolute inset-0">
                <RackScene />
              </div>
            </Suspense>
            <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-muted">Drag knobs to turn · scroll to nudge · double-click to reset · drag empty space to look around</p>
          </Boundary>
        ) : (
          <div className="h-full overflow-y-auto p-4">
            <WiringPanel />
            {!show3D && tab === 'room' && <p className="mt-3 text-xs text-muted">3D unavailable — using the 2D back-panel view.</p>}
          </div>
        )}
      </div>
    </div>
  );

  if (!desktop) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="h-[48vh] shrink-0">{centre}</div>
        <div className="space-y-4 p-4">
          <Tutorial />
        </div>
        <Inspector />
        <Catalog />
        <div className="sticky bottom-0">
          <MiniTransport />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside aria-label="Equipment" className="min-h-0 overflow-y-auto border-r border-line">
          <Catalog />
        </aside>
        {centre}
        <aside aria-label="Inspector" className="min-h-0 overflow-y-auto border-l border-line">
          <div className="px-5 pt-5">
            <Tutorial />
          </div>
          <Inspector />
        </aside>
      </div>
      <MiniTransport />
    </div>
  );
}
