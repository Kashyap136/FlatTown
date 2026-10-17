'use client';

/**
 * Site-visit hooks.
 *
 * Split out of `useFlats.ts` so the funnel's visit stage has its own module and
 * the components that only schedule visits do not pull in the whole discovery
 * surface. Re-exported from `useFlats` for convenience.
 */

import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';

import { visitsApi } from '../lib/api';
import { toastError, toastSuccess } from '../components/ui/toast';
import type { PaymentStatus, SiteVisit, VisitStatus } from '../lib/types';

export const visitKeys = {
  list: (params: string) => ['visits', 'list', params] as const,
  detail: (id: string) => ['visits', 'detail', id] as const,
  availability: (flatId: string) => ['visits', 'availability', flatId] as const,
};

export interface VisitSlotOption {
  date: string;
  time: string;
  available: boolean;
}

export interface VisitAvailability {
  dates: string[];
  slots: VisitSlotOption[];
}

/** Visit list for the given scope (`mine` for buyers, `builder` for builders). */
export const useVisitList = (
  params: Record<string, unknown> = {},
  enabled = true,
): UseQueryResult<SiteVisit[]> =>
  useQuery({
    queryKey: visitKeys.list(JSON.stringify(params)),
    queryFn: () => visitsApi.list(params).then((response) => response.data),
    enabled,
    staleTime: 20_000,
  });

export const useVisit = (id: string, enabled = true): UseQueryResult<SiteVisit> =>
  useQuery({
    queryKey: visitKeys.detail(id),
    queryFn: () => visitsApi.get(id).then((response) => response.data.visit),
    enabled: Boolean(id) && enabled,
    staleTime: 15_000,
  });

/** Bookable slots for a flat. Used by the site-visit modal's calendar. */
export const useVisitAvailability = (
  flatId: string,
  enabled = true,
): UseQueryResult<VisitAvailability> =>
  useQuery({
    queryKey: visitKeys.availability(flatId),
    queryFn: () => visitsApi.availability(flatId).then((response) => response.data),
    enabled: Boolean(flatId) && enabled,
    staleTime: 30_000,
  });

export interface VisitActions {
  requestVisit: UseMutationResult<
    Awaited<ReturnType<typeof visitsApi.request>>,
    Error,
    Parameters<typeof visitsApi.request>[0]
  >;
  payVisit: UseMutationResult<
    Awaited<ReturnType<typeof visitsApi.pay>>,
    Error,
    { id: string } & Parameters<typeof visitsApi.pay>[1]
  >;
  updateStatus: UseMutationResult<
    Awaited<ReturnType<typeof visitsApi.status>>,
    Error,
    { id: string } & Parameters<typeof visitsApi.status>[1]
  >;
  cancelVisit: (id: string, reason?: string) => Promise<unknown>;
  confirmVisit: (id: string, notes?: string) => Promise<unknown>;
  completeVisit: (id: string, notes?: string) => Promise<unknown>;
  invalidate: () => void;
}

/**
 * Visit mutations.
 *
 * A visit charge is only ever settled by the server after verifying the
 * gateway payment — `payVisit` never trusts a client-side success flag.
 */
export const useVisitActions = (): VisitActions => {
  const client = useQueryClient();
  const invalidate = (): void => {
    void client.invalidateQueries({ queryKey: ['visits'] });
    void client.invalidateQueries({ queryKey: ['builders'] });
    void client.invalidateQueries({ queryKey: ['flats'] });
  };

  const requestVisit = useMutation({
    mutationFn: visitsApi.request,
    onSuccess: () => {
      invalidate();
      toastSuccess('Site visit requested', 'The builder has been notified.');
    },
    onError: (error: Error) => toastError('Could not book the site visit', error.message),
  });

  const payVisit = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof visitsApi.pay>[1]) => visitsApi.pay(id, body),
    onSuccess: () => {
      invalidate();
      toastSuccess('Visit charge paid', 'Your slot is confirmed.');
    },
    onError: (error: Error) => toastError('Visit payment failed', error.message),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof visitsApi.status>[1]) => visitsApi.status(id, body),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toastError('Could not update the visit', error.message),
  });

  return {
    requestVisit,
    payVisit,
    updateStatus,
    confirmVisit: (id: string, notes?: string) =>
      updateStatus.mutateAsync({ id, status: 'confirmed' satisfies VisitStatus, notes }),
    completeVisit: (id: string, notes?: string) =>
      updateStatus.mutateAsync({ id, status: 'completed' satisfies VisitStatus, notes }),
    cancelVisit: (id: string, cancellationReason?: string) =>
      updateStatus.mutateAsync({ id, status: 'cancelled' satisfies VisitStatus, cancellationReason }),
    invalidate,
  };
};

/** Convenience selector for a buyer's upcoming (requested/confirmed) visits. */
export const isUpcoming = (status: VisitStatus | PaymentStatus): boolean =>
  status === 'requested' || status === 'confirmed';