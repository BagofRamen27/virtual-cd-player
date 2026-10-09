import { useMemo, useRef, useState } from 'react';
import { usePlayer, useSelectedAlbum } from '../state/store';
import type { Album, SourceKind } from '../types';
import { JewelCase } from './JewelCase';
import { Button, Icon } from './ui';

type Filter = 'all' | SourceKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'local', label: 'Local' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'demo', label: 'Demo' },
];

function matches(a: Album, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return a.title.toLowerCase().includes(s) || a.artist.toLowerCase().includes(s);
}

function Grid({ albums, label }: { albums: Album[]; label: string }) {
  const selectedId = usePlayer((s) => s.selectedAlbumId);
  const insertedId = usePlayer((s) => s.insertedAlbumId);
  const select = usePlayer((s) => s.selectAlbum);
  const insert = usePlayer((s) => s.insertDisc);
  if (!albums.length) return null;
  return (
    <section aria-label={label} className="mb-6">
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</h3>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
        {albums.map((a) => (
          <JewelCase
            key={a.id}
            album={a}
            selected={a.id === selectedId}
            inPlayer={a.id === insertedId}
            onSelect={() => select(a.id)}
            onInsert={() => void insert(a.id)}
          />
        ))}
      </ul>
    </section>
  );
}

export function Shelf() {
  const albums = usePlayer((s) => s.albums);
  const spotifyAlbums = usePlayer((s) => s.spotifyAlbums);
  const spotifyResults = usePlayer((s) => s.spotifyResults);
  const spotify = usePlayer((s) => s.spotify);
  const importing = usePlayer((s) => s.importing);
  const insertedId = usePlayer((s) => s.insertedAlbumId);
  const { importLocal, insertDisc, searchSpotify, removeAlbum, loginSpotify } = usePlayer.getState();
  const selected = useSelectedAlbum();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dragOver, setDragOver] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  const show = (src: SourceKind) => filter === 'all' || filter === src;
  const local = useMemo(() => albums.filter((a) => a.source === 'local' && matches(a, query)), [albums, query]);
  const demo = useMemo(() => albums.filter((a) => a.source === 'demo' && matches(a, query)), [albums, query]);
  const saved = useMemo(() => spotifyAlbums.filter((a) => matches(a, query)), [spotifyAlbums, query]);
  const nothing = (show('local') ? local.length : 0) + (show('demo') ? demo.length : 0) + (show('spotify') ? saved.length + spotifyResults.length : 0) === 0;

  const onFiles = (list: FileList | null) => {
    if (list?.length) void importLocal(Array.from(list));
  };

  return (
    <div
      className={`flex h-full flex-col transition-colors ${dragOver ? 'bg-accent/5' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <div className="px-4 pb-3 pt-5 sm:px-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="library" tabIndex={-1} className="font-display text-xl font-light tracking-tight">
            My CD shelf
          </h2>
          <span className="text-xs text-muted">{albums.length + spotifyAlbums.length} disc{albums.length + spotifyAlbums.length === 1 ? '' : 's'}</span>
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (spotify.status === 'connected' && query.trim()) void searchSpotify(query);
          }}
        >
          <label className="relative block">
            <span className="sr-only">Search albums{spotify.status === 'connected' ? ' (press Enter to search Spotify)' : ''}</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={spotify.status === 'connected' ? 'Search shelf · Enter for Spotify' : 'Search your shelf'}
              className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
          </label>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by source">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${filter === f.id ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-surface-2/70'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 sm:px-3">
        {show('demo') && <Grid albums={demo} label="Demo disc · synthesized sample audio" />}
        {show('local') && <Grid albums={local} label="Local albums" />}
        {show('spotify') && spotify.status === 'connected' && (
          <>
            {spotify.searching && <p className="px-2 pb-3 text-xs text-muted">Searching Spotify…</p>}
            <Grid albums={spotifyResults} label="Spotify search" />
            <Grid albums={saved} label="Saved on Spotify" />
          </>
        )}
        {show('spotify') && spotify.status !== 'connected' && filter === 'spotify' && (
          <div className="mx-2 mb-6 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            {spotify.status === 'unconfigured' ? (
              <p>Spotify isn’t configured for this deployment. Add a client ID in <code className="font-mono text-xs">.env</code> to browse your Spotify library here.</p>
            ) : (
              <p>
                <button type="button" className="font-medium text-accent-ink underline underline-offset-2" onClick={() => void loginSpotify()}>
                  Connect Spotify
                </button>{' '}
                to turn your saved albums into virtual CDs.
              </p>
            )}
          </div>
        )}
        {nothing && query && <p className="px-3 py-6 text-center text-sm text-muted">No discs match “{query}”.</p>}

        <div className="mx-1 mb-6 rounded-2xl border border-dashed border-line p-4 text-center">
          <p className="text-sm text-ink-soft">Add your own music</p>
          <p className="mt-1 text-xs text-muted">Drop audio files here, or choose files or a folder. Files stay in this browser.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => files.current?.click()} disabled={importing}>
              <Icon name="plus" size={14} /> {importing ? 'Importing…' : 'Choose files'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => folder.current?.click()} disabled={importing}>
              Folder
            </Button>
          </div>
          <input ref={files} type="file" accept="audio/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <input
            ref={folder}
            type="file"
            multiple
            hidden
            {...({ webkitdirectory: '' } as Record<string, string>)}
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
      </div>

      {selected && (
        <div className="border-t border-line bg-surface/60 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{selected.title}</p>
              <p className="truncate text-xs text-muted">{selected.artist}</p>
            </div>
            {selected.source === 'local' && selected.id !== insertedId && (
              <button
                type="button"
                className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink"
                aria-label={`Remove ${selected.title} from shelf`}
                title="Remove from shelf"
                onClick={() => {
                  if (confirm(`Remove “${selected.title}” and its stored audio from this browser?`)) void removeAlbum(selected.id);
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            )}
            <Button variant="solid" size="sm" onClick={() => void insertDisc(selected.id)} disabled={selected.id === insertedId}>
              <Icon name="disc" size={15} /> {selected.id === insertedId ? 'In player' : 'Insert disc'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
