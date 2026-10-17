'use client';

import { CalendarDays, Check, ClipboardList, FileText, Home, IndianRupee, Info, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { CommissionNote, RatingStars, RERABadge, TierBadge } from '@/components/common/Badges';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxRow } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { DocumentUpload } from '@/components/flat/InquiryForm';
import { SiteVisitModal } from '@/components/flat/SiteVisitModal';
import { TokenPaymentModal } from '@/components/flat/TokenPaymentModal';
import { useBookingActions, useCreateInquiry } from '@/hooks/useFlats';
import { VISIT_SLOTS } from '@/lib/filters';
import { formatArea, formatINR, formatPossession, splitCommission } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { DEFAULT_DOCUMENT_TYPES, useBookingStore } from '@/store/useBookingStore';
import type { Booking, FlatDetail, TokenOrderResponse } from '@/lib/types';

const STEPS = [
  { key: 'details', label: 'Your details', icon: Info },
  { key: 'visit', label: 'Site visit', icon: CalendarDays },
  { key: 'token', label: 'Token & escrow', icon: IndianRupee },
  { key: 'documents', label: 'Documents', icon: FileText },
] as const;

/**
 * The four-step booking funnel.
 *
 * STEP 1 details → STEP 2 visit slot → STEP 3 token + escrow → STEP 4 documents.
 * Every financial figure shown here is recomputed by the API; the amounts on
 * this screen are for explanation only.
 */
