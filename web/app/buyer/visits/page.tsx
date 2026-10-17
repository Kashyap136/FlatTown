import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { BuyerVisits } from '@/components/dashboards/BuyerVisits';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'My site visits | FLAT TOWN', robots: { index: false, follow: false } };

export default function BuyerVisitsPage() {
  return (
    <RequireRole allow={['buyer']}>
      <DashboardShell
        title="Site visits"
        subtitle="Requested and completed site visits. Paid visit charges are fully refunded when you book the flat."
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
        <BuyerVisits />
      </DashboardShell>
    </RequireRole>
  );
}