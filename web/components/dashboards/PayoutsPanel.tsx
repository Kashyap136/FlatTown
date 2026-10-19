'use client';

import { IndianRupee, Percent, ShieldCheck, TrendingUp } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useBookings } from '@/hooks/useFlats';
import { formatDate, formatDateTime, formatINR } from '@/lib/price';
import type { Booking } from '@/lib/types';

/**
 * Payout ledger for a builder or agent.
 *
 * The agent column is only populated for bookings where an agent was involved
 * — the split is computed server-side from the admin-configurable ratio.
 */
export const PayoutsPanel = () => {
  const { data, isLoading } = useBookings({ scope: 'builder', limit: 100 });
  const { data: agentBookings } = useBookings({ scope: 'agent', limit: 100 });

  if (isLoading) return <ListSkeleton rows={3} />;

  const bookings = (data ?? []) as Booking[];
  const agentRows = (agentBookings ?? []) as Booking[];

  const held = bookings.reduce((sum, b) => sum + (b.escrow?.heldAmount ?? 0), 0);
  const released = bookings.reduce((sum, b) => sum + (b.escrow?.releasedAmount ?? 0), 0);
  const commission = bookings.reduce((sum, b) => sum + (b.escrow?.platformAmount ?? 0), 0);
  const owedToBuilder = bookings.reduce((sum, b) => sum + (b.escrow?.builderAmount ?? 0), 0);
  const agentCommission = agentRows.reduce((sum, b) => sum + (b.escrow?.agentAmount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Held in escrow" value={formatINR(held)} icon={<ShieldCheck className="size-5" />} tone="brand" />
        <StatCard label="Released to you" value={formatINR(released)} icon={<TrendingUp className="size-5" />} />
        <StatCard label="Platform commission" value={formatINR(commission)} icon={<Percent className="size-5" />} tone="warning" />
        <StatCard label="Your share (90%)" value={formatINR(owedToBuilder)} icon={<IndianRupee className="size-5" />} />
      </div>

      <Alert tone="info" title="How the money splits">
        The platform commission is <strong>10% of the booking token only</strong> — never of the property price. On
        release you receive 90% of the token; when an agent is involved their share comes out of that 10% commission
        (70% platform / 30% agent by default, configurable by an admin).
      </Alert>

      {/* --------------------------- builder ledger -------------------------- */}
      <section aria-labelledby="po-ledger" className="space-y-3">
        <h2 id="po-ledger" className="text-base font-bold text-slate-900">
          Booking payout ledger
        </h2>
        {bookings.length === 0 ? (
          <EmptyState preset="bookings" compact actionLabel="Browse the marketplace" actionHref="/" />
        ) : (
          <Card className="overflow-hidden">
            <div className="ft-table-wrap">
              <table className="ft-table">
                <caption className="sr-only">Payout ledger for your bookings</caption>
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="p-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
                      Booking
                    </th>
                    <th scope="col" className="p-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600">
                      Token
                    </th>
                    <th scope="col" className="p-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600">
                      Commission
                    </th>
                    <th scope="col" className="p-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600">
                      Your share
                    </th>
                    <th scope="col" className="p-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-slate-100">
                      <td className="p-3">
                        <Link href={`/builder/bookings?booking=${booking.id}`} className="block">
                          <span className="block text-[13px] font-medium text-slate-900 hover:text-emerald-700">
                            {booking.flat?.title ?? 'Flat'}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {booking.reference} · {formatDate(booking.createdAt)}
                          </span>
                        </Link>
                      </td>
                      <td className="p-3 text-right text-[13px] tabular-nums text-slate-900">
                        {formatINR(booking.tokenAmount)}
                      </td>
                      <td className="p-3 text-right text-[13px] tabular-nums text-slate-600">
                        {formatINR(booking.escrow?.platformAmount ?? 0)}
                        {booking.escrow?.agentAmount ? (
                          <span className="block text-[11px] text-slate-500">
                            incl. agent {formatINR(booking.escrow.agentAmount)}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-right text-[13px] font-medium tabular-nums text-slate-900">
                        {formatINR(booking.escrow?.builderAmount ?? 0)}
                      </td>
                      <td className="p-3 text-right">
                        <Badge
                          variant={
                            booking.escrowStatus === 'completed'
                              ? 'success'
                              : booking.escrowStatus === 'refunded'
                                ? 'danger'
                                : 'neutral'
                          }
                          className="capitalize"
                        >
                          {booking.escrowStatus.replace(/_/g, ' ')}
                        </Badge>
                        {booking.escrow?.releasedAt ? (
                          <span className="mt-1 block text-[10px] text-slate-500">
                            {formatDateTime(booking.escrow.releasedAt)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <th scope="row" className="p-3 text-left text-[13px] font-bold text-slate-900">
                      Total
                    </th>
                    <td className="p-3 text-right text-[13px] font-bold tabular-nums text-slate-900">
                      {formatINR(bookings.reduce((sum, b) => sum + b.tokenAmount, 0))}
                    </td>
                    <td className="p-3 text-right text-[13px] font-bold tabular-nums text-slate-900">
                      {formatINR(commission)}
                    </td>
                    <td className="p-3 text-right text-[13px] font-bold tabular-nums text-slate-900">
                      {formatINR(owedToBuilder)}
                    </td>
                    <td className="p-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ---------------------------- agent ledger --------------------------- */}
      {agentRows.length > 0 ? (
        <section aria-labelledby="po-agent" className="space-y-3">
          <h2 id="po-agent" className="text-base font-bold text-slate-900">
            Your agent commission
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>30% of the commission on {agentRows.length} booking(s)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black tabular-nums text-emerald-700">{formatINR(agentCommission)}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                This is your share of the platform commission on bookings where you were the assigned agent. It is
                carved out of the 10% token commission — the builder still receives their full 90%.
              </p>
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {agentRows.map((booking) => (
                  <li key={booking.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-slate-700">
                      {booking.flat?.title ?? 'Flat'} · {booking.reference}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-emerald-700">
                      {formatINR(booking.escrow?.agentAmount ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Settlement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] leading-relaxed text-slate-600">
          <p>
            Escrow amounts shown as <em>held</em> have not been paid out. They are released to you by a Flat Town
            admin once the buyer&rsquo;s documents are verified — a builder can never release their own escrow.
          </p>
          <p>
            Final sale commission is settled offline against an invoice after handover. Platform commission on the
            booking token is settled at the point escrow is released.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/builder/bookings">Go to bookings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};