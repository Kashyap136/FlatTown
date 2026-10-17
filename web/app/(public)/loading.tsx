import { Skeleton } from '@/components/ui/skeleton';
import { FlatCardGridSkeleton } from '@/components/ui/skeleton';

/** Route-level loading UI for the marketplace. */
export default function MarketplaceLoading() {
  return (
    <div className="ft-container py-10">
      <div className="rounded-xl bg-slate-900 px-5 py-10 sm:px-8 sm:py-14">
        <Skeleton className="h-6 w-56 bg-slate-700" />
        <Skeleton className="mt-4 h-9 w-full max-w-2xl bg-slate-700" />
        <Skeleton className="mt-3 h-4 w-full max-w-xl bg-slate-800" />
      </div>
      <div className="mt-8 flex gap-6">
        <div className="hidden w-[280px] shrink-0 lg:block">
          <Skeleton className="h-[32rem] w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <FlatCardGridSkeleton count={9} />
        </div>
      </div>
    </div>
  );
}