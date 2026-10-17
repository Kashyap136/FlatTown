'use client';

import type { LucideIcon } from 'lucide-react';

import { EmptyState } from '@/components/common/States';
import { FlatCard } from '@/components/marketplace/FlatCard';
import { Button } from '@/components/ui/button';
import { FlatCardGridSkeleton } from '@/components/ui/skeleton';
import { useWishlist } from '@/hooks/useFlats';
import { formatDate } from '@/lib/price';
import type { FlatSummary } from '@/lib/types';

/** Wishlist entries with their flat payload, falling back to a fetch-friendly note. */
export const WishlistGrid = ({ icon }: { icon: LucideIcon }) => {
  const { data, isLoading } = useWishlist();
  const entries = data ?? [];

  if (isLoading) return <FlatCardGridSkeleton count={3} />;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={icon}
        preset="wishlist"
        actionLabel="Browse the marketplace"
        actionHref="/"
      />
    );
  }

  const flats = entries
    .map((entry) => entry.flat as FlatSummary | undefined)
    .filter((flat): flat is FlatSummary => Boolean(flat?.id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {entries.length} saved {entries.length === 1 ? 'flat' : 'flats'}
      </p>

      {flats.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {flats.map((flat) => (
            <li key={flat.id} className="flex">
              <FlatCard flat={flat} className="w-full" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id ?? entry.flatId}>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <span className="text-sm text-slate-700">Flat saved {formatDate(entry.createdAt)}</span>
                <Button asChild size="sm" variant="outline">
                  <a href={`/flat/${entry.flatId}`}>View</a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-500">
        Wishlist entries are private — other buyers can never see what you have saved. This is a shortlist, not a
        checkout.
      </p>
    </div>
  );
};