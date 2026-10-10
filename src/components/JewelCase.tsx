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

/** Closed jewel case with an inset paper booklet, black tray hinge and clear plastic lid. */
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
        <div className="relative aspect-[1.13/1] w-full">
          <div className="jewel-shell relative h-full w-full overflow-hidden rounded-[3px]">
            <div className="jewel-booklet absolute bottom-[4%] left-[14%] right-[4%] top-[4%] overflow-hidden">
            {album.coverUrl ? (
              <img src={album.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
            ) : (
              <div className="h-full w-full" style={{ background: album.tint }} />
            )}
            </div>
            <div aria-hidden="true" className="jewel-hinge absolute bottom-[2%] left-[2%] top-[2%] w-[10%]">
              <span className="jewel-spine">COMPACT DISC · DIGITAL AUDIO</span>
            </div>
            <div aria-hidden="true" className="jewel-lid pointer-events-none absolute bottom-[1%] left-[12%] right-[1%] top-[1%] rounded-[2px]" />
            <span aria-hidden="true" className="jewel-latch absolute right-[1%] top-[43%] h-[14%] w-[2.5%]" />
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
