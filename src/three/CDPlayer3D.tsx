import { toTexture } from './canvasTexture';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import { useShallow } from 'zustand/react/shallow';
import { usePlayer, prefersReducedMotion } from '../state/store';
import { generateConditionStrokes } from '../audio/damage';
import { lcdContent } from '../lib/lcd';
import { Disc3D } from './Disc3D';
import { Lid3D } from './Lid3D';
import { drawGlyph, drawLcd, drawWalnut, type Glyph } from './textures';

export const BODY_W = 2.7;
export const BODY_D = 3.3;
const BODY_TOP = 0.33;
const DECK_T = 0.035;
const DECK_TOP = BODY_TOP + DECK_T;
const DISC_Z = -0.32;
const WELL_R = 1.07;
const SEAT: [number, number, number] = [0, BODY_TOP + 0.016, DISC_Z];

function useDisposable<T extends { dispose(): void }>(factory: () => T, deps: unknown[]): T {
  const value = useMemo(factory, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Brushed champagne top plate with the circular disc well cut out. */
function Deck() {
  const geo = useDisposable(() => {
    const w = BODY_W - 0.04;
    const d = BODY_D - 0.04;
    const r = 0.16;
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -d / 2);
    s.lineTo(w / 2 - r, -d / 2);
    s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    s.lineTo(w / 2, d / 2 - r);
    s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    s.lineTo(-w / 2 + r, d / 2);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    s.lineTo(-w / 2, -d / 2 + r);
    s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const hole = new THREE.Path();
    hole.absarc(0, -DISC_Z, WELL_R, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: DECK_T - 0.01, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.008, bevelSegments: 3, curveSegments: 72 });
  }, []);
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, BODY_TOP + 0.005, 0]} castShadow receiveShadow>
      <meshPhysicalMaterial color="#e8d8bf" metalness={0.6} roughness={0.36} anisotropy={0.7} clearcoat={0.3} clearcoatRoughness={0.4} />
    </mesh>
  );
}

/** Spindle, hub, optical pickup sled and rails visible inside the well. */
function WellInterior() {
  return (
    <group>
      <mesh position={[0, BODY_TOP + 0.002, DISC_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[WELL_R, 96]} />
        <meshStandardMaterial color="#2a231f" roughness={0.85} />
      </mesh>
      {/* Pickup slot, sled and rails */}
      <mesh position={[0, BODY_TOP + 0.003, DISC_Z + 0.58]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.32, 0.78]} />
        <meshStandardMaterial color="#14100e" roughness={1} />
      </mesh>
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, BODY_TOP + 0.012, DISC_Z + 0.58]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.8, 8]} />
          <meshStandardMaterial color="#b9b2a8" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
      <mesh position={[0, BODY_TOP + 0.012, DISC_Z + 0.42]}>
        <boxGeometry args={[0.24, 0.016, 0.14]} />
        <meshStandardMaterial color="#8d8478" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, BODY_TOP + 0.022, DISC_Z + 0.42]}>
        <sphereGeometry args={[0.022, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#3d4a6b" metalness={0.2} roughness={0.05} clearcoat={1} />
      </mesh>
      {/* Hub and spindle */}
      <mesh position={[0, BODY_TOP + 0.008, DISC_Z]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.012, 48]} />
        <meshStandardMaterial color="#c9b291" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, BODY_TOP + 0.03, DISC_Z]} castShadow>
        <cylinderGeometry args={[0.112, 0.118, 0.045, 32]} />
        <meshStandardMaterial color="#e7dccb" metalness={0.6} roughness={0.25} />
      </mesh>
      <mesh position={[0, BODY_TOP + 0.053, DISC_Z]}>
        <sphereGeometry args={[0.112, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e7dccb" metalness={0.6} roughness={0.25} />
      </mesh>
    </group>
  );
}

interface ButtonProps {
  glyph: Glyph;
  x: number;
  z: number;
  label: string;
  accent?: boolean;
  active?: boolean;
  onPress: () => void;
}

