import { Router, raw, type Request, type Response } from 'express';
import { Booking } from '../models/Booking';
import { SiteVisit } from '../models/SiteVisit';
import { ApiError } from '../utils/ApiError';
import { env, hasLiveRazorpay } from '../config/env';
import { fetchPayment, verifyWebhookSignature } from '../utils/razorpay';
import { notifySafe } from '../services/notification.service';
import { sendOk } from '../utils/response';
import { asyncHandler } from '../utils/errorHandler';

const router = Router();

/**
 * Razorpay webhook (payment.captured / payment.failed / refund.processed).
 *
 * The signature is verified with RAZORPAY_WEBHOOK_SECRET using the raw body.
 * Escrow state is only ever advanced from a gateway-confirmed capture.
 */
router.post(
  '/razorpay',
  raw({ type: 'application/json' }),
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.header('x-razorpay-signature');
    const rawBody = (req as Request & { body: Buffer }).body;

    if (!hasLiveRazorpay()) {
      throw ApiError.badRequest('Razorpay is not configured on this deployment');
    }
    if (!verifyWebhookSignature(rawBody, signature)) {
      throw ApiError.unauthorized('Webhook signature verification failed');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: {
        payment?: {
          entity?: {
            id: string;
            order_id: string;
            amount: number;
            status: string;
            method?: string;
            notes?: Record<string, string>;
          };
          refund?: { entity?: { id: string; payment_id: string; amount: number; status: string } };
        };
      };
    };

    const notes = event.payload?.payment?.entity?.notes ?? {};
    const purpose = notes.purpose ?? '';
    const paymentId = event.payload?.payment?.entity?.id;
    const orderId = event.payload?.payment?.entity?.order_id;

    if (event.event === 'payment.captured' && paymentId && orderId) {
      // Cross-check against the gateway before trusting the webhook payload.
      const payment = await fetchPayment(paymentId);
      if (!payment || payment.status !== 'captured') {
        return sendOk(res, 'Webhook received but payment is not captured; ignored');
      }

      if (purpose === 'booking_token_escrow') {
        const booking = await Booking.findOne({ 'payment.orderId': orderId });
        if (booking && !booking.payment?.paymentId) {
          // `fetchPayment` already returns rupees (it divides the paise value).
          const captured = Math.round(payment.amount ?? 0);
          if (captured === booking.tokenAmount) {
            booking.payment = {
              orderId,
              paymentId,
              signature: 'webhook',
              gateway: 'razorpay',
              amount: captured,
              capturedAt: new Date(),
            };
            booking.escrow.heldAmount = captured;
            booking.ledger.push({
              type: 'token_received',
              amount: captured,
              note: 'Token received via Razorpay webhook',
              at: new Date(),
            });
            booking.ledger.push({
              type: 'commission_booked',
              amount: booking.commissionAmount,
              note: `Platform commission ${booking.commissionPercent}% of token`,
              at: new Date(),
            });
            booking.statusHistory.push({
              from: booking.escrowStatus,
              to: 'token_paid',
              note: 'Token payment confirmed by webhook',
              at: new Date(),
            });
            booking.escrowStatus = 'token_paid';
            booking.escrow.status = 'token_paid';
            await booking.save();

            await notifySafe({
              recipientId: String(booking.builderId),
              event: 'token_payment_successful',
              title: 'Token received in escrow',
              body: `A token of ₹${captured} was received for your booking via webhook confirmation.`,
              data: { bookingId: String(booking._id) },
            });
          }
        }
      }

      if (purpose === 'site_visit_charge') {
        const visit = await SiteVisit.findOne({ 'payment.orderId': orderId });
        if (visit && visit.paymentStatus !== 'paid') {
          // `fetchPayment` already returns rupees — do not divide again.
          const captured = Math.round(payment.amount ?? 0);
          // The captured amount must match the charge owed, otherwise a
          // tampered/partial payment must never settle the visit.
          if (captured !== visit.visitCharge) {
            await notifySafe({
              recipientId: String(visit.builderId),
              event: 'site_visit_payment_mismatch',
              title: 'Site visit payment mismatch',
              body: `A site visit charge of ₹${captured} was received but ₹${visit.visitCharge} was due. Review before confirming.`,
              data: { visitId: String(visit._id) },
            });
            return sendOk(res, 'Amount mismatch; visit not confirmed');
          }
          visit.payment = {
            orderId,
            paymentId,
            signature: 'webhook',
            gateway: 'razorpay',
            amount: captured,
            paidAt: new Date(),
          };
          visit.paymentStatus = 'paid';
          if (visit.status === 'requested') visit.status = 'confirmed';
          await visit.save();

          await notifySafe({
            recipientId: String(visit.builderId),
            event: 'site_visit_confirmed',
            title: 'Site visit confirmed',
            body: `Visit charge of ₹${captured} received. Site visit confirmed.`,
            data: { visitId: String(visit._id) },
          });
        }
      }
    }

    if (event.event === 'refund.processed') {
      const refund = event.payload?.payment?.refund?.entity;
      if (refund) {
        const booking = await Booking.findOne({ 'payment.paymentId': refund.payment_id });
        if (booking && booking.escrowStatus !== 'refunded') {
          booking.refund = {
            amount: Math.round((refund.amount ?? 0) / 100),
            refundId: refund.id,
            reason: 'Refund processed via Razorpay webhook',
            gateway: 'razorpay',
            at: new Date(),
          };
          booking.escrow.refundedAmount = booking.refund.amount;
          booking.escrow.heldAmount = Math.max(0, booking.escrow.heldAmount - booking.refund.amount);
          booking.statusHistory.push({
            from: booking.escrowStatus,
            to: 'refunded',
            note: 'Refund confirmed by webhook',
            at: new Date(),
          });
          booking.escrowStatus = 'refunded';
          booking.escrow.status = 'refunded';
          await booking.save();
        }
      }
    }

    return sendOk(res, 'Webhook processed');
  }),
);

/** GET /webhooks/razorpay/config — exposes only the public key + mode. */
router.get('/razorpay/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Payment configuration',
    data: {
      mode: hasLiveRazorpay() ? 'live' : env.allowMockPayments && !env.isProd ? 'mock' : 'unavailable',
      keyId: hasLiveRazorpay() ? env.razorpayKeyId : null,
      escrowAccountId: env.escrowAccountId,
    },
  });
});

export default router;