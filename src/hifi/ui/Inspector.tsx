import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer, activeAdapterKind } from '../../state/store';
import { Icon, Pill } from '../../components/ui';
import { currentAmpState, currentRoute, profileFor, rackOf, useHifi } from '../store';
import { ampToneFilters, responseDb, scaleFilters } from '../dsp';
import { readMeters, toDb } from '../meters';
import { PROFILES } from '../catalog';
import type { FilterSpec } from '../types';
import { DEMO_ALBUM_ID } from '../../audio/demoAlbum';
import { RotaryKnob } from './RotaryKnob';
import { VUMeters } from './VUMeters';

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <label className={`block ${disabled ? 'opacity-50' : ''}`}>
      <span className="flex justify-between gap-2 text-xs text-ink-soft">
        {label} <span className="font-mono text-[11px] text-muted">{display}</span>
      </span>
      <input
        type="range"
        className="dd-range min-h-11"
        style={{ ['--fill' as string]: fill }}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={hint}
      className={`min-h-11 rounded-full px-3 text-xs font-medium transition-colors ${on ? 'bg-ink text-bg' : 'bg-surface-2/70 text-ink-soft hover:bg-surface-2'}`}
    >
      {label}
    </button>
  );
}

/** Frequency response plot (20 Hz – 20 kHz) of the amp tone stack + output emulation. */
function EqCurve({ tone, profile }: { tone: FilterSpec[]; profile: FilterSpec[] }) {
  const W = 300;
  const H = 110;
  const freqs = useMemo(() => Array.from({ length: 90 }, (_, i) => 20 * Math.pow(1000, i / 89)), []);
  const x = (f: number) => (Math.log10(f / 20) / 3) * W;
  const y = (db: number) => H / 2 - (Math.max(-24, Math.min(24, db)) / 24) * (H / 2);
  const path = (filters: FilterSpec[]) => freqs.map((f, i) => `${i ? 'L' : 'M'}${x(f).toFixed(1)},${y(responseDb(filters, f)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label="Frequency response of the current chain">
      {[100, 1000, 10000].map((f) => (
        <g key={f}>
          <line x1={x(f)} x2={x(f)} y1={0} y2={H} stroke="var(--line)" />
          <text x={x(f) + 3} y={H - 4} fontSize={9} fill="var(--muted)">
            {f >= 1000 ? `${f / 1000}k` : f}
          </text>
        </g>
      ))}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="3 3" />
      <text x={3} y={10} fontSize={9} fill="var(--muted)">
        +24 dB
      </text>
      <text x={3} y={H - 14} fontSize={9} fill="var(--muted)">
        −24
      </text>
      <path d={path(profile)} fill="none" stroke="var(--muted)" strokeWidth={1.2} strokeDasharray="4 3" />
      <path d={path([...tone, ...profile])} fill="none" stroke="var(--accent)" strokeWidth={2} />
    </svg>
  );
}

function Meters() {
  const [m, setM] = useState({ inL: -60, inR: -60, outL: -60, outR: -60, clip: false });
  const raf = useRef(0);
  useEffect(() => {
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 60) {
        last = t;
        const r = readMeters();
        setM({ inL: toDb(r.inL), inR: toDb(r.inR), outL: toDb(r.outL), outR: toDb(r.outR), clip: r.clipHeld });
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  const Bar = ({ db, label }: { db: number; label: string }) => (
    <div className="flex items-center gap-2">
      <span className="w-8 text-[10px] text-muted">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${db > -3 ? 'bg-[#b5523b]' : 'bg-accent'}`} style={{ width: `${((db + 60) / 60) * 100}%`, transition: 'width 60ms linear' }} />
      </div>
      <span className="w-12 text-right font-mono text-[10px] text-muted">{db <= -59 ? '−∞' : `${db.toFixed(0)} dB`}</span>
    </div>
  );
  return (
    <div className="space-y-1.5" aria-label="Signal meters">
      <Bar db={Math.max(m.inL, m.inR)} label="In" />
      <Bar db={m.outL} label="Out L" />
      <Bar db={m.outR} label="Out R" />
      <p className={`text-[11px] font-medium ${m.clip ? 'text-[#b5523b]' : 'text-muted'}`}>{m.clip ? '● Clipping — turn it down' : '○ No clipping'}</p>
    </div>
  );
}

