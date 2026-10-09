/** Quiet, synthesized mechanical sounds. Only played when the user enables them in Settings. */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noiseBurst(duration: number, freq: number, peak: number, q = 2) {
  const c = context();
  if (!c) return;
  const len = Math.ceil(duration * c.sampleRate);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.value = peak;
  src.connect(bp).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  button: () => noiseBurst(0.025, 3200, 0.18, 3),
  lidOpen: () => noiseBurst(0.18, 700, 0.12, 1),
  lidClose: () => {
    noiseBurst(0.06, 900, 0.16, 1.5);
    setTimeout(() => noiseBurst(0.04, 500, 0.1, 1), 70);
  },
  seat: () => noiseBurst(0.035, 1800, 0.12, 2),
};
