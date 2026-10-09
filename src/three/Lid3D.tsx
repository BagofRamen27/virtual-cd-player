import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import { drawWordmark, toTexture } from './textures';

interface Lid3DProps {
  open: boolean;
  hinge: [number, number, number];
  width: number;
  depth: number;
  reducedMotion: boolean;
  onToggle: () => void;
}

const OPEN_ANGLE = -1.85; // ≈106°

/** Smoked acrylic lid on a rear hinge, with an aluminium front lip and printed wordmark. */
export function Lid3D({ open, hinge, width, depth, reducedMotion, onToggle }: Lid3DProps) {
  const pivot = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const wordmark = useMemo(() => toTexture(drawWordmark()), []);

  useFrame((_, dt) => {
    if (!pivot.current) return;
    // Opening feels sprung (quicker), closing is damped for a soft landing.
    const smooth = reducedMotion ? 0.04 : open ? 0.32 : 0.42;
    easing.dampAngle(pivot.current.rotation, 'x', open ? OPEN_ANGLE : 0, smooth, dt);
  });

  return (
    <group position={hinge}>
      {/* Hinge barrels */}
      {[-width * 0.33, width * 0.33].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.42, 24]} />
          <meshStandardMaterial color="#cdb596" metalness={0.85} roughness={0.32} />
        </mesh>
      ))}
      <group ref={pivot}>
        <group
          position={[0, 0.024, depth / 2]}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <RoundedBox args={[width, 0.045, depth]} radius={0.02} smoothness={3} castShadow>
            <meshPhysicalMaterial
              color="#7a6050"
              transparent
              opacity={0.22}
              roughness={0.06}
              metalness={0}
              clearcoat={1}
              clearcoatRoughness={0.04}
              reflectivity={0.6}
              envMapIntensity={1.2}
              depthWrite={false}
            />
          </RoundedBox>
          {/* Aluminium front lip for opening */}
          <mesh position={[0, -0.005, depth / 2 - 0.03]} castShadow>
            <boxGeometry args={[width * 0.38, 0.05, 0.07]} />
            <meshPhysicalMaterial color="#d6bf9f" metalness={0.9} roughness={0.3} anisotropy={0.6} />
          </mesh>
          <mesh position={[width / 2 - 0.62, 0.0235, depth / 2 - 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.0, 0.25]} />
            <meshBasicMaterial map={wordmark} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
