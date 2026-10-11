import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { usePlayer, useInsertedAlbum } from '../../state/store';
import { TransportControls } from '../../components/TransportControls';
import { hasWebGL } from '../../lib/webgl';
import { formatTime } from '../../lib/art';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { currentRoute, useHifi } from '../store';
import { Catalog } from './Catalog';
import { PRESETS } from '../store';
import { Inspector } from './Inspector';
import { Tutorial } from './Tutorial';
import { WiringPanel } from './WiringPanel';
import type { RoomView } from '../three/RackScene';
import { useGraphicsProfile } from '../../state/performance';

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
  const albums = local;
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line bg-surface/85 px-4 py-3 shadow-[0_-12px_30px_-24px_rgba(37,31,27,0.5)] backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[5px] shadow-[0_6px_14px_-8px_rgba(37,31,27,0.6)]" style={{ background: album?.tint ?? 'var(--surface-2)' }}>
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

/** Swipeable one-tap setups for small screens. */
function PresetStrip() {
  const apply = useHifi((s) => s.applyPreset);
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]" role="list" aria-label="Setups">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="listitem"
          onClick={() => apply(p.id)}
          className="shrink-0 rounded-full border border-line bg-surface/80 px-3.5 py-2 text-xs font-medium text-ink-soft shadow-[0_6px_16px_-12px_rgba(37,31,27,0.5)] hover:border-accent/40"
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

export function RackView() {
  const webgl = useMemo(() => hasWebGL(), []);
  const force2D = useGraphicsProfile() === '2d';
  const enabled = useHifi((s) => s.enabled);
  const setEnabled = useHifi((s) => s.setEnabled);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [tab, setTab] = useState<'room' | 'wiring' | 'controls'>('room');
  const [view, setView] = useState<RoomView>('knobs');
  const hasAmp = !!useHifi((s) => s.rackIds.amp);
  const show3D = webgl && !force2D;

  const centre = (
    <div className="relative flex h-full min-h-0 flex-col" style={{ background: 'var(--stage)' }}>
      {/* Keep navigation outside the scene so it never covers equipment controls. */}
      <div className="relative z-10 flex shrink-0 flex-wrap items-start justify-between gap-3 p-3">
        <div role="tablist" aria-label="Room view" className="pointer-events-auto flex gap-1 rounded-full border border-line bg-surface/75 p-1 shadow-[0_8px_24px_-12px_rgba(37,31,27,0.45)] backdrop-blur-md">
          {(['room', 'wiring', 'controls'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-8 rounded-full px-3.5 text-xs font-medium transition-colors ${tab === t ? 'bg-ink text-bg shadow-sm' : 'text-ink-soft hover:bg-surface-2/70'}`}
            >
              {t === 'room' ? (
                <>
                  <span className="sm:hidden">Room</span>
                  <span className="hidden sm:inline">Listening room</span>
                </>
              ) : t === 'wiring' ? (
                <>
                  <span className="sm:hidden">Wiring</span>
                  <span className="hidden sm:inline">Wiring · back panels</span>
                </>
              ) : 'Controls'}
            </button>
          ))}
        </div>
        <label className="pointer-events-auto flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface/75 px-3.5 text-xs text-ink-soft shadow-[0_8px_24px_-12px_rgba(37,31,27,0.45)] backdrop-blur-md">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-[var(--accent)]" />
          <span className="sm:hidden">Use rack</span>
          <span className="hidden sm:inline">Play through this rack</span>
        </label>
      </div>
      <div className="relative min-h-0 flex-1">
        {tab === 'room' && show3D ? (
          <Boundary fallback={<div className="p-6"><WiringPanel /></div>}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Setting up the room…</div>}>
              <div className="absolute inset-0">
                <RackScene view={(view === 'amp' || view === 'knobs') && !hasAmp ? 'source' : view} />
              </div>
            </Suspense>
            <div className="absolute bottom-3 inset-x-3 flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Camera view" className="flex gap-1 rounded-2xl border border-line bg-surface/90 p-1 shadow-sm">
                {(['room', 'amp', 'knobs', 'source'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} disabled={(v === 'amp' || v === 'knobs') && !hasAmp} onClick={() => setView(v)}
                    className={`min-h-11 rounded-xl px-3 text-xs font-medium disabled:opacity-40 ${view === v ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-surface-2'}`}>
                    {v === 'room' ? 'Whole room' : v === 'amp' ? 'Amplifier' : v === 'knobs' ? 'Knobs' : 'CD player'}
                  </button>
                ))}
              </div>
              <p className="pointer-events-none hidden rounded-full bg-surface/80 px-3 py-1 text-[11px] text-ink-soft xl:block">Camera stays still · drag knobs to adjust</p>
            </div>
          </Boundary>
        ) : (
          <div className="h-full overflow-y-auto p-4">
            {tab === 'controls' ? <Inspector /> : <WiringPanel />}
            {!show3D && tab === 'room' && <p className="mt-3 text-xs text-muted">3D unavailable — using the 2D back-panel view.</p>}
          </div>
        )}
      </div>
    </div>
  );

  if (!desktop) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={`${tab === 'controls' ? 'h-[65vh]' : 'h-[46vh]'} shrink-0`}>{centre}</div>
          <PresetStrip />
          <div className="space-y-4 px-4 pt-2">
            <Tutorial />
          </div>
          {tab !== 'controls' && <Inspector />}
          <Catalog />
        </div>
        <MiniTransport />
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
          {tab !== 'controls' && <Inspector />}
        </aside>
      </div>
      <MiniTransport />
    </div>
  );
}
