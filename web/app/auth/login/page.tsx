import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

import { LoginForm } from '@/components/auth/LoginForm';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Flat Town to book site visits, reserve new flats and track your escrow.',
  alternates: { canonical: '/auth/login' },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <div className="ft-container flex min-h-[70vh] items-center justify-center py-10">
      <Suspense
        fallback={
          <div className="w-full max-w-md space-y-4" role="status" aria-label="Loading sign in">
            <Skeleton className="h-72 w-full" />
            <span className="sr-only">Loading…</span>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
      <p className="sr-only">
        <Link href="/auth/register">Create an account</Link>
      </p>
    </div>
  );
}