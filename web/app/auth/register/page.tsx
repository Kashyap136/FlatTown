import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

import { RegisterForm } from '@/components/auth/RegisterForm';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Create an account',
  description:
    'Join Flat Town as a buyer, builder or agent. List new projects, book RERA-verified site visits and reserve flats with a token held in escrow.',
  alternates: { canonical: '/auth/register' },
  robots: { index: true, follow: true },
};

export default function RegisterPage() {
  return (
    <div className="ft-container flex min-h-[70vh] items-center justify-center py-10">
      <Suspense
        fallback={
          <div className="w-full max-w-2xl space-y-4" role="status" aria-label="Loading registration">
            <Skeleton className="h-96 w-full" />
            <span className="sr-only">Loading…</span>
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
      <p className="sr-only">
        <Link href="/auth/login">Sign in</Link>
      </p>
    </div>
  );
}