import { usePlayer } from '../state/store';
import { useHifi } from '../hifi/store';
import { Icon, IconButton } from './ui';
import { BurnCD } from './BurnCD';

export function TopNav() {
  const theme = usePlayer((s) => s.settings.theme);
  const update = usePlayer((s) => s.updateSettings);
  const setUi = usePlayer((s) => s.setUi);

  const view = useHifi((s) => s.view);
  const setView = useHifi((s) => s.setView);
  const jump = (id: string, tab: 'library' | 'playing') => {
    setView('player');
    setUi({ mobileTab: tab });
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el?.focus({ preventScroll: true });
    });
  };

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-6">
        <a href="/" className="flex items-baseline gap-2 rounded-md" aria-label="DiscDeck home">
          <span className="font-display text-[22px] font-light leading-none tracking-tight sm:text-[26px]">DiscDeck</span>
        </a>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          <button type="button" onClick={() => jump('library', 'library')} className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2/60">
            Library
          </button>
          <button type="button" onClick={() => jump('now-playing', 'playing')} className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2/60">
            Now Playing
          </button>
        </nav>
        <div role="tablist" aria-label="Mode" className="flex rounded-full border border-line p-0.5">
          {(['player', 'room'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              aria-label={v === 'player' ? 'Player' : 'Hi-Fi Room'}
              onClick={() => setView(v)}
              className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${view === v ? 'bg-ink text-bg' : 'text-ink-soft hover:text-ink'}`}
            >
              {v === 'player' ? 'Player' : (
                <>
                  Hi-Fi<span className="hidden sm:inline"> Room</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <BurnCD />
        <IconButton label="Settings" onClick={() => setUi({ settingsOpen: true })}>
          <Icon name="settings" />
        </IconButton>
        <IconButton
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark listening-room theme'}
          onClick={() => update({ theme: theme === 'dark' ? 'light' : 'dark' })}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </IconButton>
      </div>
    </header>
  );
}
