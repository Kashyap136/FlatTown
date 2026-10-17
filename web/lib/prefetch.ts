import { QueryClient, dehydrate } from '@tanstack/react-query';

import { amenitiesApi, flatsApi, metaApi } from './api';
import { filtersKey, filtersToQuery, paramsToFilters } from './filters';
import { qk } from './queryKeys';
import { INITIAL_FILTERS, type FilterState } from './filters';

/**
 * Server-side data prefetching for the marketplace.
 *
 * Without this the marketplace shipped a loading skeleton in its HTML and every
 * listing was fetched after hydration, so search engines saw no listings at all.
 * Prefetching here means the first HTML already contains real, crawlable cards.
 *
 * The query key is built with the same `filtersKey` the client hook uses, and the
 * filter state is derived from the same URL parameters, so the hydrated cache is
 * an exact match and the client does not immediately refetch.
 */
/**
 * The marketplace opens on Pune unless the URL says otherwise.
 *
 * This must stay in step with `MarketplaceBrowser`, which also defaults to Pune
 * on its first render — if they diverge the hydrated cache misses and the client
 * refetches, which is exactly the skeleton-only render this work removes.
 */
const DEFAULT_CITY = 'Pune';

const createPrefetchClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Match the browser defaults so hydration is considered fresh.
        staleTime: 60_000,
        retry: 0,
      },
    },
  });

/**
 * @param searchParams the page's raw search params — the same ones the client
 *   reads with `useSearchParams`.
 */
export const prefetchMarketplace = async (searchParams: Record<string, string | string[] | undefined>) => {
  const queryClient = createPrefetchClient();

  // Normalise Next's searchParams shape into a URLSearchParams the filter
  // parser understands.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }

  // Must mirror `MarketplaceBrowser`'s first render exactly, or the hydrated
  // cache will not match the key the client hook looks up.
  const city = params.get('city') ?? DEFAULT_CITY;
  const state: FilterState = { ...INITIAL_FILTERS, ...paramsToFilters(params) };
  const query = filtersToQuery(state, city);

  await Promise.all([
    queryClient.prefetchQuery({ queryKey: qk.flats(filtersKey(query, city)), queryFn: () => flatsApi.list(query) }),
    // The filter drawer and the tier chips need these before they can render.
    queryClient.prefetchQuery({ queryKey: qk.amenities, queryFn: () => amenitiesApi.list().then((r) => r.data) }),
    queryClient.prefetchQuery({ queryKey: qk.tierConfig, queryFn: () => metaApi.tierConfig().then((r) => r.data) }),
    queryClient.prefetchQuery({ queryKey: qk.cities, queryFn: () => metaApi.cities().then((r) => r.data) }),
  ]);

  return dehydrate(queryClient);
};