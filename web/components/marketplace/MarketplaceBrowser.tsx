'use client';

import { Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { EmptyState, ErrorState } from '@/components/common/States';
import { BhkTabs, FilterDrawer, TierChips } from '@/components/marketplace/FilterDrawer';
import { FlatCard } from '@/components/marketplace/FlatCard';
import { Pagination, SortSelect } from '@/components/marketplace/Pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FlatCardGridSkeleton } from '@/components/ui/skeleton';
import { useCities, useFlats } from '@/hooks/useFlats';
import { describeFilters, filtersToParams, filtersToQuery, paramsToFilters, INITIAL_FILTERS } from '@/lib/filters';
import { useFilterStore } from '@/store/useFilterStore';
import type { SortKey } from '@/lib/types';

const DEFAULT_CITIES = ['Pune', 'Mumbai'];

/** The marketplace opens on Pune unless the URL says otherwise. */
export const DEFAULT_CITY = 'Pune';

/**
 * The marketplace: filter rail + results grid.
 *
 * Filter state lives in the Zustand store and is mirrored into the URL, so a
 * filtered search is shareable and the browser back button steps through filter
 * history.
 */
export const MarketplaceBrowser = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterStore();
  const [city, setCity] = useState<string>(searchParams.get('city') ?? DEFAULT_CITY);
  const [search, setSearch] = useState(filters.search);
  const { data: cityData } = useCities();

  /**
   * The filter set used for the *first* render comes straight from the URL.
   *
   * The store is only filled from `searchParams` inside an effect, which never
   * runs on the server — so reading the store here would render the unfiltered
   * marketplace for a shared link like `/?tier=budget`, then snap to the filtered
   * result on the client. Deriving it from the URL makes the server render, the
   * hydration render and the server-side prefetch all agree on the same query
   * key, which is what lets React Query hydrate instead of refetching.
   */
  const urlFilters = useMemo(() => paramsToFilters(searchParams), [searchParams]);
  const [urlDriven, setUrlDriven] = useState(true);
  const effectiveFilters = useMemo(
    () => (urlDriven ? { ...INITIAL_FILTERS, ...urlFilters } : filters),
    [urlDriven, urlFilters, filters],
  );

  // Hydrate from the URL on first paint and whenever the query changes
  // (back/forward, or a shared link).
  useEffect(() => {
    const urlCity = searchParams.get('city');
    if (urlCity) setCity(urlCity);
    else {
      const stored = window.localStorage.getItem('flattown.city');
      if (stored) setCity(stored);
    }
    filters.hydrate(paramsToFilters(searchParams));
    setSearch(paramsToFilters(searchParams).search ?? '');
    // From now on the store owns the state, so UI toggles are reflected.
    setUrlDriven(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const localities = useMemo(() => {
    const match = cityData?.find((c) => c.name === city);
    return match?.localities ?? [];
  }, [cityData, city]);

  const query = useMemo(() => filtersToQuery(effectiveFilters, city), [effectiveFilters, city]);

  // Push the filter set into the URL without adding a history entry per keystroke.
  useEffect(() => {
    const next = filtersToParams(filters, city).toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `/?${next}` : '/', { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, city]);

  const { data, total, page, totalPages, hasNext, hasPrev, isLoading, isFetching, error, refetch } = useFlats(query, city);

  const chips = describeFilters(filters);

  const clearChip = (chip: string) => {
    if (filters.locality === chip) filters.patch({ locality: '' });
    else if (/^\d BHK$/.test(chip)) filters.patch({ bhk: [] });
    else if (['Budget', 'Mid', 'Luxury'].includes(chip))
      filters.patch({ tier: [] });
    else if (chip === 'RERA verified only') filters.patch({ reraOnly: false });
    else if (chip === 'Including sold-out') filters.patch({ includeUnavailable: false });
    else if (chip.startsWith('Builder rating')) filters.patch({ builderRatingMin: 0 });
    else filters.patch({ priceMin: 0, priceMax: 0, type: [], possession: [] });
  };

  return (
    <section className="ft-container pb-16" aria-label="Flat marketplace">
      {/* ------------------------------ toolbar ------------------------------ */}
      <div className="sticky top-14 z-30 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:top-16 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-6 lg:backdrop-blur-none">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              role="search"
              className="relative flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                filters.patch({ search, page: 1 });
              }}
            >
              <label htmlFor="ft-search" className="sr-only">
                Search flats by project or title
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id="ft-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by project or flat name…"
                className="pl-9"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    filters.patch({ search: '', page: 1 });
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </form>

            <div className="flex items-center gap-2">
              <CityPills
                cities={cityData?.map((c) => c.name) ?? DEFAULT_CITIES}
                value={city}
                onChange={(next) => {
                  setCity(next);
                  window.localStorage.setItem('flattown.city', next);
                  filters.patch({ locality: '' });
                }}
              />
              <SortSelect
                value={filters.sortBy}
                onChange={(value: SortKey) => filters.patch({ sortBy: value })}
                className="ml-auto"
              />
            </div>
          </div>

          <BhkTabs />
          <TierChips />

          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => clearChip(chip)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {chip}
                  <X className="size-3 text-slate-400" aria-hidden="true" />
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
              <Button variant="link" size="sm" onClick={() => filters.reset()}>
                Clear all
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* ------------------------------- results ----------------------------- */}
      <div className="mt-6 flex gap-6">
        <FilterDrawer localities={localities} />

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-2 text-sm">
            <p className="text-slate-600" aria-live="polite">
              {isLoading ? (
                'Loading flats…'
              ) : (
                <>
                  <span className="font-semibold text-slate-900 tabular-nums">{total}</span>{' '}
                  {total === 1 ? 'flat' : 'flats'} found
                  {query.city ? ` in ${query.city}` : ''}
                </>
              )}
            </p>
            {isFetching && !isLoading ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span className="size-3 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700" aria-hidden="true" />
                Updating
              </span>
            ) : null}
          </div>

          {error ? (
            <ErrorState
              title="We could not load the marketplace"
              message={error.message}
              onRetry={refetch}
            />
          ) : isLoading ? (
            <FlatCardGridSkeleton count={9} />
          ) : data.length === 0 ? (
            <EmptyState
              preset="flats"
              actionLabel="Clear all filters"
              onAction={() => filters.reset()}
            />
          ) : (
            <>
              <ul
                className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${
                  isFetching ? 'opacity-60 transition-opacity' : ''
                }`}
              >
                {data.map((flat, index) => (
                  <li key={flat.id} className="flex">
                    <FlatCard flat={flat} priority={index < 3} className="w-full" />
                  </li>
                ))}
              </ul>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                onChange={(next) => {
                  filters.patch({ page: next });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="mt-8"
              />

              {hasPrev || hasNext ? (
                <p className="sr-only" aria-live="polite">
                  Page {page} of {totalPages}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

/** Horizontal city selector for the results bar. */
const CityPills = ({
  cities,
  value,
  onChange,
}: {
  cities: string[];
  value: string;
  onChange: (city: string) => void;
}) => (
  <div className="ft-scroll-x" role="group" aria-label="Select city">
    {cities.map((option) => {
      const active = option === value;
      return (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={active}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            active
              ? 'border-emerald-700 bg-emerald-700 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {option}
        </button>
      );
    })}
  </div>
);