export function Inspector() {
  const h = useHifi();
  const playerVolume = usePlayer((s) => s.settings.volume);
  const setPlayerVolume = usePlayer((s) => s.setVolume);
  const insertedSource = usePlayer((s) => s.findAlbum(s.insertedAlbumId)?.source);
  const playerState = usePlayer((s) => s.state);
  const rack = rackOf(h.rackIds);
  const amp = rack.amp;
  const ampState = currentAmpState(h);
  const route = currentRoute(h);
  const profile = profileFor(route);
  const spotify = insertedSource === 'spotify' || activeAdapterKind() === 'spotify';
  const tone = route.throughAmp && amp && ampState ? ampToneFilters(amp, ampState) : [];
  const profFilters = profile && !h.bypass ? scaleFilters(profile.filters, h.intensity) : [];
  const srcVol = rack.source?.id === 'dd1' ? playerVolume : (h.sourceVolumes[rack.source?.id ?? ''] ?? 0.6);
  const setSrcVol = (v: number) => (rack.source?.id === 'dd1' ? setPlayerVolume(v) : h.setSourceVolume(v));
  const set = h.setAmp;
  const out = route.output;

  return (
    <div className="space-y-4 px-5 pb-8 pt-4 text-sm">
      <details className="space-y-3 rounded-2xl border border-line bg-surface/70 p-4">
        <summary className="min-h-7 cursor-pointer text-sm font-medium">Hear the difference · comparison demo</summary>
        <p className="text-xs text-ink-soft">Switch systems while the same track plays. Listen for deep bass, crisp percussion, and stereo separation.</p>
        <button type="button" disabled={['LOADING', 'EJECTING'].includes(playerState)}
          className="min-h-11 w-full rounded-xl bg-ink px-3 text-xs font-medium text-bg disabled:opacity-40"
          onClick={() => void (async () => {
            h.applyPreset('living-room');
            await usePlayer.getState().insertDisc(DEMO_ALBUM_ID);
            await usePlayer.getState().play();
          })()}>Play comparison demo</button>
        <div role="group" aria-label="Compare sound systems" className="flex flex-wrap gap-2">
          {([['living-room', 'Full-range'], ['budget-dorm', 'Small speakers'], ['bedroom-boombox', 'Boombox']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => h.applyPreset(id)} className="min-h-11 flex-1 rounded-xl border border-line px-3 text-xs font-medium hover:bg-surface-2">{label}</button>
          ))}
        </div>
        <Toggle label={h.bypass ? 'Original sound' : 'System sound'} on={!h.bypass} onChange={(on) => h.setLab({ bypass: !on })} />
        <p className="text-[11px] text-muted">{spotify ? 'Spotify: only volume changes. Play the demo above to hear the equipment effects.' : 'Equipment profiles affect demo and imported audio. Presets enable the full effect.'}</p>
      </details>
      {/* Route status */}
      <section aria-live="polite" className={`rounded-2xl border p-4 ${out.kind === 'silent' ? 'border-amber/60 bg-amber/10' : 'border-line bg-surface/70'}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{out.kind === 'silent' ? 'Silent' : 'You’re hearing'}</p>
        {out.kind === 'silent' ? (
          <p className="mt-1 leading-relaxed text-ink">{out.reason}</p>
        ) : out.kind === 'direct' ? (
          <p className="mt-1">Direct output (hi-fi routing off)</p>
        ) : (
          <p className="mt-1 font-medium">{out.deviceName}</p>
        )}
        {route.chain.length > 0 && out.kind !== 'direct' && <p className="mt-2 text-[11px] text-muted">{route.chain.join(' → ')}</p>}
        {spotify && (
          <p className="mt-3 rounded-xl bg-surface-2/70 p-2.5 text-[11px] leading-relaxed text-ink-soft">
            <strong className="font-semibold">Spotify disc: emulation is visual-only.</strong> Spotify audio can’t be routed through this DSP and must not be altered, so only
            volume and silence (from the route) reach it. Tone, speaker and headphone emulation apply to local and demo discs.
          </p>
        )}
      </section>

      {/* Source */}
      {rack.source && (
        <section aria-labelledby="src-h" className="space-y-3 rounded-2xl border border-line bg-surface/70 p-4 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_12px_28px_-24px_rgba(37,31,27,0.6)]">
          <h3 id="src-h" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {rack.source.displayName}
          </h3>
          {rack.source.hasVolumeKnob ? <Slider
            label={route.sourceVolumeApplies ? 'Volume' : 'Volume (headphone jack only — line out is fixed)'}
            value={srcVol}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(srcVol * 100)}%`}
            onChange={setSrcVol}
          /> : <p className="text-xs text-muted">Fixed-level RCA output. Adjust listening volume on the amplifier.</p>}
        </section>
      )}

      {/* Amplifier */}
      {amp && ampState && (
        <section aria-labelledby="amp-h" className="space-y-3 rounded-2xl border border-line bg-surface/70 p-4 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_12px_28px_-24px_rgba(37,31,27,0.6)]">
          <div className="flex items-center justify-between">
            <h3 id="amp-h" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {amp.displayName}
            </h3>
            <button type="button" onClick={h.resetAmp} className="text-[11px] text-muted underline-offset-2 hover:underline">
              Reset
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Toggle label={ampState.power ? 'Power on' : 'Power off'} on={ampState.power} onChange={(v) => set({ power: v })} />
            <Toggle label="Loudness" on={ampState.loudness} onChange={(v) => set({ loudness: v })} hint="Lifts bass and treble more at low volume" />
            <Toggle label="Speakers A" on={ampState.speakersA} onChange={(v) => set({ speakersA: v })} />
          </div>
          <VUMeters />
          <div role="radiogroup" aria-label="Input selector" className="flex gap-1.5">
            {amp.inputs.map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={ampState.input === i}
                onClick={() => set({ input: i })}
                className={`min-h-11 flex-1 rounded-lg text-xs font-medium ${ampState.input === i ? 'bg-ink text-bg' : 'bg-surface-2/60 text-ink-soft hover:bg-surface-2'}`}
              >
                {i}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">Drag a knob up or right to turn it. Arrow keys adjust; double-click resets.</p>
          <div className="grid grid-cols-2 gap-3">
          <RotaryKnob label="Volume" defaultValue={0.4} value={ampState.volume} min={0} max={1} step={0.01} display={`${(ampState.volume * 10).toFixed(1)} / 10`} onChange={(v) => set({ volume: v })} />
          <RotaryKnob label="Bass" defaultValue={0} value={ampState.bass} min={-1} max={1} step={0.05} display={`${ampState.bass >= 0 ? '+' : ''}${Math.round(ampState.bass * 12)} dB`} onChange={(v) => set({ bass: v })} />
          <RotaryKnob label="Treble" defaultValue={0} value={ampState.treble} min={-1} max={1} step={0.05} display={`${ampState.treble >= 0 ? '+' : ''}${Math.round(ampState.treble * 12)} dB`} onChange={(v) => set({ treble: v })} />
          <RotaryKnob
            defaultValue={0}
            label="Balance"
            value={ampState.balance}
            min={-1}
            max={1}
            step={0.05}
            display={Math.abs(ampState.balance) < 0.02 ? 'centre' : ampState.balance < 0 ? `L ${Math.round(-ampState.balance * 100)}%` : `R ${Math.round(ampState.balance * 100)}%`}
            onChange={(v) => set({ balance: v })}
          />
          </div>
          {!route.throughAmp && route.output.kind !== 'silent' && <p className="text-[11px] text-muted">The amp isn’t in the current signal path, so these controls don’t affect what you hear right now.</p>}
        </section>
      )}

      {/* Response + meters */}
      <section aria-labelledby="eq-h" className="space-y-2 rounded-2xl border border-line bg-surface/70 p-4 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_12px_28px_-24px_rgba(37,31,27,0.6)]">
        <h3 id="eq-h" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Response &amp; levels
        </h3>
        <EqCurve tone={tone} profile={profFilters} />
        <p className="text-[10px] text-muted">Solid: whole chain (amp tone + emulation). Dashed: emulation only.</p>
        <Meters />
      </section>

      {/* Output emulation */}
      {profile && (
        <section aria-labelledby="out-h" className="space-y-3 rounded-2xl border border-line bg-surface/70 p-4 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_12px_28px_-24px_rgba(37,31,27,0.6)]">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="out-h" className="font-medium">
              {profile.displayName}
            </h3>
            <Pill tone="warn">{profile.evidence.grade === 'measured' ? 'Measured' : profile.evidence.grade === 'approximate' ? 'Approximate' : 'Illustrative'}</Pill>
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-soft">
            {profile.traits.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {profile.isolation && <p className="text-xs text-muted">{profile.isolation}</p>}
          <p className="text-[11px] text-muted">{profile.evidence.notes}</p>
        </section>
      )}

      {/* A/B lab */}
      <section aria-labelledby="ab-h" className="space-y-3 rounded-2xl border border-line bg-surface/70 p-4 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_12px_28px_-24px_rgba(37,31,27,0.6)]">
        <h3 id="ab-h" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Compare
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <Toggle label={h.bypass ? 'Emulation bypassed' : 'Emulation on'} on={!h.bypass} onChange={(v) => h.setLab({ bypass: !v })} hint="Reference: skip the speaker/headphone model" />
          <Toggle label="Level-matched" on={h.levelMatch} onChange={(v) => h.setLab({ levelMatch: v })} hint="Compensate loudness so comparisons are fair" />
        </div>
        <Slider label="Emulation intensity" value={h.intensity} min={0} max={1} step={0.05} display={h.intensity === 0 ? 'neutral' : `${Math.round(h.intensity * 100)}%`} onChange={(v) => h.setLab({ intensity: v })} />
        <div className="grid grid-cols-2 gap-1.5">
          {(['speakers', 'headphones'] as const).map((slot) => {
            const list = slot === 'speakers' ? ['bookshelf-premium', 'mini-cheap'] : ['studio-closed', 'earbuds-cheap'];
            const cur = h.rackIds[slot];
            const next = list.find((id) => id !== cur) ?? list[0];
            return (
              <button
                key={slot}
                type="button"
                onClick={() => h.selectDevice(slot, next)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-2 py-2 text-[11px] text-ink-soft hover:bg-surface-2/60"
              >
                <Icon name="reset" size={13} /> Swap to {PROFILES[next].displayName.toLowerCase()}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          Ordinary cables that work properly don’t change the sound in any meaningful way, so DiscDeck doesn’t pretend they do — cables here define the route, not the
          tone.
        </p>
      </section>
    </div>
  );
}
