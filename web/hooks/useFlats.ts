'use client';

/**
 * Marketplace data hooks.
 *
 * All server state flows through TanStack React Query with the query keys
 * derived from `lib/filters.ts`, so a filter change refetches exactly the
 * right slice and back/forward navigation restores cached pages instantly.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  adminApi,
  bookingsApi,
  buildersApi,
  disputesApi,
  flatsApi,
  loanApi,
  metaApi,
  notificationsApi,
  projectsApi,
  requirementsApi,
  reviewsApi,
  wishlistApi,
  type AdminDashboard,
  type FlatQuery,
} from '../lib/api';
import { filtersKey } from '../lib/filters';
import { toastError, toastSuccess } from '../components/ui/toast';
import type {
  Amenity,
  Booking,
  CityOption,
  Dispute,
  FlatDetail,
  FlatSummary,
  Inquiry,
  LoanApplication,
  LoanPartner,
  MarketplaceStats,
  PlatformConfigView,
  ProjectDetail,
  ProjectSummary,
  Review,
  ReviewList,
  SiteVisit,
  TierConfig,
  WishlistEntry,
} from '../lib/types';

/* ------------------------------- query keys ------------------------------- */

// Re-exported so existing `import { qk } from '@/hooks/useFlats'` keeps working,
// while server components can import the same keys from a non-client module.
import { qk } from '../lib/queryKeys';

export { qk };

/* --------------------------------- meta ----------------------------------- */

export const useTierConfig = (): UseQueryResult<TierConfig> =>
  useQuery({ queryKey: qk.tierConfig, queryFn: () => metaApi.tierConfig().then((r) => r.data), staleTime: 10 * 60_000 });

export const useCities = (): UseQueryResult<CityOption[]> =>
  useQuery({ queryKey: qk.cities, queryFn: () => metaApi.cities().then((r) => r.data), staleTime: 30 * 60_000 });

export const useAmenities = (): UseQueryResult<Amenity[]> =>
  useQuery({ queryKey: qk.amenities, queryFn: () => metaApi.amenities().then((r) => r.data), staleTime: 30 * 60_000 });

export const useMarketplaceStats = (): UseQueryResult<MarketplaceStats> =>
  useQuery({ queryKey: qk.stats, queryFn: () => metaApi.marketplaceStats().then((r) => r.data), staleTime: 60_000 });

/* ------------------------------- marketplace ------------------------------ */

export interface UseFlatsResult {
  data: FlatSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useFlats = (query: FlatQuery, city: string): UseFlatsResult => {
  const key = filtersKey(query, city);
  const result = useQuery({
    queryKey: qk.flats(key),
    queryFn: () => flatsApi.list(query),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  return {
    data: (result.data?.data ?? []) as FlatSummary[],
    total: result.data?.meta?.total ?? 0,
    page: result.data?.meta?.page ?? query.page ?? 1,
    limit: result.data?.meta?.limit ?? query.limit ?? 18,
    totalPages: result.data?.meta?.totalPages ?? 0,
    hasNext: result.data?.meta?.hasNext ?? false,
    hasPrev: result.data?.meta?.hasPrev ?? false,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: (result.error as Error | null) ?? null,
    refetch: () => void result.refetch(),
  };
};

export const useFlat = (id: string, enabled = true): UseQueryResult<FlatDetail> =>
  useQuery({
    queryKey: qk.flat(id),
    queryFn: () => flatsApi.get(id).then((r) => r.data),
    enabled: Boolean(id) && enabled,
    staleTime: 30_000,
  });

export const useCompare = (ids: string[]) =>
  useQuery({
    queryKey: qk.compare(ids),
    queryFn: () => flatsApi.compare(ids).then((r) => r.data),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

export const useFlatReviews = (flatId: string): UseQueryResult<ReviewList> =>
  useQuery({
    queryKey: qk.flatReviews(flatId),
    queryFn: () => flatsApi.reviews(flatId).then((r) => r.data),
    enabled: Boolean(flatId),
    staleTime: 60_000,
  });

/* -------------------------------- projects -------------------------------- */

/** Project list. Returns the page of projects directly for convenience. */
export const useProjects = (params: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: qk.projects(JSON.stringify(params)),
    queryFn: () => projectsApi.list(params),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    select: (response) => (response.data ?? []) as ProjectSummary[],
  });

export const useProject = (id: string): UseQueryResult<ProjectDetail> =>
  useQuery({
    queryKey: qk.project(id),
    queryFn: () => projectsApi.get(id).then((r) => r.data),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

export const useProjectFlats = (projectId: string, params: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: qk.projectFlats(projectId, JSON.stringify(params)),
    queryFn: () => projectsApi.flats(projectId, params).then((r) => r.data),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

/* -------------------------------- builders -------------------------------- */

export const useTopBuilders = (city?: string) =>
  useQuery({ queryKey: qk.topBuilders(city ?? ''), queryFn: () => buildersApi.topRated(city).then((r) => r.data) });

export const useBuilderDashboard = (enabled = true) =>
  useQuery({
    queryKey: qk.builderDashboard,
    queryFn: () => buildersApi.dashboard().then((r) => r.data),
    enabled,
    staleTime: 30_000,
  });

export const useBuilderInquiries = (params: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: qk.builderInquiries(JSON.stringify(params)),
    queryFn: () => buildersApi.inquiries(params),
    staleTime: 30_000,
    select: (response) => (response.data ?? []) as Inquiry[],
  });

export const useUpdateInquiryStatus = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => buildersApi.updateInquiryStatus(id, status),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['builders'] });
      void client.invalidateQueries({ queryKey: ['flats'] });
      toastSuccess('Inquiry updated');
    },
    onError: (error: Error) => toastError('Could not update the inquiry', error.message),
  });
};

