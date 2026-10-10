import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import { currentAmpState, rackOf, useHifi } from '../store';
import { readMeters, toDb } from '../meters';
import { defaultAmpState } from '../catalog';
import { Knob3D, PanelButton } from './Knob3D';
import { brushedBump, brushedRoughness, plasticBump, ventSlots, woodColor, woodRoughness } from './materials';

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

/** Printed legends and scales (transparent), layered over the brushed-aluminium faceplate. */
function faceplateTexture(name: string, inputs: string[]): THREE.CanvasTexture {
  const darkPanel = name.includes('R-9');
  const W = 2048;
  const H = Math.round((W * AMP_SIZE.h) / AMP_SIZE.w);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number): [number, number] => [((x + AMP_SIZE.w / 2) / AMP_SIZE.w) * W, ((AMP_SIZE.h / 2 - y) / AMP_SIZE.h) * H];
  const text = (s: string, x: number, y: number, size = 20, weight = 600, color = '#3b332c') => {
    const [cx, cy] = px(x, y);
    g.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
    g.fillStyle = darkPanel ? '#d3d9d6' : color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s, cx, cy);
  };
  text(name.split(' ')[0].toUpperCase(), -0.98, 0.17, 28, 700, '#2b241f');
  text(name.split(' · ')[0].toUpperCase(), -0.96, 0.1, 12, 600, '#5a4f45');
  text('POWER', L.power[0], L.power[1] - 0.085, 15);
  text('PHONES', L.phones[0], L.phones[1] - 0.085, 15);
  text('LOUDNESS', L.loudness[0], L.loudness[1] - 0.085, 15);
  text('SPEAKERS A', L.spkA[0], L.spkA[1] - 0.085, 15);
  text('BASS', L.bass[0], L.bass[1] - 0.105, 15);
  text('TREBLE', L.treble[0], L.treble[1] - 0.105, 15);
  text('BALANCE', L.balance[0], L.balance[1] - 0.105, 15);
  text('INPUT', L.input[0], L.input[1] - 0.105, 15);
  text(inputs[0], L.input[0] - 0.075, L.input[1] + 0.085, 14, 700);
  text(inputs[1], L.input[0] + 0.075, L.input[1] + 0.085, 14, 700);
  text('VOLUME', L.volume[0], L.volume[1] - 0.225, 17);
  // tick marks around the volume knob
  const [vx, vy] = px(L.volume[0], L.volume[1]);
  const r = (0.205 / AMP_SIZE.w) * W;
  g.strokeStyle = darkPanel ? '#d3d9d6' : '#3b332c';
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
  const marks = [-40, -30, -20, -10, -3, 0, 3];
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

/** Meter angle for a VU reading in dB (−40..+3), centred on 0 rad = straight up. */
function vuAngle(db: number): number {
  const x = Math.min(3, Math.max(-40, db));
  return -0.75 + ((x + 40) / 43) * 1.5;
}

function VuMeter({ position, channel, on }: { position: readonly [number, number]; channel: 'L' | 'R'; on: boolean }) {
  const needle = useRef<THREE.Group>(null);
  const tex = useMemo(() => vuTexture(channel), [channel]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((_, dt) => {
    if (!needle.current) return;
    const m = readMeters();
    const rms = channel === 'L' ? m.outRmsL : m.outRmsR;
    // Calibrated RMS, 0 VU = -18 dBFS. Extended scale shows quiet playback too.
    const db = on ? toDb(rms) + 18 : -60;
    easing.dampAngle(needle.current.rotation, 'z', -vuAngle(db), 0.15, dt);
  });
  const w = 0.36;
  const h = 0.18;
  return (
    <group position={[position[0], position[1], FACE_Z + 0.002]}>
      {/* chrome bezel */}
      <mesh position={[0, 0, -0.002]}>
        <boxGeometry args={[w + 0.035, h + 0.035, 0.012]} />
        <meshPhysicalMaterial color="#d8d4cc" metalness={1} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0, 0.0045]}>
        <planeGeometry args={[w + 0.01, h + 0.01]} />
        <meshStandardMaterial color="#120e0b" />
      </mesh>
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} color={on ? '#fff3dc' : '#5e5146'} />
      </mesh>
      <group ref={needle} position={[0, -h / 2 - 0.03, 0.008]}>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.0035, 0.18, 0.002]} />
          <meshBasicMaterial color="#1b1410" />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.0035, 0.025, 0.002]} />
          <meshBasicMaterial color="#b5371f" />
        </mesh>
      </group>
      {/* inner shadow along the top edge of the window */}
      <mesh position={[0, h / 2 - 0.012, 0.009]}>
        <planeGeometry args={[w, 0.024]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.25} />
      </mesh>
      {/* glass with a faint reflection */}
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial transparent opacity={0.08} roughness={0.04} clearcoat={1} color="#ffffff" envMapIntensity={2} />
      </mesh>
    </group>
  );
}

