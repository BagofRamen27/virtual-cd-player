import { useState } from 'react';
import { CATALOG, PRESETS, useHifi } from '../store';
import type { Device, Slot } from '../types';

const SECTIONS: { slot: Slot; title: string; items: Device[]; optional: boolean }[] = [
  { slot: 'source', title: 'Sources', items: CATALOG.sources, optional: false },
  { slot: 'amp', title: 'Receivers & amplifiers', items: CATALOG.amps, optional: true },
  { slot: 'speakers', title: 'Speakers', items: CATALOG.speakers, optional: true },
  { slot: 'headphones', title: 'Headphones', items: CATALOG.headphones, optional: true },
];

export function Catalog() {
  const [era, setEra] = useState('all');
  const rackIds = useHifi((s) => s.rackIds);
  const select = useHifi((s) => s.selectDevice);
  const applyPreset = useHifi((s) => s.applyPreset);

  return (
    <div className="space-y-6 px-4 pb-8 pt-5">
      <label className="flex items-center justify-between gap-2 text-xs">Equipment era
        <select value={era} onChange={(e) => setEra(e.target.value)} className="min-h-11 rounded-xl border border-line bg-surface px-3">
          <option value="all">All eras</option><option value="1970s">1970s</option><option value="1980s">1980s</option>
        </select>
      </label>
      <section aria-labelledby="presets-h">
        <h2 id="presets-h" className="mb-2 font-display text-lg font-light">
          Setups
        </h2>
        <ul className="space-y-1.5">
          {PRESETS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => applyPreset(p.id)}
                className="w-full rounded-2xl border border-line bg-surface/60 px-3.5 py-2.5 text-left shadow-[0_1px_0_rgba(255,255,255,0.5)_inset] transition-all hover:-translate-y-px hover:border-accent/40 hover:bg-surface hover:shadow-[0_10px_22px_-16px_rgba(37,31,27,0.5)]"
              >
                <span className="block text-[13px] font-medium">{p.name}</span>
                <span className="block text-[11px] text-muted">{p.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {SECTIONS.map((sec) => (
        <section key={sec.slot} aria-labelledby={`cat-${sec.slot}`}>
          <h3 id={`cat-${sec.slot}`} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {sec.title}
          </h3>
          <div role="radiogroup" aria-labelledby={`cat-${sec.slot}`} className="space-y-1.5">
            {sec.items.filter((d) => era === 'all' || d.era === era || rackIds[sec.slot] === d.id).map((d) => {
              const on = rackIds[sec.slot] === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => select(sec.slot, on && sec.optional ? null : d.id)}
                  className={`relative w-full rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-200 ${
                    on
                      ? 'border-accent/60 bg-accent/10 shadow-[0_10px_24px_-18px_rgba(183,123,86,0.9)]'
                      : 'border-line bg-surface/60 hover:border-accent/30 hover:bg-surface'
                  }`}
                >
                  {on && <span className="absolute left-0 top-3 h-5 w-[3px] rounded-r-full bg-accent" aria-hidden="true" />}
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{d.displayName}</span>
                    <span className="rounded-full bg-surface-2/80 px-1.5 py-px text-[10px] text-muted">
                      {d.era} · {d.tier}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug text-ink-soft">{d.description}</span>
                  <span className="mt-1 block text-[10px] italic text-muted">{d.referenceUrl ? 'Real-model recreation · simplified controls' : `Inspired by ${d.manufacturerInspiration}`}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-[11px] leading-relaxed text-muted">
        Vintage models are simplified recreations. Sound profiles are illustrative, not measurements of the original equipment.
      </p>
    </div>
  );
}
