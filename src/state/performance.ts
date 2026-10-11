import { create } from 'zustand';
import { usePlayer } from './store';
import { graphicsInfo } from '../lib/webgl';
import { initialGraphics, type GraphicsProfile } from '../lib/graphicsPolicy';
const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { deviceMemory?: number };
export const graphicsCeiling = initialGraphics(graphicsInfo(), nav?.hardwareConcurrency, nav?.deviceMemory);
interface PerformanceState {
  automatic: GraphicsProfile;
  reason: string;
  stats: { fps: number; meanMs: number; p95Ms: number; dpr: number; textures: number; geometries: number; active: boolean } | null;
}
export const usePerformance = create<PerformanceState>(() => ({ automatic: graphicsCeiling, reason: graphicsCeiling === '2d' ? 'Graphics acceleration is unavailable; using lightweight controls.' : 'Selected from device capabilities.', stats: null }));
export function currentGraphicsProfile(): GraphicsProfile {
  const settings = usePlayer.getState().settings;
  const mode = settings.graphicsMode ?? (settings.force2D ? '2d' : settings.quality);
  return mode === 'auto' ? usePerformance.getState().automatic : mode;
}
export function useGraphicsProfile(): GraphicsProfile {
  const mode = usePlayer(s => s.settings.graphicsMode), legacy = usePlayer(s => s.settings.quality), force = usePlayer(s => s.settings.force2D);
  const automatic = usePerformance(s => s.automatic);
  return mode === 'auto' ? automatic : mode ?? (force ? '2d' : legacy);
}
