'use client';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/common/States';

/**
 * Global error boundary.
 *
 * Next.js renders this in place of the route when a client render or a server
 * data fetch throws, so a visitor always gets a recoverable state instead of a
 * blank page. `notFound()` is *not* routed here — it renders `not-found.tsx`.
 */
export default function AppErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="ft-container py-16">
      <ErrorState
        title="We hit a problem loading this page"
        message={error.message || 'Please try again in a moment.'}
        onRetry={reset}
      />
      <div className="mt-6 text-center">
        <Button asChild variant="ghost" size="sm">
          <a href="/">Back to the marketplace</a>
        </Button>
      </div>
    </div>
  );
}