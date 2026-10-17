'use client';

import { Check, Circle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/price';
import { formatINR } from '@/lib/price';
import type { Booking, EscrowStatus } from '@/lib/types';

/** The escrow state machine, rendered as an inline tracker. */
const FLOW: Array<{ status: EscrowStatus; label: string; description: string }> = [
  { status: 'created', label: 'Booking created', description: 'Token order created, nothing captured yet.' },
  { status: 'token_paid', label: 'Token paid', description: 'Payment verified by the server and held in escrow.' },
  { status: 'builder_accepted', label: 'Builder accepted', description: 'The builder confirmed your request.' },
  { status: 'docs_pending', label: 'Documents verified', description: 'Aadhaar, PAN and loan papers checked.' },
  { status: 'completed', label: 'Escrow released', description: '90% of the token paid to the builder.' },
];

const ORDER: EscrowStatus[] = ['created', 'token_paid', 'builder_accepted', 'docs_pending', 'completed'];

export const BookingStatusTimeline = ({ booking, className }: { booking: Booking; className?: string }) => {
  if (booking.escrowStatus === 'refunded') {
    return (
      <div className={cn('rounded-lg border border-rose-200 bg-rose-50 p-3', className)}>
        <p className="text-sm font-semibold text-rose-900">Refunded</p>
        <p className="mt-0.5 text-xs text-rose-800">
          {booking.refund
            ? `${formatINR(booking.refund.amount)} returned on ${formatDateTime(booking.refund.at)} — ${booking.refund.reason}.`
            : 'The token on this booking was refunded.'}
        </p>
      </div>
    );
  }

  const currentIndex = ORDER.indexOf(booking.escrowStatus);

  return (
    <ol className={cn('flex flex-wrap items-start gap-x-1 gap-y-2', className)} aria-label="Escrow progress">
      {FLOW.map((step, index) => {
        const done = currentIndex > index;
        const active = currentIndex === index;
        return (
          <li key={step.status} className="flex min-w-[6.5rem] flex-1 items-start gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
                done
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : active
                    ? 'border-emerald-700 bg-white text-emerald-700'
                    : 'border-slate-300 bg-white text-slate-300',
              )}
            >
              {done ? <Check className="size-2.5" /> : <Circle className="size-2" />}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-[11px] font-semibold', active ? 'text-emerald-800' : done ? 'text-slate-800' : 'text-slate-400')}>
                {step.label}
              </span>
              {active ? <span className="mt-0.5 block text-[10px] leading-snug text-slate-600">{step.description}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/**
 * Where every rupee of the token sits.
 *
 * RULE 4/12: the platform's 10% is charged on the token only, and an agent's
 * share is split out of that commission — never from the builder's 90%.
 */
export const EscrowBreakdown = ({ booking, className }: { booking: Booking; className?: string }) => {
  const escrow = booking.escrow;
  const rows = [
    { label: 'Total price of the flat', value: booking.totalPrice, muted: true },
    { label: 'Booking token held', value: escrow?.heldAmount ?? 0 },
    { label: 'Platform commission (10% of token)', value: escrow?.platformAmount ?? 0, muted: true },
    ...(booking.agentId || (escrow?.agentAmount ?? 0) > 0
      ? [{ label: `Agent share (${escrow?.agentSharePercent ?? 30}% of commission)`, value: escrow?.agentAmount ?? 0, muted: true }]
      : []),
    { label: 'Held for the builder (90%)', value: escrow?.builderAmount ?? 0 },
  ];

  return (
    <dl className={cn('grid gap-1.5 rounded-lg bg-slate-50 p-3 sm:grid-cols-2', className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-2 text-[13px]">
          <dt className={cn(row.muted ? 'text-slate-500' : 'font-medium text-slate-800')}>{row.label}</dt>
          <dd className={cn('shrink-0 tabular-nums', row.muted ? 'text-slate-600' : 'font-semibold text-slate-900')}>
            {formatINR(row.value)}
          </dd>
        </div>
      ))}
      {escrow?.releasedAmount ? (
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-1.5 text-[13px] sm:col-span-2">
          <dt className="font-medium text-emerald-800">Released to builder</dt>
          <dd className="font-semibold tabular-nums text-emerald-800">
            {formatINR(escrow.releasedAmount)}
            {escrow.releasedAt ? ` · ${formatDateTime(escrow.releasedAt)}` : ''}
          </dd>
        </div>
      ) : null}
    </dl>
  );
};