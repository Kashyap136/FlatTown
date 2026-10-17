/**
 * Centralised React Query cache keys.
 *
 * This lives outside `hooks/useFlats.ts` on purpose. That module is a client
 * component, so a server component cannot import from it. Keeping the keys here
 * lets a server component prefetch with the *exact* key the client hook will
 * use, which is what makes SSR hydration work instead of immediately refetching.
 */
export const qk = {
  tierConfig: ['meta', 'tiers'] as const,
  cities: ['meta', 'cities'] as const,
  amenities: ['meta', 'amenities'] as const,
  stats: ['meta', 'stats'] as const,
  priceRange: ['meta', 'price-range'] as const,
  flats: (query: string) => ['flats', 'list', query] as const,
  flat: (id: string) => ['flats', 'detail', id] as const,
  compare: (ids: string[]) => ['flats', 'compare', ids.join(',')] as const,
  flatReviews: (id: string) => ['flats', id, 'reviews'] as const,
  projects: (params: string) => ['projects', 'list', params] as const,
  project: (id: string) => ['projects', 'detail', id] as const,
  projectFlats: (id: string, params: string) => ['projects', id, 'flats', params] as const,
  topBuilders: (city: string) => ['builders', 'top', city] as const,
  builderRating: (id: string) => ['builders', id, 'rating'] as const,
  builderDashboard: ['builders', 'me', 'dashboard'] as const,
  builderInquiries: (params: string) => ['builders', 'me', 'inquiries', params] as const,
  visits: (params: string) => ['visits', 'list', params] as const,
  visitAvailability: (flatId: string) => ['visits', 'availability', flatId] as const,
  bookings: (params: string) => ['bookings', 'list', params] as const,
  booking: (id: string) => ['bookings', 'detail', id] as const,
  requirements: ['requirements', 'list'] as const,
  requirementMatches: (id: string) => ['requirements', 'matches', id] as const,
  loanApplications: ['loan', 'mine'] as const,
  loanPartners: ['loan', 'partners'] as const,
  wishlist: ['wishlist', 'mine'] as const,
  wishlistIds: ['wishlist', 'ids'] as const,
  notifications: ['notifications'] as const,
  adminDashboard: ['admin', 'dashboard'] as const,
  verificationQueue: (type: string) => ['admin', 'queue', type] as const,
  escrow: (params: string) => ['admin', 'escrow', params] as const,
  revenue: (params: string) => ['admin', 'revenue', params] as const,
  config: ['admin', 'config'] as const,
  adminAmenities: ['admin', 'amenities'] as const,
  disputes: (params: string) => ['admin', 'disputes', params] as const,
  adminReviews: (params: string) => ['admin', 'reviews', params] as const,
  adminLoanPartners: ['admin', 'loan-partners'] as const,
  adminLoanApplications: (params: string) => ['admin', 'loan-applications', params] as const,
};