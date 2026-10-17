import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { LoanPanel } from '@/components/dashboards/LoanPanel';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Loan assistance | FLAT TOWN', robots: { index: false, follow: false } };

export default function BuyerLoanPage() {
  return (
    <RequireRole allow={['buyer', 'agent']}>
      <DashboardShell
        title="Loan assistance"
        subtitle="Apply for home-loan assistance and track where your application is with the assigned partner."
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
        <LoanPanel />
      </DashboardShell>
    </RequireRole>
  );
}