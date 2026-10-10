import { audioEngine } from '../audio/AudioEngine';
import { usePlayer } from '../state/store';
import { computeDspParams, type DspParams } from './dsp';
import { currentAmpState, currentRoute, profileFor, rackOf, useHifi } from './store';

/**
 * HardwareControlBindings: the single place where UI state (player volume, rack, cables,
 * amp knobs, A/B settings) becomes real audio parameters.
 *
 * Local / demo audio → full DSP chain.
 */
export function currentDspParams(): DspParams {
  const h = useHifi.getState();
  const p = usePlayer.getState();
  const rack = rackOf(h.rackIds);
  // The rack only shapes the sound inside the Hi-Fi Room; the Player page always plays directly.
  const route = currentRoute({ ...h, enabled: h.enabled && h.view === 'room' });
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
    const key = JSON.stringify(params);
    if (key === last) return;
    last = key;
    audioEngine.setDsp(params);
  };
  useHifi.subscribe(sync);
  usePlayer.subscribe((s, prev) => {
    if (s.settings.volume !== prev.settings.volume || s.insertedAlbumId !== prev.insertedAlbumId) sync();
  });
  sync();
}
