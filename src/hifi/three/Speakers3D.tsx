import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import { readMeters } from '../meters';
import { grilleCloth, paperCone, plasticBump, woodColor, woodRoughness } from './materials';

export interface SpeakerLook {
  w: number;
  h: number;
  d: number;
  cabinet: 'walnut' | 'plastic' | 'black';
  woofer: number;
  tweeter: number;
  midrange?: number;
  coneColor?: string;
  grilleColor?: string;
  sealed?: boolean;
}

export const SPEAKER_LOOKS: Record<string, SpeakerLook> = {
  'jbl-l100': { w: 1.0, h: 1.65, d: 0.85, cabinet: 'walnut', woofer: 0.34, tweeter: 0.07, midrange: 0.13, coneColor: '#ece5d4', grilleColor: '#b95c24', sealed: true },
  'yamaha-ns1000m': { w: 0.96, h: 1.65, d: 0.85, cabinet: 'black', woofer: 0.32, tweeter: 0.075, midrange: 0.13, sealed: true },
  'yamaha-ns10m': { w: 0.7, h: 1.05, d: 0.65, cabinet: 'black', woofer: 0.22, tweeter: 0.06, coneColor: '#f1f0e8', sealed: true },
  'bookshelf-premium': { w: 0.85, h: 1.35, d: 0.95, cabinet: 'walnut', woofer: 0.25, tweeter: 0.055 },
  'mini-cheap': { w: 0.55, h: 0.75, d: 0.55, cabinet: 'plastic', woofer: 0.17, tweeter: 0 },
};

/**
 * A woofer with real anatomy: cast basket rim with screws, rubber surround, paper cone and dust
 * cap. The cone moves with the real output level of its channel while this pair is playing.
 */
function Woofer({ radius, channel, active, y, z, color }: { radius: number; channel: 'L' | 'R'; active: boolean; y: number; z: number; color?: string }) {
  const cone = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!cone.current) return;
    const m = readMeters();
    const level = active ? (channel === 'L' ? m.outL : m.outR) : 0;
    easing.damp(cone.current.position, 'z', level * radius * 0.09, 0.025, dt);
  });
  return (
    <group position={[0, y, z]}>
      {/* basket rim */}
      <mesh>
        <torusGeometry args={[radius * 1.14, radius * 0.07, 12, 64]} />
        <meshStandardMaterial color="#1c1917" metalness={0.6} roughness={0.4} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        return (
          <mesh key={i} position={[Math.cos(a) * radius * 1.14, Math.sin(a) * radius * 1.14, radius * 0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[radius * 0.035, radius * 0.035, radius * 0.03, 12]} />
            <meshStandardMaterial color="#6f6a63" metalness={0.9} roughness={0.35} />
          </mesh>
        );
      })}
      {/* recess behind the cone */}
      <mesh position={[0, 0, -radius * 0.3]}>
        <circleGeometry args={[radius, 48]} />
        <meshStandardMaterial color="#060505" />
      </mesh>
      <group ref={cone}>
        {/* rubber surround */}
        <mesh scale={[1, 1, 0.6]}>
          <torusGeometry args={[radius * 0.98, radius * 0.07, 16, 64]} />
          <meshStandardMaterial color="#141210" roughness={0.75} />
        </mesh>
        {/* paper cone (opens toward the listener) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -radius * 0.17]}>
          <coneGeometry args={[radius * 0.95, radius * 0.34, 64, 1, true]} />
          <meshStandardMaterial map={color ? undefined : paperCone()} color={color ?? '#ffffff'} roughness={0.92} side={THREE.DoubleSide} />
        </mesh>
        {/* dust cap */}
        <mesh position={[0, 0, -radius * 0.24]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.55, 1]}>
          <sphereGeometry args={[radius * 0.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color="#2c2724" roughness={0.45} clearcoat={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function Tweeter({ radius, y, z }: { radius: number; y: number; z: number }) {
  return (
    <group position={[0, y, z]}>
      {/* machined faceplate */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 2.3, radius * 2.3, 0.014, 48]} />
        <meshStandardMaterial color="#1d1a18" metalness={0.5} roughness={0.35} />
      </mesh>
      {/* shallow waveguide */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.004]}>
        <coneGeometry args={[radius * 1.9, radius * 0.4, 48, 1, true]} />
        <meshStandardMaterial color="#26221f" metalness={0.4} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      {/* soft dome */}
      <mesh position={[0, 0, 0.004]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d9d1c3" roughness={0.65} />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh key={i} position={[Math.cos(a) * radius * 1.95, Math.sin(a) * radius * 1.95, 0.009]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[radius * 0.1, radius * 0.1, 0.004, 10]} />
            <meshStandardMaterial color="#6f6a63" metalness={0.9} roughness={0.35} />
          </mesh>
        );
      })}
    </group>
  );
}

