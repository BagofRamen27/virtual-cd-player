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

## How the scratch simulation works

A real CD is read from the inside out at constant linear velocity, so the playback time reached at radius *r* grows with *r²*. DiscDeck stores scratches as polar strokes on the disc and maps them onto the album timeline the same way (`src/audio/damage.ts`):

- **Arced scratches** run along the spiral track and wreck a short stretch of audio. They produce repeats ("stuck" CD), skips, dropouts with a slow tracking recovery, and stutters.
- **Radial scratches** cross many turns of the spiral but only briefly on each turn, so they produce sparse micro-clicks over a longer stretch.
- **Condition levels** add seeded wear marks and dust, fingerprint smudges and haze. Every level above Mint also loses tracking periodically, from an occasional click on a Light disc to a skip every few seconds on an Unplayable one. The first problem always arrives within about 15 seconds.
- **The classic CD skip** (`skipburst`): a tiny fragment stutters a few times ("ch-ch-ch"), then the laser jumps ahead.
- **You can see every glitch:** the disc jolts and its spin hiccups, the LCD flashes SKIP / TRACKING / SEARCH, and Now Playing shows "Skipped at 1:23".
- Every random choice is seeded from the disc's ID and each stroke's ID, so the same disc fails at the same places on every play. This is covered by unit tests.

The audio runs in an AudioWorklet (`src/audio/scratch-worklet.js`) that plays the decoded track and applies the events. Every discontinuity goes through a short gain ramp, and the output passes through a gentle limiter. The result is audible damage without harsh clicks or loud peaks.

Damage profiles are saved per album in IndexedDB.

## Hi-Fi Room (virtual hi-fi lab) — Phase 1

Switch to **Hi-Fi Room** in the header. You build a small system from period gear, wire it with typed cables, and hear the result through a real Web Audio DSP chain.

### What's in Phase 1

| Slot | Equipment (original, fictional designs, *inspired by* a category) |
| --- | --- |
| Sources | **DiscDeck DD-1** (the existing portable: fixed 3.5 mm line out plus a volume-controlled headphone jack) · **Sundown CD Boombox** (2000s, built-in speakers, headphone jack mutes them) |
| Amplifier | **Ashford A-60** (1980s silver-faced integrated): power, volume, bass, treble, balance, loudness, CD/AUX selector, Speakers A, 6.35 mm phones jack (mutes speakers), real VU meters |
| Speakers | **Walnut Monitor B2** (premium bookshelf) · **Budget Mini Speakers** |
| Headphones | **Studio Monitor Headphones** · **Bundled Earbuds** |

The 3D knobs and buttons work for real: drag to turn, scroll to nudge, double-click to reset. Every control also has a slider or toggle in the inspector, so the whole room works from the keyboard. The VU meters, speaker cones and boombox grilles move with the actual analysed output signal, not a canned animation.

### Wiring

The **Wiring (back panels)** tab shows every jack. Click a jack and then another to connect them, or drag between them; click a connected jack to unplug it. While you hold a cable, compatible jacks glow and incompatible ones dim. Connections are checked by a typed-port system (`src/hifi/routing.ts`):

- **Valid:** CD line out → amp CD/AUX in (3.5 mm→RCA), amp Speakers A → passive speakers (speaker wire), headphones into the amp's or source's Phones jack (the 6.35 mm adapter is used automatically).
- **Refused, with a reason:** speakers on an unamplified line out, speaker-level output into headphones or a line input, output → output, and a second cable in an occupied jack.
- **Routing rules:** the amp's input selector chooses what you hear. Selecting an input with nothing plugged in gives silence plus an explanation. A switched-off amp is silent. Plugging in headphones mutes the speakers (a per-model rule), and unplugging them brings the speakers back.

**Auto-connect** and the **Setups** presets (*Living-room hi-fi*, *2003 Bedroom Boombox*, *Budget 1998 Dorm*, *Late-night headphones*, *Portable + earbuds*) wire a system in one click. Your rack, cables and per-amp knob settings persist across reloads and gear swaps. Cables the new gear can't accept are unplugged, and the app tells you so.

