# DiscDeck performance audit

Completed against main commit `99ffa1567dc1985d403383173464420637185069` on October 11, 2026. Claude's shader warm-up, WebGL detection, mobile audio unlock, cached demo audio and Player/Hi-Fi routing fixes were retained.

## Findings and changes

| Priority | Finding | Change | Evidence |
| --- | --- | --- | --- |
| 1 | The closed scratch editor and a shared canvas utility eagerly pulled Three.js into initial loading. Manual chunks also put React in the 3D dependency chain. | Lazy-load the editor, separate canvas drawing from GPU conversion, and explicitly isolate React and renderer chunks. | Clean production manifests show the initial JavaScript dependency closure shrinking from 1,421,760 to 395,073 bytes. |
| 2 | Player and room kept rendering static scenes. High settings used expensive shadows and unlimited DPR on some devices. | Demand rendering; sleep when idle, hidden or offscreen; activity wakes animations. Add Automatic, High, Balanced, Low and 2D profiles with DPR/resource caps. | Production player frame counter stayed at 6 across separate observations after settling. Background throttling prevents a reliable active FPS comparison. |
| 3 | Whole-album tracks allocated a cropped AudioBuffer and then another worklet transport copy. | Transfer the selected sample range directly from the shared decoded album. | Production silent-WAV regression passed all three segments and PCM byte accounting. Saves one song-sized float buffer by inspection. |
| 4 | Successfully persisted files were also retained in the session fallback Map. Shelf textures were not explicitly disposed. | Keep fallback blobs only when persistence fails; clear fallback entries on removal; dispose locally owned shelf textures. | Source/lifecycle review. Long-session browser heap measurements remain pending. |
| 5 | The hardware CD display subscribed to every playback position update. Idle VU updates repeatedly allocated React state. | Select only display fields and whole seconds; retain unchanged meter state. | Source review; live metering algorithms remain unchanged. |
| 6 | An empty or fully paused worklet zeroed samples one at a time. | Zero idle output channels once per block, preserving active playback and pause fades. | Idle-output regression test and synthetic benchmark below. |

## Measured production JavaScript

Both builds used the same installed dependencies and Vite production settings. Totals follow the manifest's static imports recursively from `index.html`, count each JavaScript file once, and sum gzip-compressed files. They exclude CSS, worklet loading, and dynamic scene imports. They describe the initial 2D/UI dependency path; entering a 3D scene still downloads its renderer.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Static initial JS, raw | 1,421,760 bytes | 395,073 bytes | 72.2% |
| Static initial JS, gzip | 409,642 bytes | 126,641 bytes | 69.1% |

No network startup-time or time-to-interactive improvement is claimed. Loading the renderer is deferred rather than removed.

## Rendering observations and limits

Earlier local production samples in the Codex browser, at DPR 1, recorded Player High around 59.9 FPS (mean 16.7 ms, p95 17.3 ms), Room High around 40.9 FPS (mean 24.4 ms, p95 42.9 ms), and Room Low around 55.3 FPS (mean 18.1 ms, p95 19.7 ms). These are individual baseline samples, not representative device averages.

Later background samples were throttled to roughly 1–2 FPS even during a forced continuous-render test. They are unsuitable for before/after performance claims. The player resting counter was stable; profile switching and the room view rendered successfully. Real foreground desktop/phone frame-time runs remain necessary.

High caps DPR at 1.75, Balanced at 1.25 and Low at 1. Low disables dynamic shadows and limits animation scheduling to approximately 30 FPS. Balanced uses smaller shadow/environment targets and a static contact shadow. Automatic uses capability defaults and sustained frame-time windows with a 20-second cooldown; manual settings are preserved. Choosing Automatic again restarts adaptation. Graphics profiles never reduce audio sample rate or change DSP parameters.

## Audio benchmark and memory estimate

A Node VM benchmark ran the worklet directly without audio output: stereo, 44.1 kHz, 128 frames/block, 100 warm-up blocks, 10,000 measured blocks, five trials, median wall time. That represents approximately 29 seconds of simulated audio per trial.

| Worklet workload | Before median | After median |
| --- | ---: | ---: |
| Fully idle | 3.6403 ms | 0.6249 ms |
| Active | 15.4511 ms | 14.5331 ms |

Idle loop wall time fell about 83% in this synthetic test. Active samples overlap in variability; this is not evidence of a material active-playback speedup or a browser underrun measurement.

Analytical estimate: five minutes of stereo float PCM at 44.1 kHz occupies 105,840,000 bytes (about 101 MiB). Removing the cropped intermediate buffer saves that amount for a five-minute segment. A full 80-minute album still requires about 1.58 GiB for its decoded stereo float data, plus the current worklet song and browser overhead. Streaming decode is not implemented, so very large albums can still exceed mobile memory limits.

## Verification

- TypeScript build passed; clean Vite production build passed.
- All 65 automated tests passed, including damage/skip behavior, routing/DSP, VU response, track boundaries, burn backups and the new graphics/idle-worklet checks.
- Production browser harness decoded a disposable silent stereo WAV, selected three album segments, exercised next/previous, play, pause, seek, stop and unload, and verified transferred PCM size and cache release. Fixture audio was removed afterward. No audible music was played.
- Graphics overrides persisted after reload; lightweight diagnostics and precise scratch controls opened successfully. Player and room views rendered successfully. Temporary audit controls were removed from published source.

Diagnostics are opt-in, local, and display rendering activity, approximate frame times, WebGL availability, audio context state and retained PCM estimates. They do not collect or upload telemetry.

## Remaining release checks

Test a foreground production preview on a modest Windows laptop, Android Chrome and iOS Safari. Exercise local-file import, whole-album markers, cover replacement, long playback, scratched discs, physical knobs, wiring and repeated scene switches. Record foreground frame times, memory trends and audio interruptions. iOS permission behavior, real touch interaction and multi-hour memory stability were not validated on physical devices during this audit. Do not describe this work as universal phone certification.

The broader roadmap and sticker customization remain deferred, as requested.
