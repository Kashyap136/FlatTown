import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Booking, type BookingDocument, type EscrowStatus, type IBooking } from '../models/Booking';
import { Flat } from '../models/Flat';
import { Inquiry } from '../models/Inquiry';
import { PlatformConfig } from '../models/PlatformConfig';
import { SiteVisit } from '../models/SiteVisit';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendCreated, sendOk } from '../utils/response';
import { getPricingContext } from '../utils/pricingContext';
import { env } from '../config/env';
import { calcCommission, splitCommission } from '../utils/tierCalculator';
import { createPaymentOrder, refundPayment, verifyPayment, type CreatedOrder } from '../utils/razorpay';
import { notifySafe } from '../services/notification.service';
import { money } from '../services/email.service';
import { audit } from './audit.util';
import { currentUser } from '../middlewares/roleCheck';

const idParam = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid booking id') });

/**
 * KYC documents are private (RULE 15): the stored URL is never sent to a
 * client. The escrow ledger and the admin document centre resolve them through
 * authorised, logged access instead.
 */
const publicDocuments = (docs: unknown): Array<Record<string, unknown>> =>
  ((docs as Array<Record<string, unknown>>) ?? []).map((doc) => ({
    type: doc.type,
    verified: doc.verified,
    verifiedAt: doc.verifiedAt,
    uploadedAt: doc.uploadedAt,
    rejectionReason: doc.rejectionReason,
  }));

const bookingShape = (booking: Record<string, unknown>) => ({
  id: String(booking._id),
  reference: booking.reference,
  escrowStatus: booking.escrowStatus,
  loanStatus: booking.loanStatus,
  totalPrice: booking.totalPrice,
  sizeSqft: booking.sizeSqft,
  pricePerSqft: booking.pricePerSqft,
  tier: booking.tier,
  tokenAmount: booking.tokenAmount,
  commissionPercent: booking.commissionPercent,
  commissionAmount: booking.commissionAmount,
  escrow: booking.escrow,
  loan: booking.loan,
  documents: publicDocuments(booking.documents),
  documentsRequested: booking.documentsRequested,
  payment: booking.payment
    ? {
        orderId: (booking.payment as Record<string, unknown>).orderId,
        paymentId: (booking.payment as Record<string, unknown>).paymentId,
        amount: (booking.payment as Record<string, unknown>).amount,
        gateway: (booking.payment as Record<string, unknown>).gateway,
        capturedAt: (booking.payment as Record<string, unknown>).capturedAt,
      }
    : null,
  refund: booking.refund,
  statusHistory: booking.statusHistory,
  ledger: booking.ledger,
  flat: booking.flat,
  project: booking.project,
  builder: booking.builder,
  buyer: booking.buyer,
  agent: booking.agent,
  siteVisitId: booking.siteVisitId,
  agentId: booking.agentId ? String(booking.agentId) : null,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
  completedAt: booking.completedAt,
});

/** Fallback booking token when neither the flat nor the platform config sets one. */
const DEFAULT_TOKEN_AMOUNT = 50_000;

/**
 * Escrow state machine.
 *
 * Escrow is a financial ledger, so a booking may only move along declared
 * edges. Without this, a booking could jump `token_paid → completed` and skip
 * builder acceptance and documentation entirely.
 *
 *   created → token_paid | refunded
 *   token_paid → builder_accepted | refunded
 *   builder_accepted → docs_pending | completed | refunded
 *   docs_pending → completed | refunded
 *   completed / refunded → (terminal)
 */
const ESCROW_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  created: ['token_paid', 'refunded'],
  token_paid: ['builder_accepted', 'refunded'],
  builder_accepted: ['docs_pending', 'completed', 'refunded'],
  docs_pending: ['completed', 'refunded'],
  completed: [],
  refunded: [],
};

const transition = (booking: IBooking, to: EscrowStatus, actorId: string, note?: string): void => {
  const from = booking.escrowStatus;
  if (!ESCROW_TRANSITIONS[from]?.includes(to)) {
    throw ApiError.conflict(`A booking cannot move from "${from}" to "${to}"`);
  }
  booking.statusHistory.push({
    from,
    to,
    by: new Types.ObjectId(actorId),
    note,
    at: new Date(),
  });
  booking.escrowStatus = to;
  booking.escrow.status = to;
};

