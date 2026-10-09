import { usePlayer, useInsertedAlbum } from '../state/store';
import { LCDDisplay } from './LCDDisplay';

/** Usable 2D player for devices without WebGL (or when 2D mode is chosen in Settings). */
export function Player2D() {
  const album = useInsertedAlbum();
  const state = usePlayer((s) => s.state);
  const lidOpen = usePlayer((s) => s.lidOpen);
  const phase = usePlayer((s) => s.discPhase);
  const toggleLid = usePlayer((s) => s.toggleLid);
  const spinning = state === 'PLAYING';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="relative aspect-square w-[min(78vw,340px)] rounded-[28px] bg-gradient-to-b from-[#f1e8db] to-[#e2d5c2] p-[7%] shadow-[0_30px_60px_-25px_rgba(37,31,27,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className="relative h-full w-full rounded-full bg-[#2a231f] shadow-[inset_0_4px_14px_rgba(0,0,0,0.5)]">
          {album && phase !== 'none' && (
            <div
              className={`absolute inset-[3%] rounded-full transition-all duration-700 ${phase === 'inserting' || phase === 'ejecting' ? 'translate-y-[-12%] opacity-60' : ''}`}
            >
              <div className={`cd-surface relative h-full w-full rounded-full ${spinning ? 'dd-spin' : ''}`}>
                <div className="absolute inset-[14%] overflow-hidden rounded-full" style={{ background: album.tint }}>
                  {album.coverUrl && <img src={album.coverUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="absolute inset-[40%] rounded-full bg-[#d8dde0]/70" />
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
      <LCDDisplay />
    </div>
  );
}
