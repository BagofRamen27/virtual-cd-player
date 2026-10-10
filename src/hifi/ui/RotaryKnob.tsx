import { useRef, type PointerEvent } from 'react';

/** A large rotary control: drag up/right or use the arrow keys. */
export function RotaryKnob({ label, value, min, max, step, display, defaultValue, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; defaultValue: number; onChange: (value: number) => void;
}) {
  const drag = useRef<{ x: number; y: number; value: number } | null>(null);
  const update = (next: number) => onChange(Math.max(min, Math.min(max, Math.round(next / step) * step)));
  const end = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const angle = -135 + ((value - min) / (max - min)) * 270;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2/40 px-2 py-3">
      <span className="text-xs font-medium">{label}</span>
      <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={display}
        className="relative h-20 w-20 touch-none cursor-grab rounded-full border-4 border-[#40362f] shadow-[0_4px_12px_rgba(0,0,0,0.3)] outline-none focus-visible:ring-4 focus-visible:ring-accent active:cursor-grabbing"
        style={{ background: 'radial-gradient(circle at 35% 25%, #f0ece4, #bcb3a7 55%, #756c61)' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, value };
        }}
        onPointerMove={(e) => {
          if (drag.current) update(drag.current.value + ((drag.current.y - e.clientY + e.clientX - drag.current.x) / 180) * (max - min));
        }}
        onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null; }}
        onDoubleClick={() => update(defaultValue)}
        onKeyDown={(e) => {
          const deltas: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 10, PageDown: -step * 10 };
          if (e.key in deltas) { e.preventDefault(); e.stopPropagation(); update(value + deltas[e.key]); }
          else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); update(e.key === 'Home' ? min : max); }
        }}>
        <span className="pointer-events-none absolute inset-0" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="absolute left-1/2 top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-[#40362f]" />
        </span>
      </div>
      <span className="text-center font-mono text-[11px] text-ink-soft">{display}</span>
    </div>
  );
}
