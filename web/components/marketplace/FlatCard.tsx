'use client';

import { Building, CalendarClock, Eye, Heart, Layers, MapPin, Maximize2, Scale } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { PossessionBadge, RERABadge, RatingStars, TierBadge } from '@/components/common/Badges';
import { Button } from '@/components/ui/button';
import { formatArea, formatCompactINR, formatINR, formatPossession, formatRate } from '@/lib/price';
import type { FlatSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MAX_COMPARE, useCompareStore, useWishlistStore } from '@/store/useCompareStore';
import { useToggleWishlist } from '@/hooks/useFlats';
import { toastError } from '@/components/ui/toast';
import { useAuthStore } from '@/store/useAuthStore';

/** Unsplash-backed placeholder so a listing without imagery still looks real. */
const PLACEHOLDER = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=60';

const coverOf = (flat: FlatSummary): string => {
  const withImage = flat.images?.find((image) => image.kind === 'image' || !image.kind);
  return withImage?.url ?? (flat.images?.[0]?.url ?? PLACEHOLDER);
};

/** "Wakad, Pune · 2 BHK · Sky View" */
const locationLabel = (flat: FlatSummary): string => {
  const project = flat.project;
  if (!project) return 'Location on request';
  return [project.locality, project.city].filter(Boolean).join(', ') || 'Location on request';
};

export interface FlatCardProps {
  flat: FlatSummary;
  /** `compare` adds the compare checkbox; `default` shows the wishlist heart. */
  mode?: 'default' | 'compare';
  className?: string;
  priority?: boolean;
}

export const FlatCard = ({ flat, mode = 'default', className, priority = false }: FlatCardProps) => {
  const user = useAuthStore((s) => s.user);
  const toggleWishlist = useToggleWishlist();
  const wishlisted = useWishlistStore((s) => s.ids.includes(flat.id));
  const compareIds = useCompareStore((s) => s.ids);
  const toggleCompare = useCompareStore((s) => s.toggle);
  const limitReached = useCompareStore((s) => s.limitReached);

  const inCompare = compareIds.includes(flat.id);
  const soldOut = !flat.isAvailable;

  const onCompare = () => {
    const result = toggleCompare(flat.id);
    if (result === 'full') {
      toastError('You can compare up to 3 flats', 'Remove one from the compare tray to add another.');
    }
  };

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md',
        soldOut && 'opacity-75',
        className,
      )}
    >
      {/* ------------------------------ media ------------------------------ */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <Link href={`/flat/${flat.id}`} className="block h-full w-full" tabIndex={-1} aria-hidden="true">
          <Image
            src={coverOf(flat)}
            alt={flat.title}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </Link>

        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5">
          <TierBadge tier={flat.tier} size="sm" />
          <RERABadge verified={flat.project?.isRERAVerified} reraNumber={flat.project?.reraNumber} size="sm" />
          {soldOut ? (
            <span className="rounded-full bg-slate-900/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Sold out
            </span>
          ) : null}
        </div>

        {mode === 'default' ? (
          <button
            type="button"
            onClick={() => (user ? toggleWishlist.mutate(flat.id) : undefined)}
            disabled={!user}
            aria-pressed={wishlisted}
            aria-label={wishlisted ? `Remove ${flat.title} from wishlist` : `Save ${flat.title} to wishlist`}
            title={user ? (wishlisted ? 'Remove from wishlist' : 'Save to wishlist') : 'Sign in to save flats'}
            className={cn(
              'absolute right-2 top-2 grid size-9 place-items-center rounded-full backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600',
              wishlisted ? 'bg-rose-600 text-white' : 'bg-white/90 text-slate-700 hover:bg-white',
            )}
          >
            <Heart className={cn('size-4', wishlisted && 'fill-current')} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* ------------------------------ body ------------------------------- */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="ft-line-2 text-[15px] font-semibold leading-snug text-slate-900">
              <Link href={`/flat/${flat.id}`} className="hover:text-emerald-700 focus-visible:underline">
                {flat.title}
              </Link>
            </h3>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-600">
              <MapPin className="size-3 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate">{locationLabel(flat)}</span>
            </p>
          </div>
          {flat.builder?.name ? (
            <span className="hidden shrink-0 max-w-[8rem] truncate text-right text-[11px] text-slate-500 sm:block">
              {flat.builder.companyName ?? flat.builder.name}
            </span>
          ) : null}
        </div>

        <dl className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <Building className="size-3 text-slate-400" aria-hidden="true" />
            <dt className="sr-only">Configuration</dt>
            <dd className="font-medium text-slate-800">
              {flat.bhk} BHK
              {flat.type !== 'apartment' ? ` · ${flat.type}` : ''}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <Maximize2 className="size-3 text-slate-400" aria-hidden="true" />
            <dt className="sr-only">Carpet area</dt>
            <dd>{formatArea(flat.sizeSqft)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <Layers className="size-3 text-slate-400" aria-hidden="true" />
            <dt className="sr-only">Floor</dt>
            <dd>{flat.floor === 0 ? 'Ground' : `Floor ${flat.floor}`}</dd>
          </div>
          <div className="flex items-center gap-1">
            <Scale className="size-3 text-slate-400" aria-hidden="true" />
            <dt className="sr-only">Price per square foot</dt>
            <dd>{formatRate(flat.pricePerSqft)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <CalendarClock className="size-3 text-slate-400" aria-hidden="true" />
            <dt className="sr-only">Possession</dt>
            <dd>{formatPossession(flat.possessionDate)}</dd>
          </div>
        </dl>

        {/* Price is the most important element on the card. */}
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
            {formatCompactINR(flat.totalPrice)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Total price · {formatINR(flat.pricePerSqft)} per sq ft
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {flat.project?.status ? <PossessionBadge status={flat.project.status} /> : null}
          {flat.builder?.rating ? (
            <RatingStars value={flat.builder.rating.avg} count={flat.builder.rating.count} size="sm" />
          ) : null}
          {typeof flat.views === 'number' ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Eye className="size-3" aria-hidden="true" />
              {flat.views}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex gap-2 pt-4">
          <Button asChild size="sm" className="flex-1">
            <Link href={`/flat/${flat.id}`}>View details</Link>
          </Button>
          <Button
            variant={inCompare ? 'primary' : 'outline'}
            size="sm"
            onClick={onCompare}
            aria-pressed={inCompare}
            className="shrink-0"
            title={inCompare ? 'Remove from compare' : 'Add to compare'}
          >
            {inCompare ? 'In compare' : 'Compare'}
          </Button>
        </div>
      </div>

      {mode === 'compare' && limitReached && !inCompare ? (
        <p className="sr-only" role="status">
          Compare is limited to {MAX_COMPARE} flats.
        </p>
      ) : null}
    </article>
  );
};

/** Compact variant used in "similar flats" rails. */
export const FlatCardCompact = ({ flat }: { flat: FlatSummary }) => (
  <Link
    href={`/flat/${flat.id}`}
    className="flex w-56 shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 transition-shadow hover:shadow-md sm:w-64"
  >
    <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-slate-100">
      <Image src={coverOf(flat)} alt="" fill sizes="56px" className="object-cover" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="ft-line-2 block text-[13px] font-semibold leading-snug text-slate-900">{flat.title}</span>
      <span className="mt-1 block text-xs font-bold text-slate-900">{formatCompactINR(flat.totalPrice)}</span>
      <span className="mt-0.5 block text-[11px] text-slate-500">
        {flat.bhk} BHK · {formatArea(flat.sizeSqft)}
      </span>
    </span>
  </Link>
);

export { coverOf as flatCoverImage, locationLabel as flatLocationLabel };