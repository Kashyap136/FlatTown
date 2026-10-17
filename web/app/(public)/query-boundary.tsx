'use client';

import { HydrationBoundary, type DehydratedState } from '@tanstack/react-query';

/**
 * Seeds the client-side React Query cache with data fetched on the server.
 *
 * Wrapped in its own client component because `HydrationBoundary` cannot be
 * rendered directly from a server component. The `QueryClientProvider` itself
 * lives in the root layout, so this only transfers the already-fetched state.
 */
export const QueryBoundary = ({
  state,
  children,
}: {
  state: DehydratedState;
  children: React.ReactNode;
}) => <HydrationBoundary state={state}>{children}</HydrationBoundary>;