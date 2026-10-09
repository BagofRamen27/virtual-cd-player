import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import { currentAmpState, rackOf, useHifi } from '../store';
import { readMeters, toDb } from '../meters';
import { defaultAmpState } from '../catalog';
import { Knob3D, PanelButton } from './Knob3D';

export const AMP_SIZE = { w: 2.4, h: 0.55, d: 1.5 };
const FACE_Z = AMP_SIZE.d / 2 + 0.004;

/** Control layout on the faceplate, in faceplate coordinates (x right, y up, metres-ish units). */
const L = {
  power: [-1.04, -0.12],
  phones: [-0.86, -0.12],
  loudness: [-0.66, -0.12],
  spkA: [-0.48, -0.12],
  bass: [-0.22, -0.1],
  treble: [0.0, -0.1],
  balance: [0.22, -0.1],
  input: [0.47, -0.1],
  volume: [0.88, -0.01],
  vuL: [-0.38, 0.13],
  vuR: [0.02, 0.13],
} as const;

/** Back-panel jack positions (local), used for cable anchors. */
export const AMP_JACKS: Record<string, [number, number, number]> = {
  'in-cd': [-0.85, 0.05, -AMP_SIZE.d / 2 - 0.02],
  'in-aux': [-0.55, 0.05, -AMP_SIZE.d / 2 - 0.02],
  'spk-a': [0.7, 0.05, -AMP_SIZE.d / 2 - 0.02],
  phones: [L.phones[0], L.phones[1], FACE_Z + 0.02],
};

function faceplateTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = Math.round((W * AMP_SIZE.h) / AMP_SIZE.w);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#e9e6df');
  grad.addColorStop(1, '#c9c4ba');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // brushed lines
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
    g.fillRect(0, y, W, 1);
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    g.fillRect(0, y + 1, W, 1);
  }
  const px = (x: number, y: number): [number, number] => [((x + AMP_SIZE.w / 2) / AMP_SIZE.w) * W, ((AMP_SIZE.h / 2 - y) / AMP_SIZE.h) * H];
  const text = (s: string, x: number, y: number, size = 20, weight = 600, color = '#3b332c') => {
    const [cx, cy] = px(x, y);
    g.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s, cx, cy);
  };
  text('ASHFORD', -0.98, 0.17, 34, 700, '#2b241f');
  text('A-60 STEREO INTEGRATED AMPLIFIER', -0.98, 0.1, 13, 600, '#5a4f45');
  text('POWER', L.power[0], L.power[1] - 0.085, 15);
  text('PHONES', L.phones[0], L.phones[1] - 0.085, 15);
  text('LOUDNESS', L.loudness[0], L.loudness[1] - 0.085, 15);
  text('SPEAKERS A', L.spkA[0], L.spkA[1] - 0.085, 15);
  text('BASS', L.bass[0], L.bass[1] - 0.105, 15);
  text('TREBLE', L.treble[0], L.treble[1] - 0.105, 15);
  text('BALANCE', L.balance[0], L.balance[1] - 0.105, 15);
  text('INPUT', L.input[0], L.input[1] - 0.105, 15);
  text('CD', L.input[0] - 0.075, L.input[1] + 0.085, 14, 700);
  text('AUX', L.input[0] + 0.075, L.input[1] + 0.085, 14, 700);
  text('VOLUME', L.volume[0], L.volume[1] - 0.225, 17);
  // tick marks around the volume knob
  const [vx, vy] = px(L.volume[0], L.volume[1]);
  const r = (0.205 / AMP_SIZE.w) * W;
  g.strokeStyle = '#3b332c';
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    g.lineWidth = i % 5 === 0 ? 3 : 1.5;
    g.beginPath();
    g.moveTo(vx + Math.cos(a) * r, vy + Math.sin(a) * r);
    g.lineTo(vx + Math.cos(a) * (r + 12), vy + Math.sin(a) * (r + 12));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function vuTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffe2a8');
  grad.addColorStop(1, '#f0b964');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#3b2a1c';
  g.fillStyle = '#3b2a1c';
  g.lineWidth = 3;
  const cx = 256;
  const cy = 300;
  const R = 230;
  g.beginPath();
  g.arc(cx, cy, R, Math.PI * 1.25, Math.PI * 1.75);
  g.stroke();
  const marks = [-20, -10, -7, -5, -3, 0, 3];
  g.font = '600 22px Inter, sans-serif';
  g.textAlign = 'center';
  marks.forEach((db) => {
    const a = Math.PI * 1.5 + vuAngle(db);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.lineTo(cx + Math.cos(a) * (R + 18), cy + Math.sin(a) * (R + 18));
    g.strokeStyle = db > 0 ? '#b5371f' : '#3b2a1c';
    g.stroke();
    g.fillStyle = db > 0 ? '#b5371f' : '#3b2a1c';
    g.fillText(String(db), cx + Math.cos(a) * (R + 40), cy + Math.sin(a) * (R + 40) + 8);
  });
  g.fillStyle = '#3b2a1c';
  g.font = '700 26px Inter, sans-serif';
  g.fillText(`VU  ${label}`, cx, 220);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Meter angle for a VU reading in dB (−20..+3), centred on 0 rad = straight up. */
