import { CATALOG, PRESETS, useHifi } from '../store';
import type { Device, Slot } from '../types';

const SECTIONS: { slot: Slot; title: string; items: Device[]; optional: boolean }[] = [
  { slot: 'source', title: 'Sources', items: CATALOG.sources, optional: false },
  { slot: 'amp', title: 'Amplifiers', items: CATALOG.amps, optional: true },
  { slot: 'speakers', title: 'Speakers', items: CATALOG.speakers, optional: true },
  { slot: 'headphones', title: 'Headphones', items: CATALOG.headphones, optional: true },
];

export function Catalog() {
  const rackIds = useHifi((s) => s.rackIds);
  const select = useHifi((s) => s.selectDevice);
  const applyPreset = useHifi((s) => s.applyPreset);

  return (
    <div className="space-y-6 px-4 pb-8 pt-5">
      <section aria-labelledby="presets-h">
        <h2 id="presets-h" className="mb-2 font-display text-lg font-light">
          Setups
        </h2>
        <ul className="space-y-1.5">
          {PRESETS.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => applyPreset(p.id)} className="w-full rounded-xl border border-line px-3 py-2 text-left hover:bg-surface-2/50">
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
            {sec.items.map((d) => {
              const on = rackIds[sec.slot] === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => select(sec.slot, on && sec.optional ? null : d.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${on ? 'bg-ink text-bg' : 'bg-surface-2/50 hover:bg-surface-2'}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium">{d.displayName}</span>
                    <span className={`text-[10px] ${on ? 'opacity-70' : 'text-muted'}`}>{d.era}</span>
                  </span>
                  <span className={`mt-0.5 block text-[11px] leading-snug ${on ? 'opacity-75' : 'text-muted'}`}>{d.description}</span>
                  <span className={`mt-1 block text-[10px] italic ${on ? 'opacity-60' : 'text-muted'}`}>Inspired by: {d.manufacturerInspiration}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-[11px] leading-relaxed text-muted">
        All equipment is original and fictional, inspired by product categories. Sound profiles are illustrative — not measurements of any real model.
      </p>
    </div>
  );
}