/* --------------------------------- visits --------------------------------- */

/**
 * Visit hooks live in `useVisit.ts`; re-exported here so a component that
 * already imports from this module does not need a second import.
 */
export {
  useVisit,
  useVisitActions,
  useVisitAvailability,
  useVisitList,
  isUpcoming,
} from './useVisit';
export type { VisitActions, VisitSlotOption } from './useVisit';

/* -------------------------------- bookings ------------------------------- */

/**
 * Bookings for the given scope.
 *
 * Must unwrap `.data` like every other hook here. Returning the raw
 * `{ success, message, data }` envelope meant callers doing
 * `(bookings ?? []) as Booking[]` kept the *object*, so `.filter`/`.map`/`.length`
 * misbehaved and six dashboards (buyer overview, buyer bookings, buyer loan,
 * builder bookings, builder payouts, agent) crashed into the error boundary.
 */
export const useBookings = (
  params: Record<string, unknown> = {},
  enabled = true,
): UseQueryResult<Booking[]> =>
  useQuery({
    queryKey: qk.bookings(JSON.stringify(params)),
    queryFn: () => bookingsApi.list(params).then((r) => r.data),
    enabled,
    staleTime: 20_000,
  });

export const useBooking = (id: string, enabled = true): UseQueryResult<Booking> =>
  useQuery({
    queryKey: qk.booking(id),
    queryFn: () => bookingsApi.get(id).then((r) => r.data.booking),
    enabled: Boolean(id) && enabled,
    staleTime: 20_000,
  });

