'use client';

/**
 * Razorpay checkout loader.
 *
 * `window.Razorpay` only exists once the CDN script has finished executing.
 * Reading it synchronously is a race: on a slow connection the script is still
 * in flight and the previous implementation responded by submitting an EMPTY
 * payment payload, which the server correctly rejected but with a confusing
 * error. This module awaits the script instead and reports genuine failures.
 *
 * Crucially, when the live gateway cannot be loaded the caller is told so —
 * there is deliberately no path that silently downgrades a real payment into a
 * simulated one.
 */

const SCRIPT_ID = 'razorpay-checkout';
const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency?: string;
  name: string;
  description: string;
  order_id?: string;
  prefill?: Record<string, string>;
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (payload: {
    razorpay_payment_id: string;
    razorpay_signature: string;
    razorpay_order_id?: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: never) => void) => void;
}

export type RazorpayCtor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let loader: Promise<RazorpayCtor> | null = null;

/**
 * Loads (once) and returns the Razorpay constructor.
 * Rejects with a human-readable message if the script is blocked or fails.
 */
export const loadRazorpay = (): Promise<RazorpayCtor> => {
  if (loader) return loader;

  loader = new Promise<RazorpayCtor>((resolve, reject) => {
    const settle = (): void => {
      const ctor = typeof window !== 'undefined' ? window.Razorpay : undefined;
      if (ctor) resolve(ctor);
      else reject(new Error('The Razorpay checkout script loaded but did not initialise.'));
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.Razorpay) {
        settle();
        return;
      }
      existing.addEventListener('load', settle, { once: true });
      existing.addEventListener('error', () => reject(new Error(CHECKOUT_UNAVAILABLE)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', settle, { once: true });
    script.addEventListener(
      'error',
      () => {
        // Allow a later retry rather than caching a permanent failure.
        loader = null;
        reject(new Error(CHECKOUT_UNAVAILABLE));
      },
      { once: true },
    );
    document.body.appendChild(script);
  });

  return loader;
};

/** Clears the memoised loader so a retry can re-fetch the script. */
export const resetRazorpayLoader = (): void => {
  loader = null;
};

export const CHECKOUT_UNAVAILABLE =
  'The Razorpay checkout could not be loaded. Check your connection or any ad blocker, then try again. Your visit is still saved and unpaid.';

/**
 * Resolves the payload for the SIMULATED gateway.
 *
 * This must only ever be reachable when the backend reported
 * `gateway: 'mock'` — i.e. Razorpay credentials are absent and
 * `ALLOW_MOCK_PAYMENTS` is on (never in production). The server accepts a
 * well-formed proof in place of a real Razorpay signature, and the booking is
 * recorded with `gateway: 'mock'` so it is never mistaken for real money.
 */
export const resolveMockPayment = async (input: {
  orderId: string;
  amount: number;
  mockSignature?: string;
}): Promise<{ paymentId: string; signature: string }> => {
  if (!input.orderId) {
    throw new Error('No payment order was created. Please request the visit again.');
  }
  return {
    paymentId: `pay_mock_${input.orderId}`,
    signature: input.mockSignature ?? 'flattown-simulated-payment'.padEnd(64, '0').slice(0, 64),
  };
};