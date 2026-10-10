import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import { usePlayer } from '../../state/store';
import { formatTime } from '../../lib/art';
import { rackOf, useHifi } from '../store';
import { brushedBump, brushedRoughness, plasticBump } from './materials';
import { PanelButton } from './Knob3D';

export const DECK_JACKS: Record<string, [number, number, number]> = { 'line-out': [0.9, 0.18, -0.8] };

/** Model-specific silhouettes and loading mechanisms; transport operates the actual player. */
export function CDDeck3D() {
  const source = rackOf(useHifi((s) => s.rackIds)).source!;
  const p = usePlayer();
  const topLoader = source.id === 'philips-cd100';
  const silver = topLoader;
  const width = topLoader ? 1.9 : 2.4;
  const height = topLoader ? 0.32 : source.id === 'yamaha-cd1' ? 0.6 : 0.45;
  const front = 0.8;
  const tray = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const face = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 384;
    const g = c.getContext('2d')!;
    g.fillStyle = silver ? '#deddd8' : '#232728'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = silver ? '#343b3c' : '#c6cdcc'; g.font = '600 48px Arial';
    g.fillText(source.manufacturerInspiration, 65, 70);
    g.font = '20px Arial'; g.fillText('COMPACT DISC DIGITAL AUDIO', 65, 104);
    g.fillText('PLAY / PAUSE', 1340, 335); g.fillText('STOP', 1560, 335); g.fillText('OPEN / CLOSE', 1710, 335);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8; return texture;
  }, [source.id, source.manufacturerInspiration, silver]);
  const display = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, texture };
  }, []);
  const seconds = Math.floor(p.position);
  useEffect(() => {
    const g = display.canvas.getContext('2d')!;
    g.fillStyle = '#061a14'; g.fillRect(0, 0, 512, 160);
    g.fillStyle = p.powered ? '#91e9c3' : '#20362d'; g.font = '58px monospace';
    g.fillText(p.insertedAlbumId ? `${String(p.trackIndex + 1).padStart(2, '0')}  ${formatTime(seconds)}` : 'NO DISC', 20, 100);
    display.texture.needsUpdate = true;
  }, [display, p.trackIndex, p.insertedAlbumId, p.powered, seconds]);
  useEffect(() => () => face.dispose(), [face]);
  useEffect(() => () => display.texture.dispose(), [display]);
  useFrame((_, dt) => {
    if (tray.current) easing.damp(tray.current.position, 'z', p.lidOpen ? 0.5 : 0, 0.18, dt);
    if (lid.current) easing.damp(lid.current.rotation, 'x', p.lidOpen ? -1.1 : 0, 0.18, dt);
  });
  return (
    <group>
      <RoundedBox args={[width, height, 1.6]} radius={0.016} smoothness={3} position={[0, height / 2 + 0.04, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={silver ? '#c4c5c1' : '#25292a'} metalness={0.7} roughness={0.36} bumpMap={brushedBump(4)} bumpScale={0.002} />
      </RoundedBox>
      <mesh position={[0, height / 2 + 0.04, front + 0.002]}>
        <planeGeometry args={[width - 0.025, height - 0.012]} />
        <meshStandardMaterial map={face} metalness={0.5} roughnessMap={brushedRoughness(4)} roughness={0.8} />
      </mesh>
      <mesh position={[topLoader ? -0.48 : 0.25, height * 0.63, front + 0.009]}>
        <planeGeometry args={[topLoader ? 0.7 : 0.8, 0.12]} />
        <meshBasicMaterial map={display.texture} toneMapped={false} />
      </mesh>
      {topLoader ? (
        <group ref={lid} position={[0, height + 0.047, -0.45]}>
          <mesh position={[0, 0, 0.35]}>
            <boxGeometry args={[1.05, 0.018, 0.75]} />
            <meshPhysicalMaterial color="#24342e" transparent opacity={0.65} roughness={0.08} clearcoat={1} />
          </mesh>
        </group>
      ) : (
        <group ref={tray}>
          <mesh position={[-0.65, height * 0.48, front + 0.012]} castShadow>
            <boxGeometry args={[0.83, 0.13, 0.025]} />
            <meshStandardMaterial color="#111617" roughness={0.3} bumpMap={plasticBump()} bumpScale={0.001} />
          </mesh>
          <mesh position={[-0.65, height * 0.45 - 0.04, front - 0.23]}>
            <boxGeometry args={[0.8, 0.015, 0.48]} /><meshStandardMaterial color="#121414" roughness={0.75} />
          </mesh>
        </group>
      )}
      <PanelButton position={[width * 0.19, height * 0.28, front + 0.01]} size={[0.16, 0.08]} label="Play / pause" onPress={() => void p.togglePlay()} />
      <PanelButton position={[width * 0.31, height * 0.28, front + 0.01]} size={[0.1, 0.08]} label="Stop" onPress={() => void p.stop()} />
      <PanelButton position={[width * 0.42, height * 0.28, front + 0.01]} size={[0.1, 0.08]} label="Open / close" onPress={p.toggleLid} />
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <mesh key={`${x}${z}`} position={[x * (width / 2 - 0.15), 0.025, z * 0.6]}>
          <cylinderGeometry args={[0.06, 0.065, 0.05, 24]} /><meshStandardMaterial color="#151617" roughness={0.8} />
        </mesh>
      )))}
    </group>
  );
}
