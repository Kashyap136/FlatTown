import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { RequirementsPanel } from '@/components/dashboards/RequirementsPanel';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'My requirements | FLAT TOWN', robots: { index: false, follow: false } };

export default function BuyerRequirementsPage() {
  return (
    <RequireRole allow={['buyer']}>
      <DashboardShell
        title="Requirements & matches"
        subtitle="Tell us what you are looking for and we will match it against live, RERA-eligible inventory."
        nav={[
          { href: '/buyer', label: 'Overview', exact: true },
          { href: '/buyer/bookings', label: 'Bookings & escrow' },
          { href: '/buyer/visits', label: 'Site visits' },
          { href: '/buyer/wishlist', label: 'Saved flats' },
          { href: '/buyer/requirements', label: 'Requirements' },
          { href: '/buyer/loan', label: 'Loan assistance' },
          { href: '/buyer/profile', label: 'Profile' },
        ]}
      >
        <RequirementsPanel />
      </DashboardShell>
    </RequireRole>
  );
}