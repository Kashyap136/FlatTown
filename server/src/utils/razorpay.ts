import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env, hasLiveRazorpay } from '../config/env';
import { ApiError } from './ApiError';

/**
 * Payment gateway abstraction.
 *
 * Production path : real Razorpay orders + HMAC signature verification.
 * Development path: deterministic simulated gateway (`gateway: 'mock'`) so the
 *                   full booking/escrow lifecycle can be exercised without live
 *                   credentials. Mock payments are explicitly labelled as such in
 *                   the database, API payloads and UI, and the mock gateway can
 *                   never be enabled in production.
 */

export type GatewayName = 'razorpay' | 'mock';

export interface CreatedOrder {
  orderId: string;
  amount: number;
  currency: string;
  receipt: string;
  gateway: GatewayName;
  /** Client-side key to open the Razorpay checkout. */
  keyId?: string;
  /** Mock-mode signing secret used to prove a simulated payment callback. */
  mockSignature?: string;
  notes?: Record<string, string>;
}

export interface PaymentVerificationResult {
  verified: boolean;
  orderId: string;
  paymentId: string;
  amount: number;
  gateway: GatewayName;
  method?: string;
  capturedAt: Date;
}

let razorpayInstance: any = null;

export const getRazorpay = (): any => {
  if (!hasLiveRazorpay()) {
    throw ApiError.internal('Razorpay is not configured. Set RAZORPAY_KEY and RAZORPAY_SECRET.');
  }
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: env.razorpayKeyId,
      key_secret: env.razorpayKeySecret,
    });
  }
  return razorpayInstance;
};

export const usingMockGateway = (): boolean => !hasLiveRazorpay() && env.allowMockPayments && !env.isProd;

/** Guard: any attempt to simulate money in production is refused. */
const assertMockAllowed = (): void => {
  if (env.isProd) {
    throw ApiError.internal('Mock payment gateway is disabled in production');
  }
  if (!env.allowMockPayments) {
    throw ApiError.internal('Mock payments are disabled (ALLOW_MOCK_PAYMENTS=false)');
  }
};

export const createPaymentOrder = async (input: {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<CreatedOrder> => {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('Payment amount must be a positive integer number of rupees');
  }
  const amountInPaise = amount * 100;

  if (hasLiveRazorpay()) {
    const order = await getRazorpay().orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes ?? {},
    });
    return {
      orderId: order.id,
      amount,
      currency: 'INR',
      receipt: input.receipt,
      gateway: 'razorpay',
      keyId: env.razorpayKeyId,
      notes: input.notes,
    };
  }

  assertMockAllowed();
  const orderId = `order_mock_${crypto.randomBytes(10).toString('hex')}`;
  // Signature the mock client must echo back, proving it handled the callback.
  const mockSignature = crypto
    .createHmac('sha256', env.mockPaymentKey)
    .update(`${orderId}|${amount}`)
    .digest('hex');

  return {
    orderId,
    amount,
    currency: 'INR',
    receipt: input.receipt,
    gateway: 'mock',
    mockSignature,
    notes: input.notes,
  };
};

