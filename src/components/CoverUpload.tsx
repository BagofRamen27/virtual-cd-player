import { useRef, useState } from 'react';
import { Button } from './ui';

export function CoverUpload({ value, disabled, onChange, onBusyChange }: {
  value?: string; disabled?: boolean; onChange: (cover: string) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file || busy || disabled) return;
    setBusy(true); onBusyChange?.(true); setError('');
    let bitmap: ImageBitmap | undefined;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 600;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable in this browser.');
      const side = Math.min(bitmap.width, bitmap.height);
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, 600, 600);
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 600, 600);
      await onChange(canvas.toDataURL('image/jpeg', 0.9));
    } catch (error) { setError(error instanceof Error && /Choose|unavailable/.test(error.message) ? error.message : 'Could not read this image. Try a JPG, PNG or WebP file.'); }
    finally { bitmap?.close(); setBusy(false); onBusyChange?.(false); }
  }
  return <div className="space-y-2">
    <div className="flex items-center gap-3">
      {value && <img src={value} alt="Album cover preview" className="h-20 w-20 rounded-lg object-cover" />}
      <Button size="sm" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? 'Saving cover…' : 'Upload album cover'}</Button>
    </div>
    <p className="text-xs text-muted">JPG, PNG or WebP · up to 10 MB · cropped to a square. Saved in this browser.</p>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
    {error && <p role="alert" className="text-xs text-ink-soft">{error}</p>}
  </div>;
}
