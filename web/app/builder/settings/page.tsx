import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { VerificationPanel } from '@/components/dashboards/VerificationPanel';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Verification | FLAT TOWN builder', robots: { index: false, follow: false } };

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

export default function BuilderSettingsPage() {
  return (
    <RequireRole allow={['builder', 'agent']}>
      <DashboardShell
        title="Verification"
        subtitle="KYC, RERA registration and your public rating. An admin approves all of this — you cannot self-verify."
        nav={NAV}
      >
        <VerificationPanel />
      </DashboardShell>
    </RequireRole>
  );
}