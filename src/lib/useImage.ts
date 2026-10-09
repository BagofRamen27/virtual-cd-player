import { useEffect, useState } from 'react';

const cache = new Map<string, Promise<HTMLImageElement | null>>();

/** Loads an image for canvas use (CORS-enabled). Resolves to null if it cannot be used. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      if (!url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

export function useImage(url: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let alive = true;
    setImg(null);
    if (url) void loadImage(url).then((i) => alive && setImg(i));
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}
