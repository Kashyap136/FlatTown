import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { ProjectForm } from '@/components/builder/ProjectForm';

/** Authenticated, per-user surface: never prerendered or cached. */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Add a project | FLAT TOWN builder',
  description: 'Create a new builder project. It stays hidden until an admin approves it.',
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

export default function NewProjectPage() {
  return (
    <RequireRole allow={['builder', 'agent']}>
      <DashboardShell
        title="Add a project"
        subtitle="A project groups your flats, carries your RERA number and drives the project detail page buyers browse."
        nav={NAV}
      >
        <ProjectForm />
      </DashboardShell>
    </RequireRole>
  );
}