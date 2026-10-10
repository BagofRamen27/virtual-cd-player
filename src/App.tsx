import { useEffect } from 'react';
import { usePlayer } from './state/store';
import { TopNav } from './components/TopNav';
import { Shelf } from './components/Shelf';
import { PlayerStage } from './components/PlayerStage';
import { NowPlaying } from './components/NowPlaying';
import { SettingsDialog } from './components/SettingsDialog';
import { ScratchEditor } from './components/ScratchEditor';
import { NoticeToast } from './components/NoticeToast';
import { useMediaQuery } from './lib/useMediaQuery';
import { useHifi } from './hifi/store';
import { startHifiBridge } from './hifi/bridge';
import { audioEngine } from './audio/AudioEngine';
import { prewarmDemo } from './audio/demoAlbum';
import { RackView } from './hifi/ui/RackView';

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLInputElement) return el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'button';
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const s = usePlayer.getState();
      const key = e.key.toLowerCase();
      const onButton = e.target instanceof HTMLButtonElement;
      if (key === ' ' && !onButton) {
        e.preventDefault();
        void s.togglePlay();
      } else if (key === 'arrowright' || key === 'arrowleft') {
        const dir = key === 'arrowright' ? 1 : -1;
        e.preventDefault();
        if (e.shiftKey) void (dir > 0 ? s.next() : s.prev());
        else if (s.insertedAlbumId) void s.seek(Math.max(0, Math.min(s.duration - 0.1, s.position + dir * 5)));
      } else if (key === 's') void s.stop();
      else if (key === 'o') s.toggleLid();
      else if (key === 'i') void s.insertDisc();
      else if (key === 'e') void s.eject();
      else if (key === 'r') s.resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const ready = usePlayer((s) => s.ready);
  const theme = usePlayer((s) => s.settings.theme);
  const mobileTab = usePlayer((s) => s.mobileTab);
  const setUi = usePlayer((s) => s.setUi);
  const desktop = useMediaQuery('(min-width: 1024px)');

  const view = useHifi((s) => s.view);
  useEffect(() => {
    void usePlayer.getState().init();
    startHifiBridge();
    prewarmDemo();
    // Unlock audio on the first real interaction (required on phones, harmless elsewhere).
    const unlock = () => audioEngine.unlock();
    const opts = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('touchend', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('touchend', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d1815' : '#F4EFE7');
  }, [theme]);
  useKeyboardShortcuts();

  return (
    <div className="flex h-full flex-col">
      <a href="#library" className="sr-only-focusable fixed left-3 top-3 z-50 rounded-full bg-surface px-4 py-2 text-sm shadow">
        Skip to library
      </a>
      <TopNav />
      {!ready ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">Opening the shelf…</div>
      ) : view === 'room' ? (
        <main className="flex min-h-0 flex-1 flex-col">
          <RackView />
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:grid-rows-1 xl:grid-cols-[330px_minmax(0,1fr)_370px]">
          {desktop && (
            <aside aria-label="Library" className="min-h-0 border-r border-line">
              <Shelf />
            </aside>
          )}
          <div className="min-h-0">
            <PlayerStage />
          </div>
          {desktop && (
            <aside aria-label="Now playing" className="min-h-0 border-l border-line">
              <NowPlaying />
            </aside>
          )}

          {/* Mobile bottom sheet */}
          {!desktop && (
          <div className="flex h-[44vh] flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_30px_-20px_rgba(37,31,27,0.4)]">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-2" aria-hidden="true" />
            <div role="tablist" aria-label="Panels" className="flex gap-1 px-4 pt-2">
              {(['library', 'playing'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={mobileTab === t}
                  onClick={() => setUi({ mobileTab: t })}
                  className={`h-9 flex-1 rounded-full text-sm font-medium ${mobileTab === t ? 'bg-ink text-bg' : 'text-ink-soft'}`}
                >
                  {t === 'library' ? 'Library' : 'Now playing'}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="min-h-0 flex-1">
              {mobileTab === 'library' ? <Shelf /> : <NowPlaying />}
            </div>
          </div>
          )}
        </main>
      )}
      <SettingsDialog />
      <ScratchEditor />
      <NoticeToast />
    </div>
  );
}
