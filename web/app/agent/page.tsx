import { Plus } from 'lucide-react';
import Link from 'next/link';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { AgentDashboard } from '@/components/dashboards/AgentDashboard';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Agent dashboard',
  description:
    'List flats on behalf of verified builders, schedule site visits and track the 30% agent share of the booking-token commission.',
  robots: { index: false, follow: false },
};

export default function AgentDashboardPage() {
  return (
    <RequireRole allow={['agent']}>
      <DashboardShell
        title="Agent dashboard"
        subtitle="List inventory for builders, manage client site visits and see your share of the booking-token commission."
        nav={[
          { href: '/agent', label: 'Overview', exact: true },
          { href: '/builder/flats/new', label: 'List a flat' },
          { href: '/buyer/visits', label: 'Client visits' },
          { href: '/builder/payouts', label: 'Commission' },
          { href: '/buyer/profile', label: 'Profile' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/builder/flats/new">
              <Plus />
              List a flat
            </Link>
          </Button>
        }
      >
        <AgentDashboard />
      </DashboardShell>
    </RequireRole>
  );
}