/** POST /bookings/token — buyer creates a token booking and receives an order. */
export const createTokenBooking = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    if (req.user.role !== 'buyer') throw ApiError.forbidden('Only buyers can book a flat');

    const schema = z.object({
      flatId: z.string().refine(Types.ObjectId.isValid, 'Invalid flat id'),
      // Optional: defaults to the flat's advertised token amount.
      tokenAmount: z.coerce.number().min(1000, 'Token must be at least ₹1,000').max(10000000).optional(),
      loanAssistanceRequired: z.coerce.boolean().default(false),
      siteVisitId: z.string().refine(Types.ObjectId.isValid, 'Invalid site visit id').optional(),
      requirements: z.string().trim().max(500).optional(),
      agentId: z.string().refine(Types.ObjectId.isValid, 'Invalid agent id').optional(),
    });
    const input = schema.parse(req.body);

    const flat = await Flat.findById(input.flatId);
    if (!flat) throw ApiError.notFound('Flat not found');
    if (!flat.isAvailable) throw ApiError.badRequest('This flat is no longer available');

    const existing = await Booking.findOne({
      flatId: flat._id,
      buyerId: req.user._id,
      escrowStatus: { $in: ['created', 'token_paid', 'builder_accepted', 'docs_pending'] },
    });
    if (existing) throw ApiError.conflict('You already have an active booking for this flat');

    const config = await PlatformConfig.findOne({ key: 'default' }).lean();
    const allowed = config?.booking?.allowedTokenAmounts ?? [];

    // The token is the builder's advertised booking token for THIS flat and is
    // the default when the buyer does not pick one — so a flat configured at
    // ₹2,00,000 cannot be quietly booked for ₹50,000. A buyer may select any
    // amount on the admin-controlled allowlist, but never an arbitrary value,
    // because the platform commission is a percentage OF the token.
    const flatToken = flat.tokenAmount || config?.booking?.defaultTokenAmount || DEFAULT_TOKEN_AMOUNT;
    const requested = input.tokenAmount ?? flatToken;
    if (allowed.length && !allowed.includes(requested)) {
      throw ApiError.badRequest(
        `Token amount must be one of ${allowed.map((a) => money(a)).join(', ')}. ` +
          `This flat is configured for ${money(flatToken)}.`,
      );
    }
    const tokenAmount = requested;

    const { commissionPercent, agentPlatformPercent } = getPricingContext();
    // Agent involvement is decided server-side: the flat's assigned agent, or an
    // explicitly assigned agent who is a valid Flat Town agent.
    let agentId: Types.ObjectId | undefined = flat.agentId ? (flat.agentId as Types.ObjectId) : undefined;
    if (input.agentId) {
      const agent = await User.findOne({ _id: input.agentId, role: 'agent' }).select('_id').lean();
      if (!agent) throw ApiError.badRequest('Selected agent does not exist');
      agentId = new Types.ObjectId(input.agentId);
    }

    // RULE 4: commission is charged on the token only.
    const commissionAmount = calcCommission(tokenAmount, commissionPercent);
    const split = splitCommission(tokenAmount, commissionPercent, Boolean(agentId), agentPlatformPercent);

    const escrowAccountId = config?.booking?.escrowAccountId ?? env.escrowAccountId;

    const booking = await Booking.create({
      flatId: flat._id,
      projectId: flat.projectId,
      buyerId: req.user._id,
      builderId: flat.builderId,
      agentId,
      totalPrice: flat.totalPrice,
      sizeSqft: flat.sizeSqft,
      pricePerSqft: flat.pricePerSqft,
      tier: flat.tier,
      tokenAmount,
      commissionPercent,
      commissionAmount,
      escrowStatus: 'created',
      escrow: {
        status: 'created',
        heldAmount: 0,
        builderAmount: split.builderAmount,
        platformAmount: split.platformAmount,
        agentAmount: split.agentAmount,
        agentSharePercent: split.agentSharePercent,
        accountId: escrowAccountId,
      },
      loanStatus: input.loanAssistanceRequired ? 'applied' : 'not_needed',
      loan: {
        required: input.loanAssistanceRequired,
        status: input.loanAssistanceRequired ? 'applied' : 'not_needed',
        appliedAt: input.loanAssistanceRequired ? new Date() : undefined,
        leadFeeAmount: 0,
      },
      siteVisitId: input.siteVisitId,
      statusHistory: [{ from: 'created', to: 'created', by: req.user._id, note: 'Booking created', at: new Date() }],
    });

    if (input.siteVisitId) {
      await SiteVisit.updateOne({ _id: input.siteVisitId }, { $set: { bookingId: booking._id } });
    }
    const inquiry = await Inquiry.findOne({ buyerId: req.user._id, flatId: flat._id });
    if (inquiry) {
      inquiry.bookingId = booking._id;
      inquiry.status = 'booked';
      await inquiry.save();
    }

    const order: CreatedOrder = await createPaymentOrder({
      amount: tokenAmount,
      receipt: booking.reference ?? `booking-${booking._id}`,
      notes: {
        purpose: 'booking_token_escrow',
        bookingId: String(booking._id),
        flatId: String(flat._id),
        buyerId: String(req.user._id),
      },
    });

    booking.payment = {
      orderId: order.orderId,
      amount: tokenAmount,
      gateway: order.gateway,
    };
    await booking.save();

    await audit({
      action: 'booking_created',
      entity: 'booking',
      entityId: String(booking._id),
      actorId: String(req.user._id),
      actorRole: req.user.role,
      amount: tokenAmount,
      metadata: { commissionAmount, totalPrice: flat.totalPrice, gateway: order.gateway },
      req,
    });

    await notifySafe({
      recipientId: String(flat.builderId),
      event: 'booking_created',
      title: 'New booking request',
      body: `${req.user.name} has raised a booking token of ${money(tokenAmount)} for ${flat.title}.`,
      email: { subject: 'New booking request', cta: { label: 'Review booking', url: '/builder/bookings' } },
      data: { bookingId: String(booking._id) },
    });

    return sendCreated(res, 'Booking created. Complete the token payment to enter escrow.', {
      booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>),
      payment: {
        required: true,
        amount: tokenAmount,
        orderId: order.orderId,
        gateway: order.gateway,
        // Never present a simulated payment as a real one (RULE 15 / "no fake payments").
        simulated: order.gateway === 'mock',
        keyId: order.keyId,
        mockSignature: order.mockSignature,
        escrow: {
          status: 'created',
          note: `Token of ${money(tokenAmount)} is held in escrow until admin verification and release.`,
        },
        commission: {
          percent: commissionPercent,
          amount: commissionAmount,
          basis: 'booking_token',
          note: '10% commission applies to the token only — not to the property price.',
        },
        split: split,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/** POST /bookings/:id/verify-token-payment — signature-verified confirmation. */
export const verifyTokenPayment = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      paymentId: z.string().min(4, 'Payment id is required'),
      signature: z.string().min(8, 'Payment signature is required'),
      orderId: z.string().min(4).optional(),
    });
    const input = schema.parse(req.body);

    const booking = await Booking.findById(id);
    if (!booking) throw ApiError.notFound('Booking not found');
    if (String(booking.buyerId) !== String(req.user._id)) {
      throw ApiError.forbidden('You can only pay for your own booking');
    }
    if (booking.escrowStatus === 'refunded') throw ApiError.badRequest('This booking has been refunded');
    if (booking.payment?.paymentId) {
      return sendOk(res, 'Payment was already verified', { booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>) });
    }

    const orderId = input.orderId ?? booking.payment?.orderId ?? '';
    if (!orderId) throw ApiError.badRequest('No payment order exists for this booking');

    // Signature + amount verified against the gateway. Never trust the client.
    const result = await verifyPayment({
      orderId,
      paymentId: input.paymentId,
      signature: input.signature,
      expectedAmount: booking.tokenAmount,
    });

    booking.payment = {
      orderId,
      paymentId: result.paymentId,
      signature: input.signature,
      gateway: result.gateway,
      amount: result.amount,
      capturedAt: result.capturedAt,
    };
    booking.escrow.heldAmount = result.amount;
    booking.ledger.push({
      type: 'token_received',
      amount: result.amount,
      note: `Token received via ${result.gateway} into escrow ${booking.escrow.accountId}`,
      by: req.user._id,
      at: new Date(),
    });
    booking.ledger.push({
      type: 'commission_booked',
      amount: booking.commissionAmount,
      note: `Platform commission ${booking.commissionPercent}% of token ${money(booking.tokenAmount)}`,
      at: new Date(),
    });
    transition(booking, 'token_paid', String(req.user._id), 'Token payment verified');
    await booking.save();

    await audit({
      action: 'token_payment_verified',
      entity: 'payment',
      entityId: String(booking._id),
      actorId: String(req.user._id),
      amount: result.amount,
      metadata: { gateway: result.gateway, paymentId: result.paymentId },
      req,
    });

    await notifySafe({
      recipientId: String(booking.builderId),
      event: 'token_payment_successful',
      title: 'Token received in escrow',
      body: `A token of ${money(result.amount)} has been received in escrow for your booking. Please accept the booking to proceed.`,
      email: { subject: 'Token received — accept booking', cta: { label: 'Accept booking', url: '/builder/bookings' } },
      data: { bookingId: String(booking._id) },
    });

    return sendOk(res, 'Token payment verified. Amount held in escrow.', {
      booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>),
      payment: {
        status: 'verified',
        amount: result.amount,
        escrowStatus: 'token_paid',
        gateway: result.gateway,
        simulated: result.gateway === 'mock',
        commission: { percent: booking.commissionPercent, amount: booking.commissionAmount, basis: 'booking_token' },
      },
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /bookings/:id/accept — builder accepts the booking. */
export const acceptBooking = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      documentTypes: z
        .array(z.enum(['aadhaar', 'pan', 'loan_approval', 'salary_proof', 'bank_statement', 'other']))
        .max(6)
        .optional(),
      note: z.string().trim().max(500).optional(),
    });
    const input = schema.parse(req.body ?? {});

    const booking = await Booking.findById(id);
    if (!booking) throw ApiError.notFound('Booking not found');
    if (req.user.role !== 'admin' && String(booking.builderId) !== String(req.user._id)) {
      throw ApiError.forbidden('Only the builder can accept this booking');
    }
    if (booking.escrowStatus !== 'token_paid') {
      throw ApiError.badRequest(`Booking must be in token_paid state to accept (current: ${booking.escrowStatus})`);
    }

    transition(booking, 'builder_accepted', String(req.user._id), input.note);
    const documentTypes = input.documentTypes ?? ['aadhaar', 'pan'];
    const loanRequired = booking.loanStatus !== 'not_needed';
    if (loanRequired && !documentTypes.includes('loan_approval')) documentTypes.push('loan_approval');
    booking.documentsRequested = documentTypes.map((type) => ({
      type,
      requestedAt: new Date(),
      by: currentUser(req)._id,
    }));
    await booking.save();

    await notifySafe({
      recipientId: String(booking.buyerId),
      event: 'documents_requested',
      title: 'Booking accepted — documents required',
      body: `Your booking has been accepted. Please upload: ${documentTypes.join(', ')}.`,
      email: { subject: 'Upload documents to continue', cta: { label: 'Upload documents', url: `/buyer/bookings` } },
      data: { bookingId: String(booking._id), documentTypes },
    });

    return sendOk(res, 'Booking accepted. Documents requested from the buyer.', {
      booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>),
      documentsRequested: booking.documentsRequested,
    });
  } catch (error) {
    return next(error);
  }
};

