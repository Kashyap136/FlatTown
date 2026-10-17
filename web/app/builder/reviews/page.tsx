import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { ReviewsManager } from '@/components/dashboards/ReviewsManager';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reviews | FLAT TOWN builder', robots: { index: false, follow: false } };

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

export default function BuilderReviewsPage() {
  return (
    <RequireRole allow={['builder', 'agent']}>
      <DashboardShell
        title="Reviews & rating"
        subtitle="Only buyers with a completed booking can review you. Ratings are scored on possession, construction quality and transparency."
        nav={NAV}
      >
        <ReviewsManager />
      </DashboardShell>
    </RequireRole>
  );
}