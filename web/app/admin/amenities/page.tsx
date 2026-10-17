import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { AmenityManager } from '@/components/dashboards/AmenityManager';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Amenity master | FLAT TOWN admin', robots: { index: false, follow: false } };

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

export default function AdminAmenitiesPage() {
  return (
    <RequireRole allow={['admin']}>
      <DashboardShell
        title="Amenity master"
        subtitle="The amenity catalogue buyers filter on. The amenities filter uses all-required matching, so each entry must describe something genuinely offered."
        nav={NAV}
      >
        <AmenityManager />
      </DashboardShell>
    </RequireRole>
  );
}