export function SpeakerCabinet({ look, channel, active }: { look: SpeakerLook; channel: 'L' | 'R'; active: boolean }) {
  const front = look.d / 2;
  const premium = look.cabinet !== 'plastic';
  return (
    <group position={[0, look.h / 2 + 0.02, 0]}>
      {premium ? (
        <>
          {/* Veneered cabinet with the grain running vertically */}
          <RoundedBox args={[look.w, look.h, look.d]} radius={0.018} smoothness={3} castShadow receiveShadow>
            <meshPhysicalMaterial map={look.cabinet === 'black' ? undefined : woodColor('walnut', 5, true, 1024)} color={look.cabinet === 'black' ? '#232628' : '#ffffff'} roughnessMap={woodRoughness(5)} roughness={0.8} clearcoat={0.15} clearcoatRoughness={0.5} />
          </RoundedBox>
          {/* Satin-black baffle, slightly proud of the cabinet */}
          <RoundedBox args={[look.w - 0.035, look.h - 0.035, 0.03]} radius={0.01} smoothness={2} position={[0, 0, front + 0.004]} castShadow>
            <meshPhysicalMaterial color="#1b1816" roughness={0.55} clearcoat={0.25} clearcoatRoughness={0.5} />
          </RoundedBox>
          <Woofer radius={look.woofer} channel={channel} active={active} y={-look.h * (look.midrange ? 0.2 : 0.1)} z={front + 0.022} color={look.coneColor} />
          {look.midrange && <Woofer radius={look.midrange} channel={channel} active={active} y={look.h * 0.12} z={front + 0.025} />}
          <Tweeter radius={look.tweeter} y={look.h * 0.29} z={front + 0.02} />
          {/* Front bass port */}
          {!look.sealed && <group position={[0, -look.h * 0.39, front + 0.02]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.06, 0.012, 10, 32]} />
              <meshStandardMaterial color="#141210" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0, -0.01]}>
              <circleGeometry args={[0.06, 32]} />
              <meshStandardMaterial color="#050404" />
            </mesh>
          </group>}
          {look.grilleColor && (
            <group position={[0, 0, front + 0.055]}>
              <RoundedBox args={[look.w - 0.075, look.h - 0.075, 0.055]} radius={0.015} smoothness={2}>
                <meshStandardMaterial color={look.grilleColor} roughness={1} map={grilleCloth('#db8550')} />
              </RoundedBox>
              {Array.from({ length: 8 }, (_, row) => Array.from({ length: 5 }, (_, col) => (
                <mesh key={`${row}-${col}`} position={[(col - 2) * 0.18, (row - 3.5) * 0.19, 0.03]}>
                  <boxGeometry args={[0.12, 0.13, 0.016]} /><meshStandardMaterial color="#85431f" roughness={1} />
                </mesh>
              )))}
            </group>
          )}
          {/* Small metal badge */}
          <mesh position={[0, -look.h * 0.46, front + 0.021]}>
            <boxGeometry args={[0.14, 0.022, 0.003]} />
            <meshStandardMaterial color="#c9b291" metalness={1} roughness={0.25} />
          </mesh>
        </>
      ) : (
        <>
          {/* Moulded matte plastic with a visible parting line */}
          <RoundedBox args={[look.w, look.h, look.d]} radius={0.04} smoothness={4} castShadow receiveShadow>
            <meshStandardMaterial color="#2b2826" roughness={0.68} metalness={0.05} bumpMap={plasticBump()} bumpScale={0.002} />
          </RoundedBox>
          <mesh position={[0, 0, front - 0.06]}>
            <boxGeometry args={[look.w + 0.002, look.h + 0.002, 0.004]} />
            <meshStandardMaterial color="#141210" roughness={0.9} />
          </mesh>
          {/* Cloth grille on a plastic frame */}
          <RoundedBox args={[look.w - 0.04, look.h - 0.04, 0.025]} radius={0.02} smoothness={2} position={[0, 0, front + 0.006]}>
            <meshStandardMaterial color="#1f1c1a" roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0, front + 0.0195]}>
            <planeGeometry args={[look.w - 0.075, look.h - 0.075]} />
            <meshStandardMaterial map={grilleCloth('#2e2a27')} roughness={1} />
          </mesh>
          {/* Faint driver outline pressing through the cloth */}
          <mesh position={[0, 0.02, front + 0.0198]}>
            <ringGeometry args={[look.woofer * 0.96, look.woofer, 48]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.18} />
          </mesh>
          <mesh position={[0, -look.h * 0.42, front + 0.02]}>
            <boxGeometry args={[0.1, 0.018, 0.004]} />
            <meshStandardMaterial color="#9c968c" metalness={0.6} roughness={0.4} />
          </mesh>
        </>
      )}
      {/* Binding posts on the back */}
      {[
        ['#b5371f', -0.05],
        ['#1b1714', 0.05],
      ].map(([color, x]) => (
        <group key={String(x)} position={[x as number, -look.h * 0.3, -look.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh position={[0, -0.01, 0]}>
            <cylinderGeometry args={[0.02, 0.022, 0.02, 20]} />
            <meshStandardMaterial color={color as string} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.03, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.03, 12]} />
            <meshStandardMaterial color="#d6b25e" metalness={1} roughness={0.25} />
          </mesh>
        </group>
      ))}
      {/* Rubber isolation pads */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (look.w / 2 - 0.08), -look.h / 2 - 0.01, sz * (look.d / 2 - 0.08)]}>
            <cylinderGeometry args={[0.04, 0.045, 0.02, 16]} />
            <meshStandardMaterial color="#141210" roughness={0.95} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function speakerTerminalLocal(look: SpeakerLook): [number, number, number] {
  return [0, look.h / 2 + 0.02 - look.h * 0.3, -look.d / 2 - 0.04];
}
