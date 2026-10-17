import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Flat, type IFlat } from '../models/Flat';
import { Inquiry } from '../models/Inquiry';
import { PlatformConfig } from '../models/PlatformConfig';
import { Project } from '../models/Project';
import { SiteVisit, type ISiteVisit } from '../models/SiteVisit';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendCreated, sendOk } from '../utils/response';
import {
  createPaymentOrder,
  refundPayment,
  usingMockGateway,
  verifyPayment,
  type CreatedOrder,
} from '../utils/razorpay';
import { notifySafe } from '../services/notification.service';
import { invalidateFlat } from '../services/cacheInvalidation';
import { money } from '../services/email.service';
import { currentUser } from '../middlewares/roleCheck';

/** Midnight of the given day — the canonical form a visit slot date is stored in. */
const startOfDay = (value: Date): Date => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** `days` calendar days after `from`, at midnight. */
const addDays = (from: Date, days: number): Date => {
  const d = startOfDay(from);
  d.setDate(d.getDate() + days);
  return d;
};

const visitSchema = z.object({
  flatId: z.string().refine(Types.ObjectId.isValid, 'Invalid flat id'),
  slot: z.object({
    date: z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), 'Invalid date'),
    time: z.string().trim().min(3, 'Time slot is required').max(40),
  }),
  loanNeeded: z.coerce.boolean().default(false),
  loanAssistanceRequired: z.coerce.boolean().optional(),
  requirements: z.string().trim().max(500).optional(),
  visitorCount: z.coerce.number().int().min(1).max(10).default(1),
});

const statusSchema = z.object({
  status: z.enum(['requested', 'confirmed', 'completed', 'cancelled']),
  notes: z.string().trim().max(500).optional(),
  cancellationReason: z.string().trim().max(300).optional(),
});

const idParam = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid visit id') });

/** Standard slots offered on the booking calendar. */
export const VISIT_SLOTS = ['09:30 AM', '11:00 AM', '12:30 PM', '03:00 PM', '04:30 PM', '06:00 PM'];

/**
 * A visit document plus the relations that `.populate()` may have attached.
 * The populated fields are absent on a freshly created document, hence optional.
 */
type PopulatedVisit = ISiteVisit & {
  flat?: unknown;
  project?: unknown;
  builder?: unknown;
  buyer?: unknown;
  agent?: unknown;
};

const shape = (input: PopulatedVisit | Record<string, unknown>) => {
  const visit = input as Record<string, unknown>;
  return {
  id: String(visit._id),
  reference: visit.reference,
  status: visit.status,
  slot: visit.slot,
  visitCharge: visit.visitCharge,
  paymentStatus: visit.paymentStatus,
  payment: visit.payment,
  requirements: visit.requirements,
  loanAssistanceRequired: visit.loanAssistanceRequired,
  visitorCount: visit.visitorCount,
  builderNotes: visit.builderNotes,
  cancellationReason: visit.cancellationReason,
  bookingId: visit.bookingId ? String(visit.bookingId) : undefined,
  flat: visit.flat,
  project: visit.project,
  builder: visit.builder,
  buyer: visit.buyer,
  agent: visit.agent,
  createdAt: visit.createdAt,
  updatedAt: visit.updatedAt,
  };
};

/**
 * Free-visit allowance: verified builders get their first 2 visits free,
 * everyone else pays the published charge (₹199 / ₹499).
 */
const resolveVisitCharge = async (flat: IFlat): Promise<{ charge: number; freeQuota: number; used: number }> => {
  const config = await PlatformConfig.findOne({ key: 'default' }).lean();
  const freeVerified = config?.visits?.freeVisitsForVerifiedBuilders ?? 2;
  const freeAll = config?.visits?.freeVisitsForAll ?? 0;
  const builder = await User.findById(flat.builderId).select('isRERAVerified').lean();

  const freeQuota = (builder?.isRERAVerified ? freeVerified : 0) + freeAll;
  const used = await SiteVisit.countDocuments({
    flatId: flat._id,
    status: { $in: ['confirmed', 'completed'] },
  });

  if (used < freeQuota) return { charge: 0, freeQuota, used };
  const allowed = config?.visits?.allowedCharges ?? [0, 199, 499];
  const flatCharge = allowed.includes(flat.visitCharge) ? flat.visitCharge : (allowed[1] ?? 199);
  return { charge: flatCharge, freeQuota, used };
};

