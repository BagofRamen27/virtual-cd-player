# DiscDeck

A cozy 3D virtual CD player. Browse a shelf of jewel cases, pick up a disc, open the smoked-acrylic lid, drop it onto the spindle and listen. Local audio files can be scratched, and the scratches skip, stutter and drop out in the same places every time you play the disc.

Built with React, TypeScript, Vite, Tailwind CSS, React Three Fiber, Three.js and Drei. Local audio runs through the Web Audio API and an AudioWorklet. Spotify uses its official PKCE login and the Web Playback SDK.

## Quick start

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. No configuration is needed. Without Spotify credentials DiscDeck runs in **demo mode**, which is labelled in the header:

- **Evening Session** is a demo disc of three short ambient pieces synthesized in your browser, so nothing is downloaded and no licensing is involved.
- **Add your own music** with *Choose files* / *Folder*, or by dropping audio files on the shelf. Files are stored in your browser (IndexedDB) and never uploaded anywhere.

Requires Node 22.18 or newer (the unit tests use Node's built-in TypeScript support).

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on `127.0.0.1:5173` |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests for the deterministic damage model |
| `npm run typecheck` | TypeScript only |

## Using the player

- **Select** a disc by clicking its jewel case. Hovering slides the disc out.
- **Insert** it by double-clicking the case, pressing *Insert disc*, dragging the case onto the player, or clicking the empty disc well while the lid is open.
- **Open or close the lid** by clicking the lid itself or using *Open lid / Close lid*. Opening the lid during playback pauses, like a real portable. Pressing play with the lid open closes it first.
- **Use the transport** with the physical buttons on the 3D player or the matching buttons below it: power, previous, play/pause, stop, next and eject. The amber LCD shows track, time and state. If you press play with no disc, the app tells you what to do.
- **Move the camera**: drag to orbit, scroll or pinch to zoom, and use *Reset view* to return. Angles and distance are limited so you can't lose the player.
- **Disc condition**: Mint, Light, Used, Scratched, Damaged or Unplayable, in the Now Playing panel.
- **Scratch editor**: paint scratches onto the disc, erase them, set their depth and turn the disc. Hovering shows which track and time a spot on the disc corresponds to. *Add scratch precisely* places a scratch from sliders, so you can do it without a pointer. *Clean disc* resets all damage.

### Keyboard

| Key | Action |
| --- | --- |
| Space | Play / pause |
| S | Stop |
| ← / → | Seek 5 s |
| Shift + ← / → | Previous / next track |
| O | Open / close lid |
| I | Insert selected disc |
| E | Eject |
| R | Reset 3D view |

Everything in the 3D scene also has a DOM control: transport buttons, a seek slider, a track list, volume, and condition radios. Player state is announced through a polite live region, so screen readers hear it.

## How the scratch simulation works (local audio only)

A real CD is read from the inside out at constant linear velocity, so the playback time reached at radius *r* grows with *r²*. DiscDeck stores scratches as polar strokes on the disc and maps them onto the album timeline the same way (`src/audio/damage.ts`):

- **Arced scratches** run along the spiral track and wreck a short stretch of audio. They produce repeats ("stuck" CD), skips, dropouts with a slow tracking recovery, and stutters.
- **Radial scratches** cross many turns of the spiral but only briefly on each turn, so they produce sparse micro-clicks over a longer stretch.
- **Condition levels** add seeded wear marks. Damaged and Unplayable discs also lose tracking periodically across the whole program.
- Every random choice is seeded from the disc's ID and each stroke's ID, so the same disc fails at the same places on every play. This is covered by unit tests.

The audio runs in an AudioWorklet (`src/audio/scratch-worklet.js`) that plays the decoded track and applies the events. Every discontinuity goes through a short gain ramp, and the output passes through a gentle limiter. The result is audible damage without harsh clicks or loud peaks.

Damage profiles are saved per album in IndexedDB.

## Spotify setup

Spotify is optional. Without it, the app says so plainly and never pretends to be connected.

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Under **Redirect URIs** add `http://127.0.0.1:5173/callback` for local development. Add `https://<your-domain>/callback` for production. Spotify requires HTTPS or a loopback IP literal; `localhost` is not accepted.
3. Under **APIs used**, enable **Web API** and **Web Playback SDK**.
4. Copy `.env.example` to `.env` and fill it in:

   ```bash
   VITE_SPOTIFY_CLIENT_ID=your_client_id
   VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
   ```

5. Restart `npm run dev` and click **Connect Spotify**.

**Who can connect:** while your Spotify app is in *development mode*, only the Spotify accounts you add under **Users and Access** in the dashboard can log in. Opening it to the public requires applying to Spotify for extended quota.

**What works:**
- Login uses Authorization Code with PKCE. No client secret exists anywhere in this code.
- Your saved albums appear on the shelf as virtual CDs. Press Enter in the search box to search Spotify's catalogue.
- With **Spotify Premium**, the Web Playback SDK creates a "DiscDeck" device in your browser and plays the album for real.
- Transport, progress, the track list, the LCD and the spinning disc follow the SDK's own reported state. Nothing about playback is simulated.

**Limitations, by design and by Spotify's terms:**
- Free accounts can browse but cannot play in the browser. DiscDeck says this clearly.
- Spotify audio is never captured, recorded, processed or altered. Scratches on Spotify discs are cosmetic only, and the UI says so.
- Artwork and metadata are attributed to Spotify, and each album links back with *Open in Spotify*.
- The Web Playback SDK needs a desktop browser with DRM (EME) support. Some mobile browsers, and Chromium builds without Widevine, report an initialization error, which DiscDeck displays.
- Spotify periodically changes which Web API endpoints are open to development-mode apps. If a request is refused, the error message is shown as-is.

> Note: the Spotify flow is implemented against Spotify's documented APIs but has not been run end-to-end with real credentials in this repository's automated checks. Local playback, scratches, persistence and the 3D interactions have been exercised in a headless Chromium run.

## Deploying to Vercel (or any static host)

DiscDeck is a static single-page app.

1. Import this repository into [Vercel](https://vercel.com/new). It auto-detects Vite: the build command is `npm run build` and the output directory is `dist`.
2. Add the environment variables `VITE_SPOTIFY_CLIENT_ID` and `VITE_SPOTIFY_REDIRECT_URI` (`https://<your-app>.vercel.app/callback`) if you want Spotify. Then add that same redirect URI in the Spotify dashboard.
3. Deploy. `vercel.json` rewrites every path to `index.html`, so the `/callback` route works.

On Netlify, Cloudflare Pages or GitHub Pages, use the same build settings plus an SPA fallback (all paths → `index.html`).

## Project structure

```
src/
  App.tsx                     layout, theme, keyboard shortcuts, mobile bottom sheet
  types.ts                    Album, Track, PlayerState, DamageProfile…
  state/store.ts              zustand store: player state machine + actions
  audio/
    AudioEngine.ts            Web Audio graph (worklet → volume → limiter)
    scratch-worklet.js        AudioWorklet: playback + damage events
    damage.ts                 deterministic scratch → timeline model (pure, tested)
    demoAlbum.ts              procedurally synthesized demo disc
    sfx.ts                    optional mechanical sounds (off by default)
  playback/
    PlaybackAdapter.ts        shared adapter interface
    LocalAudioPlaybackAdapter.ts
    SpotifyPlaybackAdapter.ts Web Playback SDK, real state only
  spotify/auth.ts, api.ts     PKCE login, token refresh, Web API calls
  db/idb.ts                   IndexedDB: albums, audio blobs, damage, settings
  lib/                        ID3 reader, importer, cover art, LCD text, helpers
  three/
    Stage.tsx                 canvas, lights, camera limits, shadows
    CDPlayer3D.tsx            body, deck, well, buttons, LCD
    Lid3D.tsx                 hinged acrylic lid
    Disc3D.tsx                disc, label, motion blur, scratches, insert animation
    WarmEnvironment.tsx       locally generated studio lighting (no HDR download)
    textures.ts               canvas-drawn label, scratches, LCD, glyphs, walnut
  components/                 Shelf, JewelCase, NowPlaying, TransportControls,
                              LCDDisplay, ScratchEditor, SettingsDialog, Player2D…
tests/damage.test.ts
```

### Player state machine

`EMPTY → LOADING → READY ⇄ PLAYING ⇄ PAUSED → STOPPED`. From any loaded state you can go to `EJECTING → EMPTY`, and loading or playback failures go to `ERROR`. Invalid transitions are rejected (see `TRANSITIONS` in `store.ts`). `PLAYING` and `PAUSED` are set from the adapter's reported status, not from button presses, so the 3D disc only spins while audio is really advancing.

## Performance notes

- **The 3D model is procedural.** It's built from Three.js primitives and canvas textures, so there are no model or HDR files to download. The environment map is rendered once, at load.
- **The 3D code is split out.** `three` and the R3F/Drei code ship as separate chunks, and the 3D stage is lazy-loaded.
- **Settings → 3D quality → Low** turns off real-time shadows, caps the pixel ratio at 1, and renders contact shadows once.
- **Fallbacks:** *2D player* mode, and an automatic 2D fallback when WebGL is missing or crashes, give a usable flat player.
- **Reduced motion:** with `prefers-reduced-motion`, lid, insertion and camera motion become near-instant and the disc spins slowly.
- **Memory:** local tracks are fully decoded into memory, one track at a time, so the worklet can jump around freely. A very long single file (an hour or more) uses a lot of RAM.

## Deferred / not yet built

- Gapless playback between tracks, and preloading the next track.
- Pointer drag-and-drop of the 3D disc itself. Inserting by dragging the jewel case onto the player, or by clicking, is implemented.
- Embedded artwork and tags for formats other than MP3/ID3v2 (FLAC/M4A files fall back to the file name and generated art).
- Editing album titles and artists after import.
- Separate visual scratches on the disc's underside. Scratches are drawn on the visible surface.
