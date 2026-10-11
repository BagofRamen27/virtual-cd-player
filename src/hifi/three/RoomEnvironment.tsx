import { useEffect, useMemo, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { usePlayer } from '../../state/store';
import { loadImage } from '../../lib/useImage';
import { floorPlanks, plaster, rug, woodColor, woodRoughness } from './materials';

const TOP_W = 11.5;
const TOP_D = 3.8;
const BODY_H = 1.55;
const LEG_H = 0.85;
export const FLOOR_Y = -0.16 - BODY_H - LEG_H;

function Veneer({ seed = 3, clearcoat = 0.3, vertical = false, size = 512 }: { seed?: number; clearcoat?: number; vertical?: boolean; size?: number }) {
  return <meshPhysicalMaterial map={woodColor('walnut', seed, vertical, size)} roughnessMap={woodRoughness(seed)} roughness={1} clearcoat={clearcoat} clearcoatRoughness={0.3} />;
}

/** Mid-century walnut credenza: veneered top with a bevelled edge, slatted doors, tapered legs. */
function Credenza() {
  const doorW = (TOP_W - 0.5) / 4;
  return (
    <group>
      <RoundedBox args={[TOP_W, 0.16, TOP_D]} radius={0.05} smoothness={4} position={[0, -0.08, 0]} receiveShadow castShadow>
        <Veneer seed={3} clearcoat={0.45} size={1024} />
      </RoundedBox>
      {/* carcass */}
      <mesh position={[0, -0.16 - BODY_H / 2, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[TOP_W - 0.3, BODY_H, TOP_D - 0.3]} />
        <Veneer seed={11} clearcoat={0.2} />
      </mesh>
      {/* four doors with vertical slats and a shadow gap between each */}
      {Array.from({ length: 4 }, (_, d) => {
        const x = -TOP_W / 2 + 0.25 + doorW * (d + 0.5);
        return (
          <group key={d} position={[x, -0.16 - BODY_H / 2, TOP_D / 2 - 0.19]}>
            <mesh>
              <boxGeometry args={[doorW - 0.03, BODY_H - 0.12, 0.03]} />
              <meshStandardMaterial color="#20160f" roughness={0.9} />
            </mesh>
            {Array.from({ length: 11 }, (_, i) => (
              <mesh key={i} position={[(i - 5) * ((doorW - 0.1) / 11), 0, 0.03]} castShadow>
                <boxGeometry args={[(doorW - 0.1) / 11 - 0.012, BODY_H - 0.16, 0.04]} />
                <Veneer seed={11 + (i % 3)} clearcoat={0.2} vertical />
              </mesh>
            ))}
            {/* recessed brass pull */}
            <mesh position={[d % 2 === 0 ? doorW / 2 - 0.12 : -doorW / 2 + 0.12, 0.15, 0.06]}>
              <boxGeometry args={[0.03, 0.28, 0.02]} />
              <meshStandardMaterial color="#c9a45c" metalness={1} roughness={0.3} />
            </mesh>
          </group>
        );
      })}
      {/* tapered, splayed legs */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            position={[sx * (TOP_W / 2 - 0.6), -0.16 - BODY_H - LEG_H / 2 + 0.02, sz * (TOP_D / 2 - 0.5)]}
            rotation={[sz * 0.08, 0, -sx * 0.08]}
            castShadow
          >
            <cylinderGeometry args={[0.07, 0.035, LEG_H, 20]} />
            <Veneer seed={11} vertical />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Wall-mounted slatted acoustic panel behind the gear (felt backing + walnut slats). */
function SlatPanel() {
  const W = 3.4;
  const H = 2.1;
  const n = 18;
  return (
    <group position={[0.75, 2.05, -2.52]}>
      <mesh receiveShadow>
        <boxGeometry args={[W, H, 0.03]} />
        <meshStandardMaterial color="#2c241f" roughness={1} />
      </mesh>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[-W / 2 + (W / n) * (i + 0.5), 0, 0.045]} castShadow receiveShadow>
          <boxGeometry args={[(W / n) * 0.78, H, 0.06]} />
          <Veneer seed={11 + (i % 3)} clearcoat={0.15} vertical />
        </mesh>
      ))}
    </group>
  );
}

/** Ceramic table lamp with a linen drum shade — also the room's warm practical light. */
function TableLamp({ dark }: { dark: boolean }) {
  return (
    <group position={[-2.45, 0, -1.75]} scale={0.85}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <sphereGeometry args={[0.36, 32, 24]} />
        <meshPhysicalMaterial color="#b8a58c" roughness={0.35} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.7, 12]} />
        <meshStandardMaterial color="#c9a45c" metalness={1} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.52, 0.62, 0.62, 48, 1, true]} />
        <meshStandardMaterial color="#efe2c8" emissive="#ffcf8a" emissiveIntensity={dark ? 1.1 : 0.55} roughness={1} side={THREE.DoubleSide} transparent opacity={0.96} />
      </mesh>
      <pointLight position={[0, 1.35, 0]} intensity={dark ? 9 : 4.5} color="#ffb874" distance={9} decay={2} castShadow={false} />
    </group>
  );
}