/** POST /bookings/:id/documents — buyer uploads KYC / loan documents. */
export const uploadBookingDocuments = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);

    const booking = await Booking.findById(id);
    if (!booking) throw ApiError.notFound('Booking not found');
    if (String(booking.buyerId) !== String(req.user._id)) {
      throw ApiError.forbidden('You can only upload documents to your own booking');
    }
    if (['completed', 'refunded'].includes(booking.escrowStatus)) {
      throw ApiError.badRequest(`Documents cannot be uploaded for a ${booking.escrowStatus} booking`);
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('No documents uploaded');

    const allowedTypes = ['aadhaar', 'pan', 'loan_approval', 'salary_proof', 'bank_statement', 'other'] as const;
    type DocumentType = (typeof allowedTypes)[number];
    const isDocumentType = (value: string): value is DocumentType =>
      (allowedTypes as readonly string[]).includes(value);

    const types = String(req.body?.types ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    types.forEach((t) => {
      if (!isDocumentType(t)) throw ApiError.badRequest(`Invalid document type: ${t}`);
    });

    /**
     * Falls back to the uploaded filename when the client did not label the
     * file. Without this, two unlabelled uploads both became type `other` and
     * the second silently overwrote the first, leaving a buyer permanently
     * blocked at escrow release with "documents not verified: aadhaar, pan"
     * and no way to tell why.
     */
    const inferType = (filename: string): DocumentType => {
      const name = filename.toLowerCase();
      if (/aadhaar|aadhar|aadhaa?r/.test(name)) return 'aadhaar';
      if (/\bpan\b|permanent.account/.test(name)) return 'pan';
      if (/loan.?approval|bank.?sanction|sanction.?letter/.test(name)) return 'loan_approval';
      if (/salary|payslip|pay.?slip/.test(name)) return 'salary_proof';
      if (/bank.?statement/.test(name)) return 'bank_statement';
      return 'other';
    };

    const { uploadBuffer } = await import('../utils/storage');
    const uploaded = await Promise.all(
      files.map(async (file, index): Promise<BookingDocument> => {
        const type = types[index] ?? inferType(file.originalname);
        if (!isDocumentType(type)) throw ApiError.badRequest(`Invalid document type: ${type}`);
        const stored = await uploadBuffer(file.buffer, {
          filename: file.originalname,
          kind: 'document',
          mimetype: file.mimetype,
        });
        return { type, url: stored.url, publicId: stored.publicId, verified: false, uploadedAt: new Date() };
      }),
    );

    // Replace any previous upload of the same type.
    for (const doc of uploaded) {
      const existing = booking.documents.findIndex((d) => d.type === doc.type);
      if (existing >= 0) booking.documents[existing] = doc;
      else booking.documents.push(doc);
    }
    if (!booking.documents.some((d) => d.type === 'loan_approval') && booking.loanStatus !== 'not_needed') {
      // Not blocking: the admin verification step will flag the missing doc.
    }
    await booking.save();

    await notifySafe({
      recipientId: String(booking.builderId),
      event: 'documents_uploaded',
      title: 'Buyer documents uploaded',
      body: `${uploaded.length} document(s) uploaded for booking ${booking.reference}.`,
      email: { subject: 'Documents uploaded', cta: { label: 'Review documents', url: '/builder/bookings' } },
      data: { bookingId: String(booking._id) },
    });

    return sendCreated(res, 'Documents uploaded successfully', {
      booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>),
      uploaded,
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /bookings/:id/documents/:docIndex/verify — builder/admin verifies a document. */
export const verifyDocument = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id, docIndex } = z
      .object({
        id: z.string().refine(Types.ObjectId.isValid, 'Invalid booking id'),
        docIndex: z.coerce.number().int().min(0),
      })
      .parse(req.params);
    const schema = z.object({ verified: z.boolean(), rejectionReason: z.string().trim().max(300).optional() });
    const input = schema.parse(req.body);

    const booking = await Booking.findById(id);
    if (!booking) throw ApiError.notFound('Booking not found');
    const canVerify =
      req.user.role === 'admin' || String(booking.builderId) === String(req.user._id);
    if (!canVerify) throw ApiError.forbidden('Only the builder or an admin can verify documents');

    const doc = booking.documents[docIndex];
    if (!doc) throw ApiError.notFound('Document not found');
    doc.verified = input.verified;
    doc.verifiedBy = req.user._id;
    doc.verifiedAt = new Date();
    doc.rejectionReason = input.verified ? undefined : input.rejectionReason ?? 'Document could not be verified';

    if (!booking.documentsRequested.length) {
      booking.documentsRequested = booking.documents.map((d) => ({ type: d.type, requestedAt: new Date(), by: currentUser(req)._id }));
    }
    const allUploaded = booking.documentsRequested.every((reqDoc) =>
      booking.documents.some((d) => d.type === reqDoc.type && d.verified),
    );
    if (allUploaded && booking.escrowStatus === 'builder_accepted') {
      transition(booking, 'docs_pending', String(req.user._id), 'All documents verified');
    }
    await booking.save();

    await audit({
      action: `document_${input.verified ? 'verified' : 'rejected'}`,
      entity: 'booking',
      entityId: String(booking._id),
      actorId: String(req.user._id),
      metadata: { type: doc.type },
      req,
    });

    await notifySafe({
      recipientId: String(booking.buyerId),
      event: 'documents_verified',
      title: input.verified ? 'Document verified' : 'Document needs re-upload',
      body: input.verified
        ? `Your ${doc.type} document was verified.`
        : `Your ${doc.type} document was rejected: ${doc.rejectionReason}`,
      data: { bookingId: String(booking._id) },
    });

    return sendOk(res, 'Document verification updated', {
      booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /bookings/:id/escrow-release — admin only. RULE 12. */
export const releaseEscrow = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      throw ApiError.forbidden('Only an admin can release escrow');
    }
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      note: z.string().trim().max(300).optional(),
      builderKycVerified: z.boolean().default(true),
    });
    const input = schema.parse(req.body ?? {});

    const booking = await Booking.findById(id);
    if (!booking) throw ApiError.notFound('Booking not found');

    const config = await PlatformConfig.findOne({ key: 'default' }).lean();

    // RULE 12: escrow may only be released once the booking has actually reached
    // the documentation stage. This is enforced unconditionally — an admin
    // config flag must not be able to unlock a payout on an undocumented
    // booking, because escrow release moves real money.
    if (booking.escrowStatus === 'refunded') throw ApiError.badRequest('A refunded booking cannot be released');
    if (booking.escrowStatus === 'completed' || booking.escrow.releasedAt) {
      throw ApiError.conflict('Escrow has already been released');
    }
    if (booking.payment?.paymentId === undefined) {
      throw ApiError.badRequest('Escrow cannot be released before the token payment is verified');
    }
    if (booking.escrowStatus === 'created') {
      throw ApiError.conflict('Escrow cannot be released before the token payment is confirmed');
    }
    if (booking.escrowStatus === 'token_paid') {
      throw ApiError.conflict('Escrow cannot be released until the builder accepts this booking');
    }
    // A partially refunded booking must not settle the remaining balance.
    const refundedAmount = booking.escrow.refundedAmount ?? 0;
    if (refundedAmount > 0) {
      throw ApiError.conflict('Escrow has already been partially refunded and cannot be released');
    }

    // Documentation is always required before funds move.
    const required = booking.documentsRequested.length
      ? booking.documentsRequested.map((d) => d.type)
      : ['aadhaar', 'pan'];
    const missing = required.filter((type) => !booking.documents.some((d) => d.type === type && d.verified));
    if (missing.length) {
      throw ApiError.badRequest(`Escrow release blocked — documents not verified: ${missing.join(', ')}`);
    }

    if (!input.builderKycVerified) {
      throw ApiError.badRequest('Builder KYC must be verified before escrow release');
    }
    const builder = await User.findById(booking.builderId).select('kycStatus isAdminVerified').lean();
    if (!builder?.isAdminVerified) {
      throw ApiError.badRequest('Builder KYC is not verified by the admin yet');
    }

    // Recompute the split server-side at release time using current config.
    const { commissionPercent, agentPlatformPercent } = getPricingContext();
    // A per-agent override is only honoured when the platform has explicitly
    // enabled it AND an admin has set the value. Agents cannot self-assign it
    // (see auth.controller updateProfile) — the default is always the
    // configured global split, so an agent can never raise their own share.
    let platformSharePct = agentPlatformPercent;
    if (config?.commission?.allowPerAgentOverride) {
      const agent = booking.agentId
        ? await User.findById(booking.agentId).select('commissionSharePercent').lean()
        : null;
      if (typeof agent?.commissionSharePercent === 'number') {
        platformSharePct = 100 - agent.commissionSharePercent;
      }
    }
    const split = splitCommission(booking.tokenAmount, commissionPercent, Boolean(booking.agentId), platformSharePct);

    // Atomic claim: the read above is not a lock, so two concurrent admin
    // requests could both pass every guard and release the escrow twice. This
    // conditional update succeeds for exactly one of them.
    const claimed = await Booking.findOneAndUpdate(
      { _id: booking._id, escrowStatus: { $in: ['builder_accepted', 'docs_pending'] }, 'escrow.releasedAt': null },
      { $set: { 'escrow.releasedAt': new Date(), 'escrow.releasedBy': req.user._id } },
      { new: true },
    );
    if (!claimed) {
      throw ApiError.conflict('This escrow was released by another request. Reload the booking.');
    }

    booking.commissionPercent = commissionPercent;
    booking.commissionAmount = split.commissionAmount;
    booking.escrow.builderAmount = split.builderAmount;
    booking.escrow.platformAmount = split.platformAmount;
    booking.escrow.agentAmount = split.agentAmount;
    booking.escrow.agentSharePercent = split.agentSharePercent;
    booking.escrow.releasedAmount = split.builderAmount;
    booking.escrow.releasedAt = claimed.escrow.releasedAt;
    booking.escrow.releasedBy = req.user._id;
    booking.completedAt = new Date();

    // The commission ledger entry written when the token was captured used the
    // rate in force at that time. Reconcile it so the ledger and the escrow
    // totals can never disagree.
    const bookedEntry = booking.ledger.find((e) => e.type === 'commission_booked');
    if (bookedEntry) {
      bookedEntry.amount = split.commissionAmount;
      bookedEntry.note = `Platform commission ${commissionPercent}% of token (reconciled at escrow release)`;
    }

    const builderSharePercent = Math.round((split.builderAmount / booking.tokenAmount) * 100);
    booking.ledger.push(
      {
        type: 'escrow_released',
        amount: split.builderAmount,
        note: `Released to builder (${builderSharePercent}% of token) — ${money(split.builderAmount)}`,
        by: req.user._id,
        at: new Date(),
      },
      {
        type: 'adjustment',
        amount: split.agentAmount,
        note: split.agentAmount
          ? `Agent share (${split.agentSharePercent}% of commission) — ${money(split.agentAmount)}`
          : 'No agent attached to this booking',
        by: req.user._id,
        at: new Date(),
      },
    );

    transition(booking, 'completed', String(req.user._id), input.note ?? 'Escrow released by admin');
    await booking.save();

    await Promise.all([
      audit({
        action: 'escrow_released',
        entity: 'escrow',
        entityId: String(booking._id),
        actorId: String(req.user._id),
        actorRole: req.user.role,
        amount: split.builderAmount,
        metadata: { ...split },
        req,
      }),
      Flat.updateOne({ _id: booking.flatId }, { $set: { isAvailable: false } }),
    ]);

    await notifySafe({
      recipientId: String(booking.builderId),
      event: 'escrow_released',
      title: 'Escrow released',
      body: `${money(split.builderAmount)} (${builderSharePercent}% of the token) has been released to you. Platform commission retained: ${money(split.platformAmount)}${split.agentAmount ? `, agent share ${money(split.agentAmount)}` : ''}.`,
      email: { subject: 'Escrow released — payout recorded', cta: { label: 'View payouts', url: '/builder/bookings' } },
      data: { bookingId: String(booking._id) },
    });
    await notifySafe({
      recipientId: String(booking.buyerId),
      event: 'escrow_released',
      title: 'Booking completed',
      body: 'Your booking is complete. The agreement has been generated and your possession timeline is now active.',
      email: { subject: 'Flat Town — booking complete', cta: { label: 'Track booking', url: '/buyer/bookings' } },
      data: { bookingId: String(booking._id) },
    });
    if (booking.agentId) {
      await notifySafe({
        recipientId: String(booking.agentId),
        event: 'escrow_released',
        title: 'Commission credited',
        body: `Your commission share of ${money(split.agentAmount)} has been released for booking ${booking.reference}.`,
        data: { bookingId: String(booking._id) },
      });
    }

    return sendOk(res, 'Escrow released successfully', {
      booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>),
      payout: {
        tokenAmount: booking.tokenAmount,
        commissionPercent: commissionPercent,
        commissionAmount: split.commissionAmount,
        builderAmount: split.builderAmount,
        platformAmount: split.platformAmount,
        agentAmount: split.agentAmount,
        agentSharePercent: split.agentSharePercent,
        escrowAccountId: booking.escrow.accountId,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/** POST /bookings/:id/refund — admin (or buyer within policy). */
export const refundBooking = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      reason: z.string().trim().min(5, 'A refund reason is required').max(300),
      amount: z.coerce.number().min(1).optional(),
    });
    const input = schema.parse(req.body);

    const booking = await Booking.findById(id);
    if (!booking) throw ApiError.notFound('Booking not found');
    const isAdmin = req.user.role === 'admin';
    const isBuyer = String(booking.buyerId) === String(req.user._id);
    if (!isAdmin) throw ApiError.forbidden('Only an admin can refund a booking token');

    if (booking.escrowStatus === 'refunded') throw ApiError.conflict('This booking has already been refunded');
    if (booking.escrowStatus === 'completed') {
      throw ApiError.badRequest('Escrow was already released. Resolve this through the dispute centre instead.');
    }
    if (['created'].includes(booking.escrowStatus)) {
      throw ApiError.badRequest('No token was ever paid for this booking — cancel it instead');
    }
    if (!booking.payment?.paymentId) throw ApiError.badRequest('No captured payment found for this booking');

    if (isBuyer && input.amount) {
      throw ApiError.forbidden('Refund amounts are decided by the platform');
    }

    // Refundable = the amount still held in escrow, minus anything already
    // returned. Using the token amount instead would let a second refund
    // request push the gateway past the captured total.
    const held = booking.escrow.heldAmount || booking.tokenAmount;
    const alreadyRefunded = booking.escrow.refundedAmount ?? 0;
    const refundable = held - alreadyRefunded;
    if (alreadyRefunded > 0 && input.amount === undefined) {
      throw ApiError.conflict('This booking has already been partially refunded');
    }
    const amount = Math.min(input.amount ?? refundable, refundable);
    if (amount <= 0) throw ApiError.badRequest('No refundable balance remains for this booking');

    const isFullRefund = amount >= refundable;

    const refund = await refundPayment({
      paymentId: booking.payment.paymentId,
      amount,
      notes: { bookingId: String(booking._id), reason: input.reason, by: String(req.user._id) },
    });

    booking.refund = {
      amount: refund.amount,
      refundId: refund.refundId,
      reason: input.reason,
      gateway: refund.gateway,
      at: new Date(),
      by: req.user._id,
    };
    // Accumulate rather than overwrite so repeated partial refunds are tracked.
    booking.escrow.refundedAmount = alreadyRefunded + refund.amount;
    booking.escrow.heldAmount = Math.max(0, booking.escrow.heldAmount - refund.amount);
    booking.ledger.push({
      type: 'refund',
      amount: refund.amount,
      note: `Refund issued: ${input.reason}`,
      by: req.user._id,
      at: new Date(),
    });
    // A booking is only "refunded" once the whole token has been returned. A
    // partial refund leaves it in its current state so the remaining balance
    // can still be settled (released or refunded) later.
    if (isFullRefund) {
      transition(booking, 'refunded', String(req.user._id), input.reason);
    }
    await booking.save();

    // Only return the flat to the market when it is genuinely free again.
    // Another buyer may already hold a live booking, or the flat may have been
    // sold and the escrow already released — re-listing in either case would put
    // a sold unit back on sale.
    const otherLiveBooking = await Booking.exists({
      flatId: booking.flatId,
      _id: { $ne: booking._id },
      escrowStatus: { $in: ['created', 'token_paid', 'builder_accepted', 'docs_pending', 'completed'] },
    });

    await Promise.all([
      audit({
        action: 'booking_refunded',
        entity: 'escrow',
        entityId: String(booking._id),
        actorId: String(req.user._id),
        actorRole: req.user.role,
        amount: refund.amount,
        metadata: { refundId: refund.refundId, gateway: refund.gateway, reason: input.reason, isFullRefund },
        req,
      }),
      !otherLiveBooking && isFullRefund
        ? Flat.updateOne({ _id: booking.flatId }, { $set: { isAvailable: true } })
        : Promise.resolve(),
    ]);

    await notifySafe({
      recipientId: String(booking.buyerId),
      event: 'refund_processed',
      title: 'Refund processed',
      body: `${money(refund.amount)} has been refunded against booking ${booking.reference}.`,
      email: { subject: 'Flat Town — refund processed', cta: { label: 'View booking', url: '/buyer/bookings' } },
      data: { bookingId: String(booking._id) },
    });

    return sendOk(res, 'Refund processed successfully', {
      booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>),
      refund: booking.refund,
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /bookings/:id/cancel — buyer cancels a booking that has no payment yet. */
export const cancelBooking = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const booking = await Booking.findById(id);
    if (!booking) throw ApiError.notFound('Booking not found');
    if (String(booking.buyerId) !== String(req.user._id) && req.user.role !== 'admin') {
      throw ApiError.forbidden('You can only cancel your own booking');
    }
    if (booking.escrowStatus !== 'created') {
      throw ApiError.badRequest('A paid booking can only be refunded by the platform');
    }
    transition(booking, 'refunded', String(req.user._id), 'Cancelled before payment');
    booking.escrow.refundedAmount = 0;
    await booking.save();
    await audit({
      action: 'booking_cancelled',
      entity: 'booking',
      entityId: String(booking._id),
      actorId: String(req.user._id),
      req,
    });
    return sendOk(res, 'Booking cancelled', { booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>) });
  } catch (error) {
    return next(error);
  }
};

