import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { BuilderVisits } from '@/components/dashboards/BuilderVisits';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Site visits | FLAT TOWN builder', robots: { index: false, follow: false } };

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

export default function BuilderVisitsPage() {
  return (
    <RequireRole allow={['builder', 'agent']}>
      <DashboardShell
        title="Site visits"
        subtitle="Confirm, complete or decline visit requests. Visit charges are credited to the platform and fully refunded when the buyer books."
        nav={NAV}
      >
        <BuilderVisits />
      </DashboardShell>
    </RequireRole>
  );
}