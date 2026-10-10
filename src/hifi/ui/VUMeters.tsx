import { useEffect, useState, useSyncExternalStore } from 'react';
import { readMeters } from '../meters';
import { tabAudioMeter } from '../TabAudioMeter';

export function VUMeters() {
  const capture = useSyncExternalStore(tabAudioMeter.subscribe, tabAudioMeter.getSnapshot);
  const [levels, setLevels] = useState([-60, -60]);
  const [reference, setReference] = useState(-42);
  useEffect(() => {
    let frame = 0; let last = 0;
    const update = (now: number) => {
      if (now - last >= 40) {
        last = now;
        const signal = readMeters();
        setLevels([signal.vuL, signal.vuR]);
        setReference(signal.vuReferenceDb);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div aria-label="Live stereo VU meters" className="rounded-xl bg-[#161a1b] p-3">
      <div className="grid grid-cols-2 gap-2">
        {levels.map((db, i) => {
          const angle = -55 + ((Math.max(-40, Math.min(3, db)) + 40) / 43) * 110;
          return <svg key={i} viewBox="0 0 180 105" role="img" aria-label={`${i ? 'Right' : 'Left'} output ${db <= -40 ? 'silent' : `${db.toFixed(1)} VU`}`}>
            <rect x="1" y="1" width="178" height="103" rx="5" fill="#f0dec0" />
            <path d="M 26 56 Q 90 -7 154 56" fill="none" stroke="#64513b" strokeWidth="1" />
            {[-40, -30, -20, -10, -3, 0, 3].map((mark) => {
              const a = (-55 + ((mark + 40) / 43) * 110) * Math.PI / 180;
              return <text key={mark} x={90 + Math.sin(a) * 72} y={95 - Math.cos(a) * 72} fontSize="8" textAnchor="middle" fill={mark >= 0 ? '#a33e2d' : '#463a2c'}>{mark}</text>;
            })}
            <line x1="90" y1="95" x2="90" y2="29" stroke="#352c24" strokeWidth="2" transform={`rotate(${angle} 90 95)`} />
            <circle cx="90" cy="95" r="4" fill="#352c24" />
            <text x="90" y="76" fontSize="11" textAnchor="middle" fill="#463a2c">VU · {i ? 'R' : 'L'}</text>
          </svg>;
        })}
      </div>
      <p className="mt-2 text-center text-[10px] text-[#b9c1bd]">{`${capture.state === 'active' ? 'Shared audio' : 'Live output'} RMS · Auto range · 0 VU = ${reference.toFixed(0)} dBFS`}</p>
    </div>
  );
}
