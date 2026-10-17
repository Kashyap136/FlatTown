/**
 * Filter ⇄ URL query-string synchronisation.
 *
 * The marketplace keeps the whole filter set in the URL so results are
 * shareable, bookmarkable and back-button friendly. These helpers are pure so
 * they can be unit reasoned about and reused by the compare page.
 *
 * `FilterState` and `INITIAL_FILTERS` are declared here rather than in the
 * Zustand store so a server component can build an identical filter state for
 * SSR prefetching without pulling in React state.
 */

import type { FlatQuery } from './api';
import type { FlatType, Facing, ProjectStatus, SortKey, Tier } from './types';

export interface FilterState {
  city: string;
  locality: string;
  bhk: number[];
  tier: Tier[];
  possession: ProjectStatus[];
  type: FlatType[];
  facing: Facing[];
  amenities: string[];
  priceMin: number;
  priceMax: number;
  reraOnly: boolean;
  builderRatingMin: number;
  tokenMax: number;
  search: string;
  sortBy: SortKey;
  page: number;
  limit: number;
  includeUnavailable: boolean;
  /** Mobile / tablet filter drawer visibility. */
  drawerOpen: boolean;
}

export const INITIAL_FILTERS: FilterState = {
  city: '',
  locality: '',
  bhk: [],
  tier: [],
  possession: [],
  type: [],
  facing: [],
  amenities: [],
  priceMin: 0,
  priceMax: 0,
  reraOnly: false,
  builderRatingMin: 0,
  tokenMax: 0,
  search: '',
  sortBy: 'relevance',
  page: 1,
  limit: 18,
  includeUnavailable: false,
  drawerOpen: false,
};

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'relevance', label: 'Recommended' },
  { value: 'price:asc', label: 'Price: low to high' },
  { value: 'price:desc', label: 'Price: high to low' },
  { value: 'pricePerSqft:asc', label: 'Price per sq ft: low to high' },
  { value: 'pricePerSqft:desc', label: 'Price per sq ft: high to low' },
  { value: 'possessionDate:asc', label: 'Possession: soonest' },
  { value: 'possessionDate:desc', label: 'Possession: latest' },
  { value: 'rating:desc', label: 'Builder rating' },
  { value: 'views:desc', label: 'Most viewed' },
  { value: 'newest', label: 'Newest listings' },
];

export const BHK_OPTIONS = [1, 2, 3, 4];

export const TIER_OPTIONS: Array<{ value: Tier; label: string; hint: string }> = [
  { value: 'budget', label: 'Budget', hint: 'Under ₹50L' },
  { value: 'mid', label: 'Mid', hint: '₹50L – ₹1.5Cr' },
  { value: 'luxury', label: 'Luxury', hint: '₹1.5Cr+' },
];

export const POSSESSION_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'ready_to_move', label: 'Ready to move' },
  { value: 'under_construction', label: 'Under construction' },
  { value: 'new_launch', label: 'New launch' },
];

export const TYPE_OPTIONS: Array<{ value: FlatType; label: string }> = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'villa', label: 'Villa' },
  { value: 'penthouse', label: 'Penthouse' },
];

export const FACING_OPTIONS: Array<{ value: Facing; label: string }> = [
  { value: 'east', label: 'East' },
  { value: 'west', label: 'West' },
  { value: 'north', label: 'North' },
  { value: 'south', label: 'South' },
  { value: 'north_east', label: 'North-east' },
  { value: 'north_west', label: 'North-west' },
  { value: 'south_east', label: 'South-east' },
  { value: 'south_west', label: 'South-west' },
];

/** Time slots offered by the site-visit calendar. */
export const VISIT_SLOTS = [
  '09:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '02:00 PM',
  '03:00 PM',
  '04:00 PM',
  '05:00 PM',
];

/** Token amounts offered in the booking flow (mirrors PlatformConfig defaults). */
export const TOKEN_OPTIONS = [50_000, 100_000, 200_000, 500_000];

const csv = (values: Array<string | number>): string => values.join(',');

