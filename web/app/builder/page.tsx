import { Plus } from 'lucide-react';
import Link from 'next/link';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { BuilderDashboard } from '@/components/dashboards/BuilderDashboard';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/builder', label: 'Overview', exact: true },
  { href: '/builder/projects/new', label: 'Add project' },
  { href: '/builder/flats/new', label: 'Add flat' },
  { href: '/builder/visits', label: 'Site visits' },
  { href: '/builder/bookings', label: 'Bookings' },
  { href: '/builder/payouts', label: 'Payouts & escrow' },
  { href: '/builder/reviews', label: 'Reviews' },
  { href: '/builder/settings', label: 'Verification' },
];

export const metadata = {
  title: 'Builder dashboard',
  description:
    'Manage new-builder projects and flats, site visits, bookings, escrow payouts, RERA documents and buyer reviews.',
  robots: { index: false, follow: false },
};

export default function BuilderDashboardPage() {
  return (
    <RequireRole allow={['builder', 'agent']}>
      <DashboardShell
        title="Builder dashboard"
        subtitle="Views, inquiries, visits and bookings — all computed live from your listings."
        nav={NAV}
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href="/builder/flats/new">
                <Plus />
                List a flat
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/builder/projects/new">
                <Plus />
                Add a project
              </Link>
            </Button>
          </>
        }
      >
        <BuilderDashboard />
      </DashboardShell>
    </RequireRole>
  );
}