export const useBookingActions = () => {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['bookings'] });
    void client.invalidateQueries({ queryKey: ['visits'] });
    void client.invalidateQueries({ queryKey: ['flats'] });
    void client.invalidateQueries({ queryKey: ['admin'] });
  };

  return {
    createToken: useMutation({ mutationFn: bookingsApi.createToken, onSuccess: invalidate }),
    verifyToken: useMutation({
      mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof bookingsApi.verifyToken>[1]) =>
        bookingsApi.verifyToken(id, body),
      onSuccess: invalidate,
    }),
    accept: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) => bookingsApi.accept(id, note),
      onSuccess: () => {
        invalidate();
        toastSuccess('Booking accepted', 'The buyer has been notified.');
      },
      onError: (error: Error) => toastError('Could not accept the booking', error.message),
    }),
    uploadDocuments: useMutation({
      mutationFn: ({ id, files, types }: { id: string; files: File[]; types: string[] }) =>
        bookingsApi.uploadDocuments(id, files, types),
      onSuccess: () => {
        invalidate();
        toastSuccess('Documents uploaded', 'The builder will verify them shortly.');
      },
      onError: (error: Error) => toastError('Upload failed', error.message),
    }),
    verifyDocument: useMutation({
      mutationFn: ({ id, index, ...body }: { id: string; index: number; verified: boolean; rejectionReason?: string }) =>
        bookingsApi.verifyDocument(id, index, body),
      onSuccess: () => {
        invalidate();
        toastSuccess('Document verified');
      },
      onError: (error: Error) => toastError('Could not verify the document', error.message),
    }),
    releaseEscrow: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) => bookingsApi.releaseEscrow(id, note),
      onSuccess: () => {
        invalidate();
        toastSuccess('Escrow released', '90% of the token has been allocated to the builder.');
      },
      onError: (error: Error) => toastError('Escrow release blocked', error.message),
    }),
    refund: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => bookingsApi.refund(id, reason),
      onSuccess: () => {
        invalidate();
        toastSuccess('Refund processed');
      },
      onError: (error: Error) => toastError('Refund failed', error.message),
    }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason?: string }) => bookingsApi.cancel(id, reason),
      onSuccess: invalidate,
    }),
    loanStatus: useMutation({
      mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof bookingsApi.loanStatus>[1]) =>
        bookingsApi.loanStatus(id, body),
      onSuccess: invalidate,
    }),
  };
};

/* ---------------------------- requirements & loan -------------------------- */

export const useRequirements = (enabled = true) =>
  useQuery({
    queryKey: qk.requirements,
    queryFn: () => requirementsApi.list().then((r) => r.data),
    enabled,
  });

export const useRequirementMatches = (id?: string, enabled = true) =>
  useQuery({
    queryKey: qk.requirementMatches(id ?? 'active'),
    queryFn: () => requirementsApi.matches(id).then((r) => r.data),
    enabled,
  });

export const useCreateRequirement = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: requirementsApi.create,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.requirements });
      void client.invalidateQueries({ queryKey: ['requirements'] });
      toastSuccess('Requirement saved', 'We will match it against new inventory.');
    },
    onError: (error: Error) => toastError('Could not save the requirement', error.message),
  });
};

export const useLoanApplications = (enabled = true): UseQueryResult<LoanApplication[]> =>
  useQuery({
    queryKey: qk.loanApplications,
    queryFn: () => loanApi.mine().then((r) => r.data),
    enabled,
  });

export const useLoanPartners = (enabled = true): UseQueryResult<LoanPartner[]> =>
  useQuery({
    queryKey: qk.loanPartners,
    queryFn: () => loanApi.partners().then((r) => r.data),
    enabled,
  });

export const useApplyLoan = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: loanApi.apply,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.loanApplications });
      toastSuccess('Loan assistance requested', 'A loan partner will be assigned shortly.');
    },
    onError: (error: Error) => toastError('Could not submit the request', error.message),
  });
};

/* ------------------------------- wishlist --------------------------------- */

export const useWishlist = (enabled = true) =>
  useQuery({ queryKey: qk.wishlist, queryFn: () => wishlistApi.mine().then((r) => r.data), enabled });

export const useToggleWishlist = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (flatId: string) => wishlistApi.toggle(flatId),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: qk.wishlist });
      void client.invalidateQueries({ queryKey: qk.wishlistIds });
      void client.invalidateQueries({ queryKey: ['flats'] });
      toastSuccess(result.data.wishlisted ? 'Saved to your wishlist' : 'Removed from your wishlist');
    },
    onError: (error: Error) => toastError('Could not update your wishlist', error.message),
  });
};

/* -------------------------------- reviews --------------------------------- */

export const useCreateReview = (flatId: string, bookingId?: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { rating: number; comment: string }) => reviewsApi.create({ flatId, bookingId, ...body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.flatReviews(flatId) });
      void client.invalidateQueries({ queryKey: ['builders'] });
      toastSuccess('Review submitted', 'Thank you for helping other buyers.');
    },
    onError: (error: Error) => toastError('Could not submit the review', error.message),
  });
};

