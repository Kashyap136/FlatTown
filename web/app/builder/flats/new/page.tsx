import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { FlatForm } from '@/components/builder/FlatForm';

/** Authenticated, per-user surface: never prerendered or cached. */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'List a flat | FLAT TOWN builder',
  description:
    'Publish a new flat. Enter size and price per square foot — the total price and the budget/mid/luxury tier are calculated by the platform.',
  robots: { index: false, follow: false },
};

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

export default function NewFlatPage() {
  return (
    <RequireRole allow={['builder', 'agent']}>
      <DashboardShell
        title="List a flat"
        subtitle="Set the size and the rate — the platform derives the total price and tier, so the listing can never disagree with the maths."
        nav={NAV}
      >
        <FlatForm />
      </DashboardShell>
    </RequireRole>
  );
}