export const BookingWizard = ({
  flat,
  allowedTokens,
  commissionPercent = 10,
  agentPlatformPercent = 70,
}: {
  flat: FlatDetail;
  allowedTokens: number[];
  commissionPercent?: number;
  agentPlatformPercent?: number;
}) => {
  const user = useAuthStore((s) => s.user);
  const store = useBookingStore();
  const { createToken, verifyToken, uploadDocuments } = useBookingActions();
  const createInquiry = useCreateInquiry(flat.id);

  const [visitOpen, setVisitOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [order, setOrder] = useState<TokenOrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);

  // Prefill the wizard from the signed-in profile and the flat's default token.
  useEffect(() => {
    store.start(flat.id, flat.tokenAmount || allowedTokens[0] || 50_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat.id]);

  useEffect(() => {
    if (user) {
      store.setDetails({
        fullName: store.details.fullName || user.name,
        email: store.details.email || user.email,
        phone: store.details.phone || user.phone,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const split = splitCommission(store.tokenAmount, commissionPercent, false, agentPlatformPercent);

  /* ------------------------------ STEP 1 ------------------------------ */

  const submitDetails = async () => {
    setError(null);
    if (!store.details.fullName || !store.details.email || !store.details.phone) {
      setError('Name, email and phone are required.');
      return;
    }
    setPending(true);
    try {
      if (!inquirySent) {
        await createInquiry.mutateAsync({
          message: store.details.requirements || undefined,
          loanAssistanceRequired: store.details.loanAssistanceRequired,
        });
        setInquirySent(true);
      }
      store.setStep(store.details.loanAssistanceRequired ? 'visit' : 'token');
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not submit your details.'));
    } finally {
      setPending(false);
    }
  };

  /* ------------------------------ STEP 2 ------------------------------ */

  const submitVisit = async () => {
    setError(null);
    if (!store.slot) {
      setError('Pick a date and time for your visit.');
      return;
    }
    setPending(true);
    try {
      const response = await createToken.mutateAsync({
        flatId: flat.id,
        tokenAmount: store.tokenAmount,
        requirements: store.details.requirements || undefined,
        loanAssistanceRequired: store.details.loanAssistanceRequired,
      });
      const created = response.data;
      setOrder(created);
      store.setBooking(created.booking);
      store.setPayment({
        orderId: created.payment.orderId,
        amount: created.payment.amount,
        gateway: created.payment.gateway,
        simulated: created.payment.simulated ?? created.payment.gateway === 'mock',
      });
      setPaymentOpen(true);
      store.setStep('token');
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not create the booking.'));
    } finally {
      setPending(false);
    }
  };

  /* ------------------------------ payment ----------------------------- */

  /**
   * Opens the gateway.
   *
   * For the real Razorpay gateway the modal hands control to the checkout
   * script; for the clearly-labelled simulated gateway we resolve locally and
   * still go through the server's verification endpoint — the escrow state is
   * never advanced by the browser alone.
   */
  const resolvePayment = useCallback(
    async (input: {
      orderId: string;
      amount: number;
      keyId?: string;
      mockSignature?: string;
      gateway: 'razorpay' | 'mock';
    }): Promise<{ paymentId: string; signature: string }> => {
      if (input.gateway === 'mock') {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return {
          paymentId: `pay_mock_${Date.now().toString(36)}`,
          signature: input.mockSignature ?? 'a'.repeat(64),
        };
      }
      // The Razorpay checkout handler calls `onPay` directly instead.
      return { paymentId: '', signature: '' };
    },
    [],
  );

  const confirmPayment = async (paymentId: string, signature: string, orderId?: string) => {
    if (!order) return;
    setPending(true);
    setError(null);
    try {
      const response = await verifyToken.mutateAsync({ id: order.booking.id, paymentId, signature, orderId });
      store.setBooking(response.data.booking);
      setPaymentOpen(false);
      store.setStep('documents');
    } catch (payError) {
      setError(errorMessage(payError, 'Payment verification failed.'));
    } finally {
      setPending(false);
    }
  };

  /* ------------------------------ STEP 4 ------------------------------ */

  const submitDocuments = async (files: File[], types: string[]): Promise<void> => {
    if (!store.booking) return;
    await uploadDocuments.mutateAsync({ id: store.booking.id, files, types });
  };

  /* ------------------------------ render ------------------------------- */

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reserve this flat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">Sign in to raise a booking token, book a visit and upload documents.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href={`/auth/login?next=/booking/${flat.id}`}>Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/auth/register">Create a buyer account</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentIndex = STEPS.findIndex((step) => step.key === store.step);

  return (
    <div className="space-y-4">
      {/* ------------------------------ tracker --------------------------- */}
      <Card>
        <CardContent className="p-4">
          <ol className="flex items-center gap-1 overflow-x-auto pb-1">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const done = index < currentIndex;
              const active = index === currentIndex;
              return (
                <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1">
                  <span
                    className={`flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold sm:px-2.5 ${
                      active
                        ? 'bg-emerald-700 text-white'
                        : done
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                  }`}
                  >
                    {done ? <Check className="size-3" aria-hidden="true" /> : <Icon className="size-3" aria-hidden="true" />}
                    <span className="hidden whitespace-nowrap sm:inline">{step.label}</span>
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span aria-hidden="true" className="h-px w-3 shrink-0 bg-slate-200 sm:w-5" />
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="sr-only" aria-live="polite">
            Step {currentIndex + 1} of {STEPS.length}: {STEPS[currentIndex]?.label}
          </p>
        </CardContent>
      </Card>

      {error ? <Alert tone="error" title="Something went wrong">{error}</Alert> : null}

      {/* ------------------------------ STEP 1 ---------------------------- */}
      {store.step === 'details' ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Your details</CardTitle>
            <p className="text-[13px] text-slate-600">
              We share these with the builder so they can confirm your visit and booking.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" htmlFor="ft-bk-name" required>
                <Input
                  id="ft-bk-name"
                  value={store.details.fullName}
                  autoComplete="name"
                  onChange={(event) => store.setDetails({ fullName: event.target.value })}
                />
              </Field>
              <Field label="Phone" htmlFor="ft-bk-phone" required>
                <Input
                  id="ft-bk-phone"
                  type="tel"
                  inputMode="numeric"
                  value={store.details.phone}
                  autoComplete="tel"
                  onChange={(event) => store.setDetails({ phone: event.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Email" htmlFor="ft-bk-email" required>
                  <Input
                    id="ft-bk-email"
                    type="email"
                    value={store.details.email}
                    autoComplete="email"
                    onChange={(event) => store.setDetails({ email: event.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Requirements or questions"
                  htmlFor="ft-bk-req"
                  hint="For example: “Need loan assistance for ₹70L”."
                >
                  <Textarea
                    id="ft-bk-req"
                    rows={3}
                    value={store.details.requirements}
                    onChange={(event) => store.setDetails({ requirements: event.target.value })}
                  />
                </Field>
              </div>
            </div>

            <CheckboxRow
              id="ft-bk-loan"
              label="I need loan assistance"
              hint="We assign a Flat Town loan partner once the booking progresses"
              checked={store.details.loanAssistanceRequired}
              onCheckedChange={(checked) => store.setDetails({ loanAssistanceRequired: checked })}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => store.setStep('visit')}>
                Skip to site visit
              </Button>
              <Button onClick={submitDetails} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------ STEP 2 ---------------------------- */}
      {store.step === 'visit' ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 — Pick a site-visit slot</CardTitle>
            <p className="text-[13px] text-slate-600">
              A site visit is optional but recommended — it is the first step of the inquiry → visit → token → documents
              flow.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <Home className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{flat.title}</span>
              <TierBadge tier={flat.tier} size="sm" />
              <RERABadge verified={flat.project?.isRERAVerified} reraNumber={flat.project?.reraNumber} size="sm" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Visit date" htmlFor="ft-bk-date" required>
                <Input
                  id="ft-bk-date"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={store.slot?.date ? store.slot.date.slice(0, 10) : ''}
                  onChange={(event) =>
                    store.setSlot({ date: event.target.value, time: store.slot?.time ?? VISIT_SLOTS[0] })
                  }
                />
              </Field>
              <Field label="Time slot" htmlFor="ft-bk-time" required>
                <select
                  id="ft-bk-time"
                  value={store.slot?.time ?? VISIT_SLOTS[0]}
                  onChange={(event) => store.setSlot({ date: store.slot?.date ?? new Date().toISOString(), time: event.target.value })}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  {VISIT_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {flat.visitCharge > 0 ? (
              <Alert tone="warning" title={`Site visit charge ${formatINR(flat.visitCharge)}`}>
                Charged only if the builder’s free-visit allowance is used up. Paid to the platform and fully refundable
                if you book this flat.
              </Alert>
            ) : (
              <Alert tone="success" title="Free site visit">
                This builder offers free visits right now.
              </Alert>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => store.setStep('details')}>
                Back
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setVisitOpen(true)}>
                  <CalendarDays />
                  Book with full calendar
                </Button>
                <Button
                  onClick={() => {
                    if (!store.slot) store.setSlot({ date: new Date().toISOString(), time: VISIT_SLOTS[0] });
                    store.setStep('token');
                  }}
                >
                  Continue without a visit
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------ STEP 3 ---------------------------- */}
      {store.step === 'token' ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 3 — Booking token & escrow</CardTitle>
            <p className="text-[13px] text-slate-600">
              The token is held in escrow. 90% goes to the builder after an admin verifies your documents; 10% is the
              platform commission — charged on the token only.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Total price</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">{formatINR(flat.totalPrice)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Carpet area</p>
                <p className="text-lg font-bold text-slate-900">{formatArea(flat.sizeSqft)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Possession</p>
                <p className="text-lg font-bold text-slate-900">{formatPossession(flat.possessionDate)}</p>
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-900">
                Choose a token amount
              </legend>
              <RadioGroup
                value={String(store.tokenAmount)}
                onValueChange={(value) => store.setTokenAmount(Number(value))}
                className="space-y-2"
              >
                {allowedTokens.map((amount) => (
                  <RadioCard
                    key={amount}
                    id={`ft-token-${amount}`}
                    value={String(amount)}
                    title={formatINR(amount)}
                    description={`Platform commission ${formatINR(Math.round((amount * commissionPercent) / 100))}`}
                  />
                ))}
              </RadioGroup>
            </fieldset>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
              <h3 className="text-sm font-semibold text-emerald-900">Where your token goes</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-emerald-800">Token paid</dt>
                  <dd className="font-bold tabular-nums text-emerald-900">{formatINR(store.tokenAmount)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-emerald-800">Platform commission ({commissionPercent}% of token)</dt>
                  <dd className="font-semibold tabular-nums text-emerald-900">
                    −{formatINR(split.commissionAmount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-emerald-200 pt-1.5">
                  <dt className="font-medium text-emerald-900">Held for the builder</dt>
                  <dd className="text-lg font-bold tabular-nums text-emerald-900">{formatINR(split.builderAmount)}</dd>
                </div>
              </dl>
            </div>

            <CommissionNote tokenAmount={store.tokenAmount} commissionPercent={commissionPercent} />

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => store.setStep('visit')}>
                Back
              </Button>
              {store.booking?.escrowStatus === 'token_paid' || store.booking?.payment?.paymentId ? (
                <Button onClick={() => store.setStep('documents')}>Continue to documents</Button>
              ) : (
                <Button
                  onClick={async () => {
                    if (store.booking) {
                      setPaymentOpen(true);
                      return;
                    }
                    await submitVisit();
                  }}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {store.booking ? 'Pay the token' : 'Create booking & continue'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------ STEP 4 ---------------------------- */}
      {store.step === 'documents' ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 4 — Upload your documents</CardTitle>
            <p className="text-[13px] text-slate-600">
              Once the builder accepts, the admin verifies your documents before releasing escrow.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {store.booking ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    Booking {store.booking.reference}
                  </span>
                  <Badge variant="brand" className="capitalize">
                    {store.booking.escrowStatus.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Escrow holding {formatINR(store.booking.escrow?.heldAmount ?? 0)} · Commission{' '}
                  {formatINR(store.booking.commissionAmount)} · Loan status{' '}
                  {store.booking.loanStatus.replace(/_/g, ' ')}
                </p>
              </div>
            ) : null}

            <DocumentUpload
              onUpload={submitDocuments}
              disabled={pending || !store.booking}
              types={store.details.loanAssistanceRequired ? DEFAULT_DOCUMENT_TYPES : DEFAULT_DOCUMENT_TYPES.slice(0, 2)}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => store.setStep('token')}>
                Back
              </Button>
              <Button asChild>
                <Link href={store.booking ? `/buyer/bookings?booking=${store.booking.id}` : '/buyer/bookings'}>
                  <ClipboardList />
                  Track this booking
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <SiteVisitModal
        open={visitOpen}
        onOpenChange={setVisitOpen}
        flatId={flat.id}
        flatTitle={flat.title}
        visitCharge={flat.visitCharge}
        loanAssistanceRequired={store.details.loanAssistanceRequired}
      />

      <TokenPaymentModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        order={order}
        tokenAmount={order?.payment.amount ?? store.tokenAmount}
        commissionPercent={commissionPercent}
        allowedTokens={allowedTokens}
        hasAgent={Boolean(order?.payment.split.hasAgent)}
        agentPlatformPercent={agentPlatformPercent}
        busy={pending}
        error={error}
        onTokenChange={(amount) => store.setTokenAmount(amount)}
        onPay={confirmPayment}
        resolvePayment={resolvePayment}
        onSkipDocuments={() => {
          setPaymentOpen(false);
          store.setStep('documents');
        }}
      />
    </div>
  );
};

export type { Booking };
export { RatingStars };