/* ----------------------------- notifications ------------------------------ */

export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: () => notificationsApi.list(false).then((r) => r.data),
    enabled,
    refetchInterval: 120_000,
  });

export const useMarkNotificationsRead = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await notificationsApi.markAllRead();
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.notifications }),
  });
};

/* -------------------------------- inquiry --------------------------------- */

export const useCreateInquiry = (flatId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { message?: string; visitDate?: string; loanAssistanceRequired?: boolean }) =>
      flatsApi.createInquiry(flatId, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.flat(flatId) });
      void client.invalidateQueries({ queryKey: ['builders'] });
      toastSuccess('Inquiry sent', 'The builder has been notified. You can now book a site visit.');
    },
    onError: (error: Error) => toastError('Could not send the inquiry', error.message),
  });
};

export const useCreateDispute = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: disputesApi.create,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      toastSuccess('Dispute raised', 'Our team will review it and get back to you.');
    },
    onError: (error: Error) => toastError('Could not raise the dispute', error.message),
  });
};

/* --------------------------------- admin ---------------------------------- */

export const useAdminDashboard = (enabled = true): UseQueryResult<AdminDashboard> =>
  useQuery({ queryKey: qk.adminDashboard, queryFn: () => adminApi.dashboard().then((r) => r.data), enabled });

export const useVerificationQueue = (type: 'all' | 'kyc' | 'rera' | 'project', enabled = true) =>
  useQuery({
    queryKey: qk.verificationQueue(type),
    queryFn: () => adminApi.verificationQueue(type).then((r) => r.data),
    enabled,
  });

export const useAdminActions = () => {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['admin'] });
    void client.invalidateQueries({ queryKey: ['flats'] });
    void client.invalidateQueries({ queryKey: ['projects'] });
    void client.invalidateQueries({ queryKey: ['meta'] });
  };

  return {
    verifyKyc: useMutation({
      mutationFn: ({ builderId, approved, reason }: { builderId: string; approved: boolean; reason?: string }) =>
        adminApi.verifyKyc(builderId, approved, reason),
      onSuccess: () => {
        invalidate();
        toastSuccess('KYC decision recorded');
      },
      onError: (error: Error) => toastError('Action failed', error.message),
    }),
    verifyRera: useMutation({
      mutationFn: ({ builderId, approved, reason }: { builderId: string; approved: boolean; reason?: string }) =>
        adminApi.verifyRera(builderId, approved, reason),
      onSuccess: () => {
        invalidate();
        toastSuccess('RERA decision recorded');
      },
      onError: (error: Error) => toastError('Action failed', error.message),
    }),
    approveProject: useMutation({
      mutationFn: ({ id, approved, reason }: { id: string; approved: boolean; reason?: string }) =>
        adminApi.approveProject(id, approved, reason),
      onSuccess: (_result, variables) => {
        invalidate();
        toastSuccess(variables.approved ? 'Project approved' : 'Project rejected');
      },
      onError: (error: Error) => toastError('Action failed', error.message),
    }),
    updateConfig: useMutation({
      mutationFn: adminApi.updateConfig,
      onSuccess: () => {
        invalidate();
        toastSuccess('Configuration saved', 'Tier and commission rules now apply to new listings.');
      },
      onError: (error: Error) => toastError('Could not save the configuration', error.message),
    }),
    resolveDispute: useMutation({
      mutationFn: ({ id, ...body }: { id: string; status: string; resolution?: string }) =>
        adminApi.resolveDispute(id, body),
      onSuccess: () => {
        invalidate();
        toastSuccess('Dispute updated');
      },
    }),
    moderateReview: useMutation({
      mutationFn: ({ id, ...body }: { id: string; action: string; note?: string }) => reviewsApi.moderate(id, body),
      onSuccess: () => {
        invalidate();
        toastSuccess('Review moderated');
      },
    }),
    createLoanPartner: useMutation({
      mutationFn: adminApi.createLoanPartner,
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: qk.adminLoanPartners });
        toastSuccess('Loan partner added');
      },
      onError: (error: Error) => toastError('Could not add the partner', error.message),
    }),
    updateLoanApplication: useMutation({
      mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
        adminApi.updateLoanApplication(id, body),
      onSuccess: () => {
        invalidate();
        toastSuccess('Loan application updated');
      },
    }),
  };
};

