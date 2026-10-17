import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { VerificationQueue } from '@/components/dashboards/VerificationQueue';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Verification queue | FLAT TOWN admin', robots: { index: false, follow: false } };

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

export default function AdminVerificationsPage() {
  return (
    <RequireRole allow={['admin']}>
      <DashboardShell
        title="Verification queue"
        subtitle="Builder KYC, RERA registrations and project approvals. Builders can never self-verify — every decision here is audited."
        nav={NAV}
      >
        <VerificationQueue />
      </DashboardShell>
    </RequireRole>
  );
}