/** A small stack of your own albums in jewel cases, using their real covers. */
function CdStack() {
  const albums = usePlayer((s) => s.albums);
  const covers = useMemo(() => albums.filter((a) => a.coverUrl).slice(0, 4), [albums]);
  const [textures, setTextures] = useState<(THREE.Texture | null)[]>([]);
  useEffect(() => {
    let alive = true;
    let owned: (THREE.Texture | null)[] = [];
    void Promise.all(covers.map((a) => loadImage(a.coverUrl!))).then((imgs) => {
      if (!alive) return;
      owned = imgs.map((img) => {
          if (!img) return null;
          const t = new THREE.Texture(img);
          t.colorSpace = THREE.SRGBColorSpace;
          t.needsUpdate = true;
          return t;
        });
      setTextures(owned);
    });
    return () => {
      alive = false;
      owned.forEach(texture => texture?.dispose());
    };
  }, [covers]);
  if (!covers.length) return null;
  return (
    <group position={[-3.0, 0, 1.3]} rotation={[0, 0.35, 0]}>
      {covers.map((a, i) => (
        <group key={a.id} position={[Math.sin(i * 1.7) * 0.03, 0.055 + i * 0.105, Math.cos(i * 2.3) * 0.03]} rotation={[0, (i - 1.5) * 0.08, 0]}>
          {/* jewel case */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.72, 0.1, 0.63]} />
            <meshPhysicalMaterial color="#e9eef0" transparent opacity={0.35} roughness={0.05} clearcoat={1} depthWrite={false} />
          </mesh>
          {/* cover insert under the lid */}
          <mesh position={[0.02, 0.046, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.62, 0.6]} />
            {textures[i] ? <meshStandardMaterial map={textures[i]!} roughness={0.6} /> : <meshStandardMaterial color={a.tint} roughness={0.6} />}
          </mesh>
          {/* black tray + hinge */}
          <mesh position={[0, -0.03, 0]}>
            <boxGeometry args={[0.7, 0.035, 0.61]} />
            <meshStandardMaterial color="#121010" roughness={0.4} />
          </mesh>
          <mesh position={[-0.355, 0.02, 0]}>
            <boxGeometry args={[0.02, 0.06, 0.63]} />
            <meshPhysicalMaterial color="#dfe5e8" transparent opacity={0.5} roughness={0.1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function RoomEnvironment({ dark }: { dark: boolean }) {
  return (
    <group>
      <Credenza />
      {/* Plaster wall with a skirting board */}
      <mesh position={[0, 2, -2.6]} receiveShadow>
        <planeGeometry args={[34, 12]} />
        <meshStandardMaterial map={plaster(dark)} roughness={0.95} />
      </mesh>
      <mesh position={[0, FLOOR_Y + 0.12, -2.57]}>
        <boxGeometry args={[34, 0.24, 0.05]} />
        <meshStandardMaterial color={dark ? '#2a221d' : '#efe6d9'} roughness={0.7} />
      </mesh>
      <SlatPanel />
      {/* Oak plank floor and a wool rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 2]} receiveShadow>
        <planeGeometry args={[34, 14]} />
        <meshStandardMaterial map={floorPlanks()} roughness={0.75} color={dark ? '#6d5a4a' : '#ffffff'} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y + 0.01, 3.2]} receiveShadow>
        <planeGeometry args={[9, 5.5]} />
        <meshStandardMaterial map={rug()} roughness={1} color={dark ? '#8a7966' : '#ffffff'} />
      </mesh>
      <TableLamp dark={dark} />
      <CdStack />
    </group>
  );
}
