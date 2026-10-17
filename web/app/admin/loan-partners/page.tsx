import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { LoanPartnerManager } from '@/components/dashboards/LoanPartnerManager';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Loan partners | FLAT TOWN admin',
  robots: { index: false, follow: false },
};

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

export default function AdminLoanPartnersPage() {
  return (
    <RequireRole allow={['admin']}>
      <DashboardShell
        title="Loan partners"
        subtitle="Home-loan partners buyers are matched with, and the applications an admin has assigned to them."
        nav={NAV}
      >
        <LoanPartnerManager />
      </DashboardShell>
    </RequireRole>
  );
}