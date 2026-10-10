import { useEffect, useState, useSyncExternalStore } from 'react';
import { tabAudioMeter } from '../TabAudioMeter';

export function TabAudioMeterPanel() {
  const capture = useSyncExternalStore(tabAudioMeter.subscribe, tabAudioMeter.getSnapshot);
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    setQuiet(false);
    if (capture.state !== 'active') return;
    let lastSignal = performance.now();
    const timer = setInterval(() => {
      const signal = tabAudioMeter.readMeters();
      if (signal && Math.max(signal.outL, signal.outR) > 1e-5) lastSignal = performance.now();
      setQuiet(performance.now() - lastSignal > 8000);
    }, 500);
    return () => clearInterval(timer);
  }, [capture.state]);
  return <section aria-label="Shared audio VU" className="space-y-3 rounded-2xl border border-line bg-surface/70 p-4">
    <h3 className="text-sm font-medium">Optional shared audio meters</h3>
    <p className="text-xs leading-relaxed text-ink-soft">Demo and imported tracks already have live meters and hi-fi effects. To measure another app, choose its playing tab and turn on <strong>Share tab audio</strong>. Sharing enables meters only; it does not apply hi-fi effects to that app.</p>
    <p className="text-[11px] text-muted">Your browser requests screen/tab permission. Only the audio is used for meters; nothing is recorded, uploaded or replayed.</p>
    {capture.state === 'active' || capture.state === 'requesting' ?
      <button type="button" onClick={tabAudioMeter.stop} className="min-h-11 w-full rounded-xl border border-line px-3 text-xs font-medium">{capture.state === 'requesting' ? 'Cancel meter setup' : 'Stop shared audio meters'}</button> :
      <button type="button" disabled={!supported} onClick={() => void tabAudioMeter.start()} className="min-h-11 w-full rounded-xl bg-ink px-3 text-xs font-medium text-bg disabled:opacity-40">Use tab audio for meters</button>}
    <p role="status" className="text-[11px] leading-relaxed text-ink-soft">{!supported ? 'Audio sharing is unavailable here. Open the site in desktop Chrome or Edge and try again.' : capture.message}</p>
    {quiet && <p className="text-xs leading-relaxed text-ink-soft">No audio detected. Start music in the shared tab and check Share tab audio. Some browsers or protected playback sources may block capture.</p>}
  </section>;
}
