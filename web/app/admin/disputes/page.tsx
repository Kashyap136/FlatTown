import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { DisputeCenter } from '@/components/dashboards/DisputeCenter';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Dispute centre | FLAT TOWN admin', robots: { index: false, follow: false } };

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

export default function AdminDisputesPage() {
  return (
    <RequireRole allow={['admin']}>
      <DashboardShell
        title="Dispute centre"
        subtitle="Payment, escrow, document and site-visit disputes raised by buyers, builders and agents."
        nav={NAV}
      >
        <DisputeCenter />
      </DashboardShell>
    </RequireRole>
  );
}