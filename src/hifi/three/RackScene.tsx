import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { AdaptiveQuality } from '../../three/AdaptiveQuality';
import { CompileGate } from '../../three/CompileGate';
import { usePlayer } from '../../state/store';
import { CDPlayer3D } from '../../three/CDPlayer3D';
import { WarmEnvironment } from '../../three/WarmEnvironment';
import { currentRoute, rackOf, useHifi } from '../store';
import type { CableKind, Connection, Slot } from '../types';
import { Amp3D, AMP_JACKS, AMP_SIZE } from './Amp3D';
import { Boombox3D, BOOMBOX_JACKS } from './Boombox3D';
import { Headphones3D } from './Headphones3D';
import { RoomEnvironment } from './RoomEnvironment';
import { SpeakerCabinet, SPEAKER_LOOKS, speakerTerminalLocal } from './Speakers3D';
import { CDDeck3D, DECK_JACKS } from './CDDeck3D';
import { deviceById } from '../catalog';

const DD1_SCALE = 0.42;
const POS = {
  dd1: new THREE.Vector3(-1.75, 0, 0.5),
  boombox: new THREE.Vector3(-1.75, 0, 0.15),
  amp: new THREE.Vector3(0.75, 0.03, -0.2),
  spkL: new THREE.Vector3(-3.35, 0, -0.8),
  spkR: new THREE.Vector3(3.45, 0, -0.8),
  phones: new THREE.Vector3(2.2, 0, 1.3),
};

interface Anchor {
  pos: THREE.Vector3;
  /** Direction the cable leaves the jack. */
  dir: THREE.Vector3;
}

const BACK = new THREE.Vector3(0, 0, -1);
const FRONT = new THREE.Vector3(0, 0, 1);

function anchors(slot: Slot, port: string, sourceId: string, speakersId: string | null): Anchor[] {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  if (slot === 'source') {
    if (deviceById(sourceId)?.slot === 'source' && sourceId !== 'dd1' && sourceId !== 'boombox-2003') {
      const j = DECK_JACKS[port] ?? [0.9, 0.18, -0.8];
      return [{ pos: POS.dd1.clone().add(v(...j)), dir: BACK }];
    }
    if (sourceId === 'boombox-2003') {
      const j = BOOMBOX_JACKS[port] ?? [0, 0.5, 0];
      return [{ pos: POS.boombox.clone().add(v(j[0], j[1] + 0.6, j[2])), dir: FRONT }];
    }
    // DD-1: jacks on the right-hand side of the body (unscaled local coordinates)
    const local = port === 'line-out' ? v(1.38, 0.2, -0.6) : v(1.38, 0.2, 0.4);
    return [{ pos: POS.dd1.clone().add(local.multiplyScalar(DD1_SCALE)), dir: new THREE.Vector3(1, 0, 0) }];
  }
  if (slot === 'amp') {
    const j = AMP_JACKS[port] ?? [0, 0, 0];
    return [{ pos: POS.amp.clone().add(v(j[0], j[1] + AMP_SIZE.h / 2, j[2])), dir: port === 'phones' ? FRONT : BACK }];
  }
  if (slot === 'speakers') {
    const look = SPEAKER_LOOKS[speakersId ?? 'bookshelf-premium'];
    const t = speakerTerminalLocal(look);
    return [POS.spkL, POS.spkR].map((p) => ({ pos: p.clone().add(v(...t)), dir: BACK }));
  }
  return [{ pos: POS.phones.clone().add(v(0, 0.08, -0.15)), dir: BACK }];
}

const CABLE_COLORS: Record<CableKind, string[]> = {
  rca: ['#c0392b', '#efeae0'],
  'trs35-rca': ['#c0392b', '#efeae0'],
  speaker: ['#b5532f', '#1b1714'],
  headphone: ['#1b1714'],
  'headphone-adapter': ['#1b1714'],
};

