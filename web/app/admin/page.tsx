import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin dashboard',
  description:
    'Builder KYC and RERA verification, project approval, amenity master, tier and commission configuration, escrow management and revenue reporting.',
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

export default function AdminDashboardPage() {
  return (
    <RequireRole allow={['admin']}>
      <DashboardShell
        title="Platform administration"
        subtitle="Every financial and trust decision on Flat Town is made here, and every action is written to the audit log."
        nav={NAV}
      >
        <AdminDashboard />
      </DashboardShell>
    </RequireRole>
  );
}