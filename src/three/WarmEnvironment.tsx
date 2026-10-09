import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Locally generated studio environment (no HDR download): a warm room backdrop plus soft
 * window and lamp light sources, so metals read as champagne and the disc catches highlights.
 */
export function WarmEnvironment({ dark = false, resolution = 256 }: { dark?: boolean; resolution?: number }) {
  return (
    <Environment resolution={resolution} frames={1} background={false}>
      <mesh scale={30}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color={dark ? '#4a3a2e' : '#cdb79a'} side={THREE.BackSide} />
      </mesh>
      <Lightformer form="rect" intensity={dark ? 1.6 : 2.6} color="#ffe2bf" position={[0, 6, -1]} rotation-x={Math.PI / 2} scale={[9, 4, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#ffd2a0" position={[-6, 2.5, 1]} rotation-y={Math.PI / 2} scale={[7, 3, 1]} />
      <Lightformer form="circle" intensity={dark ? 4 : 3} color="#ffb070" position={[4, 2.5, -3]} scale={1.8} />
      <Lightformer form="rect" intensity={1.4} color="#fff4e6" position={[0, 2, 7]} rotation-y={Math.PI} scale={[12, 3, 1]} />
    </Environment>
  );
}
