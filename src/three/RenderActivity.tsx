import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePlayer } from '../state/store';
import { useHifi } from '../hifi/store';
import { tabAudioMeter } from '../hifi/TabAudioMeter';
import { useGraphicsProfile, usePerformance } from '../state/performance';
/** Static scenes sleep; transport, camera and hardware changes wake their animations. */
export function RenderActivity() {
  const invalidate = useThree(s => s.invalidate), profile = useGraphicsProfile();
  const until = useRef(performance.now() + 2500), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const wake = () => { until.current = performance.now() + 2000; invalidate(); };
    const player = usePlayer.subscribe((s, prev) => {
      if (s.state !== prev.state || s.lidOpen !== prev.lidOpen || s.discPhase !== prev.discPhase || s.trackIndex !== prev.trackIndex || s.settings !== prev.settings || s.viewResetToken !== prev.viewResetToken || s.albums !== prev.albums) wake();
    });
    const rack = useHifi.subscribe(wake), capture = tabAudioMeter.subscribe(wake);
    return () => { player(); rack(); capture(); if (timer.current) clearTimeout(timer.current); };
  }, [invalidate]);
  useFrame(() => {
    if (document.hidden) return;
    const active = usePlayer.getState().state === 'PLAYING' || tabAudioMeter.getSnapshot().state === 'active' || performance.now() < until.current;
    if (active) {
      if (profile === 'low') {
        if (!timer.current) timer.current = setTimeout(() => { timer.current = undefined; invalidate(); }, 16);
      } else invalidate();
    } else {
      const stats = usePerformance.getState().stats;
      if (stats?.active) usePerformance.setState({ stats: { ...stats, active: false } });
    }
  });
  return null;
}
