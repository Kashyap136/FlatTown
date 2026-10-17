'use client';

import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  ClipboardList,
  IndianRupee,
  ShieldAlert,
  Star,
} from 'lucide-react';
import Link from 'next/link';

import { EmptyState, ErrorState } from '@/components/common/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, StatCard } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useAdminDashboard } from '@/hooks/useFlats';
import { formatDateTime, formatINR, formatNumber } from '@/lib/price';

export const AdminDashboard = () => {
  const { data, isLoading, error, refetch } = useAdminDashboard();

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) {
    return <ErrorState title="Could not load the admin dashboard" message={error.message} onRetry={refetch} />;
  }
  if (!data) return <ErrorState title="No dashboard data" message="The API returned no payload." />;

  const { users, projects, flats, bookings, visits, queue, revenue } = data;

  return (
    <div className="space-y-6">
      {/* ------------------------------ revenue --------------------------- */}
      <section aria-labelledby="ad-revenue" className="space-y-3">
        <h2 id="ad-revenue" className="text-base font-bold text-slate-900">
          Revenue
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Site visit revenue"
            value={formatINR(revenue.siteVisit)}
            hint="Charged to buyers, credited to the platform"
            icon={<CalendarDays className="size-5" />}
          />
          <StatCard
            label="Token commission"
            value={formatINR(revenue.tokenCommission)}
            hint="10% of booking tokens only"
            icon={<IndianRupee className="size-5" />}
            tone="brand"
          />
          <StatCard
            label="Released to builders"
            value={formatINR(revenue.releasedToBuilders)}
            hint="90% of released tokens"
            icon={<Building2 className="size-5" />}
          />
          <StatCard
            label="Held in escrow"
            value={formatINR(revenue.heldInEscrow)}
            hint="Awaiting admin release"
            icon={<ShieldAlert className="size-5" />}
            tone="warning"
          />
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Total platform revenue</p>
              <p className="text-3xl font-black tabular-nums text-slate-900">{formatINR(revenue.total)}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/escrow">
                Open the escrow ledger
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* ------------------------- action queues -------------------------- */}
      <section aria-labelledby="ad-queue" className="space-y-3">
        <h2 id="ad-queue" className="text-base font-bold text-slate-900">
          Needs your attention
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <QueueTile label="Builder KYC" count={queue.kyc} href="/admin/verifications" icon={BadgeCheck} tone="warning" />
          <QueueTile label="RERA reviews" count={queue.rera} href="/admin/verifications" icon={ShieldAlert} tone="warning" />
          <QueueTile label="Project approvals" count={queue.projects} href="/admin/verifications" icon={Building2} tone="warning" />
          <QueueTile label="Open disputes" count={queue.disputes} href="/admin/disputes" icon={ClipboardList} tone="danger" />
          <QueueTile label="Reviews to moderate" count={queue.reviews} href="/admin/reviews" icon={Star} tone="info" />
        </div>
      </section>

      {/* ----------------------------- platform --------------------------- */}
      <section aria-labelledby="ad-platform" className="space-y-3">
        <h2 id="ad-platform" className="text-base font-bold text-slate-900">
          Platform
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Users</p>
              <dl className="mt-2 space-y-1 text-sm">
                {(['builder', 'buyer', 'agent', 'admin'] as const).map((role) => (
                  <div key={role} className="flex justify-between gap-2">
                    <dt className="capitalize text-slate-600">{role}s</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatNumber(users[role] ?? 0)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-2 border-t border-slate-100 pt-1">
                  <dt className="text-slate-600">New in 30 days</dt>
                  <dd className="font-semibold tabular-nums text-emerald-700">{users.newIn30Days ?? 0}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projects</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Approved</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{projects.approved}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Pending</dt>
                  <dd className="font-semibold tabular-nums text-amber-700">{projects.pending}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Flats</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Total</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{flats.total}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-600">Available</dt>
                  <dd className="font-semibold tabular-nums text-emerald-700">{flats.available}</dd>
                </div>
                {Object.entries(flats.byTier ?? {}).map(([tier, count]) => (
                  <div key={tier} className="flex justify-between gap-2">
                    <dt className="capitalize text-slate-600">{tier}</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{count}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bookings & visits</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(bookings ?? {}).map(([status, row]) => (
                  <li key={status} className="flex justify-between gap-2">
                    <span className="capitalize text-slate-600">{status.replace(/_/g, ' ')}</span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {row.count}{' '}
                      <span className="text-[11px] font-normal text-slate-500">({formatINR(row.amount)})</span>
                    </span>
                  </li>
                ))}
                {Object.entries(visits ?? {}).map(([status, count]) => (
                  <li key={status} className="flex justify-between gap-2 border-t border-slate-100 pt-1">
                    <span className="capitalize text-slate-600">visits {status}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* -------------------------- audit trail --------------------------- */}
      <section aria-labelledby="ad-audit" className="space-y-3">
        <h2 id="ad-audit" className="text-base font-bold text-slate-900">
          Recent financial actions
        </h2>
        {(data.recentFinancialActions ?? []).length === 0 ? (
          <EmptyState compact preset="none" title="No financial actions yet" body="Escrow releases and refunds appear here." />
        ) : (
          <Card className="overflow-hidden">
            <div className="ft-table-wrap">
              <table className="ft-table">
                <caption className="sr-only">Recent escrow and payment audit entries</caption>
                <thead className="bg-slate-50">
                  <tr>
                    {['Action', 'Entity', 'Amount', 'Actor', 'When'].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="p-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.recentFinancialActions ?? []).map((row, index) => (
                    <tr key={String(row._id ?? index)} className="border-t border-slate-100">
                      <td className="p-3 text-[13px] font-medium text-slate-900">
                        <Badge variant="neutral">{String(row.action ?? '—').replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="p-3 text-[13px] text-slate-600">
                        {String(row.entity ?? '—')} {String(row.entityId ?? '').slice(0, 8)}
                      </td>
                      <td className="p-3 text-[13px] tabular-nums text-slate-900">
                        {typeof row.amount === 'number' ? formatINR(row.amount) : '—'}
                      </td>
                      <td className="p-3 text-[13px] capitalize text-slate-600">{String(row.actorRole ?? '—')}</td>
                      <td className="p-3 text-[13px] text-slate-500">
                        {formatDateTime(String(row.createdAt ?? ''))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h2 className="text-sm font-bold text-slate-900">What an admin controls</h2>
          <ul className="grid gap-1.5 text-[13px] leading-relaxed text-slate-600 sm:grid-cols-2">
            <li>· Builder KYC approval — no builder can self-verify.</li>
            <li>· RERA verification, which also drives priority ranking.</li>
            <li>· Project approval, which publishes a project on the marketplace.</li>
            <li>· Tier thresholds, commission percentage and the platform/agent split.</li>
            <li>· Escrow release, refunds and dispute resolution — always audited.</li>
            <li>· Amenity master data, loan partners and review moderation.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

const QueueTile = ({
  label,
  count,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  href: string;
  icon: typeof BadgeCheck;
  tone: 'warning' | 'danger' | 'info';
}) => (
  <Card>
    <CardContent className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p
          className={`mt-1 text-2xl font-black tabular-nums ${
            count > 0 ? (tone === 'danger' ? 'text-rose-600' : tone === 'warning' ? 'text-amber-600' : 'text-sky-600') : 'text-slate-300'
          }`}
        >
          {count}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Icon className="size-4 text-slate-400" aria-hidden="true" />
        <Button asChild size="sm" variant="ghost">
          <Link href={href}>Open</Link>
        </Button>
      </div>
    </CardContent>
  </Card>
);