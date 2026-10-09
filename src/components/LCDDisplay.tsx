import { useEffect, useState } from 'react';
import { usePlayer } from '../state/store';
import { lcdContent } from '../lib/lcd';

/** DOM version of the amber LCD (used by the 2D player). */
export function LCDDisplay() {
  const s = usePlayer();
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);
  const c = lcdContent({
    state: s.state,
    powered: s.powered,
    lidOpen: s.lidOpen,
    album: s.findAlbum(s.insertedAlbumId),
    trackIndex: s.trackIndex,
    position: s.position,
    glitch: s.lastGlitch,
    now,
  });
  const hidden = c.blink && Math.floor(now / 500) % 2 === 1;
  return (
    <div
      aria-hidden="true"
      className={`w-56 rounded-md px-3 py-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)] ${c.on ? 'bg-gradient-to-b from-[#f2c47e] to-[#d99a52] text-[#2b1d12]' : 'bg-[#2e2722]'}`}
    >
      <div className="h-7 font-mono text-2xl leading-7 tracking-wider">{hidden ? '' : c.main}</div>
      <div className="h-4 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-85">{c.sub}</div>
    </div>
  );
}