/** POST /visits/request — buyer books a site visit. */
export const requestVisit = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const input = visitSchema.parse(req.body);

    const flat = await Flat.findById(input.flatId);
    if (!flat) throw ApiError.notFound('Flat not found');
    if (!flat.isAvailable) throw ApiError.badRequest('This flat is no longer available');
    if (String(flat.builderId) === String(req.user._id)) {
      throw ApiError.badRequest('You cannot book a site visit on your own listing');
    }

    const startOfDay = new Date(input.slot.date);
    startOfDay.setHours(0, 0, 0, 0);
    if (startOfDay.getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime()) {
      throw ApiError.badRequest('Site visit date cannot be in the past');
    }

    const conflict = await SiteVisit.findOne({
      flatId: flat._id,
      'slot.date': startOfDay,
      'slot.time': input.slot.time,
      status: { $in: ['requested', 'confirmed'] },
    });
    if (conflict) throw ApiError.conflict('This slot has just been booked. Please pick another one.');

    const { charge } = await resolveVisitCharge(flat);

    const visit = await SiteVisit.create({
      flatId: flat._id,
      projectId: flat.projectId,
      buyerId: req.user._id,
      builderId: flat.builderId,
      agentId: flat.agentId,
      status: 'requested',
      slot: { date: startOfDay, time: input.slot.time },
      visitCharge: charge,
      paymentStatus: charge > 0 ? 'pending' : 'not_required',
      requirements: input.requirements,
      loanAssistanceRequired: input.loanAssistanceRequired ?? input.loanNeeded,
      visitorCount: input.visitorCount,
    });

    // Link back to the originating inquiry when present.
    const inquiry = await Inquiry.findOne({ buyerId: req.user._id, flatId: flat._id, bookingId: { $exists: false } });
    if (inquiry) {
      inquiry.visitId = visit._id;
      inquiry.status = 'visit_booked';
      await inquiry.save();
    }

    const project = await Project.findById(flat.projectId).select('projectName').lean();

    await notifySafe({
      recipientId: String(flat.builderId),
      event: 'site_visit_requested',
      title: 'New site visit requested',
      body: `${req.user.name} requested a site visit for ${flat.title} at ${project?.projectName ?? 'your project'} on ${startOfDay.toDateString()} at ${input.slot.time}.`,
      email: {
        subject: `Site visit request — ${flat.title}`,
        cta: { label: 'Manage visits', url: '/builder/visits' },
      },
      sms: `Flat Town: Site visit requested for ${flat.title} on ${startOfDay.toDateString()}.`,
      data: { visitId: String(visit._id) },
    });

    await invalidateFlat(flat);

    let order: CreatedOrder | undefined;
    if (charge > 0) {
      order = await createPaymentOrder({
        amount: charge,
        receipt: visit.reference ?? `visit-${visit._id}`,
        notes: {
          purpose: 'site_visit_charge',
          visitId: String(visit._id),
          flatId: String(flat._id),
          buyerId: String(req.user._id),
        },
      });
      visit.set('payment.orderId', order.orderId);
      visit.set('payment.gateway', order.gateway);
      visit.set('payment.amount', charge);
      await visit.save();
    }

    return sendCreated(res, 'Site visit requested successfully', {
      visit: shape(visit.toObject() as unknown as Record<string, unknown>),
      payment: order
        ? {
            required: true,
            amount: charge,
            refundableOnBooking: true,
            orderId: order.orderId,
            gateway: order.gateway,
            keyId: order.keyId,
            mockSignature: order.mockSignature,
            note: charge > 0 ? 'The visit charge is 100% refundable on booking and is credited to the Flat Town platform.' : undefined,
          }
        : { required: false, amount: 0, note: 'This visit is free of cost.' },
    });
  } catch (error) {
    return next(error);
  }
};

