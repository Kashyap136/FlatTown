import { Router } from 'express';
import * as bookingsController from '../controllers/bookings.controller';
import { authenticate } from '../middlewares/auth';
import { isAdmin, isBuyer } from '../middlewares/roleCheck';
import { uploadDocument, enforceRealContentType } from '../middlewares/upload';

const router = Router();

router.get('/', authenticate, bookingsController.listBookings);
router.get('/:id', authenticate, bookingsController.getBooking);
router.get('/:id/agreement', authenticate, bookingsController.getAgreement);

/** Buyer creates the token booking; commission is derived server-side. */
router.post('/token', authenticate, isBuyer, bookingsController.createTokenBooking);

/** Razorpay checkout callback verification (also handled by the webhook). */
router.post('/:id/verify-token-payment', authenticate, isBuyer, bookingsController.verifyTokenPayment);

router.put('/:id/accept', authenticate, bookingsController.acceptBooking);

router.post(
  '/:id/documents',
  authenticate,
  isBuyer,
  uploadDocument.array('documents', 6),
  enforceRealContentType(['pdf', 'doc', 'image']),
  bookingsController.uploadBookingDocuments,
);

router.put('/:id/documents/:docIndex/verify', authenticate, bookingsController.verifyDocument);

/** Admin-only escrow release (RULE 12). */
router.put('/:id/escrow-release', authenticate, isAdmin, bookingsController.releaseEscrow);

router.post('/:id/refund', authenticate, bookingsController.refundBooking);
router.put('/:id/cancel', authenticate, isBuyer, bookingsController.cancelBooking);
router.put('/:id/loan-status', authenticate, isAdmin, bookingsController.updateLoanStatus);

export default router;