### Audio chain (`src/hifi/HifiChain.ts`)

```
scratch worklet → route/source gain → amp tone (bass/treble shelves + loudness) → balance → amp volume
   ├─ emulation: speaker/headphone EQ → level-dependent soft clipper → width / channel mismatch / level trim
   └─ bypass (reference)
→ meters → limiter → output
```

- **Volume** uses an audio taper (0 dB maximum, never above unity) and is smoothed, so it never clicks. A gentle limiter follows the chain.
- **Bass and treble** are real ±12 dB shelves. **Loudness** lifts lows (and a little of the highs) more as the volume drops.
- **Speaker and headphone profiles** combine EQ, resonances, bass roll-off, stereo width, channel mismatch and drive-dependent distortion. The boombox narrows the stereo image and squashes/distorts as you turn it up.
- **Compare tools:** *Emulation bypass* (reference), *level-matched* switching (on by default, so cheap vs premium comparisons aren't just "louder wins"), and an *emulation intensity* slider (0 = neutral).
- **Live displays:** the inspector shows a frequency-response plot of the whole chain, input and output meters, and a clipping indicator.
- **All gear is always in the graph.** Changing equipment retunes parameters rather than rebuilding the graph, so swaps don't glitch.

### Honesty notes

- **No measured data.** All sound profiles are labelled *Illustrative*. None of them is a measurement of a real product, and no brand or model is claimed.
- **Cables don't change the tone.** Ordinary working cables don't meaningfully change the sound, so cables here define the route, not the tone. (A deliberately faulty cable is a possible later, explicitly fictional option.)
- **Spotify: visual-only emulation.** Spotify audio plays inside Spotify's protected player and can't be routed through Web Audio, and Spotify's terms don't allow altering it. For a Spotify disc, only the resulting **volume** reaches it, including silence when the route is invalid. Tone, speaker and headphone emulation are shown as visual-only. Full DSP applies to local files and the demo disc.
- **The DD-1's line out is fixed-level**, as on real portables: its volume control only affects the headphone jack.

### Audible A/B check (demo disc)

1. **Load the setup.** In *Hi-Fi Room*, choose **Living-room hi-fi**, insert *Evening Session* from the disc menu, and press play.
2. **Bass.** Drag the amp's **Bass** knob to +12 dB. The low pads get noticeably fuller, and the dashed and solid curves separate below ~150 Hz.
3. **Volume.** Turn the big **Volume** knob. The level changes smoothly and the VU needles follow.
4. **Silence.** Set the input selector to **AUX**. You get silence and an amber explanation. Set it back to **CD**.
5. **Speakers.** Click **Swap to budget mini speakers**. The bass gets thinner and the sound boxier at a similar loudness. Toggle **Emulation on/off** for the reference.
6. **Headphones.** Load **Late-night headphones**, then swap studio headphones ↔ earbuds. The earbuds are thinner and brighter, at a matched level.
7. **Boombox.** Load **2003 Bedroom Boombox** and turn its volume knob up. It's narrow and boxy, and compresses when pushed.

Automated checks: `tests/hifi.test.ts` covers connector validation, route construction (including headphone insertion/removal and device swaps) and control mapping (taper, a ±12 dB bass shelf measured at 30 Hz vs 2 kHz, balance, loudness, profile differences, neutral intensity).

### Coming in later phases

More eras and devices (a 1980s tray-loading player, 1990s changer and receiver, 2000s mini system, a modern transport with optical/coax into a DAC amp), more speaker and headphone profiles, anti-skip on the portable, separates (preamp + power amp), room acoustics, and a blind level-matched comparison lab.

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
- Spotify audio is never captured, recorded, processed or altered. A scratched Spotify disc still skips, but only through the Web Playback SDK's own `seek()`, the same thing a listener does when scrubbing. Skips, repeats and stutters are approximated with quick seeks, but clicks and dropouts would mean altering the audio, so they are not used on Spotify.
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