/** POST /visits/:id/pay — pay the visit charge (Razorpay or mock). */
export const payVisit = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      paymentId: z.string().min(4, 'Payment id is required'),
      signature: z.string().min(8, 'Payment signature is required'),
      orderId: z.string().min(4).optional(),
    });
    const input = schema.parse(req.body);

    const visit = await SiteVisit.findById(id);
    if (!visit) throw ApiError.notFound('Site visit not found');
    if (String(visit.buyerId) !== String(req.user._id)) throw ApiError.forbidden('This visit belongs to another buyer');
    if (visit.paymentStatus === 'paid') throw ApiError.conflict('This visit charge has already been paid');
    if (visit.visitCharge <= 0) throw ApiError.badRequest('This visit has no charge to pay');

    const orderId = input.orderId ?? visit.payment?.orderId ?? '';
    if (!orderId) throw ApiError.badRequest('No payment order exists for this visit');

    // Server-side verification — the client's success flag is never trusted.
    const result = await verifyPayment({
      orderId,
      paymentId: input.paymentId,
      signature: input.signature,
      expectedAmount: visit.visitCharge,
    });

    visit.payment = {
      orderId,
      paymentId: result.paymentId,
      signature: input.signature,
      gateway: result.gateway,
      amount: result.amount,
      paidAt: result.capturedAt,
    };
    visit.paymentStatus = 'paid';
    // A paid visit is auto-confirmed; the builder can still complete it.
    visit.status = 'confirmed';
    await visit.save();

    await notifySafe({
      recipientId: String(visit.builderId),
      event: 'site_visit_confirmed',
      title: 'Site visit confirmed',
      body: `${req.user.name}'s visit for the requested flat is confirmed on ${visit.slot.date.toDateString()} at ${visit.slot.time}. Charge of ${money(visit.visitCharge)} received.`,
      email: { subject: 'Site visit confirmed', cta: { label: 'View visits', url: '/builder/visits' } },
      data: { visitId: String(visit._id) },
    });

    return sendOk(res, 'Visit payment successful. Site visit confirmed.', {
      visit: shape(visit.toObject() as unknown as Record<string, unknown>),
      payment: {
        status: 'paid',
        amount: result.amount,
        paymentId: result.paymentId,
        gateway: result.gateway,
        simulated: result.gateway === 'mock',
      },
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /visits/:id/status — builder confirms/completes; buyer cancels. */
export const updateVisitStatus = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const input = statusSchema.parse(req.body);

    const visit = await SiteVisit.findById(id);
    if (!visit) throw ApiError.notFound('Site visit not found');

    const isBuyer = String(visit.buyerId) === String(req.user._id);
    const isBuilder = String(visit.builderId) === String(req.user._id);
    const isAgent = req.user.role === 'agent' && String(visit.agentId ?? '') === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isBuyer && !isBuilder && !isAgent && !isAdmin) {
      throw ApiError.forbidden('You cannot update this site visit');
    }

    const allowed: Record<string, string[]> = {
      requested: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    // Authorisation is checked BEFORE any state validation, so an unauthorised
    // caller always gets 403 rather than a 400 that leaks the visit's state.
    if (input.status === 'completed' && !isBuilder && !isAdmin) {
      throw ApiError.forbidden('Only the builder can mark a visit completed');
    }
    if (input.status === 'confirmed' && !isBuilder && !isAdmin) {
      throw ApiError.forbidden('Only the builder can confirm a site visit');
    }

    // Validate the transition BEFORE any money moves. Refunding first and
    // saving later would leave the gateway refunded while the document still
    // says `paid` if the write failed, allowing a second refund.
    if (visit.status === input.status) throw ApiError.badRequest(`Visit is already ${visit.status}`);
    if (!allowed[visit.status]?.includes(input.status)) {
      throw ApiError.badRequest(`Cannot move a ${visit.status} visit to ${input.status}`);
    }

    if (input.status === 'confirmed' && visit.paymentStatus === 'pending') {
      throw ApiError.badRequest('Complete the visit charge payment before confirming this visit');
    }

    if (input.status === 'cancelled') {
      // Refund rule: a paid visit charge is 100% refundable on cancellation.
      if (visit.paymentStatus === 'paid' && visit.payment?.paymentId) {
        const refund = await refundPayment({
          paymentId: visit.payment.paymentId,
          amount: visit.visitCharge,
          notes: { reason: 'site_visit_cancelled', visitId: String(visit._id) },
        });
        visit.payment = { ...visit.payment, refundId: refund.refundId };
        visit.paymentStatus = 'refunded';
      }
      visit.cancellationReason = input.cancellationReason;
    }

    visit.status = input.status;
    // `builderNotes` is a builder-only field; a buyer must not write into it.
    if (input.notes && (isBuilder || isAdmin)) visit.builderNotes = input.notes;
    await visit.save();

    if (input.status === 'completed') {
      await Flat.updateOne({ _id: visit.flatId }, { $inc: { visitCount: 1 } });
    }

    const counterpart = isBuilder || isAgent ? visit.buyerId : visit.builderId;
    const event =
      input.status === 'confirmed'
        ? 'site_visit_confirmed'
        : input.status === 'cancelled'
          ? 'site_visit_cancelled'
          : 'site_visit_completed';

    await notifySafe({
      recipientId: String(counterpart),
      event,
      title: `Site visit ${input.status}`,
      body: `Your site visit on ${visit.slot.date.toDateString()} at ${visit.slot.time} is now ${input.status}.`,
      email: { subject: `Flat Town — site visit ${input.status}`, cta: { label: 'Open dashboard', url: '/buyer/visits' } },
      data: { visitId: String(visit._id) },
    });

    return sendOk(res, `Site visit ${input.status}`, { visit: shape(visit.toObject() as unknown as Record<string, unknown>) });
  } catch (error) {
    return next(error);
  }
};

