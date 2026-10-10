/**
 * One-time graphics capability probe. Creating a WebGL context is expensive (and on some
 * machines takes a second), so this runs once, releases the context, and caches the answer.
 */
export interface GraphicsInfo {
  webgl: boolean;
  /** No GPU acceleration (SwiftShader / llvmpipe / "software" renderer): 3D will be very slow. */
  software: boolean;
  /** Phone/tablet-class device: touch-first and usually limited GPU, memory and battery. */
  mobile: boolean;
  /** Few CPU cores or little RAM. */
  lowPower: boolean;
}

let cached: GraphicsInfo | null = null;

export function graphicsInfo(): GraphicsInfo {
  if (cached) return cached;
  const info: GraphicsInfo = { webgl: false, software: false, mobile: false, lowPower: false };
  if (typeof window === 'undefined') return (cached = info);
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  info.mobile =
    nav.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) ||
    (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
  info.lowPower = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      info.webgl = true;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      info.software = /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    info.webgl = false;
  }
  return (cached = info);
}

export function hasWebGL(): boolean {
  return graphicsInfo().webgl;
}

/** Sensible starting quality for a first visit on this device. */
export function defaultQuality(): { quality: 'high' | 'low'; force2D: boolean } {
  const g = graphicsInfo();
  if (!g.webgl || g.software) return { quality: 'low', force2D: true };
  return { quality: g.mobile || g.lowPower ? 'low' : 'high', force2D: false };
}
