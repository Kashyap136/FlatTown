import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { PayoutsPanel } from '@/components/dashboards/PayoutsPanel';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Payouts & escrow | FLAT TOWN builder', robots: { index: false, follow: false } };

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

export default function BuilderPayoutsPage() {
  return (
    <RequireRole allow={['builder', 'agent']}>
      <DashboardShell
        title="Payouts & escrow"
        subtitle="Every rupee of every booking token, with the platform commission broken out. Escrow release is admin-only."
        nav={NAV}
      >
        <PayoutsPanel />
      </DashboardShell>
    </RequireRole>
  );
}