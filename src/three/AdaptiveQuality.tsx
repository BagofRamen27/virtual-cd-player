import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePlayer } from '../state/store';
import { graphicsCeiling, useGraphicsProfile, usePerformance } from '../state/performance';
import { adaptGraphics, GRAPHICS, type Adaptation } from '../lib/graphicsPolicy';

/**
 * Changes Automatic graphics only after sustained frame-time samples and a cooldown.
 * User-selected profiles and all audio parameters remain unchanged.
 */
export function AdaptiveQuality() {
  const profile = useGraphicsProfile(), setDpr = useThree(s => s.setDpr);
  const samples = useRef<number[]>([]), elapsed = useRef(0);
  const history = useRef<Adaptation>({ slow: 0, fast: 0, changedAt: performance.now() });
  useEffect(() => {
    setDpr(Math.min(globalThis.devicePixelRatio || 1, GRAPHICS[profile].dpr));
    samples.current = []; elapsed.current = 0;
    history.current = { slow: 0, fast: 0, changedAt: performance.now() };
  }, [profile, setDpr]);
  useEffect(() => () => usePerformance.setState(state => ({ stats: state.stats ? { ...state.stats, active: false } : null })), []);
  useFrame((state, delta) => {
    const { settings, settingsOpen } = usePlayer.getState();
    const diagnostics = settings.performanceDiagnostics && settingsOpen;
    if (settings.graphicsMode !== 'auto' && !diagnostics) return;
    // Demand-render gaps and returning from background aren't slow GPU frames.
    if (delta <= 0 || delta > 0.25 || document.hidden) { samples.current = []; elapsed.current = 0; return; }
    samples.current.push(delta * 1000); elapsed.current += delta;
    if (elapsed.current < 2) return;
    const values = samples.current, meanMs = values.reduce((a, b) => a + b, 0) / values.length;
    if (diagnostics) {
      const sorted = [...values].sort((a, b) => a - b);
      usePerformance.setState({ stats: { fps: 1000 / meanMs, meanMs, p95Ms: sorted[Math.floor(sorted.length * 0.95)], dpr: state.gl.getPixelRatio(), textures: state.gl.info.memory.textures, geometries: state.gl.info.memory.geometries, active: true } });
    }
    if (settings.graphicsMode === 'auto') {
      const next = adaptGraphics(profile, graphicsCeiling, meanMs, performance.now(), history.current);
      history.current = next.history;
      if (next.profile !== profile) usePerformance.setState({ automatic: next.profile, reason: next.profile === '2d' ? 'Sustained slow rendering; switched to lightweight controls. Audio quality is unchanged.' : `Adjusted to ${next.profile} after sustained frame-time measurements. Audio quality is unchanged.` });
    }
    samples.current = []; elapsed.current = 0;
  });
  return null;
}
