import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'solid' | 'soft' | 'ghost';

export function Button({
  variant = 'soft',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 disabled:opacity-45 disabled:cursor-not-allowed select-none';
  const sizes = size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm';
  const variants: Record<Variant, string> = {
    solid: 'bg-accent text-ivory hover:brightness-105 dark:text-espresso',
    soft: 'bg-surface-2/70 text-ink hover:bg-surface-2 border border-line',
    ghost: 'text-ink-soft hover:bg-surface-2/60',
  };
  return <button type="button" className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props} />;
}

export function IconButton({ label, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2/70 hover:text-ink disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Dialog({ open, onClose, title, children, wide, dismissible = true }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; dismissible?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => { if (!dismissible) e.preventDefault(); }}
      onClick={(e) => dismissible && e.target === ref.current && onClose()}
      aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-3xl border border-line bg-surface p-0 text-ink shadow-[0_30px_80px_-20px_rgba(37,31,27,0.45)] backdrop:bg-espresso/40 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-6 sm:p-8">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="font-display text-2xl font-light tracking-tight">{title}</h2>
            <IconButton label="Close" disabled={!dismissible} onClick={onClose} className="-mr-2 -mt-1">
              <Icon name="close" />
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Pill({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2/70 text-ink-soft',
    accent: 'bg-accent/15 text-accent-ink',
    warn: 'bg-amber/25 text-ink',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${tones[tone]} ${className}`}>{children}</span>;
}

const PATHS: Record<string, ReactNode> = {
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />,
  prev: <path d="M7 6v12M18 6.5v11L9.5 12z" />,
  next: <path d="M17 6v12M6 6.5v11l8.5-5.5z" />,
  eject: <path d="M5.5 14h13L12 6.5zM5.5 18h13" />,
  power: <path d="M12 4v7M7.4 7.2a6.5 6.5 0 1 0 9.2 0" />,
  sun: <path d="M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20M6.3 6.3l1 1M16.7 16.7l1 1M6.3 17.7l1-1M16.7 7.3l1-1M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z" />,
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.3 1-1.5 2.6-1.6-.5a7 7 0 0 1-1.7 1l-.3 1.7h-3l-.3-1.7a7 7 0 0 1-1.7-1l-1.6.5-1.5-2.6 1.3-1a7 7 0 0 1 0-2l-1.3-1 1.5-2.6 1.6.5a7 7 0 0 1 1.7-1L10.5 3.5h3l.3 1.7a7 7 0 0 1 1.7 1l1.6-.5 1.5 2.6-1.3 1a7 7 0 0 1 0 2z" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  reset: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7" />,
  lid: <path d="M4 17h16M6 17V9.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V17" />,
  disc: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  volume: <path d="M5 9.5h3l4-3.5v12l-4-3.5H5zM15.5 9a4 4 0 0 1 0 6M17.8 6.8a7.5 7.5 0 0 1 0 10.4" />,
  brush: <path d="M14.5 5.5l4 4-8 8-4.5.5.5-4.5zM12.5 7.5l4 4" />,
  eraser: <path d="M8.5 19h11M5.5 15.5l8-8 5 5-6.5 6.5h-3.5z" />,
  rotate: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v3.7h-3.7" />,
  sparkle: <path d="M12 4l1.6 4.8L18.5 10l-4.9 1.4L12 16l-1.6-4.6L5.5 10l4.9-1.2z" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  external: <path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" />,
  library: <path d="M5 5v14M9 5v14M13.5 5.5l4.5 13" />,
  wave: <path d="M3 12h2l2-5 3 10 3-12 3 9 2-2h3" />,
};

export function Icon({ name, size = 18, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
