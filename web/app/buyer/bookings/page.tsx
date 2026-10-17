import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { BuyerBookings } from '@/components/dashboards/BuyerBookings';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'My bookings & escrow | FLAT TOWN', robots: { index: false, follow: false } };

export default function BuyerBookingsPage() {
  return (
    <RequireRole allow={['buyer']}>
      <DashboardShell
        title="Bookings & escrow"
        subtitle="Track every booking from token payment to escrow release. Escrow is only ever released by an admin."
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
        <BuyerBookings />
      </DashboardShell>
    </RequireRole>
  );
}