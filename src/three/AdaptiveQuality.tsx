import { useState } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { usePlayer } from '../state/store';

/**
 * Keeps the 3D view smooth on whatever device opens the link: lowers the render resolution
 * when the frame rate drops, and if it keeps struggling, switches the app to Low quality
 * (no shadows / post-processing) and tells the user once.
 */
export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const [maxDpr] = useState(() => Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
  return (
    <PerformanceMonitor
      bounds={() => [40, 58]}
      flipflops={3}
      onDecline={() => setDpr(1)}
      onIncline={() => setDpr(usePlayer.getState().settings.quality === 'high' ? maxDpr : 1)}
      onFallback={() => {
        setDpr(1);
        const s = usePlayer.getState();
        if (s.settings.quality === 'high') {
          s.updateSettings({ quality: 'low' });
          s.notify('Switched to Low graphics quality to keep things smooth on this device. You can change it in Settings.');
        }
      }}
    />
  );
}
