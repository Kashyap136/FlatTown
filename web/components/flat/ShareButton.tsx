'use client';

import { Share2 } from 'lucide-react';

/**
 * Share control for the flat and project headers.
 *
 * A client component because the flat/project pages are server components and
 * cannot pass an event handler down. Uses the Web Share API where available and
 * falls back to copying the URL.
 */
export const ShareButton = ({
  title,
  label = 'Share',
  className = '',
}: {
  title: string;
  label?: string;
  className?: string;
}) => (
  <button
    type="button"
    onClick={() => {
      const url = window.location.href;
      if (typeof navigator !== 'undefined' && navigator.share) {
        void navigator.share({ title, url }).catch(() => undefined);
        return;
      }
      void navigator.clipboard?.writeText(url);
    }}
    className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${className}`}
  >
    <Share2 className="size-3.5" aria-hidden="true" />
    {label}
    <span className="sr-only">{` — share ${title}`}</span>
  </button>
);