function CableTube({ a, b, color, offset, radius }: { a: Anchor; b: Anchor; color: string; offset: number; radius: number }) {
  const geo = useMemo(() => {
    const side = new THREE.Vector3(offset, 0, 0);
    const p0 = a.pos.clone().add(side);
    const p1 = p0.clone().add(a.dir.clone().multiplyScalar(0.3));
    const p4 = b.pos.clone().add(side);
    const p3 = p4.clone().add(b.dir.clone().multiplyScalar(0.3));
    const mid = p1.clone().lerp(p3, 0.5);
    // Cables droop to the table and run behind the gear.
    mid.y = 0.03;
    mid.z = Math.min(mid.z, Math.min(p1.z, p3.z) - 0.25);
    const curve = new THREE.CatmullRomCurve3([p0, p1, p1.clone().setY(Math.max(0.04, p1.y * 0.4)), mid, p3.clone().setY(Math.max(0.04, p3.y * 0.4)), p3, p4], false, 'centripetal');
    return new THREE.TubeGeometry(curve, 80, radius, 8, false);
  }, [a, b, offset, radius]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

/** A connector body at a jack, oriented along the cable's exit direction. */
function Plug({ anchor, kind }: { anchor: Anchor; kind: CableKind }) {
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.dir.clone().normalize()), [anchor]);
  const speaker = kind === 'speaker';
  const phones = kind.startsWith('headphone');
  return (
    <group position={anchor.pos} quaternion={q}>
      <mesh position={[0, 0.035, 0]} castShadow>
        <cylinderGeometry args={[speaker ? 0.014 : 0.022, speaker ? 0.016 : 0.022, 0.07, 20]} />
        <meshPhysicalMaterial color={speaker ? '#d6b25e' : phones ? '#1b1816' : '#cfc9bf'} metalness={speaker || !phones ? 1 : 0.2} roughness={0.25} clearcoat={phones ? 0.6 : 0} />
      </mesh>
      {!speaker && !phones && (
        <mesh position={[0, 0.055, 0]}>
          <cylinderGeometry args={[0.0235, 0.0235, 0.012, 20]} />
          <meshStandardMaterial color="#b5371f" roughness={0.4} />
        </mesh>
      )}
      <mesh position={[0, 0.085, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.04, 12]} />
        <meshStandardMaterial color="#1b1816" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Cable({ c, sourceId, speakersId }: { c: Connection; sourceId: string; speakersId: string | null }) {
  const from = useMemo(() => anchors(c.from.slot, c.from.port, sourceId, speakersId), [c.from.slot, c.from.port, sourceId, speakersId]);
  const to = useMemo(() => anchors(c.to.slot, c.to.port, sourceId, speakersId), [c.to.slot, c.to.port, sourceId, speakersId]);
  const colors = CABLE_COLORS[c.cable];
  const radius = c.cable.startsWith('headphone') ? 0.012 : 0.017;
  return (
    <group>
      {to.map((t, i) =>
        colors.map((color, k) => (
          <CableTube key={`${i}-${k}`} a={from[0]} b={t} color={color} offset={(k - (colors.length - 1) / 2) * 0.04} radius={radius} />
        )),
      )}
      {[from[0], ...to].map((e, i) => (
        <Plug key={i} anchor={e} kind={c.cable} />
      ))}
    </group>
  );
}

const TARGET = new THREE.Vector3(0, 0.6, -0.15);
const VIEW_DIR = new THREE.Vector3(0, 0.3, 1).normalize();

/** Frame the whole system (speaker to speaker) for any canvas aspect, on mount and on resize. */
export type RoomView = 'room' | 'amp' | 'knobs' | 'source';

function FitCamera({ view, sourceId }: { view: RoomView; sourceId: string }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    const amplifier = view === 'amp' || view === 'knobs';
    // Frame the front controls, rather than measuring distance from inside the chassis.
    const target = amplifier ? POS.amp.clone().add(new THREE.Vector3(view === 'knobs' ? 0.35 : 0, 0.36, 0.85))
      : view === 'source' ? (sourceId === 'boombox-2003' ? POS.boombox : POS.dd1).clone().add(new THREE.Vector3(0, 0.3, sourceId === 'dd1' || sourceId === 'philips-cd100' ? 0 : 0.8)) : TARGET;
    const halfWidth = view === 'room' ? 3.95 : view === 'knobs' ? 0.76 : view === 'amp' ? 1.28 : 1.25;
    const halfHeight = view === 'room' ? 1.7 : view === 'knobs' ? 0.38 : view === 'amp' ? 0.5 : 0.7;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const aspect = size.width / Math.max(1, size.height);
    const dist = Math.max(halfWidth / (tanV * aspect), halfHeight / tanV) + (view === 'room' ? 0.9 : 0.08);
    const direction = view === 'source' && (sourceId === 'dd1' || sourceId === 'philips-cd100') ? new THREE.Vector3(0, 0.85, 1).normalize() : amplifier ? new THREE.Vector3(0, 0.035, 1).normalize() : VIEW_DIR;
    camera.position.copy(target).addScaledVector(direction, Math.max(view === 'room' ? 6 : 0.8, dist));
    camera.lookAt(target);
  }, [camera, size.width, size.height, view, sourceId]);
  return null;
}

