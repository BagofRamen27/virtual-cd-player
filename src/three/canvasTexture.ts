import * as THREE from 'three';
/** GPU conversion is kept out of the canvas art used by the lightweight player. */
export function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
