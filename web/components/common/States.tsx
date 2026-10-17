import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Compass, Inbox, RefreshCw, SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ------------------------------- empty state ------------------------------ */

const EMPTY_PRESETS = {
  flats: {
    icon: SearchX,
    title: 'No flats found',
    body: 'Try changing your filters or expanding your price range.',
  },
  bookings: { icon: Inbox, title: "You don't have any bookings yet", body: 'Browse the marketplace and reserve a flat to get started.' },
  visits: { icon: Compass, title: "You don't have any scheduled site visits", body: 'Open a flat and request a visit slot that suits you.' },
  wishlist: { icon: Compass, title: 'No saved flats yet', body: 'Tap the heart on any flat to keep it here for later.' },
  projects: { icon: Compass, title: 'No projects yet', body: 'Add your first project to start listing flats.' },
  flatsToList: { icon: Compass, title: 'No flats listed yet', body: 'Add a flat to one of your projects to start receiving inquiries.' },
  generic: { icon: SearchX, title: 'Nothing here yet', body: 'Once there is data it will appear here.' },
  none: { icon: SearchX, title: 'No results', body: 'Try adjusting your search or filters.' },
} as const;

export type EmptyPreset = keyof typeof EMPTY_PRESETS;

/**
 * The empty state every data-backed surface shares.
 *
 * `action` is a label + href so the state is always recoverable rather than a
 * dead end.
 */
export const EmptyState = ({
  preset = 'generic',
  title,
  body,
  actionLabel,
  actionHref,
  onAction,
  icon: Icon,
  className,
  compact = false,
}: {
  preset?: EmptyPreset;
  title?: string;
  body?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  className?: string;
  compact?: boolean;
}) => {
  const defaults = EMPTY_PRESETS[preset];
  const ResolvedIcon = Icon ?? defaults.icon;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
    >
      <span className="mb-3 rounded-full bg-white p-3 text-slate-400 shadow-sm">
        <ResolvedIcon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold text-slate-900">{title ?? defaults.title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{body ?? defaults.body}</p>
      {actionHref && actionLabel ? (
        <Button asChild variant="primary" size="sm" className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : onAction && actionLabel ? (
        <Button variant="primary" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
};

/* ------------------------------- error state ------------------------------ */

export const ErrorState = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
  compact = false,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}) => (
  <div
    role="alert"
    className={cn(
      'flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-center',
      compact ? 'px-4 py-8' : 'px-6 py-14',
      className,
    )}
  >
    <h3 className="text-base font-semibold text-rose-900">{title}</h3>
    {message ? <p className="mt-1 max-w-md text-sm text-rose-800">{message}</p> : null}
    {onRetry ? (
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        {retryLabel}
      </Button>
    ) : null}
  </div>
);

/* ------------------------------- loading state ---------------------------- */

export const LoadingState = ({ label = 'Loading…', className }: { label?: string; className?: string }) => (
  <div
    role="status"
    aria-live="polite"
    className={cn('flex items-center justify-center gap-3 py-16 text-sm text-slate-600', className)}
  >
    <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700" aria-hidden="true" />
    {label}
  </div>
);

/** Inline spinner for buttons and cards. */
export const InlineSpinner = ({ className }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
  />
);