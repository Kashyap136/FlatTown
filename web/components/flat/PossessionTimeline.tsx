'use client';

import { Building2, CalendarClock, CheckCircle2, CircleDot, FileText, Hammer } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { formatDate, formatPossession } from '@/lib/price';
import { cn } from '@/lib/utils';

/**
 * Possession timeline.
 *
 * The stages mirror the funnel the platform actually tracks: inquiry → site
 * visit → token booking → documentation → possession.
 */
export type TimelineStage = 'inquiry' | 'visit' | 'token' | 'documents' | 'possession';

const STAGES: Array<{
  key: TimelineStage;
  label: string;
  description: string;
  icon: typeof Building2;
}> = [
  { key: 'inquiry', label: 'Inquiry', description: 'You expressed interest in this flat.', icon: CircleDot },
  { key: 'visit', label: 'Site visit', description: 'Walk through the site with the builder.', icon: CalendarClock },
  { key: 'token', label: 'Token booking', description: 'Token paid and held in escrow.', icon: Building2 },
  { key: 'documents', label: 'Documentation', description: 'Aadhaar, PAN and loan papers verified.', icon: FileText },
  { key: 'possession', label: 'Possession', description: 'Handover on the committed date.', icon: Hammer },
];

/** Which stages are already behind the buyer for a given booking state. */
const STAGE_FOR_ESCROW: Record<string, TimelineStage> = {
  created: 'token',
  token_paid: 'token',
  builder_accepted: 'documents',
  docs_pending: 'documents',
  completed: 'possession',
  refunded: 'token',
};

export const PossessionTimeline = ({
  reached = 'inquiry',
  possessionDate,
  className,
  compact = false,
}: {
  reached?: TimelineStage;
  possessionDate?: string | null;
  className?: string;
  compact?: boolean;
}) => {
  const currentIndex = STAGES.findIndex((stage) => stage.key === reached);

  return (
    <div className={cn('w-full', className)}>
      <ol className="space-y-0">
        {STAGES.map((stage, index) => {
          const done = currentIndex > index;
          const active = currentIndex === index;
          const Icon = stage.icon;
          return (
            <li key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
              {index < STAGES.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5',
                    done ? 'bg-emerald-600' : 'bg-slate-200',
                  )}
                />
              ) : null}

              <span
                aria-hidden="true"
                className={cn(
                  'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2',
                  done
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : active
                      ? 'border-emerald-600 bg-white text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-400',
                )}
              >
                {done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
              </span>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('text-sm font-semibold', active ? 'text-emerald-800' : 'text-slate-900')}>
                    {stage.label}
                  </p>
                  {active ? <Badge variant="brand">Current stage</Badge> : null}
                  {done ? <Badge variant="success">Done</Badge> : null}
                </div>
                {!compact ? (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{stage.description}</p>
                ) : null}
                {stage.key === 'possession' && possessionDate ? (
                  <p className="mt-1 text-xs font-medium text-slate-700">
                    Committed possession: {formatDate(possessionDate)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        Expected possession: <span className="font-semibold text-slate-900">{formatPossession(possessionDate)}</span>. If
        the builder misses a committed date, verified buyers can rate it down and the platform reviews the rating.
      </p>
    </div>
  );
};

/** Maps a booking's escrow status onto the timeline's current stage. */
export const stageForEscrow = (escrowStatus: string): TimelineStage => STAGE_FOR_ESCROW[escrowStatus] ?? 'inquiry';