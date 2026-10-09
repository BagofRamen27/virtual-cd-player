import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { easing } from 'maath';
import type { Album, ScratchStroke } from '../types';
import { useImage } from '../lib/useImage';
import { drawLabel, drawRotationalBlur, drawScratches, LABEL_INNER, LABEL_OUTER, toTexture } from './textures';
import type { DiscPhase } from '../state/store';

const HOLE = 0.125;
const THICK = 0.012;

function useDisposable<T extends { dispose(): void }>(factory: () => T, deps: unknown[]): T {
  const value = useMemo(factory, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

interface DiscMeshesProps {
  album: Album;
  strokes: ScratchStroke[];
  highlight?: string | null;
  blurMaterial?: RefObject<THREE.MeshBasicMaterial | null>;
  onSurfacePointer?: {
    down?: (e: ThreeEvent<PointerEvent>) => void;
    move?: (e: ThreeEvent<PointerEvent>) => void;
    up?: (e: ThreeEvent<PointerEvent>) => void;
  };
  castShadow?: boolean;
}

/** The physical disc: holographic polycarbonate, clear hub, printed label, scratches. Lies flat (y up). */
export function DiscMeshes({ album, strokes, highlight, blurMaterial, onSurfacePointer, castShadow }: DiscMeshesProps) {
  const img = useImage(album.coverUrl);
  const labelCanvas = useMemo(() => drawLabel(album, img), [album, img]);
  const labelTex = useDisposable(() => toTexture(labelCanvas), [labelCanvas]);
  const blurTex = useDisposable(() => toTexture(drawRotationalBlur(labelCanvas)), [labelCanvas]);
  const scratchTex = useDisposable(() => toTexture(drawScratches(strokes, 1024, highlight)), [strokes, highlight]);

  const baseGeo = useDisposable(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 1, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, HOLE, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false, curveSegments: 96 });
  }, []);
  const labelGeo = useDisposable(() => new THREE.RingGeometry(LABEL_INNER, LABEL_OUTER, 128, 1), []);
  const hubGeo = useDisposable(() => new THREE.RingGeometry(HOLE, LABEL_INNER, 96, 1), []);
  const surfaceGeo = useDisposable(() => new THREE.RingGeometry(HOLE, 1, 128, 1), []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={baseGeo} castShadow={castShadow}>
        <meshPhysicalMaterial
          color="#e9e7ea"
          metalness={1}
          roughness={0.16}
          iridescence={1}
          iridescenceIOR={1.7}
          iridescenceThicknessRange={[180, 820]}
          clearcoat={1}
          clearcoatRoughness={0.08}
          envMapIntensity={1.4}
        />
      </mesh>
      <mesh geometry={hubGeo} position={[0, 0, THICK + 0.0004]}>
        <meshPhysicalMaterial color="#eef2f4" transparent opacity={0.3} roughness={0.12} metalness={0.2} clearcoat={1} />
      </mesh>
      <mesh geometry={labelGeo} position={[0, 0, THICK + 0.0006]}>
        <meshStandardMaterial map={labelTex} roughness={0.5} metalness={0.05} />
      </mesh>
      {blurMaterial && (
        <mesh geometry={labelGeo} position={[0, 0, THICK + 0.0008]}>
          <meshBasicMaterial ref={blurMaterial} map={blurTex} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh
        geometry={surfaceGeo}
        position={[0, 0, THICK + 0.001]}
        onPointerDown={onSurfacePointer?.down}
        onPointerMove={onSurfacePointer?.move}
        onPointerUp={onSurfacePointer?.up}
      >
        <meshBasicMaterial map={scratchTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

interface Disc3DProps {
  album: Album;
  strokes: ScratchStroke[];
  phase: DiscPhase;
  spinning: boolean;
  seat: [number, number, number];
  reducedMotion: boolean;
}

const MAX_SPIN = 15; // rad/s — fast enough to read as "spinning", slow enough to avoid strobing

/** The inserted disc: animates lift → hover → drop onto the spindle, spins only while really playing. */
export function Disc3D({ album, strokes, phase, spinning, seat, reducedMotion }: Disc3DProps) {
  const group = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  const blur = useRef<THREE.MeshBasicMaterial>(null);
  const speed = useRef(0);
  const phaseStart = useRef(performance.now());
  const startPos = useMemo(() => new THREE.Vector3(seat[0] + 0.2, seat[1] + 1.9, seat[2] + 2.6), [seat]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const tilt = useMemo(() => new THREE.Euler(), []);

  useEffect(() => {
    phaseStart.current = performance.now();
  }, [phase]);

  useEffect(() => {
    if (group.current) {
      group.current.position.copy(startPos);
      group.current.rotation.set(0.7, 0.3, -0.15);
    }
  }, [startPos]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = (performance.now() - phaseStart.current) / 1000;
    const smooth = reducedMotion ? 0.05 : 0.28;
    if (phase === 'inserting') {
      // Hover over the well while catching the light, then settle onto the spindle.
      if (t < 0.55) {
        target.set(seat[0], seat[1] + 0.55, seat[2] + 0.1);
        tilt.set(0.18 + Math.sin(state.clock.elapsedTime * 2) * 0.04, 0, -0.06);
      } else {
        target.set(...seat);
        tilt.set(0, 0, 0);
      }
    } else if (phase === 'ejecting') {
      target.set(seat[0], seat[1] + 1.4, seat[2] + 2.2);
      tilt.set(0.65, 0, 0.1);
    } else {
      target.set(...seat);
      tilt.set(0, 0, 0);
    }
    easing.damp3(g.position, target, phase === 'seated' ? 0.08 : smooth, dt);
    easing.dampE(g.rotation, tilt, smooth, dt);

    // Spin up/down like a real motor: quick start, gentle coast to a stop.
    const want = spinning ? (reducedMotion ? 4 : MAX_SPIN) : 0;
    easing.damp(speed, 'current', want, spinning ? 0.35 : 0.7, dt);
    if (spinner.current) spinner.current.rotation.y -= speed.current * dt;
    if (blur.current) blur.current.opacity = Math.min(1, Math.max(0, (speed.current - 3) / (MAX_SPIN - 5)));
  });

  return (
    <group ref={group}>
      <group ref={spinner}>
        <DiscMeshes album={album} strokes={strokes} blurMaterial={blur} castShadow />
      </group>
    </group>
  );
}
