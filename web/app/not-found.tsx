import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Page not found',
  description: 'The page you were looking for does not exist on Flat Town.',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="ft-container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-6xl font-black tabular-nums text-emerald-700">404</p>
      <h1 className="mt-4 text-2xl font-black text-slate-900">We could not find that page</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        The listing may have been sold or removed by the builder. Browse the marketplace to find something similar.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/">Browse the marketplace</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/auth/login">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}