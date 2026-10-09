import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import { readMeters } from '../meters';
import { drawWalnut, toTexture } from '../../three/textures';

export interface SpeakerLook {
  w: number;
  h: number;
  d: number;
  cabinet: 'walnut' | 'plastic';
  woofer: number;
  tweeter: number;
}

export const SPEAKER_LOOKS: Record<string, SpeakerLook> = {
  'bookshelf-premium': { w: 0.85, h: 1.35, d: 0.95, cabinet: 'walnut', woofer: 0.26, tweeter: 0.07 },
  'mini-cheap': { w: 0.55, h: 0.75, d: 0.55, cabinet: 'plastic', woofer: 0.17, tweeter: 0 },
};

/** Driver cone that moves with the real output level on its channel when this pair is playing. */
function Driver({ radius, channel, active, y, z }: { radius: number; channel: 'L' | 'R'; active: boolean; y: number; z: number }) {
  const cone = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!cone.current) return;
    const m = readMeters();
    const level = active ? (channel === 'L' ? m.outL : m.outR) : 0;
    easing.damp(cone.current.position, 'z', z + level * radius * 0.08, 0.03, dt);
  });
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0, z - 0.004]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 1.12, radius * 1.12, 0.02, 40]} />
        <meshStandardMaterial color="#1f1b18" metalness={0.3} roughness={0.6} />
      </mesh>
      <group ref={cone} position={[0, 0, z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[radius, radius * 0.35, 40, 1, true]} />
          <meshStandardMaterial color="#2c2622" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <sphereGeometry args={[radius * 0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#3a332d" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

export function SpeakerCabinet({ look, channel, active }: { look: SpeakerLook; channel: 'L' | 'R'; active: boolean }) {
  const walnut = useMemo(() => {
    const t = toTexture(drawWalnut());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  const front = look.d / 2 + 0.002;
  return (
    <group position={[0, look.h / 2, 0]}>
      <RoundedBox args={[look.w, look.h, look.d]} radius={look.cabinet === 'plastic' ? 0.05 : 0.02} smoothness={3} castShadow receiveShadow>
        {look.cabinet === 'walnut' ? (
          <meshStandardMaterial map={walnut} roughness={0.5} />
        ) : (
          <meshStandardMaterial color="#26221f" roughness={0.4} metalness={0.1} />
        )}
      </RoundedBox>
      {/* Baffle */}
      <mesh position={[0, 0, front]}>
        <planeGeometry args={[look.w - 0.06, look.h - 0.06]} />
        <meshStandardMaterial color={look.cabinet === 'walnut' ? '#2a2420' : '#1d1a18'} roughness={0.8} />
      </mesh>
      <Driver radius={look.woofer} channel={channel} active={active} y={look.tweeter ? -look.h * 0.14 : 0} z={front + 0.01} />
      {look.tweeter > 0 && (
        <group position={[0, look.h * 0.27, front + 0.012]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[look.tweeter * 1.6, look.tweeter * 1.6, 0.015, 32]} />
            <meshStandardMaterial color="#c9b291" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.008]}>
            <sphereGeometry args={[look.tweeter, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#d8d2c6" roughness={0.4} />
          </mesh>
        </group>
      )}
      {/* Binding posts on the back */}
      {[
        ['#c0392b', -0.05],
        ['#1b1410', 0.05],
      ].map(([color, x]) => (
        <mesh key={String(x)} position={[x as number, -look.h * 0.3, -look.d / 2 - 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.04, 16]} />
          <meshStandardMaterial color={color as string} />
        </mesh>
      ))}
    </group>
  );
}

export function speakerTerminalLocal(look: SpeakerLook): [number, number, number] {
  return [0, look.h / 2 - look.h * 0.3, -look.d / 2 - 0.03];
}