export const useEscrowLedger = (params: Record<string, unknown> = {}, enabled = true) =>
  useQuery({
    queryKey: qk.escrow(JSON.stringify(params)),
    queryFn: () => adminApi.escrow(params).then((r) => r.data),
    enabled,
  });

export const useRevenue = (params: Record<string, unknown> = {}, enabled = true) =>
  useQuery({
    queryKey: qk.revenue(JSON.stringify(params)),
    queryFn: () => adminApi.revenue(params).then((r) => r.data),
    enabled,
  });

export const usePlatformConfig = (enabled = true): UseQueryResult<{ config: PlatformConfigView; effective: Record<string, unknown> }> =>
  useQuery({ queryKey: qk.config, queryFn: () => adminApi.getConfig().then((r) => r.data), enabled });

export const useAdminAmenities = (enabled = true) =>
  useQuery({ queryKey: qk.adminAmenities, queryFn: () => adminApi.amenities().then((r) => r.data), enabled });

export const useDisputes = (
  params: Record<string, unknown> = {},
  enabled = true,
): UseQueryResult<Dispute[]> =>
  useQuery({
    queryKey: qk.disputes(JSON.stringify(params)),
    queryFn: () => adminApi.disputes(params).then((r) => r.data),
    enabled,
  });

export const useAdminReviews = (params: Record<string, unknown> = {}, enabled = true) =>
  useQuery({
    queryKey: qk.adminReviews(JSON.stringify(params)),
    queryFn: () => adminApi.reviews(params).then((r) => r.data),
    enabled,
  });

/** Unwraps `.data` like every other list hook — the raw envelope is an object,
 *  which surfaced as "map is not a function" on /admin/loan-partners. */
export const useAdminLoanApplications = (
  params: Record<string, unknown> = {},
  enabled = true,
): UseQueryResult<LoanApplication[]> =>
  useQuery({
    queryKey: qk.adminLoanApplications(JSON.stringify(params)),
    queryFn: () => adminApi.loanApplications(params).then((r) => r.data),
    enabled,
  });

/* ------------------------- listing CRUD (builder/agent) ------------------- */

export const useCreateFlat = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: flatsApi.create,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['flats'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['builders'] });
      toastSuccess('Flat listed', 'Your flat is now visible on the marketplace.');
    },
    onError: (error: Error) => toastError('Could not list the flat', error.message),
  });
};

export const useUpdateFlat = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => flatsApi.update(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['flats'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
      toastSuccess('Flat updated');
    },
    onError: (error: Error) => toastError('Could not update the flat', error.message),
  });
};

export const useDeleteFlat = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: flatsApi.remove,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['flats'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
      toastSuccess('Flat removed');
    },
    onError: (error: Error) => toastError('Could not remove the flat', error.message),
  });
};

export const useCreateProject = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['builders'] });
      toastSuccess('Project created', 'An admin will review it before it goes live.');
    },
    onError: (error: Error) => toastError('Could not create the project', error.message),
  });
};

export const useUpdateProject = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => projectsApi.update(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      toastSuccess('Project updated');
    },
    onError: (error: Error) => toastError('Could not update the project', error.message),
  });
};

export const useDeleteProject = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: projectsApi.remove,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['flats'] });
      toastSuccess('Project removed', 'Its flats were marked unavailable.');
    },
    onError: (error: Error) => toastError('Could not remove the project', error.message),
  });
};

export const useUploadRera = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; reraNumber?: string; reraState?: string }) =>
      projectsApi.uploadRera(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      toastSuccess('RERA details submitted', 'An admin will verify your registration.');
    },
    onError: (error: Error) => toastError('Could not submit the RERA details', error.message),
  });
};

export type { FlatSummary, ProjectSummary, Inquiry, Review, WishlistEntry, SiteVisit, Booking };