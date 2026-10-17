import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { BuilderBookings } from '@/components/dashboards/BuilderBookings';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Bookings | FLAT TOWN builder', robots: { index: false, follow: false } };

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

export default function BuilderBookingsPage() {
  return (
    <RequireRole allow={['builder', 'agent']}>
      <DashboardShell
        title="Bookings"
        subtitle="Accept booking requests, verify buyer documents and track escrow. Only an admin releases escrow."
        nav={NAV}
      >
        <BuilderBookings />
      </DashboardShell>
    </RequireRole>
  );
}