'use client';

import { CalendarDays, CheckCircle2, Clock, IndianRupee, Loader2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckboxRow } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Textarea } from '@/components/ui/input';
import { useVisitActions, useVisitAvailability } from '@/hooks/useFlats';
import { VisitPaymentModal, type VisitPaymentOrder } from './VisitPaymentModal';
import { VISIT_SLOTS } from '@/lib/filters';
import { resolveMockPayment as resolveMockGatewayPayment } from '@/lib/razorpay';
import { formatDate, formatINR } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import Link from 'next/link';

const addDays = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Site-visit booking.
 *
 * The charge rules are explained before the buyer picks a slot: verified
 * builders get their first two visits free, the charge is credited to the
 * platform, and it is fully refunded if the buyer goes on to book.
 */
export const SiteVisitModal = ({
  open,
  onOpenChange,
  flatId,
  flatTitle,
  visitCharge,
  loanAssistanceRequired = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flatId: string;
  flatTitle: string;
  visitCharge: number;
  loanAssistanceRequired?: boolean;
}) => {
  const user = useAuthStore((s) => s.user);
  const builder = useAuthStore((s) => s.user?.role === 'builder');
  const { requestVisit, payVisit } = useVisitActions();
  const { data: availability } = useVisitAvailability(flatId, open && !builder);

  const [dayOffset, setDayOffset] = useState(1);
  const [time, setTime] = useState<string>(VISIT_SLOTS[0]);
  const [requirements, setRequirements] = useState('');
  const [loanNeeded, setLoanNeeded] = useState(loanAssistanceRequired);
  const [visitors, setVisitors] = useState(2);
  const [localError, setLocalError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    visitId: string;
    visitCharge: number;
    paymentStatus: string;
    status: string;
    order: VisitPaymentOrder | null;
  } | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(i + 1)), []);
  const selectedDay = days[Math.min(dayOffset - 1, days.length - 1)];

  const taken = new Set(
    (availability?.slots ?? [])
      .filter((slot) => !slot.available)
      .map((slot) => `${new Date(slot.date).toDateString()}|${slot.time}`),
  );

  const submit = async () => {
    setLocalError(null);
    try {
      const response = await requestVisit.mutateAsync({
        flatId,
        slot: { date: selectedDay.toISOString(), time },
        requirements: requirements || undefined,
        loanAssistanceRequired: loanNeeded,
        visitorCount: visitors,
      });
      setResult({
        visitId: response.data.visit.id,
        visitCharge: response.data.visit.visitCharge,
        paymentStatus: response.data.visit.paymentStatus,
        status: response.data.visit.status,
        order: (response.data.payment as VisitPaymentOrder | undefined) ?? null,
      });
      // A chargeable visit is unusable until it is paid, so offer payment
      // immediately rather than stranding the buyer on a pending visit.
      if (response.data.visit.visitCharge > 0) setPayOpen(true);
    } catch (error) {
      setLocalError(errorMessage(error, 'Could not book the site visit.'));
    }
  };

  const resolveMockPayment = async (input: { orderId: string; amount: number; mockSignature?: string }) =>
    resolveMockGatewayPayment(input);

  const handlePaid = async (paymentId: string, signature: string, orderId?: string) => {
    if (!result) return;
    await payVisit.mutateAsync({ id: result.visitId, paymentId, signature, orderId });
    setResult((prev) => (prev ? { ...prev, paymentStatus: 'paid', status: 'confirmed' } : prev));
    setPayOpen(false);
  };

  const reset = () => {
    setResult(null);
    setLocalError(null);
    setRequirements('');
    setPayOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Book a site visit</DialogTitle>
          <DialogDescription>{flatTitle}</DialogDescription>
        </DialogHeader>

        {!user ? (
          <DialogBody>
            <Alert tone="info" title="Sign in to book a visit">
              You need a Flat Town account so the builder can confirm the slot and so you can track the visit.{' '}
              <Link href={`/auth/login?next=/flat/${flatId}`} className="font-semibold underline">
                Sign in
              </Link>{' '}
              or{' '}
              <Link href="/auth/register" className="font-semibold underline">
                create an account
              </Link>
              .
            </Alert>
          </DialogBody>
        ) : builder ? (
          <DialogBody>
            <Alert tone="warning" title="This is your own listing">
              Builders cannot book a site visit on their own flat.
            </Alert>
          </DialogBody>
        ) : result ? (
          <DialogBody className="space-y-4">
            <Alert
              tone={result.visitCharge > 0 && result.paymentStatus !== 'paid' ? 'warning' : 'success'}
              title={result.paymentStatus === 'paid' ? 'Site visit confirmed' : 'Visit requested'}
            >
              {result.visitCharge > 0 && result.paymentStatus !== 'paid' ? (
                <p>
                  A visit charge of <strong>{formatINR(result.visitCharge)}</strong> applies. Complete the payment to
                  confirm the slot — the amount is credited to the platform and fully refunded if you go on to book the
                  flat.
                </p>
              ) : result.paymentStatus === 'paid' ? (
                <p>
                  Your visit charge of <strong>{formatINR(result.visitCharge)}</strong> has been paid and the slot is
                  confirmed. The builder has been notified.
                </p>
              ) : (
                <p>
                  This visit is <strong>free</strong> — verified builders get their first two visits free of charge. The
                  builder has been notified and will confirm shortly.
                </p>
              )}
            </Alert>

            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                <p className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-slate-500" aria-hidden="true" />
                  {formatDate(selectedDay)} at {time}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="size-4 text-slate-500" aria-hidden="true" />
                  Status: <span className="font-medium capitalize">{result.status.replace(/_/g, ' ')}</span>
                </p>
                {visitors > 1 ? (
                  <p className="flex items-center gap-2">
                    <Users className="size-4 text-slate-500" aria-hidden="true" />
                    {visitors} visitors
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <p className="text-xs text-slate-500">
              Track this visit from your buyer dashboard.{' '}
              <Link href="/buyer/visits" className="font-semibold underline">
                My visits
              </Link>
            </p>
          </DialogBody>
        ) : (
          <DialogBody className="space-y-5">
            {localError ? <Alert tone="error" title="Could not book the visit">{localError}</Alert> : null}

            {/* ------------------------------ charge ---------------------------- */}
            <div
              className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                visitCharge > 0 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              {visitCharge > 0 ? (
                <IndianRupee className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <div>
                <p className="font-semibold">
                  {visitCharge > 0 ? `Visit charge ${formatINR(visitCharge)}` : 'Free visit'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed">
                  {visitCharge > 0
                    ? 'Paid to the platform and 100% refundable if you book this flat. Charged only when the free allowance is used up.'
                    : 'Verified builders get their first two visits free.'}
                </p>
              </div>
            </div>

            {/* ------------------------------- date ----------------------------- */}
            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-900">Pick a date</legend>
              <div className="ft-scroll-x pb-1" role="radiogroup" aria-label="Visit date">
                {days.map((day, index) => {
                  const active = index === dayOffset - 1;
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDayOffset(index + 1)}
                      className={`min-w-[4.25rem] shrink-0 rounded-lg border px-2 py-2 text-center transition-colors ${
                        active
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-[11px] uppercase opacity-80">
                        {day.toLocaleDateString('en-IN', { weekday: 'short' })}
                      </span>
                      <span className="block text-lg font-bold leading-tight">{day.getDate()}</span>
                      <span className="block text-[11px] opacity-80">
                        {day.toLocaleDateString('en-IN', { month: 'short' })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* ------------------------------- time ----------------------------- */}
            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-900">Pick a time slot</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VISIT_SLOTS.map((slot) => {
                  const isTaken = taken.has(`${selectedDay.toDateString()}|${slot}`);
                  const active = time === slot && !isTaken;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isTaken}
                      onClick={() => setTime(slot)}
                      aria-pressed={active}
                      className={`rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through ${
                        active
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
              {availability ? (
                <p className="mt-1.5 text-[11px] text-slate-500">Struck-through slots are already booked.</p>
              ) : null}
            </fieldset>

            {/* ----------------------------- details --------------------------- */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="How many visitors?" htmlFor="ft-visitors">
                <select
                  id="ft-visitors"
                  value={visitors}
                  onChange={(event) => setVisitors(Number(event.target.value))}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'person' : 'people'}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Anything the builder should know?"
                  htmlFor="ft-requirements"
                  hint="For example: “Need loan assistance”, “Please show the 11th floor sample”."
                >
                  <Textarea
                    id="ft-requirements"
                    rows={3}
                    value={requirements}
                    onChange={(event) => setRequirements(event.target.value)}
                    placeholder="Need loan assistance"
                  />
                </Field>
              </div>
            </div>

            <CheckboxRow
              id="ft-visit-loan"
              label="I want loan assistance"
              hint="A Flat Town loan partner will be assigned once the booking progresses"
              checked={loanNeeded}
              onCheckedChange={setLoanNeeded}
            />
          </DialogBody>
        )}

        <DialogFooter>
          {result ? (
            <>
              {result.visitCharge > 0 && result.paymentStatus !== 'paid' ? (
                <Button onClick={() => setPayOpen(true)} className="w-full sm:w-auto">
                  <IndianRupee aria-hidden="true" />
                  Pay {formatINR(result.visitCharge)} &amp; confirm visit
                </Button>
              ) : null}
              <Button
                variant={result.visitCharge > 0 && result.paymentStatus !== 'paid' ? 'outline' : 'primary'}
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Done
              </Button>
            </>
          ) : !user || builder ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={requestVisit.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={requestVisit.isPending}>
                {requestVisit.isPending ? <Loader2 className="animate-spin" /> : <CalendarDays />}
                {requestVisit.isPending ? 'Requesting…' : 'Request this slot'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      <VisitPaymentModal
        open={payOpen}
        onOpenChange={setPayOpen}
        visitId={result?.visitId ?? null}
        visitTitle={flatTitle}
        charge={result?.visitCharge ?? visitCharge}
        order={result?.order ?? null}
        resolveMockPayment={resolveMockPayment}
        onPaid={handlePaid}
        busy={payVisit.isPending}
      />
    </Dialog>
  );
};