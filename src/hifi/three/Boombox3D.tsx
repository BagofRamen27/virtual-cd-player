import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import { useShallow } from 'zustand/react/shallow';
import { usePlayer } from '../../state/store';
import { lcdContent } from '../../lib/lcd';
import { DiscMeshes } from '../../three/Disc3D';
import { drawLcd, toTexture } from '../../three/textures';
import { readMeters } from '../meters';
import { useHifi } from '../store';
import { Knob3D, PanelButton } from './Knob3D';

export const BOOMBOX_SIZE = { w: 2.3, h: 1.15, d: 0.7 };
export const BOOMBOX_JACKS: Record<string, [number, number, number]> = {
  phones: [0.95, 0.22, BOOMBOX_SIZE.d / 2 + 0.02],
};

function grilleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a2724';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#0f0d0c';
  for (let y = 6; y < 256; y += 12) for (let x = 6 + ((y / 12) % 2) * 6; x < 256; x += 12) {
    g.beginPath();
    g.arc(x, y, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Grille({ x, channel, active }: { x: number; channel: 'L' | 'R'; active: boolean }) {
  const tex = useMemo(() => grilleTexture(), []);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!ring.current) return;
    const m = readMeters();
    const level = active ? (channel === 'L' ? m.outL : m.outR) : 0;
    easing.damp(ring.current.scale, 'x', 1 + level * 0.03, 0.03, dt);
    ring.current.scale.y = ring.current.scale.x;
  });
  return (
    <group position={[x, -0.1, BOOMBOX_SIZE.d / 2 + 0.003]}>
      <mesh ref={ring}>
        <circleGeometry args={[0.36, 48]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, -0.001]}>
        <ringGeometry args={[0.36, 0.4, 48]} />
        <meshStandardMaterial color="#b9b4ab" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

function BoomboxLcd() {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 128;
    return c;
  }, []);
  const tex = useMemo(() => toTexture(canvas), [canvas]);
  const last = useRef('');
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(() => {
    const s = usePlayer.getState();
    const now = performance.now();
    const content = lcdContent({ state: s.state, powered: true, lidOpen: s.lidOpen, album: s.findAlbum(s.insertedAlbumId), trackIndex: s.trackIndex, position: s.position, glitch: s.lastGlitch, now });
    const blink = Math.floor(now / 500) % 2 === 0;
    const key = `${content.main}|${content.sub}|${blink}`;
    if (key === last.current) return;
    last.current = key;
    drawLcd(canvas.getContext('2d')!, 384, 128, content, blink);
    tex.needsUpdate = true;
  });
  return (
    <mesh position={[0, 0.3, BOOMBOX_SIZE.d / 2 + 0.004]}>
      <planeGeometry args={[0.6, 0.2]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

/** Early-2000s top-loading CD boombox. Transport and volume are fully functional. */
export function Boombox3D({ builtinsActive }: { builtinsActive: boolean }) {
  const p = usePlayer(useShallow((s) => ({ album: s.findAlbum(s.insertedAlbumId), lidOpen: s.lidOpen, state: s.state, profile: s.insertedAlbumId ? s.damage[s.insertedAlbumId] : undefined })));
  const actions = usePlayer.getState();
  const volume = useHifi((s) => s.sourceVolumes['boombox-2003'] ?? 0.6);
  const setVolume = useHifi((s) => s.setSourceVolume);
  const lid = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Group>(null);
  const spin = useRef(0);
  useFrame((_, dt) => {
    if (lid.current) easing.dampAngle(lid.current.rotation, 'x', p.lidOpen ? -1.2 : 0, 0.3, dt);
    easing.damp(spin, 'current', p.state === 'PLAYING' ? 12 : 0, 0.5, dt);
    if (disc.current) disc.current.rotation.y -= spin.current * dt;
  });
  const { w, h, d } = BOOMBOX_SIZE;
  const top = h / 2;
  const front = d / 2 + 0.004;
  return (
    <group position={[0, h / 2 + 0.02, 0]}>
      <RoundedBox args={[w, h, d]} radius={0.12} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#3a3632" roughness={0.45} metalness={0.25} />
      </RoundedBox>
      {/* Silver front band */}
      <mesh position={[0, 0.3, front - 0.001]}>
        <planeGeometry args={[w - 0.25, 0.32]} />
        <meshStandardMaterial color="#bdb7ad" metalness={0.75} roughness={0.32} />
      </mesh>
      <Grille x={-0.72} channel="L" active={builtinsActive} />
      <Grille x={0.72} channel="R" active={builtinsActive} />
      <BoomboxLcd />
      {/* Transport */}
      <PanelButton position={[-0.62, 0.3, front]} label="Previous" onPress={() => void actions.prev()} />
      <PanelButton position={[-0.5, 0.3, front]} label={p.state === 'PLAYING' ? 'Pause' : 'Play'} color="#B77B56" onPress={() => void actions.togglePlay()} />
      <PanelButton position={[-0.38, 0.3, front]} label="Stop" onPress={() => void actions.stop()} />
      <PanelButton position={[0.38, 0.3, front]} label="Next" onPress={() => void actions.next()} />
      <PanelButton position={[0.5, 0.3, front]} label={p.album ? 'Open lid / eject' : 'Open lid'} onPress={() => void actions.eject()} />
      <Knob3D position={[0.0, -0.18, front]} radius={0.11} value={volume} min={0} max={1} defaultValue={0.6} label="Volume" format={(v) => `${Math.round(v * 30)}`} onChange={setVolume} />
      {/* Headphone jack */}
      <mesh position={BOOMBOX_JACKS.phones} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.01, 20]} />
        <meshStandardMaterial color="#0d0b0a" />
      </mesh>
      {/* Handle */}
      <mesh position={[0, top + 0.12, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.7, 0.04, 12, 48, Math.PI]} />
        <meshStandardMaterial color="#2a2623" roughness={0.5} />
      </mesh>
      {/* Top-loading CD well and lid */}
      <mesh position={[0, top + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 48]} />
        <meshStandardMaterial color="#15120f" />
      </mesh>
      {p.album && (
        <group ref={disc} position={[0, top + 0.006, 0]} scale={0.3}>
          <DiscMeshes album={p.album} strokes={[]} wear={p.profile ? { condition: p.profile.condition, seed: p.profile.seed } : undefined} />
        </group>
      )}
      <group ref={lid} position={[0, top + 0.01, -0.34]}>
        <mesh
          position={[0, 0.008, 0.34]}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleLid();
          }}
        >
          <boxGeometry args={[0.76, 0.016, 0.68]} />
          <meshPhysicalMaterial color="#5a4c42" transparent opacity={0.35} roughness={0.1} clearcoat={1} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