function RcaPair({ position, label }: { position: [number, number, number]; label: string }) {
  return (
    <group position={position} name={label}>
      {[
        ['#efeae0', -0.05],
        ['#c0392b', 0.05],
      ].map(([color, x]) => (
        <group key={String(x)} position={[x as number, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.026, 0.026, 0.01, 24]} />
            <meshStandardMaterial color={color as string} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.017, 0.017, 0.04, 24, 1, true]} />
            <meshStandardMaterial color="#d6b25e" metalness={1} roughness={0.22} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.018, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.03, 12]} />
            <meshStandardMaterial color="#d6b25e" metalness={1} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BindingPost({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.022, 0.024, 0.02, 24]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.009, 0.009, 0.04, 16]} />
        <meshStandardMaterial color="#d6b25e" metalness={1} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.022, 6]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Screw({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[0.014, 0.014, 0.005, 16]} />
        <meshStandardMaterial color="#8b857b" metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.003, 0]}>
        <boxGeometry args={[0.018, 0.002, 0.003]} />
        <meshStandardMaterial color="#2a2522" />
      </mesh>
    </group>
  );
}

export function Amp3D() {
  const s = useHifi();
  const amp = rackOf(s.rackIds).amp;
  const state = currentAmpState(s) ?? (amp ? defaultAmpState(amp) : undefined);
  const face = useMemo(() => faceplateTexture(amp?.displayName ?? 'Ashford A-60', amp?.inputs ?? ['CD', 'AUX']), [amp]);
  useEffect(() => () => face.dispose(), [face]);
  const dial = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
    const g = c.getContext('2d')!;
    const digital = amp?.id === 'yamaha-r9';
    g.fillStyle = '#07131a'; g.fillRect(0, 0, 1024, 128);
    g.fillStyle = state?.power ? (digital ? '#8fdbc4' : '#a9d6ee') : '#34434b';
    g.font = digital ? '44px monospace' : '18px Arial';
    if (digital) g.fillText(`${state?.input ?? 'AUX'}    STEREO`, 280, 80);
    else {
      g.fillText('FM MHz', 28, 38);
      for (let i = 0; i <= 40; i++) {
        const x = 160 + i * 20; const major = i % 8 === 0;
        g.fillRect(x, 61, 1.5, major ? 40 : 18);
        if (major) g.fillText(String(88 + i / 2), x - 8, 42);
      }
      g.fillStyle = '#dc9a66'; g.fillRect(608, 10, 3, 106);
    }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [amp, state?.power, state?.input]);
  useEffect(() => () => dial.dispose(), [dial]);
  if (!amp || !state) return null;
  const set = s.setAmp;
  const phonesIn = s.connections.some((c) => c.from.slot === 'amp' && c.from.port === 'phones');
  const z = FACE_Z;
  const black = amp.id === 'yamaha-r9';
  const champagne = amp.id === 'marantz-2270';
  const caseHeight = amp.category === 'receiver' ? AMP_SIZE.h + 0.22 : AMP_SIZE.h;
  const pct = (v: number) => `${Math.round(v * 10 * 10) / 10}`;
  const db = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 12)} dB`;

  return (
    <group>
      {/* Steel chassis */}
      <RoundedBox position={[0, caseHeight / 2, -0.015]} args={[AMP_SIZE.w, caseHeight, AMP_SIZE.d - 0.03]} radius={0.008} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#262a2b" metalness={0.45} roughness={0.55} bumpMap={plasticBump()} bumpScale={0.002} />
      </RoundedBox>
      {/* Vent slots in the lid */}
      <mesh position={[0.1, caseHeight + 0.0008, -0.32]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 0.55]} />
        <meshBasicMaterial color="#070605" alphaMap={ventSlots()} transparent depthWrite={false} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Screw key={`${sx}${sz}`} position={[sx * (AMP_SIZE.w / 2 - 0.07), caseHeight + 0.002, sz * (AMP_SIZE.d / 2 - 0.09)]} />))}
      {/* Walnut side cheeks */}
      {[-1, 1].map((sx) => (
        <RoundedBox key={sx} args={[0.07, caseHeight + 0.02, AMP_SIZE.d]} radius={0.012} smoothness={2} position={[sx * (AMP_SIZE.w / 2 + 0.035), caseHeight / 2 + 0.005, 0]} castShadow receiveShadow>
          <meshPhysicalMaterial map={black ? undefined : woodColor('walnut', 8)} color={black ? '#22282b' : '#ffffff'} roughnessMap={woodRoughness(8)} roughness={0.9} clearcoat={0.15} clearcoatRoughness={0.5} />
        </RoundedBox>
      ))}
      {/* Machined faceplate (5 mm panel gap to the cheeks) */}
      <RoundedBox position={[0, caseHeight / 2, AMP_SIZE.d / 2 - 0.015]} args={[AMP_SIZE.w - 0.012, caseHeight - 0.006, 0.03]} radius={0.004} smoothness={2} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={black ? '#42484a' : champagne ? '#dbcdb0' : '#dcdedf'}
          metalness={0.82}
          roughness={1}
          roughnessMap={brushedRoughness(2)}
          bumpMap={brushedBump(2)}
          bumpScale={0.002}
          anisotropy={0.75}
          clearcoat={0.12}
          clearcoatRoughness={0.4}
        />
      </RoundedBox>
      <group position={[0, AMP_SIZE.h / 2, 0]}>
        {/* Printed legends */}
        <mesh position={[0, 0, AMP_SIZE.d / 2 + 0.001]}>
          <planeGeometry args={[AMP_SIZE.w - 0.02, AMP_SIZE.h - 0.02]} />
          <meshStandardMaterial map={face} transparent roughness={0.7} metalness={0.1} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
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
      {amp.category === 'receiver' && (
        <group position={[0, AMP_SIZE.h + 0.01, 0]}>
          <mesh position={[0, 0.11, FACE_Z + 0.001]}>
            <planeGeometry args={[2.1, 0.12]} />
            <meshBasicMaterial map={dial} toneMapped={false} />
          </mesh>
        </group>
      )}
      {/* Back panel */}
      <group position={[0, AMP_SIZE.h / 2, 0]}>
        <RcaPair position={AMP_JACKS['in-cd']} label="CD in" />
        <RcaPair position={AMP_JACKS['in-aux']} label="AUX in" />
        {[
          ['#b5371f', 0.62],
          ['#1b1714', 0.7],
          ['#b5371f', 0.8],
          ['#1b1714', 0.88],
        ].map(([color, x]) => (
          <BindingPost key={String(x)} position={[x as number, 0.05, -AMP_SIZE.d / 2]} color={color as string} />
        ))}
        {/* IEC power inlet */}
        <group position={[-0.1, -0.02, -AMP_SIZE.d / 2 - 0.006]}>
          <mesh>
            <boxGeometry args={[0.12, 0.08, 0.02]} />
            <meshStandardMaterial color="#121010" roughness={0.6} />
          </mesh>
          {[-0.03, 0, 0.03].map((x) => (
            <mesh key={x} position={[x, 0, -0.012]}>
              <boxGeometry args={[0.008, 0.024, 0.006]} />
              <meshStandardMaterial color="#9c968c" metalness={0.9} roughness={0.3} />
            </mesh>
          ))}
        </group>
        <Screw position={[-1.0, 0.18, -AMP_SIZE.d / 2 - 0.003]} rotation={[-Math.PI / 2, 0, 0]} />
        <Screw position={[1.0, 0.18, -AMP_SIZE.d / 2 - 0.003]} rotation={[-Math.PI / 2, 0, 0]} />
      </group>
      {/* Rubber feet with chrome trim rings */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <group key={`${sx}${sz}`} position={[sx * (AMP_SIZE.w / 2 - 0.18), -0.012, sz * (AMP_SIZE.d / 2 - 0.16)]}>
            <mesh>
              <cylinderGeometry args={[0.065, 0.07, 0.03, 24]} />
              <meshStandardMaterial color="#1a1715" roughness={0.95} />
            </mesh>
            <mesh position={[0, 0.012, 0]}>
              <cylinderGeometry args={[0.072, 0.072, 0.008, 24]} />
              <meshStandardMaterial color="#b9b3a9" metalness={1} roughness={0.2} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}
