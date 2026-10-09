import { useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { usePlayer } from '../state/store';
import type { Album, ScratchStroke } from '../types';
import { DATA_R0, DATA_R1, generateConditionStrokes, newDamageProfile, radiusToTime } from '../audio/damage';
import { formatTime } from '../lib/art';
import { hasWebGL } from '../lib/webgl';
import { DiscMeshes } from '../three/Disc3D';
import { WarmEnvironment } from '../three/WarmEnvironment';
import { CONDITION_LABELS } from '../types';
import { Button, Dialog, Icon } from './ui';

type Tool = 'paint' | 'erase' | 'rotate';

function polarFromEvent(e: ThreeEvent<PointerEvent>): { r: number; a: number } | null {
  if (!e.uv) return null;
  const x = e.uv.x * 2 - 1;
  const y = e.uv.y * 2 - 1;
  return { r: Math.hypot(x, y), a: Math.atan2(y, x) };
}

function locate(album: Album, r: number): string {
  if (r < DATA_R0) return 'Lead-in area — no audio here';
  if (r > DATA_R1) return 'Outer rim — beyond the program area';
  const total = album.tracks.reduce((s, t) => s + t.duration, 0);
  let t = radiusToTime(r, total);
  for (let i = 0; i < album.tracks.length; i++) {
    if (t < album.tracks[i].duration || i === album.tracks.length - 1) return `Track ${i + 1} · ${formatTime(t)}`;
    t -= album.tracks[i].duration;
  }
  return '';
}

function EditorBody({ album }: { album: Album }) {
  const stored = usePlayer((s) => s.damage[album.id]);
  const profile = useMemo(() => stored ?? newDamageProfile(album.id), [stored, album.id]);
  const { setStrokes, cleanDisc } = usePlayer.getState();
  const [tool, setTool] = useState<Tool>('paint');
  const [depth, setDepth] = useState(0.5);
  const [rotation, setRotation] = useState(0);
  const [draft, setDraft] = useState<ScratchStroke | null>(null);
  const [hover, setHover] = useState<string>('');
  const [kbRadius, setKbRadius] = useState(0.6);
  const [kbAngle, setKbAngle] = useState(0);
  const painting = useRef(false);
  const draftRef = useRef<ScratchStroke | null>(null);
  const updateDraft = (d: ScratchStroke | null) => {
    draftRef.current = d;
    setDraft(d);
  };

  const wear = useMemo(() => generateConditionStrokes(profile.seed, profile.condition), [profile.seed, profile.condition]);
  const all = useMemo(() => [...wear, ...profile.strokes, ...(draft ? [draft] : [])], [wear, profile.strokes, draft]);
  const userStrokes = profile.strokes;

  const eraseAt = (p: { r: number; a: number }) => {
    const px = p.r * Math.cos(p.a);
    const py = p.r * Math.sin(p.a);
    const keep = userStrokes.filter((s) => !s.points.some((q) => Math.hypot(q.r * Math.cos(q.a) - px, q.r * Math.sin(q.a) - py) < 0.045));
    if (keep.length !== userStrokes.length) setStrokes(album.id, keep);
  };

  const handlers = {
    down: (e: ThreeEvent<PointerEvent>) => {
      if (tool === 'rotate') return;
      e.stopPropagation();
      const p = polarFromEvent(e);
      if (!p) return;
      painting.current = true;
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
      if (tool === 'paint') updateDraft({ id: `s-${crypto.randomUUID()}`, points: [p], depth });
      else eraseAt(p);
    },
    move: (e: ThreeEvent<PointerEvent>) => {
      const p = polarFromEvent(e);
      if (p) setHover(locate(album, p.r));
      if (!painting.current || !p) return;
      if (tool === 'paint') {
        const d = draftRef.current;
        if (!d) return;
        const last = d.points[d.points.length - 1];
        const dist = Math.hypot(p.r * Math.cos(p.a) - last.r * Math.cos(last.a), p.r * Math.sin(p.a) - last.r * Math.sin(last.a));
        if (dist > 0.012) updateDraft({ ...d, points: [...d.points, p] });
      } else if (tool === 'erase') eraseAt(p);
    },
    up: () => {
      painting.current = false;
      const d = draftRef.current;
      if (d && d.points.length > 1) setStrokes(album.id, [...usePlayer.getState().damageFor(album.id).strokes, d]);
      updateDraft(null);
    },
  };

  /** Keyboard-accessible alternative to painting: an arced scratch at a chosen radius and angle. */
  const addArc = () => {
    const a0 = (kbAngle * Math.PI) / 180;
    const points = Array.from({ length: 8 }, (_, i) => ({ r: kbRadius, a: a0 + i * 0.05 }));
    setStrokes(album.id, [...userStrokes, { id: `s-${crypto.randomUUID()}`, points, depth }]);
  };

  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: 'paint', label: 'Scratch', icon: 'brush' },
    { id: 'erase', label: 'Erase', icon: 'eraser' },
    { id: 'rotate', label: 'Rotate view', icon: 'rotate' },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_240px]">
      <div>
        <div
          className="relative aspect-square w-full overflow-hidden rounded-2xl"
          style={{ background: 'var(--stage)', cursor: tool === 'rotate' ? 'grab' : 'crosshair', touchAction: 'none' }}
        >
          <Canvas camera={{ position: [0, 2.9, 0.001], fov: 42 }} dpr={[1, 2]} aria-hidden="true">
            <ambientLight intensity={0.6} color="#ffe6cc" />
            <directionalLight position={[-2, 4, 2]} intensity={1.6} color="#ffd6a3" />
            <WarmEnvironment resolution={128} />
            <group rotation={[0, rotation, 0]}>
              <DiscMeshes album={album} strokes={all} highlight={draft?.id} onSurfacePointer={handlers} />
            </group>
            <OrbitControls enabled={tool === 'rotate'} enablePan={false} minDistance={1.8} maxDistance={4.5} />
          </Canvas>
        </div>
        <p className="mt-2 h-4 text-xs text-muted" aria-live="polite">
          {hover || 'Inner edge = start of the album, outer edge = the end. Arced scratches skip; radial ones click.'}
        </p>
      </div>

      <div className="space-y-5 text-sm">
        <div role="radiogroup" aria-label="Tool" className="grid grid-cols-3 gap-1.5">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tool === t.id}
              onClick={() => setTool(t.id)}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium ${tool === t.id ? 'bg-ink text-bg' : 'bg-surface-2/60 text-ink-soft hover:bg-surface-2'}`}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="flex justify-between text-xs text-ink-soft">
            Scratch depth <span className="text-muted">{depth < 0.35 ? 'hairline' : depth < 0.7 ? 'scuff' : 'gouge'}</span>
          </span>
          <input type="range" className="dd-range mt-1" style={{ ['--fill' as string]: `${depth * 100}%` }} min={0.1} max={1} step={0.05} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
        </label>

        <label className="block">
          <span className="text-xs text-ink-soft">Turn disc</span>
          <input
            type="range"
            className="dd-range mt-1"
            style={{ ['--fill' as string]: `${(rotation / (Math.PI * 2)) * 100}%` }}
            min={0}
            max={Math.PI * 2}
            step={0.05}
            value={rotation}
            aria-valuetext={`${Math.round((rotation * 180) / Math.PI)} degrees`}
            onChange={(e) => setRotation(Number(e.target.value))}
          />
        </label>

        <fieldset className="rounded-2xl border border-line p-3">
          <legend className="px-1 text-xs text-ink-soft">Add a scratch precisely</legend>
          <label className="block text-xs text-muted">
            Position: {locate(album, kbRadius)}
            <input type="range" className="dd-range" min={DATA_R0} max={DATA_R1} step={0.005} value={kbRadius} onChange={(e) => setKbRadius(Number(e.target.value))} aria-label="Scratch position on the disc" />
          </label>
          <label className="mt-1 block text-xs text-muted">
            Angle: {kbAngle}°
            <input type="range" className="dd-range" min={0} max={355} step={5} value={kbAngle} onChange={(e) => setKbAngle(Number(e.target.value))} aria-label="Scratch angle" />
          </label>
          <Button size="sm" className="mt-2 w-full" onClick={addArc}>
            <Icon name="plus" size={14} /> Add scratch
          </Button>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setStrokes(album.id, userStrokes.slice(0, -1))} disabled={!userStrokes.length}>
            Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => cleanDisc(album.id)}>
            <Icon name="sparkle" size={14} /> Clean disc
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Condition: {CONDITION_LABELS[profile.condition]} · {userStrokes.length} hand-made scratch{userStrokes.length === 1 ? '' : 'es'}. Changes save automatically
          {album.source === 'spotify' ? ' and are cosmetic only for Spotify discs.' : ' and apply to playback immediately.'}
        </p>
      </div>
    </div>
  );
}

export function ScratchEditor() {
  const albumId = usePlayer((s) => s.scratchEditorAlbumId);
  const album = usePlayer((s) => s.findAlbum(s.scratchEditorAlbumId));
  const setUi = usePlayer((s) => s.setUi);
  const close = () => setUi({ scratchEditorAlbumId: null });
  return (
    <Dialog open={!!albumId} onClose={close} title={album ? `Scratch editor · ${album.title}` : 'Scratch editor'} wide>
      {album && (hasWebGL() ? <EditorBody album={album} /> : <p className="text-sm text-muted">The scratch editor needs WebGL. You can still set the disc condition from the Now Playing panel.</p>)}
    </Dialog>
  );
}
