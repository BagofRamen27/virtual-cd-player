import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useHifi, rackOf, type PortRef } from '../store';
import { validateConnection } from '../routing';
import type { Connector, PortDef, Slot } from '../types';

const SLOT_TITLES: Record<Slot, string> = { source: 'CD player', amp: 'Amplifier', speakers: 'Speakers', headphones: 'Headphones' };
const CONNECTOR_NAMES: Record<Connector, string> = {
  rca: 'RCA',
  trs35: '3.5 mm',
  trs635: '6.35 mm',
  speaker: 'Speaker terminals',
  optical: 'Optical',
  coax: 'Coax',
};

function JackGlyph({ port }: { port: PortDef }) {
  if (port.connector === 'rca')
    return (
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-3.5 w-3.5 rounded-full border-2 border-[#efeae0] bg-espresso" />
        <span className="h-3.5 w-3.5 rounded-full border-2 border-[#c0392b] bg-espresso" />
      </span>
    );
  if (port.connector === 'speaker')
    return (
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-3.5 w-3.5 rounded-full bg-[#c0392b]" />
        <span className="h-3.5 w-3.5 rounded-full bg-espresso ring-1 ring-ivory/40" />
      </span>
    );
  return <span aria-hidden="true" className={`rounded-full border-2 border-[#b9b2a6] bg-espresso ${port.connector === 'trs635' ? 'h-4 w-4' : 'h-3 w-3'}`} />;
}

const key = (r: PortRef) => `${r.slot}.${r.port}`;

/**
 * Simplified back-panel wiring view. Click a jack then another to connect (or drag between
 * them); click a connected jack to unplug. Incompatible targets are dimmed while a cable is
 * in hand, and every refusal comes with a plain-language reason.
 */
export function WiringPanel() {
  const h = useHifi();
  const rack = rackOf(h.rackIds);
  const box = useRef<HTMLDivElement>(null);
  const jackEls = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<{ id: string; d: string; colors: string[] }[]>([]);
  const [dragLine, setDragLine] = useState<{ from: PortRef; x: number; y: number } | null>(null);
  const dragStart = useRef<{ ref: PortRef; x: number; y: number; moved: boolean } | null>(null);
  const [hoverCable, setHoverCable] = useState<string | null>(null);

  const centre = (k: string) => {
    const el = jackEls.current.get(k);
    const b = box.current?.getBoundingClientRect();
    if (!el || !b) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
  };

  useLayoutEffect(() => {
    const update = () => {
      const next = h.connections
        .map((c) => {
          const a = centre(key(c.from));
          const b = centre(key(c.to));
          if (!a || !b) return null;
          const sag = Math.max(30, Math.abs(b.x - a.x) * 0.25);
          const d = `M ${a.x} ${a.y} C ${a.x} ${a.y + sag}, ${b.x} ${b.y + sag}, ${b.x} ${b.y}`;
          const colors = c.cable === 'speaker' ? ['#b5532f'] : c.cable.startsWith('headphone') ? ['#3a322c'] : ['#c0392b'];
          return { id: c.id, d, colors };
        })
        .filter((x): x is { id: string; d: string; colors: string[] } => x !== null);
      setPaths(next);
    };
    update();
    const ro = new ResizeObserver(update);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [h.connections, h.rackIds]);

  const pendingRef = dragLine?.from ?? h.pending;
  const compat = (ref: PortRef) => (pendingRef ? validateConnection(rack, h.connections, pendingRef, ref).ok : true);
  const connectedAt = (ref: PortRef) => h.connections.find((c) => key(c.from) === key(ref) || key(c.to) === key(ref));

  const onDown = (ref: PortRef, e: ReactPointerEvent) => {
    dragStart.current = { ref, x: e.clientX, y: e.clientY, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = dragStart.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = !connectedAt(d.ref);
    if (d.moved) {
      const b = box.current!.getBoundingClientRect();
      setDragLine({ from: d.ref, x: e.clientX - b.left, y: e.clientY - b.top });
    }
  };
  const onUp = (ref: PortRef, e: ReactPointerEvent) => {
    const d = dragStart.current;
    dragStart.current = null;
    if (d?.moved) {
      setDragLine(null);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-jack]') as HTMLElement | null;
      if (target?.dataset.jack) {
        const [slot, port] = target.dataset.jack.split('.') as [Slot, string];
        if (slot !== ref.slot || port !== ref.port) h.connect(ref, { slot, port });
      }
      return;
    }
    h.pickPort(ref);
  };

  const slots: Slot[] = ['source', 'amp', 'speakers', 'headphones'];
  const from = dragLine ? centre(key(dragLine.from)) : null;

  return (
    <div ref={box} className="relative" onPointerMove={onMove}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {slots.map((slot) => {
          const dev = rack[slot];
          return (
            <section key={slot} aria-label={`${SLOT_TITLES[slot]} back panel`} className="rounded-2xl border border-line bg-surface/80 p-3 shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_14px_30px_-24px_rgba(37,31,27,0.6)] backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{SLOT_TITLES[slot]}</p>
              <p className="truncate text-[13px] font-medium">{dev?.displayName ?? '—'}</p>
              {slot === 'source' && dev && 'builtInSpeakerProfileId' in dev && dev.builtInSpeakerProfileId && (
                <p className="mt-1 text-[11px] text-muted">Built-in speakers — no cable needed</p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                {dev?.ports.map((p) => {
                  const ref = { slot, port: p.id };
                  const k = key(ref);
                  const conn = connectedAt(ref);
                  const isPending = pendingRef && key(pendingRef) === k;
                  const ok = compat(ref);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-jack={k}
                      ref={(el) => {
                        if (el) jackEls.current.set(k, el);
                        else jackEls.current.delete(k);
                      }}
                      onPointerDown={(e) => onDown(ref, e)}
                      onPointerUp={(e) => onUp(ref, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          h.pickPort(ref);
                        }
                      }}
                      aria-pressed={!!isPending}
                      aria-label={`${dev.displayName} ${p.label}, ${CONNECTOR_NAMES[p.connector]} ${p.direction === 'out' ? 'output' : 'input'}, ${p.level} level. ${conn ? 'Connected — press to unplug.' : isPending ? 'Cable in hand — choose another jack.' : 'Press to pick up a cable.'}`}
                      className={`group flex touch-none items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition-all ${
                        isPending
                          ? 'border-accent bg-accent/10 ring-2 ring-amber/50'
                          : conn
                            ? 'border-line bg-surface-2/60'
                            : pendingRef && ok
                              ? 'border-amber bg-amber/10 shadow-[0_0_0_3px_rgba(232,182,107,0.25)]'
                              : 'border-line hover:bg-surface-2/50'
                      } ${pendingRef && !ok && !isPending ? 'opacity-40' : ''}`}
                    >
                      <span>
                        <span className="block font-medium text-ink">{p.label}</span>
                        <span className="text-[10px] text-muted">
                          {CONNECTOR_NAMES[p.connector]} · {p.direction === 'out' ? 'out' : 'in'} · {p.level}
                        </span>
                      </span>
                      <JackGlyph port={p} />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {paths.map((p) => (
          <g key={p.id} onMouseEnter={() => setHoverCable(p.id)} onMouseLeave={() => setHoverCable(null)}>
            <path d={p.d} fill="none" stroke="rgba(37,31,27,0.18)" strokeWidth={7} strokeLinecap="round" transform="translate(0 3)" />
            <path d={p.d} fill="none" stroke={p.colors[0]} strokeWidth={hoverCable === p.id ? 5 : 4} strokeLinecap="round" />
          </g>
        ))}
        {dragLine && from && <path d={`M ${from.x} ${from.y} L ${dragLine.x} ${dragLine.y}`} stroke="#E8B66B" strokeWidth={3} strokeDasharray="6 5" fill="none" />}
      </svg>
      {h.connections.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Cables">
          {h.connections.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => h.disconnect(c.id)}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:bg-surface-2"
                aria-label={`Unplug cable from ${c.from.slot} ${c.from.port} to ${c.to.slot} ${c.to.port}`}
              >
                {SLOT_TITLES[c.from.slot]} {c.from.port} → {SLOT_TITLES[c.to.slot]} {c.to.port} ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