function vuAngle(db: number): number {
  const x = Math.min(3, Math.max(-20, db));
  return -0.75 + ((x + 20) / 23) * 1.5 - 0.0;
}

function VuMeter({ position, channel, on }: { position: readonly [number, number]; channel: 'L' | 'R'; on: boolean }) {
  const needle = useRef<THREE.Group>(null);
  const tex = useMemo(() => vuTexture(channel), [channel]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((_, dt) => {
    if (!needle.current) return;
    const m = readMeters();
    const peak = channel === 'L' ? m.outL : m.outR;
    // VU-style: 0 VU ≈ −12 dBFS peak; ballistic smoothing ~300 ms
    const db = on ? toDb(peak) + 12 : -30;
    easing.dampAngle(needle.current.rotation, 'z', -vuAngle(db), 0.15, dt);
  });
  const w = 0.36;
  const h = 0.18;
  return (
    <group position={[position[0], position[1], FACE_Z + 0.002]}>
      <mesh>
        <planeGeometry args={[w + 0.02, h + 0.02]} />
        <meshStandardMaterial color="#1e1915" />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} color={on ? '#ffffff' : '#6d5f52'} />
      </mesh>
      <group ref={needle} position={[0, -h / 2 - 0.03, 0.004]}>
        <mesh position={[0, 0.11, 0]}>
          <boxGeometry args={[0.004, 0.2, 0.002]} />
          <meshBasicMaterial color="#1b1410" />
        </mesh>
      </group>
      {/* glass */}
      <mesh position={[0, 0, 0.008]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial transparent opacity={0.12} roughness={0.05} clearcoat={1} color="#ffffff" />
      </mesh>
    </group>
  );
}

function RcaPair({ position, label }: { position: [number, number, number]; label: string }) {
  return (
    <group position={position} name={label}>
      {[
        ['#f2efe8', -0.045],
        ['#c0392b', 0.045],
      ].map(([color, x]) => (
        <mesh key={String(x)} position={[x as number, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.04, 20]} />
          <meshStandardMaterial color={color as string} metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

export function Amp3D() {
  const s = useHifi();
  const amp = rackOf(s.rackIds).amp;
  const state = currentAmpState(s) ?? (amp ? defaultAmpState(amp) : undefined);
  const face = useMemo(() => faceplateTexture(), []);
  useEffect(() => () => face.dispose(), [face]);
  if (!amp || !state) return null;
  const set = s.setAmp;
  const phonesIn = s.connections.some((c) => c.from.slot === 'amp' && c.from.port === 'phones');
  const z = FACE_Z;
  const pct = (v: number) => `${Math.round(v * 10 * 10) / 10}`;
  const db = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 12)} dB`;

  return (
    <group>
      {/* Chassis */}
      <RoundedBox args={[AMP_SIZE.w, AMP_SIZE.h, AMP_SIZE.d]} radius={0.025} smoothness={3} position={[0, AMP_SIZE.h / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2b2622" metalness={0.5} roughness={0.55} />
      </RoundedBox>
      {/* Faceplate */}
      <group position={[0, AMP_SIZE.h / 2, 0]}>
        <mesh position={[0, 0, z]} receiveShadow>
          <planeGeometry args={[AMP_SIZE.w - 0.02, AMP_SIZE.h - 0.02]} />
          <meshPhysicalMaterial map={face} metalness={0.55} roughness={0.38} anisotropy={0.6} />
        </mesh>
        <VuMeter position={L.vuL} channel="L" on={state.power} />
        <VuMeter position={L.vuR} channel="R" on={state.power} />

        <PanelButton position={[L.power[0], L.power[1], z]} lit={state.power} label={state.power ? 'Power: on' : 'Power: off'} onPress={() => set({ power: !state.power })} />
        <PanelButton position={[L.loudness[0], L.loudness[1], z]} lit={state.loudness} label={`Loudness: ${state.loudness ? 'on' : 'off'}`} onPress={() => set({ loudness: !state.loudness })} />
        <PanelButton position={[L.spkA[0], L.spkA[1], z]} lit={state.speakersA} label={`Speakers A: ${state.speakersA ? 'on' : 'off'}`} onPress={() => set({ speakersA: !state.speakersA })} />
        {/* Headphone jack */}
        <group position={[L.phones[0], L.phones[1], z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.01, 24]} />
            <meshStandardMaterial color="#b9b2a6" metalness={0.9} roughness={0.25} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.004]}>
            <cylinderGeometry args={[0.014, 0.014, 0.012, 16]} />
            <meshStandardMaterial color="#0d0b0a" emissive="#E8B66B" emissiveIntensity={phonesIn ? 0.6 : 0} />
          </mesh>
        </group>

        <Knob3D position={[L.bass[0], L.bass[1], z]} radius={0.055} value={state.bass} min={-1} max={1} defaultValue={0} label="Bass" format={db} onChange={(v) => set({ bass: v })} />
        <Knob3D position={[L.treble[0], L.treble[1], z]} radius={0.055} value={state.treble} min={-1} max={1} defaultValue={0} label="Treble" format={db} onChange={(v) => set({ treble: v })} />
        <Knob3D
          position={[L.balance[0], L.balance[1], z]}
          radius={0.055}
          value={state.balance}
          min={-1}
          max={1}
          defaultValue={0}
          label="Balance"
          format={(v) => (Math.abs(v) < 0.02 ? 'centre' : v < 0 ? `L ${Math.round(-v * 100)}%` : `R ${Math.round(v * 100)}%`)}
          onChange={(v) => set({ balance: Math.abs(v) < 0.04 ? 0 : v })}
        />
        <Knob3D
          position={[L.input[0], L.input[1], z]}
          radius={0.06}
          value={amp.inputs.indexOf(state.input)}
          min={0}
          max={amp.inputs.length - 1}
          defaultValue={0}
          sweep={Math.PI / 2}
          travelPx={80}
          label="Input"
          format={(v) => amp.inputs[Math.round(v)]}
          onChange={(v) => set({ input: amp.inputs[Math.round(v)] })}
        />
        <Knob3D
          position={[L.volume[0], L.volume[1], z]}
          radius={0.15}
          value={state.volume}
          min={0}
          max={1}
          defaultValue={0.4}
          label="Volume"
          color="#e4e0d8"
          format={pct}
          onChange={(v) => set({ volume: v })}
        />
      </group>
      {/* Back panel */}
      <group position={[0, AMP_SIZE.h / 2, 0]}>
        <RcaPair position={AMP_JACKS['in-cd']} label="CD in" />
        <RcaPair position={AMP_JACKS['in-aux']} label="AUX in" />
        {[
          ['#c0392b', 0.62],
          ['#1b1410', 0.7],
          ['#c0392b', 0.78],
          ['#1b1410', 0.86],
        ].map(([color, x]) => (
          <mesh key={String(x)} position={[x as number, 0.05, -AMP_SIZE.d / 2 - 0.025]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.05, 16]} />
            <meshStandardMaterial color={color as string} metalness={0.3} roughness={0.4} />
          </mesh>
        ))}
      </group>
      {/* Feet */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (AMP_SIZE.w / 2 - 0.15), -0.01, sz * (AMP_SIZE.d / 2 - 0.15)]}>
            <cylinderGeometry args={[0.06, 0.06, 0.03, 20]} />
            <meshStandardMaterial color="#1a1613" />
          </mesh>
        )),
      )}
    </group>
  );
}
