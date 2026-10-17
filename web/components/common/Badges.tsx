'use client';

import { BadgeCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/**
 * Shared trust and status badges.
 *
 * `TierBadge` and `RERABadge` live in their own modules (`TierBadge.tsx`,
 * `RERABadge.tsx`) and are re-exported here so a single import reads naturally.
 */
export { RERABadge } from './RERABadge';
export { TierBadge } from './TierBadge';

/* ------------------------------ verification ------------------------------ */

const VERIFICATION_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  approved: { label: 'Verified', variant: 'success' },
  verified: { label: 'Verified', variant: 'success' },
  pending: { label: 'Under review', variant: 'warning' },
  not_submitted: { label: 'Not submitted', variant: 'neutral' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

export const VerificationBadge = ({ status }: { status?: string | null }) => {
  const meta = VERIFICATION_LABELS[status ?? 'not_submitted'] ?? VERIFICATION_LABELS.not_submitted;
  return (
    <Badge variant={meta.variant}>
      <BadgeCheck className="size-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
};

/* ------------------------------- possession ------------------------------- */

export const POSSESSION_LABELS: Record<string, string> = {
  new_launch: 'New launch',
  under_construction: 'Under construction',
  ready_to_move: 'Ready to move',
};

export const PossessionBadge = ({ status }: { status?: string | null }) => {
  if (!status) return null;
  const variant = status === 'ready_to_move' ? 'success' : status === 'new_launch' ? 'info' : 'neutral';
  return <Badge variant={variant}>{POSSESSION_LABELS[status] ?? status}</Badge>;
};

/* --------------------------------- ratings -------------------------------- */

export const RatingStars = ({
  value,
  count,
  size = 'md',
  showValue = true,
  className,
}: {
  value: number;
  count?: number;
  size?: 'sm' | 'md';
  showValue?: boolean;
  className?: string;
}) => {
  const rounded = Math.round(value * 2) / 2;
  const star = size === 'sm' ? 'size-3' : 'size-4';
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = rounded >= n;
          const half = !filled && rounded >= n - 0.5;
          return (
            <span key={n} className="relative">
              <span className={`${star} text-slate-300`}>★</span>
              {(filled || half) && (
                <span
                  className={`${star} absolute inset-0 overflow-hidden text-amber-500`}
                  style={half ? { width: '50%' } : undefined}
                >
                  ★
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showValue ? (
        <span className={`font-semibold tabular-nums text-slate-800 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
          {value.toFixed(1)}
        </span>
      ) : null}
      {count !== undefined ? <span className="text-xs text-slate-500">({count})</span> : null}
      <span className="sr-only">
        Rated {value.toFixed(1)} out of 5{count !== undefined ? ` from ${count} reviews` : ''}
      </span>
    </span>
  );
};

/* ----------------------------- commission note ---------------------------- */

/**
 * Makes the RULE 4 basis explicit wherever money is shown, so nobody can
 * misread the platform commission as a share of the property price.
 */
export const CommissionNote = ({
  tokenAmount,
  commissionPercent,
  amount,
  className,
}: {
  tokenAmount: number;
  commissionPercent?: number;
  amount?: number;
  className?: string;
}) => {
  const percent = commissionPercent ?? 10;
  const commission = amount ?? Math.round((tokenAmount * percent) / 100);
  return (
    <p className={`text-xs leading-relaxed text-slate-500 ${className ?? ''}`}>
      Platform commission is {percent}% of the booking token only (₹{commission.toLocaleString('en-IN')} of ₹
      {tokenAmount.toLocaleString('en-IN')}) — never a percentage of the property price.
    </p>
  );
};