/** Development-only hook for automated checks: project a world point to screen pixels. */
function DevProbe() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __rackGl: unknown }).__rackGl = gl;
    (window as unknown as { __rackProject: unknown }).__rackProject = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
  }, [camera, gl]);
  return null;
}

export default function RackScene({ view = 'room' }: { view?: RoomView }) {
  const h = useHifi();
  const theme = usePlayer((s) => s.settings.theme);
  const quality = usePlayer((s) => s.settings.quality);
  const rack = rackOf(h.rackIds);
  const route = currentRoute(h);
  const out = route.output.kind;
  const dark = theme === 'dark';
  const high = quality === 'high';
  const look = SPEAKER_LOOKS[h.rackIds.speakers ?? ''];

  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  return (
    <>
    <Canvas
      frameloop="never"
      shadows={high ? 'percentage' : false}
      dpr={high ? [1, 2] : 1}
      camera={{ position: [0, 2.7, 7.9], fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: dark ? 1.15 : 1.1 }}
      aria-hidden="true"
    >
      <AdaptiveQuality />
      <CompileGate onReady={onReady} />
      <fog attach="fog" args={[dark ? '#1b1613' : '#eadfce', 16, 34]} />
      {/* Ambient bounce: warm sky from the window, brown bounce from the wooden floor and furniture */}
      <hemisphereLight args={['#e7edf1', '#635b50', dark ? 0.75 : 0.85]} />
      {/* Key: late-afternoon window light from the left, soft and warm */}
      <directionalLight
        position={[-6, 7, 6]}
        intensity={dark ? 1.8 : 2.2}
        color="#fff1df"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      {/* Cool, faint rim from the right to separate the gear from the wall */}
      <directionalLight position={[6, 4, -3]} intensity={0.65} color="#dfe6ff" />
      <Suspense fallback={null}>
        <WarmEnvironment dark={dark} />
      </Suspense>
      <RoomEnvironment dark={dark} />

      {rack.source?.visualModel === 'deck' ? (
        <group position={POS.dd1}><CDDeck3D /></group>
      ) : rack.source?.visualModel === 'boombox' ? (
        <group position={POS.boombox}>
          <Boombox3D builtinsActive={out === 'builtin'} />
        </group>
      ) : (
        <group position={POS.dd1} scale={DD1_SCALE}>
          <CDPlayer3D />
        </group>
      )}

      {rack.amp && (
        <group position={POS.amp}>
          <Amp3D />
        </group>
      )}

      {look && (
        <>
          <group position={POS.spkL} rotation={[0, 0.25, 0]}>
            <SpeakerCabinet look={look} channel="L" active={out === 'speakers'} />
          </group>
          <group position={POS.spkR} rotation={[0, -0.25, 0]}>
            <SpeakerCabinet look={look} channel="R" active={out === 'speakers'} />
          </group>
        </>
      )}

      {rack.headphones && (
        <group position={POS.phones} rotation={[0, -0.4, 0]}>
          <Headphones3D kind={rack.headphones.id} active={out === 'headphones'} />
        </group>
      )}

      {h.connections.map((c) => (
        <Cable key={c.id} c={c} sourceId={h.rackIds.source} speakersId={h.rackIds.speakers} />
      ))}

      <FitCamera view={view} sourceId={h.rackIds.source} />
      {import.meta.env.DEV && <DevProbe />}
      <ContactShadows position={[0, 0.002, 0]} opacity={dark ? 0.6 : 0.4} scale={14} blur={2.4} far={3} resolution={high ? 512 : 256} frames={high ? Infinity : 1} color="#251F1B" />
      {high && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO halfRes aoRadius={0.3} intensity={1.2} distanceFalloff={0.8} color="#262728" />
          <Bloom mipmapBlur luminanceThreshold={1.4} luminanceSmoothing={0.15} intensity={0.12} />
          <Vignette offset={0.32} darkness={0.18} />
        </EffectComposer>
      )}
    </Canvas>
    {!ready && (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">
        Setting up the room…
      </div>
    )}
    </>
  );
}
