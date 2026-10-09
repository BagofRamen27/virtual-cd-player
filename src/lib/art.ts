import { hashString, mulberry32 } from '../audio/damage';

export const TINTS = ['#B77B56', '#594334', '#8C6A4F', '#C89B6D', '#6E5A48', '#A3684A', '#7D7356', '#9A5B3F'];

export function tintFor(key: string): string {
  return TINTS[hashString(key) % TINTS.length];
}

/** Original generated cover art for albums without artwork (local uploads, demo). */
export function generateCover(title: string, artist: string, tint: string, size = 600): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rng = mulberry32(hashString(title + artist));

  const bg = g.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#F4EFE7');
  bg.addColorStop(1, '#E7DDCE');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);

  // Soft sun / record motif
  const cx = size * (0.3 + rng() * 0.4);
  const cy = size * (0.32 + rng() * 0.2);
  const r = size * (0.22 + rng() * 0.1);
  g.fillStyle = tint;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 0.18;
  g.strokeStyle = '#251F1B';
  g.lineWidth = 1;
  for (let i = 1; i < 9; i++) {
    g.beginPath();
    g.arc(cx, cy, r + i * size * 0.025, 0, Math.PI * 2);
    g.stroke();
  }
  // Horizon bands
  g.globalAlpha = 1;
  const bands = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 ? '#594334' : tint;
    g.globalAlpha = 0.12 + i * 0.08;
    g.fillRect(0, size * (0.62 + i * 0.045), size, size * 0.03);
  }
  g.globalAlpha = 1;

  g.fillStyle = '#251F1B';
  g.font = `400 ${Math.round(size * 0.075)}px Fraunces, Georgia, serif`;
  wrapText(g, title, size * 0.08, size * 0.84, size * 0.84, size * 0.08);
  g.fillStyle = '#594334';
  g.font = `500 ${Math.round(size * 0.032)}px Inter, system-ui, sans-serif`;
  g.fillText(artist.toUpperCase(), size * 0.08, size * 0.94);

  // Grain
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.86);
}

function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(-2);
  shown.forEach((l, i) => g.fillText(l, x, y - (shown.length - 1 - i) * lineH));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Downscale embedded artwork so album records stay small in IndexedDB. */
export async function shrinkImage(blob: Blob, size = 600): Promise<string> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  } catch {
    return blobToDataUrl(blob);
  }
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
