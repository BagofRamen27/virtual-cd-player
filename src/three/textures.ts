import * as THREE from 'three';
import type { Album, ScratchStroke } from '../types';
import { mulberry32, hashString } from '../audio/damage';

/** Label ring geometry radii (disc radius = 1). */
export const LABEL_INNER = 0.36;
export const LABEL_OUTER = 0.86;

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Disc-space polar (r in disc radii, a in radians) → canvas pixels for a full-disc square map. */
export function polarToCanvas(r: number, a: number, size: number, mapRadius = 1): [number, number] {
  const k = r / mapRadius;
  return [((1 + k * Math.cos(a)) / 2) * size, ((1 - k * Math.sin(a)) / 2) * size];
}

/**
 * Printed disc label: album artwork cropped to a circle with the artist and title set on an
 * arc near the rim so they stay readable. The canvas spans LABEL_OUTER (RingGeometry UVs).
 */
export function drawLabel(album: Album, img: HTMLImageElement | null, size = 1024): HTMLCanvasElement {
  const [c, g] = canvas(size);
  const cx = size / 2;
  g.save();
  g.beginPath();
  g.arc(cx, cx, cx, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = album.tint;
  g.fillRect(0, 0, size, size);
  if (img) {
    try {
      g.drawImage(img, 0, 0, size, size);
    } catch {
      /* tainted or broken image: keep the tint */
    }
  } else {
    // Simple printed pattern when no artwork is available.
    g.strokeStyle = 'rgba(244,239,231,0.25)';
    for (let r = size * 0.22; r < size * 0.5; r += size * 0.025) {
      g.beginPath();
      g.arc(cx, cx, r, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Text band around the rim
  const bandInner = cx * 0.8;
  g.beginPath();
  g.arc(cx, cx, cx, 0, Math.PI * 2);
  g.arc(cx, cx, bandInner, 0, Math.PI * 2, true);
  g.fillStyle = 'rgba(37,31,27,0.62)';
  g.fill();
  g.restore();

  const text = `${album.artist} · ${album.title}`.toUpperCase();
  const fontPx = Math.round(size * 0.042);
  g.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
  g.fillStyle = '#F4EFE7';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const radius = (cx + bandInner) / 2;
  const maxArc = Math.PI * 1.15;
  let chars = [...text];
  const spacing = 0.12;
  const charAngle = (ch: string) => (g.measureText(ch).width * (1 + spacing)) / radius;
  let total = chars.reduce((s, ch) => s + charAngle(ch), 0);
  while (total > maxArc && chars.length > 4) {
    chars = [...chars.slice(0, -2), '…'];
    total = chars.reduce((s, ch) => s + charAngle(ch), 0);
  }
  // Centered at the bottom of the label, reading left → right.
  let angle = Math.PI / 2 + total / 2;
  for (const ch of chars) {
    const w = charAngle(ch);
    angle -= w / 2;
    g.save();
    g.translate(cx + Math.cos(angle) * radius, cx + Math.sin(angle) * radius);
    g.rotate(angle - Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
    angle -= w / 2;
  }
  return c;
}

/** Rotational motion blur of the label, faded in as the disc spins up. */
export function drawRotationalBlur(src: HTMLCanvasElement, steps = 14, spread = 0.5): HTMLCanvasElement {
  const size = 512;
  const [c, g] = canvas(size);
  g.globalAlpha = 1 / steps;
  for (let i = 0; i < steps; i++) {
    const a = (i / (steps - 1) - 0.5) * spread;
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate(a);
    g.drawImage(src, -size / 2, -size / 2, size, size);
    g.restore();
  }
  // Even out the result toward the average colour so it reads as blur, not ghosting.
  g.globalAlpha = 0.35;
  g.filter = 'blur(6px)';
  g.drawImage(c, 0, 0);
  g.filter = 'none';
  g.globalAlpha = 1;
  return c;
}

/** Scratch marks on a transparent full-disc map. */
export function drawScratches(strokes: ScratchStroke[], size = 1024, highlight?: string | null): HTMLCanvasElement {
  const [c, g] = canvas(size);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const s of strokes) {
    if (s.points.length < 2) continue;
    const rng = mulberry32(hashString(s.id));
    const sel = highlight === s.id;
    // Each scratch is a cluster of 1–3 fine parallel hairlines.
    const lines = 1 + Math.floor(rng() * (1 + s.depth * 2));
    for (let l = 0; l < lines; l++) {
      const off = (rng() - 0.5) * 0.006;
      g.beginPath();
      s.points.forEach((p, i) => {
        const [x, y] = polarToCanvas(p.r + off, p.a, size);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.strokeStyle = sel ? 'rgba(232,182,107,0.95)' : `rgba(255,255,255,${0.18 + s.depth * 0.5})`;
      g.lineWidth = (0.6 + s.depth * 2.2) * (size / 1024) * (l === 0 ? 1 : 0.6);
      g.stroke();
      // Dark edge gives the mark some depth.
      g.strokeStyle = `rgba(30,24,20,${0.08 + s.depth * 0.25})`;
      g.lineWidth *= 0.5;
      g.translate(0.8, 0.8);
      g.stroke();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  return c;
}

export interface LcdContent {
  main: string;
  sub: string;
  on: boolean;
  blink?: boolean;
}

export function drawLcd(g: CanvasRenderingContext2D, w: number, h: number, lcd: LcdContent, blinkPhase: boolean) {
  g.clearRect(0, 0, w, h);
  const bg = g.createLinearGradient(0, 0, 0, h);
  if (lcd.on) {
    bg.addColorStop(0, '#f2c47e');
    bg.addColorStop(1, '#d99a52');
  } else {
    bg.addColorStop(0, '#3a322b');
    bg.addColorStop(1, '#2a241f');
  }
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (!lcd.on) return;
  g.font = `500 ${Math.round(h * 0.42)}px "JetBrains Mono", ui-monospace, monospace`;
  g.textBaseline = 'middle';
  g.fillStyle = '#2b1d12';
  if (!(lcd.blink && !blinkPhase)) g.fillText(lcd.main, w * 0.06, h * 0.4);
  g.font = `600 ${Math.round(h * 0.2)}px Inter, system-ui, sans-serif`;
  g.fillStyle = 'rgba(43,29,18,0.85)';
  g.fillText(lcd.sub, w * 0.06, h * 0.8);
}

export type Glyph = 'power' | 'prev' | 'play' | 'pause' | 'stop' | 'next' | 'eject';

export function drawGlyph(glyph: Glyph, fg: string, bg: string, size = 128): HTMLCanvasElement {
  const [c, g] = canvas(size);
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  g.fillStyle = fg;
  g.strokeStyle = fg;
  g.lineWidth = size * 0.06;
  g.lineCap = 'round';
  const s = size;
  const tri = (x: number, y: number, w: number, hgt: number, dir: 1 | -1) => {
    g.beginPath();
    g.moveTo(x, y - hgt / 2);
    g.lineTo(x + dir * w, y);
    g.lineTo(x, y + hgt / 2);
    g.closePath();
    g.fill();
  };
  const cy = s / 2;
  switch (glyph) {
    case 'power':
      g.beginPath();
      g.arc(s / 2, cy + s * 0.03, s * 0.2, -Math.PI * 0.3, Math.PI * 1.3);
      g.stroke();
      g.beginPath();
      g.moveTo(s / 2, cy - s * 0.25);
      g.lineTo(s / 2, cy);
      g.stroke();
      break;
    case 'play':
      tri(s * 0.4, cy, s * 0.26, s * 0.32, 1);
      break;
    case 'pause':
      g.fillRect(s * 0.37, cy - s * 0.15, s * 0.08, s * 0.3);
      g.fillRect(s * 0.55, cy - s * 0.15, s * 0.08, s * 0.3);
      break;
    case 'stop':
      g.fillRect(s * 0.37, cy - s * 0.13, s * 0.26, s * 0.26);
      break;
    case 'prev':
      g.fillRect(s * 0.3, cy - s * 0.13, s * 0.05, s * 0.26);
      tri(s * 0.52, cy, s * 0.16, s * 0.26, -1);
      tri(s * 0.7, cy, s * 0.16, s * 0.26, -1);
      break;
    case 'next':
      tri(s * 0.3, cy, s * 0.16, s * 0.26, 1);
      tri(s * 0.48, cy, s * 0.16, s * 0.26, 1);
      g.fillRect(s * 0.65, cy - s * 0.13, s * 0.05, s * 0.26);
      break;
    case 'eject':
      g.beginPath();
      g.moveTo(s * 0.32, cy + s * 0.04);
      g.lineTo(s * 0.5, cy - s * 0.18);
      g.lineTo(s * 0.68, cy + s * 0.04);
      g.closePath();
      g.fill();
      g.fillRect(s * 0.32, cy + s * 0.1, s * 0.36, s * 0.06);
      break;
  }
  return c;
}

/** Procedural walnut grain. */
export function drawWalnut(w = 1024, h = 256): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const rng = mulberry32(7);
  g.fillStyle = '#5b4232';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const y = rng() * h;
    const amp = 2 + rng() * 10;
    const freq = 0.002 + rng() * 0.01;
    const phase = rng() * 10;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1) * amp * 0.3;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    const dark = rng() < 0.6;
    g.strokeStyle = dark ? `rgba(40,26,18,${0.15 + rng() * 0.3})` : `rgba(150,105,70,${0.08 + rng() * 0.15})`;
    g.lineWidth = 0.5 + rng() * 2.5;
    g.stroke();
  }
  return c;
}

/** Printed wordmark for the lid corner. */
export function drawWordmark(w = 512, h = 128): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  g.font = `400 ${h * 0.5}px Fraunces, Georgia, serif`;
  g.fillStyle = 'rgba(232,182,107,0.75)';
  g.textBaseline = 'middle';
  g.textAlign = 'right';
  g.fillText('DiscDeck', w * 0.98, h * 0.45);
  g.font = `600 ${h * 0.16}px Inter, system-ui, sans-serif`;
  g.fillStyle = 'rgba(232,182,107,0.5)';
  g.fillText('COMPACT DISC PLAYER · DD-1', w * 0.98, h * 0.85);
  return c;
}
