import { useEffect } from 'react';
import { usePlayer } from '../state/store';
import { Icon } from './ui';

export function NoticeToast() {
  const notice = usePlayer((s) => s.notice);
  const clear = usePlayer((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clear, notice.tone === 'error' ? 8000 : 4500);
    return () => clearTimeout(id);
  }, [notice, clear]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 lg:bottom-8" aria-live={notice?.tone === 'error' ? 'assertive' : 'polite'}>
      {notice && (
        <div
          key={notice.id}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-line bg-surface/95 py-3 pl-4 pr-2 text-sm text-ink shadow-[0_16px_40px_-16px_rgba(37,31,27,0.5)] backdrop-blur"
        >
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notice.tone === 'error' ? 'bg-[#b5523b]' : 'bg-amber'}`} aria-hidden="true" />
          <p className="flex-1 leading-relaxed">{notice.text}</p>
          <button type="button" onClick={clear} aria-label="Dismiss" className="rounded-full p-1 text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
