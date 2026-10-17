'use client';

import Link from 'next/link';

import { EmptyState } from '@/components/common/States';
import { FlatCardCompact } from '@/components/marketplace/FlatCard';
import { Button } from '@/components/ui/button';
import type { FlatSummary } from '@/lib/types';

/** Horizontally scrollable rail of similar flats (mobile friendly). */
export const FlatSimilarRail = ({ flats }: { flats: FlatSummary[] }) => {
  if (!flats || flats.length === 0) return null;

  return (
    <section aria-labelledby="ft-similar-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ft-similar-heading" className="text-base font-bold text-slate-900">
          Similar flats you may like
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">Browse all</Link>
        </Button>
      </div>

      <div className="ft-scroll-x pb-1">
        {flats.map((flat) => (
          <FlatCardCompact key={flat.id} flat={flat} />
        ))}
      </div>
    </section>
  );
};

/** Grid variant used on the project detail page. */
export const SimilarFlats = ({ flats }: { flats: FlatSummary[] }) => {
  if (!flats || flats.length === 0) {
    return <EmptyState preset="flats" compact />;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {flats.map((flat) => (
        <li key={flat.id}>
          <FlatCardCompact flat={flat} />
        </li>
      ))}
    </ul>
  );
};