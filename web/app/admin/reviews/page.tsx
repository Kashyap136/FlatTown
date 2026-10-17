import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { ReviewModeration } from '@/components/dashboards/ReviewModeration';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ratings moderation | FLAT TOWN admin', robots: { index: false, follow: false } };

const NAV = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/verifications', label: 'Verifications' },
  { href: '/admin/escrow', label: 'Escrow & bookings' },
  { href: '/admin/config', label: 'Tier & commission' },
  { href: '/admin/amenities', label: 'Amenity master' },
  { href: '/admin/disputes', label: 'Disputes' },
  { href: '/admin/reviews', label: 'Ratings' },
  { href: '/admin/loan-partners', label: 'Loan partners' },
];

export default function AdminReviewsPage() {
  return (
    <RequireRole allow={['admin']}>
      <DashboardShell
        title="Ratings moderation"
        subtitle="Only buyers with a completed booking can review. Hide anything that breaches the platform guidelines — builders can never moderate their own reviews."
        nav={NAV}
      >
        <ReviewModeration />
      </DashboardShell>
    </RequireRole>
  );
}