/** GET /bookings — role aware list. */
export const listBookings = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const schema = z.object({
      scope: z.enum(['mine', 'builder', 'agent', 'all']).default('mine'),
      escrowStatus: z.string().optional(),
      loanStatus: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = {};
    if (query.scope === 'all') {
      if (req.user.role !== 'admin') throw ApiError.forbidden('Admin access required');
    } else if (query.scope === 'builder') filter.builderId = req.user._id;
    else if (query.scope === 'agent') filter.agentId = req.user._id;
    else filter.buyerId = req.user._id;

    if (query.escrowStatus) filter.escrowStatus = { $in: query.escrowStatus.split(',') };
    if (query.loanStatus) filter.loanStatus = { $in: query.loanStatus.split(',') };

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('flatId', 'title bhk totalPrice tier images sizeSqft pricePerSqft')
        .populate('projectId', 'projectName slug city locality isRERAVerified')
        .populate('builderId', 'name companyName avatar rating isRERAVerified kycStatus')
        .populate('buyerId', 'name phone avatar email')
        .populate('agentId', 'name phone avatar commissionSharePercent')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Booking.countDocuments(filter),
    ]);

    const items = bookings.map((b) => bookingShape(b as unknown as Record<string, unknown>));
    return sendOk(res, 'Bookings fetched successfully', items, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/** GET /bookings/:id */
export const getBooking = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const booking = await Booking.findById(id)
      .populate('flatId', 'title bhk totalPrice tier images sizeSqft pricePerSqft floorPlan')
      .populate('projectId', 'projectName slug city locality isRERAVerified fullAddress geo')
      .populate('builderId', 'name companyName avatar rating isRERAVerified kycStatus')
      .populate('buyerId', 'name phone avatar email kycStatus')
      .populate('agentId', 'name phone avatar commissionSharePercent')
      .lean();
    if (!booking) throw ApiError.notFound('Booking not found');

    const allowed = [booking.buyerId, booking.builderId, booking.agentId].some(
      (u) => String(u?._id ?? '') === String(currentUser(req)._id),
    );
    if (!allowed && req.user.role !== 'admin') throw ApiError.forbidden('You cannot view this booking');

    // Nested under `booking` for consistency with every other booking endpoint
    // (create / verify / accept / documents / escrow-release).
    return sendOk(res, 'Booking fetched successfully', {
      booking: bookingShape(booking as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /bookings/:id/loan-status — admin sets loan status / assigns partner. */
export const updateLoanStatus = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user || req.user.role !== 'admin') throw ApiError.forbidden('Admin access required');
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      status: z.enum(['not_needed', 'applied', 'approved', 'rejected']),
      partnerId: z.string().refine(Types.ObjectId.isValid, 'Invalid partner id').optional(),
      leadFeeAmount: z.coerce.number().min(0).optional(),
      notes: z.string().trim().max(500).optional(),
    });
    const input = schema.parse(req.body);

    const booking = await Booking.findById(id);
    if (!booking) throw ApiError.notFound('Booking not found');

    let partnerName: string | undefined;
    if (input.partnerId) {
      const { LoanPartner } = await import('../models/LoanPartner');
      const partner = await LoanPartner.findById(input.partnerId).lean();
      if (!partner) throw ApiError.notFound('Loan partner not found');
      partnerName = partner.name;
      booking.loan.partnerId = partner._id;
      booking.loan.partnerName = partner.name;
      booking.loan.leadFeeAmount = input.leadFeeAmount ?? partner.leadFeeAmount;
    }
    booking.loanStatus = input.status;
    booking.loan.status = input.status;
    if (input.notes) booking.loan.notes = input.notes;
    if (input.status === 'approved') booking.loan.approvedAt = new Date();
    await booking.save();

    await notifySafe({
      recipientId: String(booking.buyerId),
      event: 'loan_status_changed',
      title: `Loan status: ${input.status.replace('_', ' ')}`,
      body: partnerName
        ? `Your home loan has been ${input.status} with ${partnerName}.`
        : `Your home loan application status is now ${input.status.replace('_', ' ')}.`,
      email: { subject: 'Flat Town — loan update', cta: { label: 'Track loan', url: '/buyer' } },
      data: { bookingId: String(booking._id) },
    });

    return sendOk(res, 'Loan status updated', {
      booking: bookingShape(booking.toObject() as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /bookings/:id/agreement — agreement URL / generated document reference. */
export const getAgreement = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const booking = await Booking.findById(id).lean();
    if (!booking) throw ApiError.notFound('Booking not found');
    const allowed = [booking.buyerId, booking.builderId].some(
      (u) => String(u) === String(currentUser(req)._id),
    );
    if (!allowed && req.user.role !== 'admin') throw ApiError.forbidden('You cannot view this agreement');

    return sendOk(res, 'Agreement fetched successfully', {
      reference: booking.reference,
      url: booking.agreementUrl ?? null,
      generatedAt: booking.completedAt,
      summary: {
        propertyValue: booking.totalPrice,
        tokenHeldInEscrow: booking.tokenAmount,
        platformCommission: booking.commissionAmount,
        releasedToBuilder: booking.escrow?.releasedAmount ?? 0,
      },
      note: 'Final sale commission is settled offline through an invoice, as per the Flat Town escrow policy.',
    });
  } catch (error) {
    return next(error);
  }
};
