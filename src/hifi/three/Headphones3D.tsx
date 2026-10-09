import * as THREE from 'three';

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
      <mesh castShadow>
        <torusGeometry args={[0.42, 0.04, 12, 48, Math.PI]} />
        <meshStandardMaterial color="#1f1c1a" roughness={0.6} />
      </mesh>
      {[-0.42, 0.42].map((x) => (
        <group key={x} position={[x, -0.02, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.12, 32]} />
            <meshStandardMaterial color="#2a2623" roughness={0.45} metalness={0.2} emissive="#E8B66B" emissiveIntensity={glow} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? -0.07 : 0.07, 0, 0]}>
            <torusGeometry args={[0.13, 0.04, 10, 32]} />
            <meshStandardMaterial color="#141210" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