/** GET /visits — role aware list. */
export const listVisits = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const schema = z.object({
      status: z.string().optional(),
      scope: z.enum(['mine', 'builder', 'agent', 'all']).default('mine'),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = {};
    if (query.scope === 'all') {
      if (req.user.role !== 'admin') throw ApiError.forbidden('Admin access required');
    } else if (query.scope === 'builder') {
      filter.builderId = req.user._id;
    } else if (query.scope === 'agent') {
      filter.agentId = req.user._id;
    } else {
      filter.buyerId = req.user._id;
    }
    if (query.status) filter.status = { $in: query.status.split(',') };
    if (query.from || query.to) {
      filter['slot.date'] = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }

    const [visits, total] = await Promise.all([
      SiteVisit.find(filter)
        .populate('flatId', 'title bhk totalPrice tier images visitCharge tokenAmount')
        .populate('projectId', 'projectName slug city locality isRERAVerified')
        .populate('builderId', 'name companyName avatar rating isRERAVerified')
        .populate('buyerId', 'name phone avatar email')
        .populate('agentId', 'name phone avatar')
        .sort({ 'slot.date': 1, createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      SiteVisit.countDocuments(filter),
    ]);

    const items = visits.map((v) => ({
      id: String(v._id),
      reference: v.reference,
      status: v.status,
      slot: v.slot,
      visitCharge: v.visitCharge,
      paymentStatus: v.paymentStatus,
      payment: v.payment,
      requirements: v.requirements,
      loanAssistanceRequired: v.loanAssistanceRequired,
      visitorCount: v.visitorCount,
      builderNotes: v.builderNotes,
      cancellationReason: v.cancellationReason,
      bookingId: v.bookingId,
      flat: v.flatId,
      project: v.projectId,
      builder: v.builderId,
      buyer: v.buyerId,
      agent: v.agentId,
      createdAt: v.createdAt,
    }));

    return sendOk(res, 'Site visits fetched successfully', items, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/** GET /visits/:id */
export const getVisit = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const visit = await SiteVisit.findById(id)
      .populate('flatId', 'title bhk totalPrice tier images visitCharge tokenAmount commissionPercent')
      .populate('projectId', 'projectName slug city locality isRERAVerified fullAddress geo')
      .populate('builderId', 'name companyName avatar rating isRERAVerified phone email')
      .populate('buyerId', 'name phone avatar email')
      .populate('agentId', 'name phone avatar')
      .lean();
    if (!visit) throw ApiError.notFound('Site visit not found');

    const allowed = [visit.buyerId, visit.builderId, visit.agentId].some(
      (u) => String(u?._id ?? '') === String(currentUser(req)._id),
    );
    if (!allowed && req.user.role !== 'admin') throw ApiError.forbidden('You cannot view this site visit');

    return sendOk(res, 'Site visit fetched successfully', shape(visit as unknown as Record<string, unknown>));
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /visits/availability?flatId=&date= — bookable slots.
 *
 * `date` is OPTIONAL. The site-visit modal renders a rolling 14-day picker, so
 * it asks for availability once rather than refetching per day. It was required
 * before, which meant the web client (which only sends `flatId`) always received
 * a 422 and silently showed every slot as free.
 *
 * Each returned slot carries its own `date` so the client can group by day.
 */
export const getAvailability = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const schema = z.object({
      flatId: z.string().refine(Types.ObjectId.isValid, 'Invalid flat id'),
      date: z.coerce.date().optional(),
      days: z.coerce.number().int().min(1).max(30).default(14),
    });
    const { flatId, date, days } = schema.parse(req.query);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const range = date ? [startOfDay(date)] : Array.from({ length: days }, (_, i) => addDays(start, i));

    const visits = await SiteVisit.find({
      flatId,
      'slot.date': { $gte: range[0], $lte: range[range.length - 1] },
      status: { $in: ['requested', 'confirmed'] },
    })
      .select('slot.date slot.time')
      .lean();

    const taken = new Set(
      visits.map((v) => `${startOfDay(v.slot.date).toISOString()}|${v.slot.time}`),
    );

    const slots = range.flatMap((day) =>
      VISIT_SLOTS.map((time) => ({
        date: startOfDay(day).toISOString(),
        time,
        available: !taken.has(`${startOfDay(day).toISOString()}|${time}`),
      })),
    );

    return sendOk(res, 'Slot availability fetched', {
      dates: range.map((d) => startOfDay(d).toISOString()),
      slots,
      visitChargeContext: usingMockGateway() ? { gateway: 'mock' } : { gateway: 'razorpay' },
    });
  } catch (error) {
    return next(error);
  }
};
