'use client';

import { FileCheck2, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { EscrowBreakdown } from '@/components/dashboards/EscrowBreakdown';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBookingActions, useEscrowLedger, useRevenue } from '@/hooks/useFlats';
import { formatDate, formatDateTime, formatINR } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import type { Booking } from '@/lib/types';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'token_paid', label: 'Token paid' },
  { key: 'builder_accepted', label: 'Accepted' },
  { key: 'docs_pending', label: 'Docs verified' },
  { key: 'completed', label: 'Released' },
  { key: 'refunded', label: 'Refunded' },
];

/**
 * The admin escrow console.
 *
 * RULE 12: only an admin releases escrow. Release pays 90% of the token to the
 * builder, retains 10% as platform commission, and the agent share is carved out
 * of that commission.
 */
export const EscrowConsole = () => {
  const [tab, setTab] = useState('all');
  const { data, isLoading } = useEscrowLedger({ limit: 100 });
  const { data: revenue } = useRevenue({});
  const bookingActions = useBookingActions();
  const releaseEscrow = bookingActions.releaseEscrow;
  const refund = bookingActions.refund;

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refundReasons, setRefundReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = (data ?? []) as Booking[];

  const doRelease = async (booking: Booking) => {
    setPending(booking.id);
    setError(null);
    try {
      await releaseEscrow.mutateAsync({ id: booking.id, note: notes[booking.id] || undefined });
    } catch (err) {
      setError(errorMessage(err, 'Escrow release was blocked.'));
    } finally {
      setPending(null);
    }
  };

  const doRefund = async (booking: Booking) => {
    const reason = refundReasons[booking.id];
    if (!reason || reason.trim().length < 5) {
      setError('A refund needs a reason of at least 5 characters.');
      return;
    }
    setPending(booking.id);
    setError(null);
    try {
      await refund.mutateAsync({ id: booking.id, reason });
    } catch (err) {
      setError(errorMessage(err, 'Refund failed.'));
    } finally {
      setPending(null);
    }
  };

  if (isLoading) return <ListSkeleton rows={4} />;

  const report = revenue?.data as Record<string, unknown> | undefined;

  return (
    <div className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {report ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <RevenueTile label="Site visit revenue" value={report.siteVisitRevenue as { gross?: number }} />
          <RevenueTile label="Token commission" value={report.tokenCommission as { amount?: number }} />
          <RevenueTile label="Released to builders" value={report.escrow as { releasedToBuilders?: number }} />
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total platform revenue</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                {formatINR(Number(report.totalPlatformRevenue ?? 0))}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Alert tone="warning" title="Release conditions">
        Escrow can only be released when the token payment is verified, the required documents are verified by the
        builder, and the builder&rsquo;s KYC is approved. Every release writes an audit entry naming the admin who did it.
      </Alert>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((item) => {
          const rows = item.key === 'all' ? all : all.filter((b) => b.escrowStatus === item.key);
          return (
            <TabsContent key={item.key} value={item.key}>
              {rows.length === 0 ? (
                <EmptyState preset="none" title="Nothing here" body="No bookings in this escrow state." />
              ) : (
                <ul className="space-y-4">
                  {rows.map((booking) => {
                    const docs = booking.documents ?? [];
                    const verifiedDocs = docs.filter((d) => d.verified).length;
                    const releasable =
                      !['completed', 'refunded'].includes(booking.escrowStatus) &&
                      Boolean(booking.payment?.paymentId) &&
                      docs.length > 0 &&
                      verifiedDocs === docs.length;
                    return (
                      <li key={booking.id}>
                        <Card>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold text-slate-900">
                                  {booking.flat?.title ?? 'Flat'} · {booking.project?.projectName ?? 'Project'}
                                </h3>
                                <p className="truncate text-xs text-slate-500">
                                  {booking.reference} · booked {formatDate(booking.createdAt)}
                                </p>
                              </div>
                              <Badge variant="brand" className="capitalize">
                                {booking.escrowStatus.replace(/_/g, ' ')}
                              </Badge>
                            </div>

                            <dl className="grid gap-2 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <dt className="text-xs uppercase tracking-wide text-slate-500">Buyer</dt>
                                <dd className="truncate font-medium text-slate-900">{booking.buyer?.name ?? '—'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase tracking-wide text-slate-500">Builder</dt>
                                <dd className="truncate font-medium text-slate-900">{booking.builder?.name ?? '—'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase tracking-wide text-slate-500">Agent</dt>
                                <dd className="truncate font-medium text-slate-900">{booking.agent?.name ?? 'None'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase tracking-wide text-slate-500">Total price</dt>
                                <dd className="font-medium tabular-nums text-slate-900">
                                  {formatINR(booking.totalPrice)}
                                </dd>
                              </div>
                            </dl>

                            <EscrowBreakdown booking={booking} />

                            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
                              <Badge variant={booking.payment?.paymentId ? 'success' : 'warning'}>
                                {booking.payment?.paymentId ? 'Payment captured' : 'No payment'}
                              </Badge>
                              <span className="inline-flex items-center gap-1">
                                <FileCheck2 className="size-3.5" aria-hidden="true" />
                                {verifiedDocs}/{docs.length} documents verified
                              </span>
                              {booking.builder?.kycStatus ? (
                                <Badge variant={booking.builder.kycStatus === 'approved' ? 'success' : 'warning'}>
                                  Builder KYC {booking.builder.kycStatus}
                                </Badge>
                              ) : null}
                            </div>

                            {booking.statusHistory?.length ? (
                              <details className="text-[12px]">
                                <summary className="cursor-pointer font-semibold text-slate-800">
                                  Escrow history ({booking.statusHistory.length})
                                </summary>
                                <ol className="mt-1.5 space-y-1">
                                  {booking.statusHistory.map((entry, index) => (
                                    <li key={`${entry.at}-${index}`} className="text-slate-600">
                                      <span className="font-medium capitalize text-slate-800">
                                        {entry.from.replace(/_/g, ' ')} → {entry.to.replace(/_/g, ' ')}
                                      </span>{' '}
                                      · {formatDateTime(entry.at)}
                                      {entry.note ? ` · ${entry.note}` : ''}
                                    </li>
                                  ))}
                                </ol>
                              </details>
                            ) : null}

                            {!['completed', 'refunded'].includes(booking.escrowStatus) ? (
                              <div className="space-y-3 border-t border-slate-100 pt-3">
                                <Field label="Release note (optional)" htmlFor={`rel-${booking.id}`}>
                                  <Input
                                    id={`rel-${booking.id}`}
                                    value={notes[booking.id] ?? ''}
                                    onChange={(event) =>
                                      setNotes((current) => ({ ...current, [booking.id]: event.target.value }))
                                    }
                                    placeholder="KYC and RERA verified"
                                  />
                                </Field>

                                {releasable ? (
                                  <Button
                                    size="sm"
                                    disabled={pending === booking.id}
                                    onClick={() => void doRelease(booking)}
                                  >
                                    {pending === booking.id ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                                    Release escrow · {formatINR(booking.escrow?.builderAmount ?? 0)} to builder
                                  </Button>
                                ) : (
                                  <p className="text-[12px] text-slate-500">
                                    Release is blocked until the token payment is captured and every uploaded document is
                                    verified.
                                  </p>
                                )}

                                {booking.payment?.paymentId ? (
                                  <details>
                                    <summary className="cursor-pointer text-[12px] font-semibold text-rose-700">
                                      Refund instead
                                    </summary>
                                    <div className="mt-2 space-y-2">
                                      <Field label="Refund reason" htmlFor={`ref-${booking.id}`} required>
                                        <Textarea
                                          id={`ref-${booking.id}`}
                                          rows={2}
                                          value={refundReasons[booking.id] ?? ''}
                                          onChange={(event) =>
                                            setRefundReasons((current) => ({
                                              ...current,
                                              [booking.id]: event.target.value,
                                            }))
                                          }
                                          placeholder="Buyer cancelled under the refund policy"
                                        />
                                      </Field>
                                      <Button
                                        size="sm"
                                        variant="danger"
                                        disabled={pending === booking.id}
                                        onClick={() => void doRefund(booking)}
                                      >
                                        <RotateCcw />
                                        Refund {formatINR(booking.tokenAmount)}
                                      </Button>
                                    </div>
                                  </details>
                                ) : null}
                              </div>
                            ) : booking.refund ? (
                              <div>
                                <Alert tone="info" title="Refunded">
                                  {formatINR(booking.refund.amount)} returned on {formatDateTime(booking.refund.at)}
                                </Alert>
                                <p className="mt-1 text-[13px] text-slate-700">Reason: {booking.refund.reason}</p>
                              </div>
                            ) : (
                              <Alert tone="success" title="Escrow released">
                                {formatINR(booking.escrow?.releasedAmount ?? 0)} released on{' '}
                                {formatDateTime(booking.escrow?.releasedAt)}.
                              </Alert>
                            )}
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-slate-900">Audit trail</h2>
          <p className="mt-1 text-[13px] text-slate-600">
            Every escrow release, refund, verification decision and configuration change is written to the audit log
            with the acting admin, the amount and a timestamp.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => window.location.reload()}
          >
            Refresh ledger
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

const RevenueTile = ({ label, value }: { label: string; value?: { gross?: number; amount?: number; releasedToBuilders?: number } }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
        {formatINR(Number(value?.gross ?? value?.amount ?? value?.releasedToBuilders ?? 0))}
      </p>
    </CardContent>
  </Card>
);