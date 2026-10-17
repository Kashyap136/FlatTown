'use client';

import { CalendarDays, CheckCircle2, Clock, IndianRupee, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { VisitPaymentModal } from '@/components/flat/VisitPaymentModal';
import { useVisitActions, useVisitList } from '@/hooks/useFlats';
import { formatDate, formatDateTime, formatINR } from '@/lib/price';
import { resolveMockPayment as resolveMockGatewayPayment } from '@/lib/razorpay';
import { errorMessage } from '@/lib/utils';
import type { SiteVisit, VisitStatus } from '@/lib/types';

const STATUS_STYLE: Record<VisitStatus, { variant: 'info' | 'success' | 'warning' | 'neutral' | 'danger'; icon: typeof Clock }> = {
  requested: { variant: 'info', icon: Clock },
  confirmed: { variant: 'success', icon: CheckCircle2 },
  completed: { variant: 'neutral', icon: CheckCircle2 },
  cancelled: { variant: 'danger', icon: XCircle },
};

export const BuyerVisits = () => {
  const { data, isLoading } = useVisitList({ scope: 'mine', limit: 50 });
  const { updateStatus, payVisit } = useVisitActions();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A chargeable visit stays `pending` until the charge is settled, so the list
  // must offer payment for any visit still awaiting it.
  const [paying, setPaying] = useState<SiteVisit | null>(null);

  const visits = (data ?? []) as SiteVisit[];

  const resolveMockPayment = async (input: { orderId: string; amount: number; mockSignature?: string }) =>
    resolveMockGatewayPayment(input);

  const handlePaid = async (paymentId: string, signature: string, orderId?: string) => {
    if (!paying) return;
    await payVisit.mutateAsync({ id: paying.id, paymentId, signature, orderId });
    setPaying(null);
  };

  const cancel = async (visit: SiteVisit) => {
    setPendingId(visit.id);
    setError(null);
    try {
      await updateStatus.mutateAsync({
        id: visit.id,
        status: 'cancelled',
        cancellationReason: 'Cancelled by the buyer',
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not cancel this visit.'));
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) return <ListSkeleton rows={3} />;

  if (visits.length === 0) {
    return (
      <EmptyState
        preset="visits"
        actionLabel="Find a flat to visit"
        actionHref="/"
        className="mt-4"
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <ul className="space-y-3">
        {visits.map((visit) => {
          const style = STATUS_STYLE[visit.status] ?? STATUS_STYLE.requested;
          const Icon = style.icon;
          const canCancel = ['requested', 'confirmed'].includes(visit.status);
          return (
            <li key={visit.id}>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-slate-900">
                        {visit.flat?.title ?? 'Flat'} · {visit.project?.projectName ?? 'Project'}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {visit.reference} · requested {formatDate(visit.createdAt)}
                      </p>
                    </div>
                    <Badge variant={style.variant} className="inline-flex items-center gap-1 capitalize">
                      <Icon className="size-3" aria-hidden="true" />
                      {visit.status}
                    </Badge>
                  </div>

                  <dl className="grid gap-2 text-[13px] sm:grid-cols-3">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 text-slate-400" aria-hidden="true" />
                      <span className="text-slate-600">
                        <span className="block text-[11px] text-slate-400">Date</span>
                        <span className="font-medium text-slate-800">{formatDate(visit.slot?.date)}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3.5 text-slate-400" aria-hidden="true" />
                      <span className="text-slate-600">
                        <span className="block text-[11px] text-slate-400">Slot</span>
                        <span className="font-medium text-slate-800">{visit.slot?.time}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <IndianRupee className="size-3.5 text-slate-400" aria-hidden="true" />
                      <span className="text-slate-600">
                        <span className="block text-[11px] text-slate-400">Charge</span>
                        <span className="font-medium text-slate-800">
                          {visit.visitCharge > 0 ? formatINR(visit.visitCharge) : 'Free'}
                        </span>
                      </span>
                    </div>
                  </dl>

                  {visit.paymentStatus === 'paid' ? (
                    <p className="rounded-lg bg-emerald-50 p-2.5 text-[12px] text-emerald-900">
                      Visit charge {formatINR(visit.visitCharge)} paid{visit.payment?.gateway === 'mock' ? ' (simulated)' : ''} — fully
                      refundable on cancellation or on booking this flat.
                    </p>
                  ) : visit.visitCharge > 0 && visit.paymentStatus === 'pending' ? (
                    <Alert tone="warning" title="Payment pending">
                      <p className="mb-2">
                        Pay the visit charge of {formatINR(visit.visitCharge)} so the builder can confirm this slot. The
                        amount is fully refunded if you book this flat.
                      </p>
                      {visit.payment?.orderId ? (
                        <Button
                          size="sm"
                          onClick={() => setPaying(visit)}
                          disabled={payVisit.isPending}
                        >
                          <IndianRupee aria-hidden="true" />
                          {payVisit.isPending ? 'Processing…' : `Pay ${formatINR(visit.visitCharge)}`}
                        </Button>
                      ) : (
                        <p className="text-[12px]">
                          No payment order is available for this visit. Please cancel it and request a new slot.
                        </p>
                      )}
                    </Alert>
                  ) : null}

                  {visit.requirements ? (
                    <p className="text-[12px] text-slate-600">
                      <span className="font-medium text-slate-700">Your note:</span> {visit.requirements}
                    </p>
                  ) : null}

                  {visit.builderNotes ? (
                    <p className="text-[12px] text-slate-600">
                      <span className="font-medium text-slate-700">Builder:</span> {visit.builderNotes}
                    </p>
                  ) : null}

                  {visit.bookingId ? (
                    <p className="text-[12px] text-emerald-700">
                      <Link href={`/buyer/bookings?booking=${visit.bookingId}`} className="font-semibold underline">
                        This visit led to a booking →
                      </Link>
                    </p>
                  ) : null}

                  {visit.payment?.refundId || visit.paymentStatus === 'refunded' ? (
                    <p className="text-[12px] text-slate-600">
                      Refunded {formatDateTime(visit.updatedAt)}
                      {visit.payment?.refundId ? ` · ${visit.payment.refundId}` : ''}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {visit.flat?.id ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/flat/${visit.flat.id}`}>View the flat</Link>
                      </Button>
                    ) : null}
                    {canCancel ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pendingId === visit.id}
                        onClick={() => void cancel(visit)}
                      >
                        {pendingId === visit.id ? <Loader2 className="animate-spin" /> : <XCircle />}
                        Cancel visit
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <VisitPaymentModal
        open={Boolean(paying)}
        onOpenChange={(open) => !open && setPaying(null)}
        visitId={paying?.id ?? null}
        visitTitle={`${paying?.flat?.title ?? 'Flat'} · ${paying?.project?.projectName ?? 'Project'}`}
        charge={paying?.visitCharge ?? 0}
        order={
          paying
            ? {
                amount: paying.visitCharge,
                orderId: paying.payment?.orderId,
                gateway: paying.payment?.gateway,
                keyId: undefined,
                mockSignature: paying.payment?.mockSignature,
              }
            : null
        }
        resolveMockPayment={resolveMockPayment}
        onPaid={handlePaid}
        busy={payVisit.isPending}
      />
    </div>
  );
};