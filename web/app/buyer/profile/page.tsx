import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { ProfilePanel } from '@/components/dashboards/ProfilePanel';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile | FLAT TOWN', robots: { index: false, follow: false } };

export default function BuyerProfilePage() {
  return (
    <RequireRole allow={['buyer', 'builder', 'agent']}>
      <DashboardShell
        title="Profile & documents"
        subtitle="Your account details and the document status the platform sees."
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
        <ProfilePanel />
      </DashboardShell>
    </RequireRole>
  );
}