function Button3D({ glyph, x, z, accent, active, onPress }: ButtonProps) {
  const cap = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  const [down, setDown] = useState(false);
  const [hover, setHover] = useState(false);
  useCursor(hover);
  const tex = useDisposable(() => toTexture(drawGlyph(glyph, accent ? '#F4EFE7' : '#594334', accent ? '#B77B56' : '#EFE6D8')), [glyph, accent]);

  useFrame((_, dt) => {
    if (cap.current) easing.damp(cap.current.position, 'y', down ? -0.014 : 0, 0.04, dt);
    if (ring.current) easing.damp(ring.current, 'emissiveIntensity', active ? 1.2 : hover ? 0.35 : 0, 0.15, dt);
  });

  return (
    <group position={[x, DECK_TOP, z]}>
      {/* Bezel ring — warm highlight when active */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.086, 0.104, 40]} />
        <meshStandardMaterial ref={ring} color="#a98c6a" emissive="#E8B66B" emissiveIntensity={0} metalness={0.6} roughness={0.35} />
      </mesh>
      <group
        ref={cap}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDown(true);
        }}
        onPointerUp={() => setDown(false)}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => {
          setHover(false);
          setDown(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onPress();
        }}
      >
        <mesh position={[0, 0.018, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.082, 0.036, 40]} />
          <meshStandardMaterial color={accent ? '#B77B56' : '#EFE6D8'} roughness={0.55} metalness={accent ? 0.35 : 0.05} />
        </mesh>
        <mesh position={[0, 0.0365, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.079, 40]} />
          <meshStandardMaterial map={tex} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function Lcd3D() {
  const size: [number, number] = [512, 168];
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    [c.width, c.height] = size;
    return c;
  }, []);
  const tex = useDisposable(() => toTexture(canvas), [canvas]);
  const lastKey = useRef('');

  useFrame(() => {
    const s = usePlayer.getState();
    const now = performance.now();
    const content = lcdContent({
      state: s.state,
      powered: s.powered,
      lidOpen: s.lidOpen,
      album: s.findAlbum(s.insertedAlbumId),
      trackIndex: s.trackIndex,
      position: s.position,
      glitch: s.lastGlitch,
      now,
    });
    const blinkPhase = Math.floor(now / 500) % 2 === 0;
    const key = `${content.main}|${content.sub}|${content.on}|${content.blink && blinkPhase}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    drawLcd(canvas.getContext('2d')!, size[0], size[1], content, blinkPhase);
    tex.needsUpdate = true;
  });

  return (
    <group position={[-0.66, DECK_TOP, 1.22]}>
      <mesh position={[0, 0.002, 0]}>
        <boxGeometry args={[1.12, 0.006, 0.42]} />
        <meshStandardMaterial color="#251F1B" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.0055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.04, 0.34]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The complete DiscDeck DD-1 player. */
export function CDPlayer3D() {
  const s = usePlayer(
    useShallow((st) => ({
      album: st.findAlbum(st.insertedAlbumId),
      profile: st.insertedAlbumId ? st.damage[st.insertedAlbumId] : undefined,
      lidOpen: st.lidOpen,
      discPhase: st.discPhase,
      state: st.state,
      powered: st.powered,
    })),
  );
  const actions = usePlayer.getState();
  const { album, profile } = s;
  const strokes = useMemo(
    () => (profile ? [...generateConditionStrokes(profile.seed, profile.condition), ...profile.strokes] : []),
    [profile],
  );
  const reduced = prefersReducedMotion();
  const walnut = useDisposable(() => {
    const t = toTexture(drawWalnut());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  const [wellHover, setWellHover] = useState(false);
  useCursor(wellHover && s.lidOpen && !album);

  const playing = s.state === 'PLAYING';
  const buttons: ButtonProps[] = ([
    { glyph: 'power', label: 'Power', active: s.powered, onPress: () => void actions.togglePower(), x: 0, z: 0 },
    { glyph: 'prev', label: 'Previous track', onPress: () => void actions.prev(), x: 0, z: 0 },
    { glyph: playing ? 'pause' : 'play', label: playing ? 'Pause' : 'Play', accent: true, active: playing, onPress: () => void actions.togglePlay(), x: 0, z: 0 },
    { glyph: 'stop', label: 'Stop', onPress: () => void actions.stop(), x: 0, z: 0 },
    { glyph: 'next', label: 'Next track', onPress: () => void actions.next(), x: 0, z: 0 },
    { glyph: 'eject', label: 'Eject', onPress: () => void actions.eject(), x: 0, z: 0 },
  ] satisfies ButtonProps[]).map((b, i) => ({ ...b, x: 0.1 + i * 0.218, z: 1.22 }));

  return (
    <group>
      {/* Walnut base */}
      <RoundedBox args={[BODY_W - 0.08, 0.06, BODY_D - 0.08]} radius={0.028} smoothness={3} position={[0, 0.03, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={walnut} roughness={0.55} metalness={0} />
      </RoundedBox>
      {/* Creamy matte housing */}
      <RoundedBox args={[BODY_W, 0.28, BODY_D]} radius={0.11} smoothness={4} position={[0, 0.19, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#EEE5D7" roughness={0.72} metalness={0} sheen={0.3} sheenColor="#fff4e2" />
      </RoundedBox>
      <Deck />
      <mesh
        position={[0, BODY_TOP + 0.004, DISC_Z]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        onPointerOver={() => setWellHover(true)}
        onPointerOut={() => setWellHover(false)}
        onClick={(e) => {
          if (!s.lidOpen || album) return;
          e.stopPropagation();
          void actions.insertDisc();
        }}
      >
        <circleGeometry args={[WELL_R, 48]} />
      </mesh>
      <WellInterior />
      {album && s.discPhase !== 'none' && (
        <Disc3D
          key={album.id}
          album={album}
          strokes={strokes}
          wear={profile ? { condition: profile.condition, seed: profile.seed } : undefined}
          phase={s.discPhase}
          spinning={playing && s.powered}
          seat={SEAT}
          reducedMotion={reduced}
        />
      )}
      <Lid3D open={s.lidOpen} hinge={[0, DECK_TOP + 0.005, -BODY_D / 2 + 0.06]} width={BODY_W - 0.1} depth={2.48} reducedMotion={reduced} onToggle={actions.toggleLid} />
      <Lcd3D />
      {buttons.map((b) => (
        <Button3D key={b.label} {...b} />
      ))}
      {/* Power LED */}
      <mesh position={[1.2, DECK_TOP + 0.004, 1.48]}>
        <sphereGeometry args={[0.018, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#5a4030" emissive="#E8B66B" emissiveIntensity={s.powered ? 2.2 : 0} toneMapped={false} />
      </mesh>
    </group>
  );
}
