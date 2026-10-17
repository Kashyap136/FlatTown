'use client';

import { CheckCircle2, CreditCard, IndianRupee, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatINR } from '@/lib/price';
import { CHECKOUT_UNAVAILABLE, loadRazorpay, type RazorpayCtor } from '@/lib/razorpay';
import { errorMessage } from '@/lib/utils';

/** Payment envelope returned by `POST /visits/request` and `/visits/:id/pay`. */
export interface VisitPaymentOrder {
  required?: boolean;
  amount: number;
  refundableOnBooking?: boolean;
  orderId?: string;
  gateway?: 'razorpay' | 'mock';
  keyId?: string;
  mockSignature?: string;
  note?: string;
}

export interface VisitPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string | null;
  visitTitle: string;
  charge: number;
  order: VisitPaymentOrder | null;
  /** Resolves the simulated-gateway payload, or rejects for the live gateway. */
  resolveMockPayment: (input: {
    orderId: string;
    amount: number;
    mockSignature?: string;
  }) => Promise<{ paymentId: string; signature: string }>;
  onPaid: (paymentId: string, signature: string, orderId?: string) => Promise<void>;
  busy?: boolean;
  error?: string | null;
}

/**
 * Site-visit charge payment.
 *
 * A visit with a charge stays at `paymentStatus: pending` until this charge is
 * settled, so this modal is the only way that visit can ever be confirmed. It is
 * reachable both straight after requesting a slot and later from the buyer's
 * visits list for any visit still awaiting payment.
 *
 * The live Razorpay path verifies server-side. When the platform runs the
 * simulated gateway this is labelled as SIMULATED — a mock payment is never
 * presented as real money.
 */
export const VisitPaymentModal = ({
  open,
  onOpenChange,
  visitId,
  visitTitle,
  charge,
  order,
  resolveMockPayment,
  onPaid,
  busy = false,
  error,
}: VisitPaymentModalProps) => {
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const isMock = order?.gateway === 'mock' || (!order?.gateway && charge > 0);
  const working = busy || localBusy;

  const settle = async (paymentId: string, signature: string, orderId?: string) => {
    setLocalBusy(true);
    try {
      await onPaid(paymentId, signature, orderId);
    } finally {
      setLocalBusy(false);
    }
  };

  const startMockPayment = async () => {
    setCheckoutError(null);
    if (!order?.orderId) {
      setCheckoutError('No payment order was created for this visit. Please request the visit again.');
      return;
    }
    try {
      const result = await resolveMockPayment({
        orderId: order.orderId,
        amount: charge,
        mockSignature: order.mockSignature,
      });
      await settle(result.paymentId, result.signature, order.orderId);
    } catch (payErr) {
      setCheckoutError(errorMessage(payErr, 'The simulated payment could not be completed.'));
    }
  };

  const openRazorpay = async () => {
    setCheckoutError(null);
    if (!order?.orderId) {
      setCheckoutError('No payment order was created for this visit. Please request the visit again.');
      return;
    }
    let Ctor: RazorpayCtor;
    try {
      Ctor = await loadRazorpay();
    } catch (loadErr) {
      setCheckoutError(errorMessage(loadErr, CHECKOUT_UNAVAILABLE));
      return;
    }
    const instance = new Ctor({
      key: order.keyId ?? '',
      amount: charge * 100,
      currency: 'INR',
      name: 'FLAT TOWN',
      description: `Site visit charge — ${visitTitle}`,
      order_id: order.orderId,
      theme: { color: '#047857' },
      handler: (payload) => {
        void settle(
          String(payload.razorpay_payment_id ?? ''),
          String(payload.razorpay_signature ?? ''),
          String(payload.razorpay_order_id ?? order.orderId),
        );
      },
    });
    instance.open();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !working && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay the site visit charge</DialogTitle>
          <DialogDescription>{visitTitle}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error ? (
            <Alert tone="error" title="Payment could not be completed">
              {errorMessage(new Error(error))}
            </Alert>
          ) : null}
          {checkoutError ? (
            <Alert tone="error" title="Payment problem">
              {checkoutError}
            </Alert>
          ) : null}

          <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <IndianRupee className="size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Visit charge {formatINR(charge)}</p>
              <p className="mt-0.5 text-xs leading-relaxed">
                Paid to the Flat Town platform. It is <strong>100% refundable</strong> if you go on to book this flat.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-700" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-emerald-900">Why a charge applies</h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-emerald-800">
              Verified builders get their first two visits free. Once that allowance is used, a small charge covers the
              builder&apos;s time. The charge goes to the platform — never to the builder — and is returned in full if
              you book.
            </p>
          </div>

          {isMock ? (
            <Alert tone="warning" title="Simulated payment gateway">
              <p className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Razorpay keys are not configured, so this payment is <strong>SIMULATED</strong> — no real money moves.
                The visit is recorded as paid with <code>gateway: &quot;mock&quot;</code>.
              </p>
            </Alert>
          ) : (
            <Alert tone="info" title="Secure Razorpay checkout">
              <p className="flex items-center gap-1.5">
                <CreditCard className="size-3.5" aria-hidden="true" />
                Payment is completed on Razorpay and verified server-side by signature.
              </p>
            </Alert>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>
            {charge > 0 ? 'Pay later' : 'Close'}
          </Button>
          <Button onClick={() => (isMock ? void startMockPayment() : void openRazorpay())} disabled={working || !visitId}>
            {working ? <Loader2 className="animate-spin" /> : <CreditCard />}
            {working ? 'Processing…' : isMock ? 'Simulate payment' : `Pay ${formatINR(charge)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};