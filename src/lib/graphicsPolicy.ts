export type GraphicsProfile = 'high' | 'balanced' | 'low' | '2d';
export type GraphicsMode = 'auto' | GraphicsProfile;
export const GRAPHICS = {
  high: { dpr: 1.75, shadows: true, shadowSize: 2048, environment: 256, contact: 512 },
  balanced: { dpr: 1.25, shadows: true, shadowSize: 1024, environment: 128, contact: 256 },
  low: { dpr: 1, shadows: false, shadowSize: 512, environment: 128, contact: 128 },
  '2d': { dpr: 1, shadows: false, shadowSize: 512, environment: 128, contact: 128 },
} as const;
export function initialGraphics(capabilities: { webgl: boolean; software: boolean; lowPower: boolean; mobile: boolean }, cores = 0, memory = 0): GraphicsProfile {
  if (!capabilities.webgl || capabilities.software) return '2d';
  if (capabilities.lowPower || capabilities.mobile) return 'low';
  return cores >= 12 && memory >= 8 ? 'high' : 'balanced';
}
export interface Adaptation { slow: number; fast: number; changedAt: number }
export function adaptGraphics(profile: GraphicsProfile, ceiling: GraphicsProfile, meanMs: number, now: number, history: Adaptation) {
  const order: GraphicsProfile[] = ['2d', 'low', 'balanced', 'high'];
  const index = order.indexOf(profile);
  const threshold = profile === 'high' ? 30 : profile === 'balanced' ? 38 : 56;
  // Low deliberately renders around 30 FPS; recovery must use that frame budget.
  const recovery = profile === 'low' ? 36 : 19;
  const next = { ...history, slow: meanMs > threshold ? history.slow + 1 : 0, fast: meanMs < recovery ? history.fast + 1 : 0 };
  if (now - history.changedAt < 20000) return { profile, history: next };
  if (next.slow >= 3 && index > 0) return { profile: order[index - 1], history: { slow: 0, fast: 0, changedAt: now } };
  if (next.fast >= 8 && index < order.indexOf(ceiling)) return { profile: order[index + 1], history: { slow: 0, fast: 0, changedAt: now } };
  return { profile, history: next };
}
export function migrateGraphics(settings?: { graphicsMode?: GraphicsMode; force2D?: boolean; quality?: 'high' | 'low' }): GraphicsMode {
  if (settings?.graphicsMode) return settings.graphicsMode;
  if (settings?.force2D) return '2d';
  if (settings?.quality) return settings.quality;
  return 'auto';
}
