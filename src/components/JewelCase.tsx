import { CONDITION_LABELS, type Album } from '../types';
import { usePlayer } from '../state/store';

export const DRAG_TYPE = 'application/x-discdeck-album';

const SOURCE_LABEL = { local: 'Local', spotify: 'Spotify', demo: 'Demo' } as const;

interface Props {
  album: Album;
  selected: boolean;
  inPlayer: boolean;
  onSelect: () => void;
  onInsert: () => void;
}

/** A jewel case on the shelf. Hover/focus slides the disc out; click selects; double-click or drag inserts. */
export function JewelCase({ album, selected, inPlayer, onSelect, onInsert }: Props) {
  const condition = usePlayer((s) => s.damage[album.id]?.condition ?? 0);
  return (
    <li className="jewel list-none" data-selected={selected}>
      <button
        type="button"
        draggable={!inPlayer}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, album.id);
          e.dataTransfer.setData('text/plain', `${album.artist} — ${album.title}`);
          e.dataTransfer.effectAllowed = 'move';
          onSelect();
        }}
        onClick={onSelect}
        onDoubleClick={onInsert}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && selected) {
            e.preventDefault();
            onInsert();
          }
        }}
        aria-pressed={selected}
        aria-label={`${album.title} by ${album.artist}, ${SOURCE_LABEL[album.source]} album, ${album.tracks.length} tracks${condition > 0 ? `, condition ${CONDITION_LABELS[condition]}` : ''}${inPlayer ? ', currently in the player' : ''}. ${selected ? 'Selected — press Enter to insert.' : ''}`}
        className={`group w-full rounded-2xl p-2 text-left transition-colors duration-300 ${selected ? 'bg-surface-2/80' : 'hover:bg-surface-2/45'}`}
      >
        <div className="relative aspect-square w-full">
          {/* The disc, peeking out from behind the case */}
          <div
            aria-hidden="true"
            className={`peek-disc absolute inset-[6%] rounded-full shadow-[0_2px_10px_rgba(37,31,27,0.18)] ${inPlayer ? 'opacity-0' : ''}`}
          >
            <div className="cd-surface absolute inset-0 rounded-full" />
            <div className="absolute inset-[22%] overflow-hidden rounded-full" style={{ background: album.tint }}>
              {album.coverUrl && <img src={album.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />}
            </div>
            <div className="absolute inset-[45%] rounded-full bg-bg" />
          </div>
          {/* The case */}
          <div className="relative h-full w-full overflow-hidden rounded-[6px] shadow-[0_8px_18px_-8px_rgba(37,31,27,0.45),0_1px_0_rgba(255,255,255,0.4)_inset]">
            {album.coverUrl ? (
              <img src={album.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
            ) : (
              <div className="h-full w-full" style={{ background: album.tint }} />
            )}
            {/* Jewel case hinge + acrylic sheen */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/25 via-white/10 to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/10" />
            {condition > 0 && !inPlayer && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-espresso/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ivory backdrop-blur-sm">
                {CONDITION_LABELS[condition]}
              </span>
            )}
            {inPlayer && (
              <div className="absolute inset-0 flex items-end bg-espresso/45 p-2">
                <span className="rounded-full bg-ivory/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-espresso">In player</span>
              </div>
            )}
          </div>
        </div>
        <div className="mt-2.5 px-0.5">
          <p className="truncate text-[13px] font-medium leading-tight text-ink">{album.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
            <span className="truncate">{album.artist}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{SOURCE_LABEL[album.source]}</span>
          </p>
        </div>
      </button>
    </li>
  );
}
