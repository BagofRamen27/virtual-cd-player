import { useEffect, useState } from 'react';
import { useGraphicsProfile, usePerformance } from '../state/performance';
import { graphicsInfo } from '../lib/webgl';
import { audioEngine } from '../audio/AudioEngine';
import { usePlayer } from '../state/store';
import { GRAPHICS } from '../lib/graphicsPolicy';
export function PerformanceDiagnostics() {
  const profile = useGraphicsProfile(), stats = usePerformance(s => s.stats), reason = usePerformance(s => s.reason);
  const mode = usePlayer(s => s.settings.graphicsMode), state = usePlayer(s => s.state);
  const [audio, setAudio] = useState(audioEngine.diagnostics);
  useEffect(() => { const timer = setInterval(() => setAudio(audioEngine.diagnostics), 1000); return () => clearInterval(timer); }, []);
  return <div className="my-3 space-y-1 rounded-xl border border-line p-3 text-xs text-ink-soft" aria-label="Performance diagnostics">
    <p>Graphics: {profile} · DPR {stats?.active ? stats.dpr.toFixed(2) : Math.min(devicePixelRatio || 1, GRAPHICS[profile].dpr).toFixed(2)}{profile === '2d' ? ' · lightweight controls' : ''}</p>
    <p>{profile === '2d' ? '3D renderer inactive.' : stats?.active ? `Approx. ${stats.fps.toFixed(0)} FPS · average ${stats.meanMs.toFixed(1)} ms · p95 ${stats.p95Ms.toFixed(1)} ms` : 'Renderer resting; no continuous frames to measure.'}</p>
    <p>WebGL: {graphicsInfo().webgl ? 'available' : 'unavailable'}{graphicsInfo().software ? ' · software renderer' : ''}</p>
    <p>Audio: {state.toLowerCase()} · context {audio.context} · {audio.sampleRate} Hz</p>
    <p>PCM estimate: {(audio.trackBytes / 1048576).toFixed(1)} MiB current song + {(audio.cachedBytes / 1048576).toFixed(1)} MiB decoded album cache. Browser and GPU overhead are additional.</p>
    {mode === 'auto' && <p>{reason}</p>}
    <p>Measured locally. Diagnostics do not record or upload data.</p>
  </div>;
}
