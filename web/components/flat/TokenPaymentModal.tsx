'use client';

import { CheckCircle2, CreditCard, Info, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';

import { CommissionNote } from '@/components/common/Badges';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { formatINR, splitCommission } from '@/lib/price';
import {
  CHECKOUT_UNAVAILABLE,
  loadRazorpay,
  type RazorpayCtor,
  type RazorpayInstance,
} from '@/lib/razorpay';
import { errorMessage } from '@/lib/utils';
import type { TokenOrderResponse } from '@/lib/types';

export interface TokenPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: TokenOrderResponse | null;
  tokenAmount: number;
  commissionPercent: number;
  allowedTokens: number[];
  hasAgent: boolean;
  agentPlatformPercent: number;
  busy?: boolean;
  error?: string | null;
  onTokenChange: (amount: number) => void;
  onPay: (paymentId: string, signature: string, orderId?: string) => Promise<void>;
  /** Sent straight to the gateway in production; resolved locally for the mock. */
  resolvePayment: (input: {
    orderId: string;
    amount: number;
    keyId?: string;
    mockSignature?: string;
    gateway: 'razorpay' | 'mock';
  }) => Promise<{ paymentId: string; signature: string }>;
  onSkipDocuments?: () => void;
}

/**
 * Token payment + escrow disclosure.
 *
 * The money breakdown is shown in full before the buyer pays: token, the 10%
 * commission taken from the token only, and where the remaining 90% goes. When
 * the platform is running the simulated gateway, this is stated explicitly —
 * a mock payment is never presented as real.
 */
