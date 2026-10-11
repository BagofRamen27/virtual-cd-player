import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { usePlayer } from '../state/store';

/**
 * Compile every shader in the scene in the background before the first real frame.
 * Without this, three.js compiles them all synchronously on frame one, which freezes the
 * page (badly on phones and low-power laptops). The Canvas starts with frameloop "never";
 * this enables demand rendering once compilation is done (or after a safety timeout).
 */
export function CompileGate({ onReady }: { onReady?: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    let done = false, disposed = false, visible = true;
    const sync = () => {
      if (!done || disposed) return;
      setFrameloop(!document.hidden && visible ? 'demand' : 'never');
      if (!document.hidden && visible) invalidate();
    };
    const start = () => {
      if (done || disposed) return;
      done = true;
      sync();
      onReady?.();
    };
    document.addEventListener('visibilitychange', sync);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; sync(); });
    observer?.observe(gl.domElement);
    const lost = () => {
      setFrameloop('never');
      usePlayer.getState().updateSettings({ graphicsMode: '2d' });
      usePlayer.getState().notify('The graphics connection was lost. Switched to lightweight controls; audio is unaffected.');
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    const safety = setTimeout(start, 8000);
    // Give React one tick to mount the whole scene graph first.
    const id = setTimeout(() => {
      gl.compileAsync(scene, camera).then(start, start);
    }, 0);
    return () => {
      disposed = true;
      clearTimeout(id);
      clearTimeout(safety);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      gl.domElement.removeEventListener('webglcontextlost', lost);
    };
  }, [gl, scene, camera, setFrameloop, invalidate, onReady]);
  return null;
}
