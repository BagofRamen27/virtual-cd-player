import { useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';

export interface Knob3DProps {
  position: [number, number, number];
  radius: number;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  label: string;
  format: (v: number) => string;
  onChange: (v: number) => void;
  /** Knob rotation range in radians (default ±135°). */
  sweep?: number;
  /** Drag sensitivity: full range per this many pixels. */
  travelPx?: number;
  color?: string;
  disabled?: boolean;
}

/**
 * A working rotary control on a front panel (axis = +z). Drag up/right to increase,
 * scroll to nudge, double-click to reset. Shows its value while hovered or turned.
 * Every 3D knob has an equivalent slider in the inspector for keyboard users.
 */
export function Knob3D({
  position,
  radius,
  value,
  min,
  max,
  defaultValue,
  label,
  format,
  onChange,
  sweep = (Math.PI * 3) / 2,
  travelPx = 220,
  color = '#d9d6cf',
  disabled,
}: Knob3DProps) {
  const body = useRef<THREE.Group>(null);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const drag = useRef<{ x: number; y: number; v: number } | null>(null);
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const t = (value - min) / (max - min);
  const angle = sweep / 2 - t * sweep;

  useFrame((_, dt) => {
    if (body.current) easing.dampAngle(body.current.rotation, 'z', angle, 0.06, dt);
  });

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const down = (e: ThreeEvent<PointerEvent>) => {
    if (disabled) return;
    e.stopPropagation();
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, v: value };
    if (controls) controls.enabled = false;
    setActive(true);
    document.body.style.cursor = 'grabbing';
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    e.stopPropagation();
    const d = drag.current.y - e.clientY + (e.clientX - drag.current.x);
    onChange(clamp(drag.current.v + (d / travelPx) * (max - min)));
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    e.stopPropagation();
    drag.current = null;
    if (controls) controls.enabled = true;
    setActive(false);
    document.body.style.cursor = hover ? 'grab' : '';
  };

  return (
    <group position={position}>
      <group
        ref={body}
        rotation={[0, 0, angle]}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          if (!drag.current && !disabled) document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          setHover(false);
          if (!drag.current) document.body.style.cursor = '';
        }}
        onWheel={(e) => {
          if (disabled) return;
          e.stopPropagation();
          onChange(clamp(value - Math.sign(e.deltaY) * (max - min) * 0.03));
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!disabled) onChange(defaultValue);
        }}
      >
        {/* skirt */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, radius * 0.18]} castShadow>
          <cylinderGeometry args={[radius * 1.08, radius * 1.12, radius * 0.36, 48]} />
          <meshStandardMaterial color="#2a2522" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* cap */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, radius * 0.55]} castShadow>
          <cylinderGeometry args={[radius, radius * 1.02, radius * 0.5, 48]} />
          <meshPhysicalMaterial color={color} metalness={0.9} roughness={0.28} anisotropy={0.8} />
        </mesh>
        {/* pointer line */}
        <mesh position={[0, radius * 0.6, radius * 0.81]}>
          <boxGeometry args={[radius * 0.08, radius * 0.6, 0.004]} />
          <meshStandardMaterial color={active || hover ? '#E8B66B' : '#3b2f27'} emissive="#E8B66B" emissiveIntensity={active ? 0.8 : hover ? 0.3 : 0} />
        </mesh>
      </group>
      {(hover || active) && (
        <Html position={[0, radius * 1.7, radius]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-full bg-espresso/90 px-2.5 py-1 text-[11px] font-medium text-ivory shadow">
            {label} · {format(value)}
          </div>
        </Html>
      )}
    </group>
  );
}

/** A latching / momentary push button on a front panel. */
export function PanelButton({
  position,
  size = [0.09, 0.05],
  lit,
  onPress,
  color = '#cfcac0',
  label,
}: {
  position: [number, number, number];
  size?: [number, number];
  lit?: boolean;
  onPress: () => void;
  color?: string;
  label: string;
}) {
  const cap = useRef<THREE.Mesh>(null);
  const [down, setDown] = useState(false);
  const [hover, setHover] = useState(false);
  useFrame((_, dt) => {
    if (cap.current) easing.damp(cap.current.position, 'z', down ? 0.006 : 0.022, 0.04, dt);
  });
  return (
    <group position={position}>
      <mesh
        ref={cap}
        position={[0, 0, 0.022]}
        castShadow
        onPointerDown={(e) => {
          e.stopPropagation();
          setDown(true);
        }}
        onPointerUp={() => setDown(false)}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          setDown(false);
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onPress();
        }}
      >
        <boxGeometry args={[size[0], size[1], 0.035]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.35} emissive="#E8B66B" emissiveIntensity={hover ? 0.15 : 0} />
      </mesh>
      {lit !== undefined && (
        <mesh position={[0, size[1] / 2 + 0.03, 0.01]}>
          <sphereGeometry args={[0.012, 12, 8]} />
          <meshStandardMaterial color="#3a2a20" emissive={lit ? '#ffb347' : '#000000'} emissiveIntensity={lit ? 2.4 : 0} toneMapped={false} />
        </mesh>
      )}
      {hover && (
        <Html position={[0, -size[1] - 0.05, 0.05]} center style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-full bg-espresso/90 px-2 py-0.5 text-[10px] text-ivory">{label}</div>
        </Html>
      )}
    </group>
  );
}
