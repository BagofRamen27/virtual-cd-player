import { Suspense, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { usePlayer } from '../../state/store';
import { CDPlayer3D } from '../../three/CDPlayer3D';
import { WarmEnvironment } from '../../three/WarmEnvironment';
import { drawWalnut, toTexture } from '../../three/textures';
import { currentRoute, rackOf, useHifi } from '../store';
import type { CableKind, Connection, Slot } from '../types';
import { Amp3D, AMP_JACKS, AMP_SIZE } from './Amp3D';
import { Boombox3D, BOOMBOX_JACKS } from './Boombox3D';
import { Headphones3D } from './Headphones3D';
import { SpeakerCabinet, SPEAKER_LOOKS, speakerTerminalLocal } from './Speakers3D';

const DD1_SCALE = 0.42;
const POS = {
  dd1: new THREE.Vector3(-1.75, 0, 0.5),
  boombox: new THREE.Vector3(-1.75, 0, 0.15),
  amp: new THREE.Vector3(0.75, 0.03, -0.2),
  spkL: new THREE.Vector3(-3.75, 0, -0.75),
  spkR: new THREE.Vector3(3.75, 0, -0.75),
  phones: new THREE.Vector3(2.55, 0, 1.25),
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
        <mesh key={i} position={e.pos}>
          <sphereGeometry args={[0.03, 12, 8]} />
          <meshStandardMaterial color="#d8c3a0" metalness={0.8} roughness={0.3} emissive="#E8B66B" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/** Development-only hook for automated checks: project a world point to screen pixels. */
function DevProbe() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __rackProject: unknown }).__rackProject = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
  }, [camera, gl]);
  return null;
}

function Room({ dark }: { dark: boolean }) {
  const walnut = useMemo(() => {
    const t = toTexture(drawWalnut());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1);
    return t;
  }, []);
  return (
    <group>
      {/* Low walnut console */}
      <RoundedBox args={[11.5, 0.16, 3.8]} radius={0.04} smoothness={3} position={[0, -0.08, 0]} receiveShadow castShadow>
        <meshStandardMaterial map={walnut} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, -1.5, 0]}>
        <boxGeometry args={[11.2, 2.8, 3.6]} />
        <meshStandardMaterial color={dark ? '#2a221d' : '#6b5241'} roughness={0.7} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, 2, -2.6]} receiveShadow>
        <planeGeometry args={[30, 10]} />
        <meshStandardMaterial color={dark ? '#2b241f' : '#e9dfd0'} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.9, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={dark ? '#211b17' : '#d9cbb7'} roughness={1} />
      </mesh>
    </group>
  );
}

export default function RackScene() {
  const h = useHifi();
  const theme = usePlayer((s) => s.settings.theme);
  const quality = usePlayer((s) => s.settings.quality);
  const rack = rackOf(h.rackIds);
  const route = currentRoute(h);
  const out = route.output.kind;
  const dark = theme === 'dark';
  const high = quality === 'high';
  const look = SPEAKER_LOOKS[h.rackIds.speakers ?? ''];

  return (
    <Canvas
      shadows={high ? 'percentage' : false}
      dpr={high ? [1, 2] : 1}
      camera={{ position: [0, 3.5, 9.4], fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: dark ? 0.95 : 1.05 }}
      aria-hidden="true"
    >
      <fog attach="fog" args={[dark ? '#1d1815' : '#efe5d6', 14, 30]} />
      <ambientLight intensity={dark ? 0.25 : 0.45} color="#ffe6cc" />
      <directionalLight
        position={[-5, 8, 5]}
        intensity={dark ? 1.3 : 2}
        color="#ffd6a3"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <pointLight position={[5.5, 3, -1.5]} intensity={dark ? 14 : 7} color="#ffb070" distance={16} decay={2} />
      <Suspense fallback={null}>
        <WarmEnvironment dark={dark} />
      </Suspense>
      <Room dark={dark} />

      {rack.source?.visualModel === 'boombox' ? (
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

      {import.meta.env.DEV && <DevProbe />}
      <ContactShadows position={[0, 0.002, 0]} opacity={dark ? 0.6 : 0.4} scale={14} blur={2.4} far={3} resolution={high ? 512 : 256} frames={high ? Infinity : 1} color="#251F1B" />
      <OrbitControls
        makeDefault
        target={[0, 0.55, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={14}
        minPolarAngle={0.3}
        maxPolarAngle={1.45}
        minAzimuthAngle={-1.1}
        maxAzimuthAngle={1.1}
      />
    </Canvas>
  );
}
