import type * as React from 'react';

import { cn } from '@/lib/utils';

export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-slate-200/70', className)} {...props} />
);

/** Placeholder that mirrors a `FlatCard` so the grid does not jump on load. */
export const FlatCardSkeleton = () => (
  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <Skeleton className="aspect-[4/3] w-full rounded-none" />
    <div className="space-y-2.5 p-4">
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-3 w-2/5" />
      <Skeleton className="h-6 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  </div>
);

/** A responsive grid of flat-card skeletons. */
export const FlatCardGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div
    role="status"
    aria-label="Loading flats"
    className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
  >
    {Array.from({ length: count }, (_, index) => (
      <FlatCardSkeleton key={index} />
    ))}
    <span className="sr-only">Loading flats…</span>
  </div>
);

export const ListSkeleton = ({ rows = 5, className }: { rows?: number; className?: string }) => (
  <div role="status" aria-label="Loading" className={cn('space-y-3', className)}>
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>
    ))}
    <span className="sr-only">Loading…</span>
  </div>
);

export const DetailSkeleton = () => (
  <div role="status" aria-label="Loading" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
    <div className="space-y-4">
      <Skeleton className="aspect-[16/9] w-full" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-32 w-full" />
    </div>
    <div className="space-y-4">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
    <span className="sr-only">Loading…</span>
  </div>
);