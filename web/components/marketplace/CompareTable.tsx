'use client';

import { Loader2, Scale, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';

import { RERABadge, TierBadge } from '@/components/common/Badges';
import { EmptyState, ErrorState } from '@/components/common/States';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCompare } from '@/hooks/useFlats';
import { formatArea, formatINR, formatPossession } from '@/lib/price';
import { MAX_COMPARE, buildCompareRows, useCompareStore } from '@/store/useCompareStore';
import { flatCoverImage } from '@/components/marketplace/FlatCard';
import type { FlatSummary } from '@/lib/types';

/** Renders the persisted compare tray as a responsive side-by-side table. */
export const CompareTable = () => {
  const ids = useCompareStore((s) => s.ids);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);

  // Hydrate the tray from localStorage on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('flattown.compare');
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.length) {
        useCompareStore.setState({ ids: (parsed as string[]).slice(0, MAX_COMPARE) });
      }
    } catch {
      /* ignore a malformed tray */
    }
  }, []);

  const { data, isLoading, error, refetch } = useCompare(ids);

  if (ids.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title="Nothing to compare yet"
        body="Add up to 3 flats from the marketplace using the Compare button on any listing."
        actionLabel="Browse the marketplace"
        actionHref="/"
      />
    );
  }

  if (error) {
    return <ErrorState title="We could not load the comparison" message={error.message} onRetry={refetch} />;
  }

  if (isLoading || !data) {
    return (
      <div role="status" aria-label="Loading comparison" className="flex items-center justify-center gap-3 py-20 text-slate-600">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        Loading comparison…
      </div>
    );
  }

  const flats = data.items as FlatSummary[];
  const rows = buildCompareRows(
    flats as Parameters<typeof buildCompareRows>[0],
    {
      price: (value) => formatINR(value),
      rate: (value) => `${formatINR(value)}/sq ft`,
      area: (value) => formatArea(value),
      possession: (value) => formatPossession(value),
    },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Comparing <span className="font-semibold text-slate-900">{flats.length}</span> of {MAX_COMPARE} flats.
        </p>
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear comparison
        </Button>
      </div>

      {/* Horizontally scrollable so a 320px viewport never overflows. */}
      <Card className="overflow-hidden">
        <div className="ft-table-wrap">
          <table className="ft-table">
            <caption className="sr-only">Side-by-side comparison of selected flats</caption>
            <thead>
              <tr>
                <th scope="col" className="w-40 bg-slate-50 p-3 text-left align-bottom text-xs font-bold uppercase tracking-wide text-slate-600">
                  Attribute
                </th>
                {flats.map((flat) => (
                  <th key={flat.id} scope="col" className="min-w-[15rem] border-l border-slate-200 p-3 text-left align-top">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/flat/${flat.id}`} className="min-w-0 flex-1">
                        <span className="relative mb-2 block aspect-[16/10] w-full overflow-hidden rounded-lg bg-slate-100">
                          <Image src={flatCoverImage(flat)} alt="" fill sizes="240px" className="object-cover" />
                        </span>
                        <span className="ft-line-2 block text-sm font-semibold text-slate-900 hover:text-emerald-700">
                          {flat.title}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(flat.id)}
                        className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Remove ${flat.title} from the comparison`}
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <TierBadge tier={flat.tier} size="sm" />
                      <RERABadge verified={flat.project?.isRERAVerified} reraNumber={flat.project?.reraNumber} size="sm" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-slate-100">
                  <th scope="row" className="bg-slate-50 p-3 text-left text-[13px] font-medium text-slate-600">
                    {row.label}
                  </th>
                  {flats.map((flat) => (
                    <td key={flat.id} className="border-l border-slate-200 p-3 text-[13px] text-slate-900">
                      {row.render(flat.id)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-slate-100">
                <th scope="row" className="bg-slate-50 p-3 text-left text-[13px] font-medium text-slate-600">
                  Next step
                </th>
                {flats.map((flat) => (
                  <td key={flat.id} className="border-l border-slate-200 p-3">
                    <Button asChild size="sm">
                      <Link href={flat.isAvailable ? `/booking/${flat.id}` : `/flat/${flat.id}`}>
                        {flat.isAvailable ? 'Reserve with token' : 'View details'}
                      </Link>
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-slate-500">
        Platform commission is 10% of the booking token only — never of the property price shown above. Token amounts
        are held in escrow and released to the builder after an admin verifies the buyer&rsquo;s documents.
      </p>
    </div>
  );
};