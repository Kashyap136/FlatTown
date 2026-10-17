import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { EscrowConsole } from '@/components/dashboards/EscrowConsole';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Escrow & bookings | FLAT TOWN admin', robots: { index: false, follow: false } };

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

export default function AdminEscrowPage() {
  return (
    <RequireRole allow={['admin']}>
      <DashboardShell
        title="Escrow & bookings"
        subtitle="Inspect every booking, release escrow once the conditions are met, refund where authorised, and read the revenue report."
        nav={NAV}
      >
        <EscrowConsole />
      </DashboardShell>
    </RequireRole>
  );
}