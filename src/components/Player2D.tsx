import { useEffect, useMemo, useState } from 'react';
import { usePlayer, useInsertedAlbum } from '../state/store';
import { generateConditionStrokes } from '../audio/damage';
import { drawScratches } from '../three/textures';
import { LCDDisplay } from './LCDDisplay';

/** Usable 2D player for devices without WebGL (or when 2D mode is chosen in Settings). */
export function Player2D() {
  const album = useInsertedAlbum();
  const state = usePlayer((s) => s.state);
  const lidOpen = usePlayer((s) => s.lidOpen);
  const phase = usePlayer((s) => s.discPhase);
  const toggleLid = usePlayer((s) => s.toggleLid);
  const spinning = state === 'PLAYING';
  const profile = usePlayer((s) => (s.insertedAlbumId ? s.damage[s.insertedAlbumId] : undefined));
  const scratchUrl = useMemo(() => {
    if (!profile || (profile.condition === 0 && profile.strokes.length === 0)) return null;
    const strokes = [...generateConditionStrokes(profile.seed, profile.condition), ...profile.strokes];
    return drawScratches(strokes, 512, null, { condition: profile.condition, seed: profile.seed }).toDataURL();
  }, [profile]);
  // Jolt the disc briefly on every skip
  const glitchAt = usePlayer((s) => s.lastGlitch?.at);
  const [jolting, setJolting] = useState(false);
  useEffect(() => {
    if (!glitchAt) return;
    setJolting(true);
    const id = setTimeout(() => setJolting(false), 320);
    return () => clearTimeout(id);
  }, [glitchAt]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-hidden p-4" style={{ containerType: 'size' }}>
      <div
        className="relative aspect-square shrink-0 rounded-[28px]"
        style={{ width: 'min(78vw, 340px, calc(100cqh - 6.5rem))', minWidth: 120 }}
      >
      <div className="absolute inset-0 rounded-[28px] bg-gradient-to-b from-[#f1e8db] to-[#e2d5c2] p-[7%] shadow-[0_30px_60px_-25px_rgba(37,31,27,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className="relative h-full w-full rounded-full bg-[#2a231f] shadow-[inset_0_4px_14px_rgba(0,0,0,0.5)]">
          {album && phase !== 'none' && (
            <div
              className={`absolute inset-[3%] rounded-full transition-all duration-700 ${phase === 'inserting' || phase === 'ejecting' ? 'translate-y-[-12%] opacity-60' : ''} ${jolting ? 'dd-jolt' : ''}`}
            >
              <div className={`cd-surface relative h-full w-full rounded-full ${spinning ? 'dd-spin' : ''}`}>
                <div className="absolute inset-[14%] overflow-hidden rounded-full" style={{ background: album.tint }}>
                  {album.coverUrl && <img src={album.coverUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="absolute inset-[40%] rounded-full bg-[#d8dde0]/70" />
                {scratchUrl && <img src={scratchUrl} alt="" className="absolute inset-0 h-full w-full" />}
              </div>
            </div>
          )}
          <div className="absolute inset-[44%] rounded-full bg-[#e7dccb] shadow" />
        </div>
        <button
          type="button"
          onClick={toggleLid}
          aria-label={lidOpen ? 'Close lid' : 'Open lid'}
          className={`absolute inset-[4%] rounded-[24px] border border-white/20 bg-[#4a3a30]/35 backdrop-blur-[1px] transition-all duration-500 ${lidOpen ? '-translate-y-[55%] opacity-25' : ''}`}
        />
      </div>
      </div>
      <LCDDisplay />
    </div>
  );
}
