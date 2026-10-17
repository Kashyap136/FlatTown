'use client';

import { CalendarDays, ClipboardList, IndianRupee, Percent, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useBookings, usePlatformConfig, useVisitList } from '@/hooks/useFlats';
import { formatDate, formatINR } from '@/lib/price';
import type { Booking, SiteVisit } from '@/lib/types';

/**
 * Agent view.
 *
 * An agent has no admin surface at all — everything here is scoped to bookings
 * and visits where they are the assigned agent.
 */
export const AgentDashboard = () => {
  const { data: bookings, isLoading } = useBookings({ scope: 'agent', limit: 60 });
  const { data: visits } = useVisitList({ scope: 'mine', limit: 30 });
  const { data: config } = usePlatformConfig(false);

  if (isLoading) return <ListSkeleton rows={3} />;

  const list = (bookings ?? []) as Booking[];
  const visitList = (visits ?? []) as SiteVisit[];
  const agentPercent = config?.config?.commission?.agentAgentPercent ?? 30;
  const platformPercent = config?.config?.commission?.agentPlatformPercent ?? 70;

  const commission = list.reduce((sum, b) => sum + (b.escrow?.agentAmount ?? 0), 0);
  const tokens = list.reduce((sum, b) => sum + b.tokenAmount, 0);
  const active = list.filter((b) => !['completed', 'refunded'].includes(b.escrowStatus)).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active bookings" value={active} icon={<ClipboardList className="size-5" />} />
        <StatCard label="Client visits" value={visitList.length} icon={<CalendarDays className="size-5" />} />
        <StatCard
          label="Tokens handled"
          value={formatINR(tokens)}
          icon={<IndianRupee className="size-5" />}
          hint="Full token value, not your share"
        />
        <StatCard
          label="Your commission"
          value={formatINR(commission)}
          icon={<Percent className="size-5" />}
          tone="brand"
          hint={`${agentPercent}% of the 10% token commission`}
        />
      </div>

      <Alert tone="info" title="How agent commission works">
        The platform commission is 10% of the <strong>booking token only</strong>. When an agent is assigned to a
        booking that commission is split <strong>{platformPercent}% platform / {agentPercent}% agent</strong> — the
        ratio is configurable by a Flat Town admin and every booking records the split that was applied.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Your bookings</CardTitle>
          <p className="text-[13px] text-slate-600">
            Bookings where you are the assigned agent. You can see the escrow split, but only an admin releases funds.
          </p>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <EmptyState
              preset="bookings"
              title="No bookings yet"
              body="List a flat on behalf of a verified builder — when a buyer books it you earn your share of the commission."
              actionLabel="List a flat"
              actionHref="/builder/flats/new"
            />
          ) : (
            <ul className="space-y-2">
              {list.map((booking) => (
                <li key={booking.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {booking.flat?.title ?? 'Flat'} · {booking.project?.projectName ?? 'Project'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {booking.reference} · {formatDate(booking.createdAt)} · token{' '}
                        {formatINR(booking.tokenAmount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-right">
                        <span className="block text-[11px] text-slate-500">Your share</span>
                        <span className="block text-sm font-bold tabular-nums text-emerald-700">
                          {formatINR(booking.escrow?.agentAmount ?? 0)}
                        </span>
                      </span>
                      <Badge variant="brand" className="capitalize">
                        {booking.escrowStatus.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client site visits</CardTitle>
        </CardHeader>
        <CardContent>
          {visitList.length === 0 ? (
            <EmptyState preset="visits" compact actionLabel="Find inventory" actionHref="/" />
          ) : (
            <ul className="space-y-2">
              {visitList.slice(0, 8).map((visit) => (
                <li key={visit.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate text-slate-700">
                    {visit.flat?.title ?? 'Flat'} · {formatDate(visit.slot?.date)} at {visit.slot?.time}
                  </span>
                  <Badge
                    variant={visit.status === 'completed' ? 'neutral' : visit.status === 'cancelled' ? 'danger' : 'info'}
                    className="capitalize"
                  >
                    {visit.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ShieldCheck className="size-4 text-emerald-700" aria-hidden="true" />
            Agent limits on Flat Town
          </h2>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-slate-600">
            <li>· You can create and manage flats on projects you are assigned to.</li>
            <li>· You cannot verify KYC, approve projects, verify RERA or release escrow.</li>
            <li>· You cannot see other agents&rsquo; bookings or the platform revenue dashboard.</li>
            <li>· Escrow release is always an admin action — this is enforced by the API, not just the UI.</li>
          </ul>
          <Button asChild variant="outline" size="sm">
            <Link href="/builder/flats/new">List a flat for a builder</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};