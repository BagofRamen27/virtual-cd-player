/**
 * Procedural PBR texture library for the Hi-Fi Room.
 *
 * Everything is generated at runtime on small canvases (512–1024 px) and cached, so the room
 * needs no downloads. Imperfections (fingerprints, dust, wear) are deliberately faint: they
 * live mostly in roughness/bump maps, where they catch the light rather than tint the surface.
 *
 * For true photorealism these would be replaced by scanned CC0 PBR sets (see README), but the
 * material *structure* (colour + roughness + bump per surface) is already in place for that.
 */
import * as THREE from 'three';
import { mulberry32 } from '../../audio/damage';
import { usePlayer } from '../../state/store';

/** Low quality (phones, low-power laptops) gets smaller generated textures. */
const lite = () => usePlayer.getState().settings.quality === 'low';

type Tex = THREE.CanvasTexture;
const cache = new Map<string, Tex>();

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, opts: { srgb?: boolean; repeat?: [number, number] } = {}): Tex {
  const k = `${key}:${opts.repeat?.join('x') ?? ''}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) t.repeat.set(...opts.repeat);
  t.anisotropy = 8;
  cache.set(k, t);
  return t;
}

/** Smooth value noise in 0..1. */
function valueNoise(seed: number, scale: number) {
  const rng = mulberry32(seed);
  const N = 64;
  const grid = Array.from({ length: N * N }, () => rng());
  const at = (x: number, y: number) => grid[((y % N) + N) % N * N + (((x % N) + N) % N)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / scale;
    const fy = y / scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const sx = smooth(fx - x0);
    const sy = smooth(fy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function fingerprints(g: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number, alpha: number) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = (0.04 + rng() * 0.05) * Math.min(w, h * 4);
    const rot = rng() * Math.PI;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.strokeStyle = `rgba(255,255,255,${alpha})`;
    g.lineWidth = 1;
    for (let k = 0.2; k < 1; k += 0.09) {
      g.beginPath();
      g.ellipse(0, 0, r * k, r * k * 0.72, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }
}

// ───────────────────────── Metals ─────────────────────────

/** Brushed aluminium roughness (grey) map: horizontal grain, faint fingerprints and edge wear. */
export function brushedRoughness(seed = 1): Tex {
  return make(`brushed-r-${seed}`, 1024, 256, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = 'rgb(92,92,92)';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const v = 80 + rng() * 40;
      g.fillStyle = `rgba(${v},${v},${v},0.55)`;
      g.fillRect(0, y, w, 1);
      // occasional longer, darker scratches along the grain
      if (rng() < 0.04) {
        g.fillStyle = 'rgba(150,150,150,0.35)';
        g.fillRect(rng() * w, y, 40 + rng() * 300, 1);
      }
    }
    fingerprints(g, w, h, seed + 7, 3, 0.07);
    // smudge-polished edges read slightly glossier
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(40,40,40,0.25)');
    grad.addColorStop(0.08, 'rgba(0,0,0,0)');
    grad.addColorStop(0.92, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(40,40,40,0.25)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function brushedBump(seed = 1): Tex {
  return make(`brushed-b-${seed}`, 1024, 256, (g, w, h) => {
    const rng = mulberry32(seed + 99);
    for (let y = 0; y < h; y++) {
      const v = 110 + rng() * 40;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, y, w, 1);
    }
  });
}

/** Spun (concentric) machined finish for knob caps: colour + roughness in one. */
export function spunMetal(): Tex {
  return make('spun', 512, 512, (g, w) => {
    const rng = mulberry32(5);
    const c = w / 2;
    g.fillStyle = '#d9d6cf';
    g.fillRect(0, 0, w, w);
    for (let r = 2; r < c; r += 1.2) {
      const v = 190 + rng() * 50;
      g.strokeStyle = `rgba(${v},${v - 3},${v - 8},0.6)`;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    // light sweep across the spun face
    const sweep = g.createConicGradient(0.6, c, c);
    sweep.addColorStop(0, 'rgba(255,255,255,0.35)');
    sweep.addColorStop(0.15, 'rgba(255,255,255,0)');
    sweep.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    sweep.addColorStop(0.65, 'rgba(255,255,255,0)');
    sweep.addColorStop(1, 'rgba(255,255,255,0.35)');
    g.fillStyle = sweep;
    g.fillRect(0, 0, w, w);
  }, { srgb: true });
}

/** Knurled grip for knob skirts (wraps around a cylinder side). */
export function knurlBump(): Tex {
  return make('knurl', 512, 64, (g, w, h) => {
    for (let x = 0; x < w; x += 4) {
      const grad = g.createLinearGradient(x, 0, x + 4, 0);
      grad.addColorStop(0, '#202020');
      grad.addColorStop(0.5, '#e0e0e0');
      grad.addColorStop(1, '#202020');
      g.fillStyle = grad;
      g.fillRect(x, 0, 4, h);
    }
  }, { repeat: [3, 1] });
}

// ───────────────────────── Wood ─────────────────────────

const WOOD_TONES = { walnut: ['#4a3324', '#5d4130', '#6e4d37', '#3b281c'], oak: ['#9a7a57', '#ab8a64', '#8c6c4b', '#b8976f'] };

/** Flat-cut veneer with cathedral figure, flowing grain and pores. */
export function woodColor(kind: 'walnut' | 'oak' = 'walnut', seed = 3, vertical = false, requested = 512): Tex {
  const size = lite() ? Math.min(requested, 256) : requested;
  return make(`wood-${kind}-${seed}-${vertical}-${size}`, size, size, (g, w, h) => {
    const k = 1024 / w; // keep the figure the same scale at any resolution
    const rng = mulberry32(seed);
    const tones = WOOD_TONES[kind];
    const n = valueNoise(seed, 140);
    const img = g.createImageData(w, h);
    const base = tones.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const x = (vertical ? py : px) * k;
        const y = (vertical ? px : py) * k;
        // grain runs along x; cathedral arcs from a slowly varying offset
        const warp = n(x * 0.25, y) * 60 + Math.sin(x / 260 + seed) * 18;
        const ring = Math.sin((y + warp) * 0.11) * 0.5 + 0.5;
        const fine = Math.sin((y + warp * 1.6) * 0.9) * 0.5 + 0.5;
        const t = ring * 0.65 + fine * 0.2 + n(x, y * 3) * 0.15;
        const a = base[Math.min(3, Math.floor(t * 3.99))];
        const b = base[(Math.min(3, Math.floor(t * 3.99)) + 1) % 4];
        const f = (t * 4) % 1;
        const i = (py * w + px) * 4;
        img.data[i] = a[0] + (b[0] - a[0]) * f * 0.5;
        img.data[i + 1] = a[1] + (b[1] - a[1]) * f * 0.5;
        img.data[i + 2] = a[2] + (b[2] - a[2]) * f * 0.5;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // pores: short dark dashes along the grain
    for (let i = 0; i < 4500 / (k * k); i++) {
      g.fillStyle = `rgba(25,15,10,${0.15 + rng() * 0.25})`;
      g.fillRect(rng() * w, rng() * h, (2 + rng() * 6) / k, 1);
    }
  }, { srgb: true });
}

/** Satin lacquer: mostly even, pores slightly rougher, faint dust. */
export function woodRoughness(seed = 3): Tex {
  return make(`wood-r-${seed}`, 512, 512, (g, w, h) => {
    const rng = mulberry32(seed + 17);
    g.fillStyle = 'rgb(105,105,105)';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(200,200,200,${0.2 + rng() * 0.3})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1);
    }
    fingerprints(g, w, h, seed, 2, 0.05);
  });
}

export function floorPlanks(): Tex {
  const ps = lite() ? 512 : 1024;
  return make(`planks-${ps}`, ps, ps, (g, w, h) => {
    const rng = mulberry32(21);
    const plankH = h / 8;
    const n = valueNoise(4, 90);
    const img = g.createImageData(w, h);
    const tones = Array.from({ length: 8 }, () => 120 + rng() * 30);
    const offsets = Array.from({ length: 8 }, () => rng() * w);
    for (let y = 0; y < h; y++) {
      const p = Math.floor(y / plankH);
      for (let x = 0; x < w; x++) {
        const v = tones[p] + Math.sin((y + n(x + offsets[p], y) * 40) * 0.35) * 10 + n(x * 2, y * 6) * 18;
        const i = (y * w + x) * 4;
        img.data[i] = v * 1.05;
        img.data[i + 1] = v * 0.82;
        img.data[i + 2] = v * 0.6;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(30,20,12,0.6)';
    for (let p = 0; p < 8; p++) {
      g.fillRect(0, (p + 1) * plankH - 2, w, 2);
      g.fillRect((offsets[p] + p * 137) % w, p * plankH, 2, plankH);
    }
  }, { srgb: true, repeat: [4, 4] });
}

// ───────────────────────── Fabric, plastic, rubber, plaster ─────────────────────────

/** Woven speaker-grille cloth. */
export function grilleCloth(color = '#2b2826'): Tex {
  return make(`cloth-${color}`, 256, 256, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, 0, 1, h);
    }
  }, { srgb: true, repeat: [6, 6] });
}

/** Fine speckle for matte injection-moulded plastic (bump). */
export function plasticBump(): Tex {
  return make('plastic', 256, 256, (g, w, h) => {
    const rng = mulberry32(9);
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + rng() * 30;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: [4, 4] });
}

/** Lime-plaster wall: soft blotches and fine trowel texture (colour). */
export function plaster(dark: boolean): Tex {
  return make(`plaster-${dark}-${lite()}`, lite() ? 512 : 1024, lite() ? 256 : 512, (g, w, h) => {
    const n = valueNoise(13, 120);
    const n2 = valueNoise(31, 18);
    const img = g.createImageData(w, h);
    const base = dark ? [52, 43, 37] : [196, 180, 160];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = (n(x, y) - 0.5) * (dark ? 10 : 16) + (n2(x, y) - 0.5) * 6;
        const i = (y * w + x) * 4;
        img.data[i] = base[0] + v;
        img.data[i + 1] = base[1] + v * 0.95;
        img.data[i + 2] = base[2] + v * 0.9;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  }, { srgb: true, repeat: [3, 2] });
}

/** Paper woofer cone with radial fibres. */
export function paperCone(): Tex {
  return make('cone', 512, 512, (g, w) => {
    const rng = mulberry32(12);
    const c = w / 2;
    g.fillStyle = '#2a2624';
    g.fillRect(0, 0, w, w);
    for (let i = 0; i < 900; i++) {
      const a = rng() * Math.PI * 2;
      const r0 = rng() * c * 0.3;
      g.strokeStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rng() * 0.05})`;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      g.stroke();
    }
  }, { srgb: true });
}