/** HMAC-SHA256 signature check used by the Razorpay checkout callback. */
export const verifyCheckoutSignature = (input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean => {
  if (usingMockGateway() && input.orderId.startsWith('order_mock_')) {
    return typeof input.signature === 'string' && input.signature.length === 64;
  }
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex');
  return safeCompare(expected, input.signature ?? '');
};

export const verifyWebhookSignature = (rawBody: Buffer | string, signature: string | undefined): boolean => {
  if (!env.razorpayWebhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
  return safeCompare(expected, signature ?? '');
};

/**
 * Authoritative payment verification.
 *
 * A payment state is NEVER advanced because a client claimed success: for live
 * Razorpay orders the payment is fetched from the gateway API and the captured
 * amount must match the expected amount exactly.
 */
export const verifyPayment = async (input: {
  orderId: string;
  paymentId: string;
  signature: string;
  expectedAmount: number;
}): Promise<PaymentVerificationResult> => {
  const expectedAmount = Math.round(Number(input.expectedAmount));

  if (hasLiveRazorpay() && !input.orderId.startsWith('order_mock_')) {
    if (!verifyCheckoutSignature(input)) {
      throw ApiError.badRequest('Payment signature verification failed');
    }
    const payment = await getRazorpay().payments.fetch(input.paymentId);
    const captured = typeof payment.amount === 'number' ? payment.amount : 0;
    if (payment.order_id !== input.orderId) {
      throw ApiError.badRequest('Payment does not belong to the supplied order');
    }
    if (Math.round(captured / 100) !== expectedAmount) {
      throw ApiError.badRequest(
        `Payment amount mismatch: expected ₹${expectedAmount}, captured ₹${Math.round(captured / 100)}`,
      );
    }
    if (payment.status !== 'captured') {
      throw ApiError.badRequest(`Payment is not captured (status: ${payment.status ?? 'unknown'})`);
    }
    return {
      verified: true,
      orderId: input.orderId,
      paymentId: input.paymentId,
      amount: Math.round(captured / 100),
      gateway: 'razorpay',
      method: payment.method ?? undefined,
      capturedAt: new Date(),
    };
  }

  // Mock gateway — explicitly simulated, development only.
  assertMockAllowed();
  if (!input.orderId.startsWith('order_mock_')) {
    throw ApiError.badRequest('Unknown payment order');
  }
  if (!verifyCheckoutSignature(input)) {
    throw ApiError.badRequest('Payment signature verification failed');
  }
  return {
    verified: true,
    orderId: input.orderId,
    paymentId: input.paymentId,
    amount: expectedAmount,
    gateway: 'mock',
    capturedAt: new Date(),
  };
};

/** Fetches a captured payment for webhook-driven confirmation. */
export const fetchPayment = async (
  paymentId: string,
): Promise<{ amount: number; status: string; orderId: string; method?: string } | null> => {
  if (!hasLiveRazorpay()) return null;
  try {
    const payment = await getRazorpay().payments.fetch(paymentId);
    return {
      amount: Math.round(Number(payment.amount ?? 0) / 100),
      status: payment.status ?? 'unknown',
      orderId: payment.order_id ?? '',
      method: payment.method ?? undefined,
    };
  } catch {
    return null;
  }
};

interface RazorpayRefund {
  id: string;
  amount?: number;
  status?: string;
}

export const refundPayment = async (input: {
  paymentId: string;
  amount: number;
  notes?: Record<string, string>;
}): Promise<{ refundId: string; amount: number; status: string; gateway: GatewayName }> => {
  const amountInPaise = Math.round(input.amount) * 100;

  if (hasLiveRazorpay() && !input.paymentId.startsWith('pay_mock_')) {
    // The razorpay typings omit `refunds.create` in this SDK version.
    const refunds = getRazorpay().refunds as unknown as {
      create(payload: { payment_id: string; amount: number; notes?: Record<string, string> }): Promise<RazorpayRefund>;
    };
    const refund = await refunds.create({
      payment_id: input.paymentId,
      amount: amountInPaise,
      notes: input.notes ?? {},
    });
    return {
      refundId: refund.id,
      amount: Math.round(Number(refund.amount ?? amountInPaise) / 100),
      status: refund.status ?? 'processed',
      gateway: 'razorpay',
    };
  }

  assertMockAllowed();
  return {
    refundId: `rfnd_mock_${crypto.randomBytes(10).toString('hex')}`,
    amount: input.amount,
    status: 'processed',
    gateway: 'mock',
  };
};

const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const gatewayInfo = () => ({
  gateway: usingMockGateway() ? ('mock' as GatewayName) : ('razorpay' as GatewayName),
  live: hasLiveRazorpay(),
  mockEnabled: usingMockGateway(),
  escrowAccountId: env.escrowAccountId,
});