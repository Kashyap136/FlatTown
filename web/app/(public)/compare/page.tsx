import type { Metadata } from 'next';

import { CompareTable } from '@/components/marketplace/CompareTable';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Compare Flats',
  description:
    'Compare up to three new-builder flats side by side: total price, price per sq ft, carpet area, possession, RERA status and builder rating.',
  alternates: { canonical: '/compare' },
};

export default function ComparePage() {
  return (
    <div className="ft-container pb-16 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Compare flats</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
          Put up to three new-builder flats side by side. Every figure below is the server-calculated value — the tier,
          total price and commission are never set by the builder or by your browser.
        </p>
      </header>

      <CompareTable />
    </div>
  );
}