/** Pleated protein-leather for headphone pads. */
export function leather(): Tex {
  return make('leather', 256, 256, (g, w, h) => {
    const rng = mulberry32(44);
    g.fillStyle = 'rgb(128,128,128)';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? 90 : 160},${rng() < 0.5 ? 90 : 160},${rng() < 0.5 ? 90 : 160},0.4)`;
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
    for (let x = 0; x < w; x += 20) {
      g.fillStyle = 'rgba(40,40,40,0.5)';
      g.fillRect(x, 0, 2, h);
    }
  }, { repeat: [4, 1] });
}

/** Vent slots for amplifier lids (alpha-style map: white = slot). */
export function ventSlots(): Tex {
  return make('vents', 512, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    for (let x = 30; x < w - 30; x += 16) {
      g.beginPath();
      g.roundRect(x, 40, 7, h - 80, 3.5);
      g.fill();
    }
  });
}

/** Woven rug with a border. */
export function rug(): Tex {
  return make('rug', 512, 512, (g, w, h) => {
    const rng = mulberry32(77);
    g.fillStyle = '#b9a184';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 20000; i++) {
      const v = rng();
      g.fillStyle = v < 0.5 ? 'rgba(150,120,90,0.25)' : 'rgba(220,200,175,0.25)';
      g.fillRect(rng() * w, rng() * h, 2, 1);
    }
    g.strokeStyle = '#7d5a3f';
    g.lineWidth = 14;
    g.strokeRect(28, 28, w - 56, h - 56);
    g.strokeStyle = '#d8c3a5';
    g.lineWidth = 4;
    g.strokeRect(48, 48, w - 96, h - 96);
  }, { srgb: true });
}
