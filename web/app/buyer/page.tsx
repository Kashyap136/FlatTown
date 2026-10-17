import { DashboardShell } from '@/components/layout/DashboardShell';
import { RequireRole } from '@/components/layout/DashboardShell';
import { BuyerDashboard } from '@/components/dashboards/BuyerDashboard';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Buyer dashboard',
  description: 'Track your site visits, bookings, escrow status, saved flats and loan assistance.',
  robots: { index: false, follow: false },
};

export default function BuyerDashboardPage() {
  return (
    <RequireRole allow={['buyer']}>
      <DashboardShell
        title="Your dashboard"
        subtitle="Every site visit, booking, escrow transfer and requirement in one place."
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
        <BuyerDashboard />
      </DashboardShell>
    </RequireRole>
  );
}