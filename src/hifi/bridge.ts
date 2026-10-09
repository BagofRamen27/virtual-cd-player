import { audioEngine } from '../audio/AudioEngine';
import { activeAdapterKind, spotifyAdapter, usePlayer } from '../state/store';
import { computeDspParams, type DspParams } from './dsp';
import { currentAmpState, currentRoute, profileFor, rackOf, useHifi } from './store';

/**
 * HardwareControlBindings: the single place where UI state (player volume, rack, cables,
 * amp knobs, A/B settings) becomes real audio parameters.
 *
 * Local / demo audio → full DSP chain.
 * Spotify → its audio can't be routed through Web Audio (and may not be altered), so only the
 *           resulting *volume* (including silence for an invalid route) is sent to the
 *           Spotify player; tone and speaker/headphone emulation are visual-only.
 */
export function currentDspParams(): DspParams {
  const h = useHifi.getState();
  const p = usePlayer.getState();
  const rack = rackOf(h.rackIds);
  const route = currentRoute(h);
  const sourceVolume = rack.source && rack.source.id !== 'dd1' ? (h.sourceVolumes[rack.source.id] ?? 0.6) : p.settings.volume;
  return computeDspParams({
    route,
    amp: rack.amp,
    ampState: currentAmpState(h),
    profile: profileFor(route),
    sourceVolume,
    settings: { bypass: h.bypass, levelMatch: h.levelMatch, intensity: h.intensity },
  });
}

let started = false;

export function startHifiBridge() {
  if (started) return;
  started = true;
  let last = '';
  const sync = () => {
    const params = currentDspParams();
    const key = JSON.stringify(params) + activeAdapterKind();
    if (key === last) return;
    last = key;
    audioEngine.setDsp(params);
    // Spotify: volume only (never processing).
    const spotifyVolume = Math.min(1, params.routeGain * params.sourceGain * (params.throughAmp ? params.ampGain : 1));
    spotifyAdapter.setVolume(spotifyVolume);
  };
  useHifi.subscribe(sync);
  usePlayer.subscribe((s, prev) => {
    if (s.settings.volume !== prev.settings.volume || s.insertedAlbumId !== prev.insertedAlbumId) sync();
  });
  sync();
}
