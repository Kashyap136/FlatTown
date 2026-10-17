'use client';

import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  type DehydratedState,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Toaster } from '@/components/ui/toast';
import { ApiRequestError } from '@/lib/api';
import { clearSession } from '@/lib/auth';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * React Query defaults.
 *
 * `staleTime` matches the server-side Redis cache (5 minutes) for discovery
 * endpoints so the browser does not refetch what the API is still serving from
 * cache; list queries use the per-hook overrides where a shorter window matters.
 */
const createClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Never retry a client error — 4xx will not fix itself.
          if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });

/**
 * `dehydratedState` lets a server component prefetch and hand the result to the
 * client, so the first paint already contains real listings instead of a
 * skeleton. Without it the marketplace ships only a loading state to crawlers.
 */
export const Providers = ({
  children,
  dehydratedState,
}: {
  children: React.ReactNode;
  dehydratedState?: DehydratedState | null;
}) => {
  const [client] = useState(createClient);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // When the refresh token is rejected the API layer broadcasts this event so
  // the whole app can drop to the signed-out state at once.
  useEffect(() => {
    const onExpired = () => {
      clearSession();
      void signOut({ notifyServer: false });
    };
    window.addEventListener('flattown:session-expired', onExpired);
    return () => window.removeEventListener('flattown:session-expired', onExpired);
  }, [signOut]);

  return (
    <QueryClientProvider client={client}>
      {dehydratedState ? <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary> : children}
      <Toaster />
    </QueryClientProvider>
  );
};