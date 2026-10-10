import { usePlayer } from '../state/store';
import { redirectUri, spotifyConfigured } from '../spotify/auth';
import { SPOTIFY_ENABLED } from '../spotify/config';
import { store } from '../db/idb';
import { Button, Dialog } from './ui';

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-10 rounded-full bg-surface-2 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['S', 'Stop'],
  ['← / →', 'Seek 5 seconds'],
  ['Shift + ← / →', 'Previous / next track'],
  ['O', 'Open / close lid'],
  ['I', 'Insert selected disc'],
  ['E', 'Eject'],
  ['R', 'Reset 3D view'],
];

export function SettingsDialog() {
  const open = usePlayer((s) => s.settingsOpen);
  const settings = usePlayer((s) => s.settings);
  const spotify = usePlayer((s) => s.spotify);
  const { updateSettings, setUi, logoutSpotify, loginSpotify } = usePlayer.getState();
  const close = () => setUi({ settingsOpen: false });

  return (
    <Dialog open={open} onClose={close} title="Settings">
      <section className="divide-y divide-line">
        <label className="flex items-center justify-between gap-4 py-3">
          <span className="text-sm">Theme</span>
          <select
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as 'light' | 'dark' })}
            className="h-9 rounded-full border border-line bg-surface px-3 text-sm"
          >
            <option value="light">Warm ivory</option>
            <option value="dark">Listening room (dark)</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-4 py-3">
          <span>
            <span className="block text-sm">3D quality</span>
            <span className="block text-xs text-muted">Low disables real-time shadows and caps resolution.</span>
          </span>
          <select
            value={settings.quality}
            onChange={(e) => updateSettings({ quality: e.target.value as 'high' | 'low' })}
            className="h-9 rounded-full border border-line bg-surface px-3 text-sm"
          >
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </label>
        <Toggle label="2D player" hint="Use a lightweight flat player instead of the 3D stage." checked={settings.force2D} onChange={(v) => updateSettings({ force2D: v })} />
        <Toggle label="Mechanical sounds" hint="Quiet button clicks and lid sounds." checked={settings.sounds} onChange={(v) => updateSettings({ sounds: v })} />
      </section>

      {SPOTIFY_ENABLED && <section className="mt-6">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Spotify</h3>
        {!spotifyConfigured() ? (
          <div className="rounded-2xl bg-surface-2/50 p-4 text-sm text-ink-soft">
            <p>Spotify is not configured for this deployment, so DiscDeck is running in demo mode with local files.</p>
            <p className="mt-2 text-xs text-muted">
              To enable it, create an app in the Spotify Developer Dashboard, add <code className="font-mono">{redirectUri()}</code> as a Redirect URI, and set{' '}
              <code className="font-mono">VITE_SPOTIFY_CLIENT_ID</code> in <code className="font-mono">.env</code>. See the README.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-2/50 p-4 text-sm text-ink-soft">
            {spotify.status === 'connected' ? (
              <>
                <p>
                  Connected as <strong className="font-medium text-ink">{spotify.user?.display_name ?? spotify.user?.id}</strong>
                  {spotify.user?.product ? ` (${spotify.user.product})` : ''}.
                </p>
                {spotify.message && <p className="mt-1 text-xs text-muted">{spotify.message}</p>}
                <Button size="sm" className="mt-3" onClick={() => void logoutSpotify()}>
                  Disconnect
                </Button>
              </>
            ) : (
              <>
                <p>{spotify.status === 'error' ? spotify.message : 'Not connected.'}</p>
                <Button size="sm" variant="solid" className="mt-3" onClick={() => void loginSpotify()}>
                  Connect Spotify
                </Button>
              </>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Playback uses Spotify’s official Web Playback SDK and requires Premium. Spotify audio is never recorded or modified; scratched Spotify discs skip using Spotify’s own seek control.
            </p>
          </div>
        )}
      </section>}

      <section className="mt-6">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Keyboard</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md border border-line bg-surface-2/50 px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
              </dt>
              <dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 border-t border-line pt-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (!confirm('Remove all imported albums, stored audio, scratch profiles and settings from this browser?')) return;
            await store.clearAll();
            location.reload();
          }}
        >
          Clear local data
        </Button>
      </section>
    </Dialog>
  );
}