export const TokenPaymentModal = ({
  open,
  onOpenChange,
  order,
  tokenAmount,
  commissionPercent,
  allowedTokens,
  hasAgent,
  agentPlatformPercent,
  busy = false,
  error,
  onTokenChange,
  onPay,
  resolvePayment,
  onSkipDocuments,
}: TokenPaymentModalProps) => {
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const razorpayRef = useRef<RazorpayInstance | null>(null);

  const split = splitCommission(tokenAmount, commissionPercent, hasAgent, agentPlatformPercent);

  const startPayment = async () => {
    if (!order) return;
    try {
      const result = await resolvePayment({
        orderId: order.payment.orderId,
        amount: order.payment.amount,
        keyId: order.payment.keyId,
        mockSignature: order.payment.mockSignature,
        gateway: order.payment.gateway,
      });
      await onPay(result.paymentId, result.signature, order.payment.orderId);
    } catch {
      // The modal surfaces the error through the `error` prop.
    }
  };

  const openRazorpay = async () => {
    if (!order) return;
    setCheckoutError(null);
    // Awaits the CDN script rather than assuming `window.Razorpay` already
    // exists. If the live checkout cannot be loaded we surface an error — we
    // never fall back to simulating a payment the user believes is real.
    let Ctor: RazorpayCtor;
    try {
      Ctor = await loadRazorpay();
    } catch (loadErr) {
      setCheckoutError(errorMessage(loadErr, CHECKOUT_UNAVAILABLE));
      return;
    }
    const instance = new Ctor({
      key: order.payment.keyId ?? '',
      amount: order.payment.amount * 100,
      currency: 'INR',
      name: 'FLAT TOWN',
      description: `Booking token for ${order.booking.flat?.title ?? 'your flat'}`,
      order_id: order.payment.orderId,
      prefill: {},
      notes: { bookingId: order.booking.id },
      theme: { color: '#047857' },
      handler: (payload) => {
        void onPay(
          String(payload.razorpay_payment_id ?? ''),
          String(payload.razorpay_signature ?? ''),
          String(payload.razorpay_order_id ?? order.payment.orderId),
        );
      },
      modal: {
        ondismiss: () => undefined,
      },
    });
    razorpayRef.current = instance;
    instance.open();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pay the booking token</DialogTitle>
          <DialogDescription>
            Your token is held in escrow. It is released to the builder only after an admin verifies the required
            documents.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error ? <Alert tone="error" title="Payment could not be completed">{errorMessage(new Error(error))}</Alert> : null}

          {checkoutError ? (
            <Alert tone="error" title="Payment gateway unavailable">
              {checkoutError}
            </Alert>
          ) : null}

          {/* --------------------------- token picker -------------------------- */}
          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-900">
              Token amount
            </legend>
            <RadioGroup
              value={String(tokenAmount)}
              onValueChange={(value) => onTokenChange(Number(value))}
              className="space-y-2"
            >
              {allowedTokens.map((amount) => {
                const preview = splitCommission(amount, commissionPercent, hasAgent, agentPlatformPercent);
                return (
                  <RadioCard
                    key={amount}
                    id={`token-${amount}`}
                    value={String(amount)}
                    title={formatINR(amount)}
                    description={`Commission ${formatINR(preview.commissionAmount)} · Builder receives ${
                      formatINR(preview.builderAmount)
                    }${hasAgent ? ` · Agent ${formatINR(preview.agentAmount)}` : ''}`}
                  />
                );
              })}
            </RadioGroup>
          </fieldset>

          <Separator />

          {/* ---------------------------- escrow math -------------------------- */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-700" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-emerald-900">Escrow breakdown</h3>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-emerald-900">Token you pay</dt>
                <dd className="font-bold tabular-nums text-emerald-900">{formatINR(tokenAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-emerald-800">
                  Platform commission ({commissionPercent}% of the token)
                </dt>
                <dd className="font-semibold tabular-nums text-emerald-900">
                  −{formatINR(split.commissionAmount)}
                </dd>
              </div>
              {hasAgent ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-emerald-800">Platform share of commission ({agentPlatformPercent}%)</dt>
                    <dd className="font-semibold tabular-nums text-emerald-900">
                      {formatINR(split.platformAmount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-emerald-800">Agent share of commission ({split.agentSharePercent}%)</dt>
                    <dd className="font-semibold tabular-nums text-emerald-900">{formatINR(split.agentAmount)}</dd>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-emerald-200 pt-2">
                <dt className="font-medium text-emerald-900">Held for the builder (90%)</dt>
                <dd className="text-lg font-bold tabular-nums text-emerald-900">{formatINR(split.builderAmount)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-emerald-800">
              90% of the token is released to the builder once an admin verifies the KYC documents. The remaining 10%
              commission is settled to the platform against an invoice.
            </p>
          </div>

          <CommissionNote tokenAmount={tokenAmount} commissionPercent={commissionPercent} amount={split.commissionAmount} />

          {order?.payment.gateway === 'mock' ? (
            <Alert tone="warning" title="Simulated payment gateway">
              <p>
                Razorpay keys are not configured, so this checkout is <strong>SIMULATED</strong> — no real money moves.
                The booking will be marked as paid in the database with <code>gateway: &quot;mock&quot;</code> and will
                never be treated as a real payment.
              </p>
            </Alert>
          ) : (
            <Alert tone="info" title="Secure Razorpay checkout">
              <p className="flex items-center gap-1.5">
                <CreditCard className="size-3.5" aria-hidden="true" />
                Payment is completed on Razorpay and verified server-side via the payment signature. We never mark a
                token as paid because the browser said so.
              </p>
            </Alert>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            After payment, the builder accepts your request and you upload Aadhaar and PAN. Escrow is released by an
            admin — never automatically.
          </p>
        </DialogBody>

        <DialogFooter>
          {onSkipDocuments ? (
            <Button variant="ghost" onClick={onSkipDocuments} disabled={busy}>
              Skip — I will upload later
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="sm:ml-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={() => (order?.payment.gateway === 'razorpay' ? openRazorpay() : startPayment())}
            disabled={busy || !order}
          >
            {busy ? <Loader2 className="animate-spin" /> : <CreditCard />}
            {busy ? 'Processing…' : order?.payment.gateway === 'mock' ? 'Simulate payment' : `Pay ${formatINR(tokenAmount)}`}
          </Button>
        </DialogFooter>

        {order ? (
          <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 sm:px-5">
            <CheckCircle2 className="mr-1 inline size-3 text-emerald-600" aria-hidden="true" />
            Order <code>{order.payment.orderId}</code> created for booking{' '}
            <Badge variant="neutral" size="sm" className="mx-0.5">
              {order.booking.reference}
            </Badge>
            via {order.payment.gateway}
            {order.payment.simulated ? ' (simulated)' : ''}.
          </p>
        ) : null}

        <TriangleAlert className="sr-only" aria-hidden="true" />
      </DialogContent>
    </Dialog>
  );
};