/**
 * Marketplace filter state.
 *
 * The store is the single source of truth for the filter UI; the URL query
 * string is kept in sync by `lib/filters.ts` so a filtered marketplace is
 * shareable and survives a refresh.
 */

import { create } from 'zustand';

import { INITIAL_FILTERS, type FilterState } from '../lib/filters';

// The shape and its defaults live in `lib/filters` so a server component can
// build an identical filter state for SSR prefetching without importing this
// Zustand store.
export type { FilterState } from '../lib/filters';
export { INITIAL_FILTERS } from '../lib/filters';

interface FilterActions {
  set: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  toggleIn: <K extends 'bhk' | 'tier' | 'possession' | 'type' | 'facing' | 'amenities'>(
    key: K,
    value: FilterState[K][number],
  ) => void;
  patch: (values: Partial<FilterState>) => void;
  hydrate: (values: Partial<FilterState>) => void;
  reset: () => void;
  resetAdvanced: () => void;
  setDrawerOpen: (open: boolean) => void;
  resetPage: () => void;
}

export const useFilterStore = create<FilterState & FilterActions>((set) => ({
  ...INITIAL_FILTERS,
  set: (key, value) => set({ [key]: value, ...(key === 'page' ? {} : { page: 1 }) } as Partial<FilterState>),
  toggleIn: (key, value) =>
    set((state) => {
      const current = state[key] as unknown[];
      const exists = current.includes(value);
      const next = exists ? current.filter((v) => v !== value) : [...current, value];
      return { [key]: next, page: 1 } as Partial<FilterState>;
    }),
  patch: (values) => set(values),
  hydrate: (values) => set(values),
  reset: () => set({ ...INITIAL_FILTERS }),
  resetAdvanced: () =>
    set({
      ...INITIAL_FILTERS,
      city: '',
      // keep the chip-level filters a user is actively browsing
      bhk: [],
      tier: [],
    }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  resetPage: () => set({ page: 1 }),
}));

/** Number of active filter groups, for the "Filters (3)" badge. */
export const countActiveFilters = (state: FilterState): number => {
  let count = 0;
  if (state.locality) count += 1;
  if (state.type.length) count += 1;
  if (state.facing.length) count += 1;
  if (state.amenities.length) count += 1;
  if (state.priceMin > 0 || state.priceMax > 0) count += 1;
  if (state.reraOnly) count += 1;
  if (state.builderRatingMin > 0) count += 1;
  if (state.tokenMax > 0) count += 1;
  if (state.includeUnavailable) count += 1;
  return count;
};