import * as THREE from 'three';
import { leather } from './materials';

/** Headphones resting on the table. `active` gives them a soft highlight when they're the live output. */
export function Headphones3D({ kind, active }: { kind: string; active: boolean }) {
  const glow = active ? 0.25 : 0;
  if (kind === 'earbuds-cheap') {
    return (
      <group>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0.05, 0]} castShadow>
            <sphereGeometry args={[0.06, 20, 14]} />
            <meshStandardMaterial color="#f1eee8" roughness={0.35} emissive="#E8B66B" emissiveIntensity={glow} />
          </mesh>
        ))}
        <mesh position={[0, 0.012, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.18, 0.007, 6, 40, Math.PI * 1.2]} />
          <meshStandardMaterial color="#f1eee8" />
        </mesh>
      </group>
    );
  }
  return (
    <group rotation={[-Math.PI / 2 + 0.05, 0, 0]} position={[0, 0.1, 0]}>
      {/* spring-steel band with a padded leather top */}
      <mesh castShadow>
        <torusGeometry args={[0.44, 0.012, 8, 64, Math.PI]} />
        <meshStandardMaterial color="#8d877e" metalness={1} roughness={0.25} />
      </mesh>
      <mesh castShadow rotation={[0, 0, Math.PI * 0.15]}>
        <torusGeometry args={[0.42, 0.035, 12, 48, Math.PI * 0.7]} />
        <meshStandardMaterial color="#1f1c1a" roughness={0.7} bumpMap={leather()} bumpScale={0.8} />
      </mesh>
      {[-0.42, 0.42].map((x) => (
        <group key={x} position={[x, -0.02, 0]}>
          {/* metal yoke */}
          <mesh position={[0, 0.17, 0]}>
            <boxGeometry args={[0.02, 0.1, 0.25]} />
            <meshStandardMaterial color="#8d877e" metalness={1} roughness={0.3} />
          </mesh>
          {/* cup */}
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.17, 0.16, 0.11, 48]} />
            <meshPhysicalMaterial color="#25211e" roughness={0.4} metalness={0.15} clearcoat={0.5} emissive="#E8B66B" emissiveIntensity={glow} />
          </mesh>
          {/* leather ear pad */}
          <mesh rotation={[0, Math.PI / 2, 0]} position={[x > 0 ? -0.075 : 0.075, 0, 0]}>
            <torusGeometry args={[0.12, 0.045, 14, 40]} />
            <meshStandardMaterial color="#171513" roughness={0.65} bumpMap={leather()} bumpScale={1.2} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