const list = (value: string | null | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const numberOr = (value: string | null, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Serialises filter state into URLSearchParams (only meaningful keys). */
export const filtersToParams = (state: FilterState, city: string): URLSearchParams => {
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (state.locality) params.set('locality', state.locality);
  if (state.bhk.length) params.set('bhk', csv(state.bhk));
  if (state.tier.length) params.set('tier', csv(state.tier));
  if (state.possession.length) params.set('possession', csv(state.possession));
  if (state.type.length) params.set('type', csv(state.type));
  if (state.facing.length) params.set('facing', csv(state.facing));
  if (state.amenities.length) params.set('amenities', csv(state.amenities));
  if (state.priceMin > 0) params.set('priceMin', String(state.priceMin));
  if (state.priceMax > 0) params.set('priceMax', String(state.priceMax));
  if (state.reraOnly) params.set('reraVerified', 'true');
  if (state.builderRatingMin > 0) params.set('builderRatingMin', String(state.builderRatingMin));
  if (state.tokenMax > 0) params.set('tokenMax', String(state.tokenMax));
  if (state.search) params.set('q', state.search);
  if (state.sortBy !== INITIAL_FILTERS.sortBy) params.set('sortBy', state.sortBy);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.limit !== INITIAL_FILTERS.limit) params.set('limit', String(state.limit));
  if (state.includeUnavailable) params.set('includeUnavailable', 'true');
  return params;
};

/** Parses URLSearchParams back into filter state. */
export const paramsToFilters = (params: URLSearchParams): Partial<FilterState> => {
  const numbers = (key: string): number[] => list(params.get(key)).map(Number).filter(Number.isFinite);
  const sortBy = params.get('sortBy') as SortKey | null;

  return {
    locality: params.get('locality') ?? '',
    bhk: numbers('bhk'),
    tier: list(params.get('tier')) as Tier[],
    possession: list(params.get('possession')) as ProjectStatus[],
    type: list(params.get('type')) as FlatType[],
    facing: list(params.get('facing')) as Facing[],
    amenities: list(params.get('amenities')),
    priceMin: numberOr(params.get('priceMin'), 0),
    priceMax: numberOr(params.get('priceMax'), 0),
    reraOnly: params.get('reraVerified') === 'true',
    builderRatingMin: numberOr(params.get('builderRatingMin'), 0),
    tokenMax: numberOr(params.get('tokenMax'), 0),
    search: params.get('q') ?? '',
    sortBy: sortBy && SORT_OPTIONS.some((o) => o.value === sortBy) ? sortBy : INITIAL_FILTERS.sortBy,
    page: numberOr(params.get('page'), 1),
    limit: numberOr(params.get('limit'), INITIAL_FILTERS.limit),
    includeUnavailable: params.get('includeUnavailable') === 'true',
  };
};

/** Builds the Axios query the API expects, omitting empty values. */
export const filtersToQuery = (state: FilterState, city: string): FlatQuery => {
  const query: FlatQuery = {
    sortBy: state.sortBy,
    page: state.page,
    limit: state.limit,
  };
  if (city) query.city = city;
  if (state.locality) query.locality = state.locality;
  if (state.bhk.length) query.bhk = csv(state.bhk);
  if (state.tier.length) query.tier = csv(state.tier);
  if (state.possession.length) query.possession = csv(state.possession);
  if (state.type.length) query.type = csv(state.type);
  if (state.facing.length) query.facing = csv(state.facing);
  if (state.amenities.length) query.amenities = csv(state.amenities);
  if (state.priceMin > 0) query.priceMin = state.priceMin;
  if (state.priceMax > 0) query.priceMax = state.priceMax;
  if (state.reraOnly) query.reraVerified = 'true';
  if (state.builderRatingMin > 0) query.builderRatingMin = state.builderRatingMin;
  if (state.tokenMax > 0) query.tokenMax = state.tokenMax;
  if (state.search) query.q = state.search;
  if (state.includeUnavailable) query.includeUnavailable = 'true';
  return query;
};

/**
 * A stable cache key for a built query, so React Query refetches exactly when
 * the filter set changes.
 *
 * Keys are emitted in a fixed order so two equivalent filter sets always produce
 * the same string (otherwise `?bhk=2` and `?tier=mid` in a different order would
 * thrash the cache).
 */
export const filtersKey = (query: FlatQuery, city: string): string => {
  const ordered: Record<string, unknown> = {
    city: city || undefined,
    locality: query.locality,
    bhk: query.bhk,
    tier: query.tier,
    possession: query.possession,
    type: query.type,
    facing: query.facing,
    amenities: query.amenities,
    priceMin: query.priceMin,
    priceMax: query.priceMax,
    reraVerified: query.reraVerified,
    builderRatingMin: query.builderRatingMin,
    tokenMax: query.tokenMax,
    projectId: query.projectId,
    builderId: query.builderId,
    q: query.q,
    includeUnavailable: query.includeUnavailable,
    sortBy: query.sortBy,
    page: query.page,
    limit: query.limit,
  };
  for (const key of Object.keys(ordered)) {
    if (ordered[key] === undefined || ordered[key] === '') delete ordered[key];
  }
  return JSON.stringify(ordered);
};

/** Human summary chips for the active filter set. */
export const describeFilters = (state: FilterState): string[] => {
  const chips: string[] = [];
  if (state.locality) chips.push(state.locality);
  for (const bhk of state.bhk) chips.push(`${bhk} BHK`);
  for (const tier of state.tier) chips.push(`${tier[0].toUpperCase()}${tier.slice(1)}`);
  for (const possession of state.possession) {
    chips.push(POSSESSION_OPTIONS.find((o) => o.value === possession)?.label ?? possession);
  }
  if (state.priceMin > 0) chips.push(`Above ${Math.round(state.priceMin / 100000)}L`);
  if (state.priceMax > 0) chips.push(`Below ${Math.round(state.priceMax / 100000)}L`);
  if (state.reraOnly) chips.push('RERA verified only');
  if (state.builderRatingMin > 0) chips.push(`Builder rating ${state.builderRatingMin}+`);
  if (state.tokenMax > 0) chips.push(`Token under ₹${Math.round(state.tokenMax / 100000)}L`);
  if (state.type.length) chips.push(state.type.map((t) => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t).join(', '));
  if (state.includeUnavailable) chips.push('Including sold-out');
  return chips;
};