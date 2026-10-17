import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { PlatformConfigForm } from '@/components/dashboards/PlatformConfigForm';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tier & commission configuration | FLAT TOWN admin',
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

export default function AdminConfigPage() {
  return (
    <RequireRole allow={['admin']}>
      <DashboardShell
        title="Tier & commission configuration"
        subtitle="RULE 13: an admin controls the tier thresholds, the commission percentage and the platform/agent split. Buyers and builders can never change these."
        nav={NAV}
      >
        <PlatformConfigForm />
      </DashboardShell>
    </RequireRole>
  );
}