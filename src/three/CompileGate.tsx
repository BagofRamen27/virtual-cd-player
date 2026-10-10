import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * Compile every shader in the scene in the background before the first real frame.
 * Without this, three.js compiles them all synchronously on frame one, which freezes the
 * page (badly on phones and low-power laptops). The Canvas starts with frameloop "never";
 * this flips it to "always" once compilation is done (or after a safety timeout).
 */
export function CompileGate({ onReady }: { onReady?: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const setFrameloop = useThree((s) => s.setFrameloop);
  useEffect(() => {
    let done = false;
    const start = () => {
      if (done) return;
      done = true;
      setFrameloop('always');
      onReady?.();
    };
    const safety = setTimeout(start, 8000);
    // Give React one tick to mount the whole scene graph first.
    const id = setTimeout(() => {
      gl.compileAsync(scene, camera).then(start, start);
    }, 0);
    return () => {
      clearTimeout(id);
      clearTimeout(safety);
    };
  }, [gl, scene, camera, setFrameloop, onReady]);
  return null;
}
