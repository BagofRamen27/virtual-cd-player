import { Suspense, useEffect, useRef, type ComponentRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;
import * as THREE from 'three';
import { usePlayer } from '../state/store';
import { CDPlayer3D } from './CDPlayer3D';
import { WarmEnvironment } from './WarmEnvironment';

function ResetOnToken({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const token = usePlayer((s) => s.viewResetToken);
  useEffect(() => {
    if (token > 0) controls.current?.reset();
  }, [token, controls]);
  return null;
}

export default function Stage() {
  const quality = usePlayer((s) => s.settings.quality);
  const theme = usePlayer((s) => s.settings.theme);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const high = quality === 'high';
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const floor = theme === 'dark' ? '#2c241f' : '#E4D8C6';

  return (
    <Canvas
      shadows={high ? 'percentage' : false}
      dpr={high ? [1, 2] : 1}
      camera={{ position: narrow ? [0, 3.7, 4.3] : [0, 4.4, 5.2], fov: 34, near: 0.1, far: 60 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: theme === 'dark' ? 0.95 : 1.05 }}
      aria-hidden="true"
    >
      <fog attach="fog" args={[floor, 9, 20]} />
      <ambientLight intensity={theme === 'dark' ? 0.25 : 0.4} color="#ffe6cc" />
      {/* Key: low golden-hour sun from the left window */}
      <directionalLight
        position={[-4, 6.5, 3.2]}
        intensity={theme === 'dark' ? 1.4 : 2.2}
        color="#ffd6a3"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      {/* Table lamp glow from the back right */}
      <pointLight position={[3.2, 2.6, -2.4]} intensity={theme === 'dark' ? 9 : 5} color="#ffb070" distance={14} decay={2} />

      <Suspense fallback={null}>
        <WarmEnvironment dark={theme === 'dark'} />
      </Suspense>

      <group position={[0, 0, 0]}>
        <CDPlayer3D />
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[24, 64]} />
        <meshStandardMaterial color={floor} roughness={0.95} />
      </mesh>
      <ContactShadows position={[0, 0.001, 0]} opacity={theme === 'dark' ? 0.7 : 0.45} scale={9} blur={2.6} far={2.5} resolution={high ? 512 : 256} frames={high ? Infinity : 1} color="#251F1B" />

      <OrbitControls
        ref={controls}
        makeDefault
        target={[0, 0.25, 0.1]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.8}
        maxDistance={9.5}
        minPolarAngle={0.12}
        maxPolarAngle={1.3}
        minAzimuthAngle={-1.3}
        maxAzimuthAngle={1.3}
      />
      <ResetOnToken controls={controls} />
    </Canvas>
  );
}
