import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Amenity } from '../models/Amenity';
import { AuditLog } from '../models/AuditLog';
import { Booking } from '../models/Booking';
import { Dispute } from '../models/Dispute';
import { Flat } from '../models/Flat';
import { Inquiry } from '../models/Inquiry';
import { LoanApplication } from '../models/LoanApplication';
import { LoanPartner } from '../models/LoanPartner';
import { PlatformConfig } from '../models/PlatformConfig';
import { Project } from '../models/Project';
import { Review } from '../models/Review';
import { SiteVisit } from '../models/SiteVisit';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendCreated, sendOk, withIds } from '../utils/response';
import { getPricingContext, setPricingContext } from '../utils/pricingContext';
import { sanitiseThresholds } from '../utils/tierCalculator';
import {
  CACHE_NAMESPACES,
  invalidateAllDiscovery,
  invalidateConfig,
  invalidateProject,
  invalidateVerification,
} from '../services/cacheInvalidation';
import { notifySafe } from '../services/notification.service';
import { recalculateBuilderRating } from './reviews.controller';
import { audit } from './audit.util';
import { money } from '../services/email.service';

const idParam = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid id') });
const builderParam = z.object({
  builderId: z.string().refine(Types.ObjectId.isValid, 'Invalid builder id'),
});

const requireAdmin = (req: Request) => {
  if (!req.user || req.user.role !== 'admin') throw ApiError.forbidden('Admin access required');
};

/* --------------------------- verification queue --------------------------- */

/** GET /admin/verification-queue — builders awaiting KYC / RERA review. */
export const getVerificationQueue = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      type: z.enum(['all', 'kyc', 'rera', 'project']).default('all'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);

    const [kycPending, reraPending, projectsPending] = await Promise.all([
      User.find({ role: 'builder', isAdminVerified: false, 'kycDocs.0': { $exists: true } })
        .select('name email phone companyName reraNumber kycStatus kycDocs isRERAVerified verificationRequestedAt location createdAt')
        .sort({ verificationRequestedAt: 1, createdAt: 1 })
        .lean(),
      User.find({ role: 'builder', isAdminVerified: true, isRERAVerified: false, reraNumber: { $exists: true } })
        .select('name email phone companyName reraNumber reraState isRERAVerified kycStatus location createdAt')
        .sort({ verificationRequestedAt: 1, createdAt: 1 })
        .lean(),
      Project.find({ isApproved: false })
        .populate('builderId', 'name email companyName isAdminVerified isRERAVerified kycStatus')
        .populate('builderName')
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const data = {
      kyc:
        query.type === 'all' || query.type === 'kyc'
          ? kycPending.map((u) => ({
              id: String(u._id),
              name: u.name,
              email: u.email,
              phone: u.phone,
              companyName: u.companyName,
              kycStatus: u.kycStatus,
              kycDocs: u.kycDocs,
              isAdminVerified: u.isAdminVerified,
              location: u.location,
              submittedAt: u.verificationRequestedAt,
            }))
          : [],
      rera:
        query.type === 'all' || query.type === 'rera'
          ? reraPending.map((u) => ({
              id: String(u._id),
              name: u.name,
              email: u.email,
              phone: u.phone,
              companyName: u.companyName,
              reraNumber: u.reraNumber,
              reraState: u.reraState,
              isRERAVerified: u.isRERAVerified,
              kycStatus: u.kycStatus,
              submittedAt: u.verificationRequestedAt,
            }))
          : [],
      projects:
        query.type === 'all' || query.type === 'project'
          ? projectsPending.map((p) => ({
              id: String(p._id),
              projectName: p.projectName,
              city: p.city,
              locality: p.locality,
              status: p.status,
              reraNumber: p.reraNumber,
              isRERAVerified: p.isRERAVerified,
              builderName: p.builderName,
              builder: p.builderId,
              submittedAt: p.createdAt,
            }))
          : [],
    };

    return sendOk(res, 'Verification queue fetched successfully', data, {
      counts: { kyc: data.kyc.length, rera: data.rera.length, projects: data.projects.length },
      page: query.page,
      limit: query.limit,
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /admin/verify-kyc/:builderId */
export const verifyKyc = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const { builderId } = builderParam.parse(req.params);
    const input = z
      .object({
        approved: z.boolean(),
        rejectionReason: z.string().trim().max(300).optional(),
      })
      .parse(req.body);

    const builder = await User.findById(builderId);
    if (!builder || builder.role !== 'builder') throw ApiError.notFound('Builder not found');

    if (input.approved) {
      builder.isAdminVerified = true;
      builder.isVerified = true;
      builder.verifiedAt = new Date();
      builder.kycStatus = 'approved';
      (builder.kycDocs ?? []).forEach((doc) => {
        doc.verified = true;
      });
    } else {
      builder.isAdminVerified = false;
      builder.isVerified = false;
      builder.kycStatus = 'rejected';
    }
    await builder.save();

    await audit({
      action: input.approved ? 'kyc_approved' : 'kyc_rejected',
      entity: 'user',
      entityId: String(builder._id),
      actorId: String(req.user!._id),
      metadata: { reason: input.rejectionReason },
      req,
    });
    await invalidateVerification(builder);

    await notifySafe({
      recipientId: String(builder._id),
      event: 'kyc_verified',
      title: input.approved ? 'KYC verified' : 'KYC could not be verified',
      body: input.approved
        ? 'Your KYC has been verified. You can now publish projects on Flat Town.'
        : `Your KYC was rejected: ${input.rejectionReason ?? 'documents could not be verified'}`,
      email: { subject: 'Flat Town — KYC update', cta: { label: 'Open dashboard', url: '/builder' } },
    });

    return sendOk(res, input.approved ? 'Builder KYC verified' : 'Builder KYC rejected', { builder });
  } catch (error) {
    return next(error);
  }
};

/** PUT /admin/verify-rera/:builderId — the ONLY route that may set RERA verified. */
export const verifyRera = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const { builderId } = builderParam.parse(req.params);
    const input = z
      .object({
        approved: z.boolean(),
        reason: z.string().trim().max(300).optional(),
        // Optional reference to the state RERA registry record consulted.
        registryReference: z.string().trim().max(120).optional(),
        projectIds: z.array(z.string()).optional(),
      })
      .parse(req.body);

    const builder = await User.findById(builderId);
    if (!builder || builder.role !== 'builder') throw ApiError.notFound('Builder not found');
    if (!builder.reraNumber) throw ApiError.badRequest('This builder has not submitted a RERA number yet');

    builder.isRERAVerified = input.approved;
    if (input.approved) {
      builder.reraVerifiedAt = new Date();
      builder.reraRejectionReason = undefined;
    } else {
      builder.reraRejectionReason = input.reason ?? 'RERA registration could not be confirmed';
      builder.reraVerifiedAt = undefined;
    }
    await builder.save({ validateBeforeSave: false });

    const projectFilter: Record<string, unknown> = { builderId: builder._id };
    if (input.projectIds?.length) projectFilter._id = { $in: input.projectIds };
    await Project.updateMany(projectFilter, {
      $set: input.approved
        ? { isRERAVerified: true, reraVerifiedAt: new Date() }
        : { isRERAVerified: false, reraVerifiedAt: undefined },
    });

    await audit({
      action: input.approved ? 'rera_verified' : 'rera_rejected',
      entity: 'user',
      entityId: String(builder._id),
      actorId: String(req.user!._id),
      metadata: { reraNumber: builder.reraNumber, registryReference: input.registryReference },
      req,
    });

    // RERA status drives priority ranking — every discovery cache entry is stale now.
    await invalidateAllDiscovery();

    await notifySafe({
      recipientId: String(builder._id),
      event: 'rera_verified',
      title: input.approved ? 'RERA verified' : 'RERA verification failed',
      body: input.approved
        ? `Your RERA registration ${builder.reraNumber} is verified. Your projects now rank ahead of unverified listings.`
        : `We could not verify RERA ${builder.reraNumber}: ${builder.reraRejectionReason}`,
      email: { subject: 'Flat Town — RERA verification', cta: { label: 'Open dashboard', url: '/builder' } },
    });

    return sendOk(res, input.approved ? 'RERA verified successfully' : 'RERA verification rejected', {
      builder: { id: String(builder._id), isRERAVerified: builder.isRERAVerified, reraNumber: builder.reraNumber },
      projectsUpdated: input.projectIds?.length ?? 'all',
    });
  } catch (error) {
    return next(error);
  }
};

/* ------------------------------- projects --------------------------------- */

/**
 * PUT /admin/approve-project/:id
 *
 * Admin-only gate for a project's public visibility. `isApproved` is the only
 * field a builder cannot set for themselves, so approving here is what makes a
 * project's flats appear in public discovery.
 */
export const approveProject = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<unknown> => {
  try {
    requireAdmin(req);
    const { id } = idParam.parse(req.params);
    const input = z
      .object({
        approved: z.boolean().default(true),
        rejectionReason: z.string().trim().max(500).optional(),
      })
      .parse(req.body ?? {});

    const project = await Project.findById(id);
    if (!project) throw ApiError.notFound('Project not found');

    if (project.isApproved === input.approved) {
      return sendOk(res, 'Project approval state unchanged', {
        project: { id: String(project._id), isApproved: project.isApproved },
      });
    }

    project.isApproved = input.approved;
    if (input.approved) {
      project.approvedAt = new Date();
      project.approvedBy = req.user!._id;
      project.rejectedReason = undefined;
    } else {
      project.approvedAt = undefined;
      project.approvedBy = undefined;
      project.rejectedReason = input.rejectionReason ?? 'Project rejected by admin review';
    }
    await project.save();

    await audit({
      action: input.approved ? 'project_approved' : 'project_rejected',
      entity: 'project',
      entityId: String(project._id),
      actorId: String(req.user!._id),
      actorRole: 'admin',
      metadata: { projectName: project.projectName, reason: project.rejectedReason },
      req,
    });

    // Approval gates public discovery, so every listing cache entry is stale.
    await invalidateAllDiscovery();
    await invalidateProject(project);

    await notifySafe({
      recipientId: String(project.builderId),
      event: 'project_approved',
      title: input.approved ? 'Project approved' : 'Project rejected',
      body: input.approved
        ? `${project.projectName} is now live on Flat Town and its flats are visible to buyers.`
        : `${project.projectName} was not approved: ${project.rejectedReason}`,
      email: { subject: 'Flat Town — project review', cta: { label: 'Open dashboard', url: '/builder' } },
    });

    return sendOk(res, input.approved ? 'Project approved successfully' : 'Project rejected', {
      project: {
        id: String(project._id),
        projectName: project.projectName,
        isApproved: project.isApproved,
        approvedAt: project.approvedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/* --------------------------------- escrow --------------------------------- */

/** GET /admin/escrow — escrow ledger across all bookings. */
export const getEscrowLedger = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = {};
    if (query.status) filter.escrowStatus = { $in: query.status.split(',') };

    const [bookings, total, totals] = await Promise.all([
      Booking.find(filter)
        .populate('buyerId', 'name email phone avatar')
        .populate('builderId', 'name email companyName kycStatus isAdminVerified')
        .populate('agentId', 'name email phone')
        .populate('projectId', 'projectName city locality')
        .populate('flatId', 'title bhk totalPrice tier images')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Booking.countDocuments(filter),
      Booking.aggregate([
        {
          $group: {
            _id: null,
            heldInEscrow: { $sum: '$escrow.heldAmount' },
            released: { $sum: '$escrow.releasedAmount' },
            refunded: { $sum: '$escrow.refundedAmount' },
            commission: { $sum: '$commissionAmount' },
            tokens: { $sum: '$tokenAmount' },
          },
        },
      ]),
    ]);

    const items = bookings.map((b) => ({
      id: String(b._id),
      reference: b.reference,
      escrowStatus: b.escrowStatus,
      loanStatus: b.loanStatus,
      totalPrice: b.totalPrice,
      tokenAmount: b.tokenAmount,
      commissionPercent: b.commissionPercent,
      commissionAmount: b.commissionAmount,
      escrow: b.escrow,
      documents: b.documents,
      documentsRequested: b.documentsRequested,
      allDocumentsVerified: (b.documentsRequested?.length ?? 0) > 0
        ? b.documentsRequested.every((r) => b.documents.some((d) => d.type === r.type && d.verified))
        : false,
      payment: b.payment,
      buyer: b.buyerId,
      builder: b.builderId,
      agent: b.agentId,
      project: b.projectId,
      flat: b.flatId,
      createdAt: b.createdAt,
    }));

    return sendOk(
      res,
      'Escrow ledger fetched successfully',
      items,
      {
        ...paginationMeta(query.page, query.limit, total),
        totals: totals[0] ?? { heldInEscrow: 0, released: 0, refunded: 0, commission: 0, tokens: 0 },
      },
    );
  } catch (error) {
    return next(error);
  }
};

/** GET /admin/revenue — visit revenue + token commission reporting. */
export const getRevenue = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      groupBy: z.enum(['day', 'month']).default('month'),
    });
    const query = schema.parse(req.query);

    const dateRange: Record<string, unknown> = {};
    if (query.from) dateRange.$gte = query.from;
    if (query.to) dateRange.$lte = query.to;
    const range = Object.keys(dateRange).length ? dateRange : undefined;

    const [visitAgg, bookingAgg, releaseAgg, refundAgg, projectAgg, daily] = await Promise.all([
      SiteVisit.aggregate([
        { $match: { paymentStatus: 'paid', ...(range ? { createdAt: range } : {}) } },
        { $group: { _id: null, revenue: { $sum: '$visitCharge' }, visits: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { 'payment.paymentId': { $exists: true }, ...(range ? { createdAt: range } : {}) } },
        {
          $group: {
            _id: null,
            commission: { $sum: '$commissionAmount' },
            tokens: { $sum: '$tokenAmount' },
            bookings: { $sum: 1 },
            propertyValue: { $sum: '$totalPrice' },
          },
        },
      ]),
      Booking.aggregate([
        { $match: { escrowStatus: 'completed', ...(range ? { 'escrow.releasedAt': range } : {}) } },
        { $group: { _id: null, releasedToBuilders: { $sum: '$escrow.releasedAmount' } } },
      ]),
      Booking.aggregate([
        { $match: { escrowStatus: 'refunded', ...(range ? { 'refund.at': range } : {}) } },
        { $group: { _id: null, refunded: { $sum: '$refund.amount' }, count: { $sum: 1 } } },
      ]),
      Project.aggregate([
        { $match: { isApproved: true } },
        { $group: { _id: '$city', projects: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        {
          $match: { 'payment.paymentId': { $exists: true }, ...(range ? { createdAt: range } : {}) },
        },
        {
          $group: {
            _id: {
              $dateToString: query.groupBy === 'day' ? { format: '%Y-%m-%d', date: '$createdAt' } : { format: '%Y-%m', date: '$createdAt' },
            },
            commission: { $sum: '$commissionAmount' },
            tokens: { $sum: '$tokenAmount' },
            bookings: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 24 },
      ]),
    ]);

    const visitRevenue = visitAgg[0]?.revenue ?? 0;
    const tokenCommission = bookingAgg[0]?.commission ?? 0;
    const loanLeads = await LoanApplication.countDocuments({ status: { $in: ['assigned', 'approved', 'disbursed'] } });
    const loanFeeAgg = await Booking.aggregate([
      { $match: { 'loan.leadFeeAmount': { $gt: 0 } } },
      { $group: { _id: null, loanLeadFees: { $sum: '$loan.leadFeeAmount' } } },
    ]);

    return sendOk(res, 'Revenue report fetched successfully', {
      period: { from: query.from ?? null, to: query.to ?? null, groupBy: query.groupBy },
      siteVisitRevenue: {
        gross: visitRevenue,
        paidVisits: visitAgg[0]?.visits ?? 0,
        refunded: refundAgg[0]?.refunded ?? 0,
        note: 'Visit charges are 100% refundable on booking and are credited to the platform.',
      },
      tokenCommission: {
        amount: tokenCommission,
        tokensCollected: bookingAgg[0]?.tokens ?? 0,
        bookings: bookingAgg[0]?.bookings ?? 0,
        basis: 'booking_token',
        percent: getPricingContext().commissionPercent,
        note: 'Commission is calculated on the booking token only — never on the property price.',
      },
      escrow: {
        releasedToBuilders: releaseAgg[0]?.releasedToBuilders ?? 0,
        refunded: refundAgg[0]?.refunded ?? 0,
        refundCount: refundAgg[0]?.count ?? 0,
        pending: 0,
      },
      loanAssistance: {
        convertedLeads: loanLeads,
        leadFees: loanFeeAgg[0]?.loanLeadFees ?? 0,
      },
      propertyValueOnBookedFlats: bookingAgg[0]?.propertyValue ?? 0,
      totalPlatformRevenue: visitRevenue + tokenCommission + (loanFeeAgg[0]?.loanLeadFees ?? 0),
      series: daily.reverse(),
      byCity: projectAgg.map((p) => ({ city: p._id, projects: p.projects })),
    });
  } catch (error) {
    return next(error);
  }
};

/* ------------------------------- configuration ---------------------------- */

/** GET /admin/commission-config */
export const getConfig = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const config = await PlatformConfig.findOne({ key: 'default' }).lean();
    const ctx = getPricingContext();
    return sendOk(res, 'Platform configuration fetched successfully', {
      config: config ?? null,
      effective: ctx,
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /admin/commission-config — tiers, commission %, agent split, tokens, visits. */
export const updateConfig = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z
      .object({
        tiers: z
          .object({
            budgetMax: z.coerce.number().min(1, 'Budget threshold must be positive'),
            midMax: z.coerce.number().min(1, 'Mid threshold must be positive'),
          })
          .optional(),
        commission: z
          .object({
            bookingTokenPercent: z.coerce.number().min(0).max(100).optional(),
            agentPlatformPercent: z.coerce.number().min(0).max(100).optional(),
            agentAgentPercent: z.coerce.number().min(0).max(100).optional(),
            allowPerAgentOverride: z.boolean().optional(),
          })
          .optional(),
        visits: z
          .object({
            freeVisitsForVerifiedBuilders: z.coerce.number().int().min(0).max(50).optional(),
            freeVisitsForAll: z.coerce.number().int().min(0).max(50).optional(),
            allowedCharges: z.array(z.coerce.number().min(0)).max(5).optional(),
            refundableOnBooking: z.boolean().optional(),
          })
          .optional(),
        booking: z
          .object({
            defaultTokenAmount: z.coerce.number().min(1000).optional(),
            allowedTokenAmounts: z.array(z.coerce.number().min(1000)).max(12).optional(),
            escrowAccountId: z.string().trim().min(3).max(60).optional(),
            requireDocumentsBeforeRelease: z.boolean().optional(),
          })
          .optional(),
        loan: z
          .object({
            enabled: z.boolean().optional(),
            defaultLeadFee: z.coerce.number().min(0).optional(),
          })
          .optional(),
      })
      .refine((v) => Object.keys(v).length > 0, 'Provide at least one configuration section')
      .refine(
        (v) => !v.tiers || v.tiers.midMax > v.tiers.budgetMax,
        { message: 'Mid threshold must be greater than the budget threshold', path: ['tiers'] },
      );

    const input = schema.parse(req.body);

    const config =
      (await PlatformConfig.findOne({ key: 'default' })) ?? (await PlatformConfig.create({ key: 'default' }));

    if (input.tiers) {
      const thresholds = sanitiseThresholds({ budget: input.tiers.budgetMax, mid: input.tiers.midMax });
      config.tiers.budgetMax = thresholds.budget;
      config.tiers.midMax = thresholds.mid;
    }
    if (input.commission) {
      for (const [key, value] of Object.entries(input.commission)) {
        if (value !== undefined) (config.commission as unknown as Record<string, unknown>)[key] = value;
      }
      // Keep the two halves of the agent split consistent.
      const platform = input.commission.agentPlatformPercent ?? config.commission.agentPlatformPercent;
      config.commission.agentAgentPercent = Math.max(0, 100 - platform);
    }
    if (input.visits) {
      for (const [key, value] of Object.entries(input.visits)) {
        if (value !== undefined) (config.visits as unknown as Record<string, unknown>)[key] = value;
      }
    }
    if (input.booking) {
      for (const [key, value] of Object.entries(input.booking)) {
        if (value !== undefined) (config.booking as unknown as Record<string, unknown>)[key] = value;
      }
    }
    if (input.loan) {
      for (const [key, value] of Object.entries(input.loan)) {
        if (value !== undefined) (config.loan as unknown as Record<string, unknown>)[key] = value;
      }
    }
    config.updatedBy = req.user!._id;
    await config.save();

    // Refresh the in-memory pricing context used by Mongoose validators.
    setPricingContext({
      thresholds: { budget: config.tiers.budgetMax, mid: config.tiers.midMax },
      commissionPercent: config.commission.bookingTokenPercent,
      agentPlatformPercent: config.commission.agentPlatformPercent,
      agentPercent: config.commission.agentAgentPercent,
      defaultTokenAmount: config.booking.defaultTokenAmount,
    });

    // Tier thresholds and commission changes alter existing flat classifications
    // and future bookings, so recalculate and purge the discovery cache.
    if (input.tiers) {
      const { recalculateAllProjectStats } = await import('../services/project.service');
      const flats = await Flat.find({}).select('_id sizeSqft pricePerSqft floorRise parkingCharges tier totalPrice');
      // `save()` runs the pre-validate hook, which recomputes totalPrice + tier
      // from the new thresholds. Calling `validate()` as well would validate the
      // same document twice concurrently.
      for (const flat of flats) {
        await flat.save();
      }
      await recalculateAllProjectStats();
    }

    await audit({
      action: 'platform_config_updated',
      entity: 'config',
      entityId: String(config._id),
      actorId: String(req.user!._id),
      metadata: input as Record<string, unknown>,
      req,
    });
    await invalidateConfig();
    await invalidateAllDiscovery();

    return sendOk(res, 'Platform configuration updated', {
      config,
      effective: getPricingContext(),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PUT /admin/agents/:id/commission — per-agent commission share.
 *
 * The agent share is a financial term, so only an admin may set it. Agents
 * cannot change their own rate through PUT /auth/profile. The value is only
 * honoured at escrow release when `commission.allowPerAgentOverride` is true.
 * Passing `null` clears the override so the global agentPlatformPercent applies.
 */
export const setAgentCommissionShare = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<unknown> => {
  try {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid agent id') }).parse(req.params);
    const input = z
      .object({
        // The AGENT's share of the commission, in percent.
        agentSharePercent: z.coerce.number().min(0).max(100).nullable(),
        enableOverride: z.boolean().default(true),
      })
      .parse(req.body ?? {});

    const agent = await User.findOne({ _id: id, role: 'agent' });
    if (!agent) throw ApiError.notFound('Agent not found');

    agent.commissionSharePercent = input.agentSharePercent ?? undefined;
    await agent.save();

    const config =
      (await PlatformConfig.findOne({ key: 'default' })) ?? (await PlatformConfig.create({ key: 'default' }));
    // Enabling overrides while the agent has no explicit rate would leave the
    // global split in place, so require a concrete value to enable it.
    const enabling = input.enableOverride && input.agentSharePercent !== null;
    config.commission.allowPerAgentOverride = enabling;
    config.updatedBy = req.user!._id;
    await config.save();

    await audit({
      action: 'agent_commission_updated',
      entity: 'user',
      entityId: String(agent._id),
      actorId: String(req.user!._id),
      actorRole: req.user!.role,
      metadata: {
        agentSharePercent: input.agentSharePercent,
        allowPerAgentOverride: config.commission.allowPerAgentOverride,
      },
      req,
    });

    return sendOk(res, 'Agent commission share updated', {
      agent: { id: String(agent._id), name: agent.name, commissionSharePercent: agent.commissionSharePercent },
      effective: getPricingContext(),
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /admin/audit-logs */
export const getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      entity: z.string().optional(),
      action: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = {};
    if (query.entity) filter.entity = query.entity;
    if (query.action) filter.action = new RegExp(query.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorId', 'name role')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return sendOk(res, 'Audit logs fetched successfully', logs, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/* --------------------------------- disputes ------------------------------- */

/** GET /admin/disputes */
export const listDisputes = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = { $in: query.status.split(',') };

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate('raisedBy', 'name role phone email')
        .populate('against', 'name role phone email')
        .populate('bookingId', 'reference escrowStatus totalPrice tokenAmount')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Dispute.countDocuments(filter),
    ]);

    return sendOk(res, 'Disputes fetched successfully', disputes, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/** POST /disputes — raised by any authenticated user. */
export const createDispute = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const schema = z.object({
      subject: z.string().trim().min(4, 'Subject is required').max(160),
      description: z.string().trim().min(20, 'Please describe the issue in at least 20 characters').max(3000),
      category: z.enum(['payment', 'escrow', 'documents', 'site_visit', 'misrepresentation', 'other']).default('other'),
      bookingId: z.string().refine(Types.ObjectId.isValid, 'Invalid booking id').optional(),
      siteVisitId: z.string().refine(Types.ObjectId.isValid, 'Invalid site visit id').optional(),
      flatId: z.string().refine(Types.ObjectId.isValid, 'Invalid flat id').optional(),
      against: z.string().refine(Types.ObjectId.isValid, 'Invalid user id').optional(),
    });
    const input = schema.parse(req.body);

    const dispute = await Dispute.create({
      raisedBy: req.user._id,
      raisedByRole: req.user.role,
      against: input.against,
      bookingId: input.bookingId,
      siteVisitId: input.siteVisitId,
      flatId: input.flatId,
      subject: input.subject,
      description: input.description,
      category: input.category,
    });

    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    await Promise.all(
      admins.map((a) =>
        notifySafe({
          recipientId: String(a._id),
          event: 'inquiry_created',
          title: 'New dispute raised',
          body: `${input.subject} — ${input.category.replace('_', ' ')}`,
          inAppOnly: true,
          data: { disputeId: String(dispute._id) },
        }),
      ),
    );

    return sendCreated(res, 'Dispute registered. Our team will reach out shortly.', { dispute });
  } catch (error) {
    return next(error);
  }
};

/** PUT /admin/disputes/:id */
export const resolveDispute = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const { id } = idParam.parse(req.params);
    const input = z
      .object({
        status: z.enum(['open', 'under_review', 'resolved', 'rejected']),
        resolution: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);

    const dispute = await Dispute.findById(id);
    if (!dispute) throw ApiError.notFound('Dispute not found');

    dispute.status = input.status;
    if (input.resolution) dispute.resolution = input.resolution;
    if (['resolved', 'rejected'].includes(input.status)) {
      dispute.resolvedBy = req.user!._id;
      dispute.resolvedAt = new Date();
    }
    await dispute.save();

    await notifySafe({
      recipientId: String(dispute.raisedBy),
      event: 'inquiry_created',
      title: `Dispute ${input.status.replace('_', ' ')}`,
      body: input.resolution ?? `Your dispute "${dispute.subject}" is now ${input.status.replace('_', ' ')}.`,
      data: { disputeId: String(dispute._id) },
    });

    return sendOk(res, 'Dispute updated', { dispute });
  } catch (error) {
    return next(error);
  }
};

/* ---------------------------------- loans --------------------------------- */

/** GET /admin/loan-partners */
export const listLoanPartnersAdmin = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const partners = await LoanPartner.find({}).sort({ name: 1 }).lean();
    return sendOk(res, 'Loan partners fetched successfully', partners, { total: partners.length });
  } catch (error) {
    return next(error);
  }
};

/** POST /admin/loan-partners */
export const createLoanPartner = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      name: z.string().trim().min(2).max(120),
      code: z.string().trim().min(2).max(20).toUpperCase(),
      logoUrl: z.string().url().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().trim().max(20).optional(),
      interestRateMin: z.coerce.number().min(0).max(30).default(8.5),
      interestRateMax: z.coerce.number().min(0).max(30).default(11.5),
      maxTenureYears: z.coerce.number().min(1).max(40).default(20),
      minLoanAmount: z.coerce.number().min(0).default(500000),
      maxLoanAmount: z.coerce.number().min(0).default(100000000),
      leadFeeAmount: z.coerce.number().min(0).default(5000),
      avgDisbursalDays: z.coerce.number().min(1).max(180).default(45),
    });
    const input = schema.parse(req.body);
    const partner = await LoanPartner.create({ ...input, isActive: true });
    return sendCreated(res, 'Loan partner created successfully', { partner });
  } catch (error) {
    return next(error);
  }
};

/** PUT /admin/loan-partners/:id */
export const updateLoanPartner = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const { id } = idParam.parse(req.params);
    const input = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        leadFeeAmount: z.coerce.number().min(0).optional(),
        isActive: z.boolean().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().trim().max(20).optional(),
        avgDisbursalDays: z.coerce.number().min(1).max(180).optional(),
      })
      .parse(req.body);

    const partner = await LoanPartner.findById(id);
    if (!partner) throw ApiError.notFound('Loan partner not found');
    Object.assign(partner, input);
    await partner.save();
    return sendOk(res, 'Loan partner updated', { partner });
  } catch (error) {
    return next(error);
  }
};

/** GET /admin/loan-applications */
export const listLoanApplicationsAdmin = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = { $in: query.status.split(',') };

    const [applications, total] = await Promise.all([
      LoanApplication.find(filter)
        .populate('buyerId', 'name email phone')
        .populate('flatId', 'title bhk totalPrice tier')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      LoanApplication.countDocuments(filter),
    ]);

    return sendOk(res, 'Loan applications fetched successfully', applications, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/** PUT /admin/loan-applications/:id — assign partner / decide. */
export const updateLoanApplication = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      status: z.enum(['applied', 'assigned', 'approved', 'rejected', 'disbursed']),
      partnerId: z.string().refine(Types.ObjectId.isValid, 'Invalid partner id').optional(),
      leadFeeAmount: z.coerce.number().min(0).optional(),
      decisionNote: z.string().trim().max(500).optional(),
    });
    const input = schema.parse(req.body);

    const application = await LoanApplication.findById(id);
    if (!application) throw ApiError.notFound('Loan application not found');

    if (input.partnerId) {
      const partner = await LoanPartner.findById(input.partnerId).lean();
      if (!partner) throw ApiError.notFound('Loan partner not found');
      application.partnerId = partner._id;
      application.partnerName = partner.name;
      application.leadFeeAmount = input.leadFeeAmount ?? partner.leadFeeAmount;
      if (application.status === 'applied') application.status = 'assigned';
    }
    if (input.status) application.status = input.status;
    if (input.decisionNote) application.decisionNote = input.decisionNote;
    application.decidedBy = req.user!._id;
    application.decidedAt = new Date();
    await application.save();

    await notifySafe({
      recipientId: String(application.buyerId),
      event: 'loan_status_changed',
      title: `Loan application ${application.status}`,
      body: application.partnerName
        ? `Your loan application is now with ${application.partnerName}.`
        : `Your loan application status is ${application.status}.`,
      data: { applicationId: String(application._id) },
    });

    return sendOk(res, 'Loan application updated', { application });
  } catch (error) {
    return next(error);
  }
};

/* -------------------------------- dashboard ------------------------------- */

/** GET /admin/dashboard */
export const getAdminDashboard = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      userCounts,
      projectCounts,
      flatAgg,
      bookingAgg,
      visitAgg,
      disputeCount,
      reviewPending,
      kycPending,
      reraPending,
      projectsPending,
      recentAudit,
    ] = await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Project.aggregate([{ $group: { _id: '$isApproved', count: { $sum: 1 } } }]),
      Flat.aggregate([
        { $group: { _id: '$tier', count: { $sum: 1 }, available: { $sum: { $cond: ['$isAvailable', 1, 0] } } } },
      ]),
      Booking.aggregate([{ $group: { _id: '$escrowStatus', count: { $sum: 1 }, amount: { $sum: '$tokenAmount' } } }]),
      SiteVisit.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Dispute.countDocuments({ status: { $in: ['open', 'under_review'] } }),
      Review.countDocuments({ 'moderation.status': 'pending' }),
      User.countDocuments({ role: 'builder', isAdminVerified: false, 'kycDocs.0': { $exists: true } }),
      User.countDocuments({ role: 'builder', isAdminVerified: true, isRERAVerified: false, reraNumber: { $exists: true } }),
      Project.countDocuments({ isApproved: false }),
      AuditLog.find({ entity: { $in: ['escrow', 'payment'] } }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const [revenue, escrowTotals, newUsers30d] = await Promise.all([
      SiteVisit.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$visitCharge' } } },
      ]),
      Booking.aggregate([
        {
          $group: {
            _id: null,
            held: { $sum: '$escrow.heldAmount' },
            commission: { $sum: '$commissionAmount' },
            released: { $sum: '$escrow.releasedAmount' },
          },
        },
      ]),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);

    const roleCounts = userCounts.reduce<Record<string, number>>((acc, r) => {
      acc[String(r._id)] = r.count;
      return acc;
    }, {});

    return sendOk(res, 'Admin dashboard fetched successfully', {
      users: { ...roleCounts, newIn30Days: newUsers30d },
      projects: {
        approved: projectCounts.find((p) => p._id === true)?.count ?? 0,
        pending: projectCounts.find((p) => p._id === false)?.count ?? 0,
      },
      flats: {
        total: flatAgg.reduce((acc, f) => acc + f.count, 0),
        available: flatAgg.reduce((acc, f) => acc + f.available, 0),
        byTier: flatAgg.reduce<Record<string, number>>((acc, f) => {
          acc[String(f._id)] = f.count;
          return acc;
        }, {}),
      },
      bookings: bookingAgg.reduce<Record<string, { count: number; amount: number }>>((acc, b) => {
        acc[String(b._id)] = { count: b.count, amount: b.amount };
        return acc;
      }, {}),
      visits: visitAgg.reduce<Record<string, number>>((acc, v) => {
        acc[String(v._id)] = v.count;
        return acc;
      }, {}),
      queue: { kyc: kycPending, rera: reraPending, projects: projectsPending, disputes: disputeCount, reviews: reviewPending },
      revenue: {
        siteVisit: revenue[0]?.total ?? 0,
        tokenCommission: escrowTotals[0]?.commission ?? 0,
        releasedToBuilders: escrowTotals[0]?.released ?? 0,
        heldInEscrow: escrowTotals[0]?.held ?? 0,
        total: (revenue[0]?.total ?? 0) + (escrowTotals[0]?.commission ?? 0),
        formatted: {
          siteVisit: money(revenue[0]?.total ?? 0),
          tokenCommission: money(escrowTotals[0]?.commission ?? 0),
        },
      },
      recentFinancialActions: recentAudit,
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /admin/reviews — moderation queue. */
export const listReviewsForModeration = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = { 'moderation.status': query.status };
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('buyerId', 'name email avatar')
        .populate('builderId', 'name companyName')
        .populate('flatId', 'title bhk')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Review.countDocuments(filter),
    ]);

    return sendOk(res, 'Reviews fetched for moderation', reviews, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/** GET /admin/bookings — every booking across the platform. */
export const listAllBookings = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      escrowStatus: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = {};
    if (query.escrowStatus) filter.escrowStatus = { $in: query.escrowStatus.split(',') };

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('buyerId', 'name email phone')
        .populate('builderId', 'name companyName kycStatus')
        .populate('agentId', 'name')
        .populate('flatId', 'title bhk totalPrice tier')
        .populate('projectId', 'projectName city locality')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Booking.countDocuments(filter),
    ]);

    return sendOk(res, 'Bookings fetched successfully', bookings, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/** GET /admin/inquiries — all inquiries. */
export const listAllInquiries = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    requireAdmin(req);
    const schema = z.object({
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = { $in: query.status.split(',') };

    const [inquiries, total] = await Promise.all([
      Inquiry.find(filter)
        .populate('buyerId', 'name email phone')
        .populate('builderId', 'name companyName')
        .populate('flatId', 'title bhk totalPrice tier')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Inquiry.countDocuments(filter),
    ]);

    return sendOk(res, 'Inquiries fetched successfully', inquiries, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/** GET /admin/amenities — amenity master with usage stats. */
export const listAmenitiesAdmin = async (_req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const amenities = await Amenity.find({}).sort({ category: 1, sortOrder: 1 }).lean();
    const shaped = withIds(amenities as unknown as Array<Record<string, unknown>>);
    return sendOk(res, 'Amenities fetched successfully', shaped, {
      total: shaped.length,
      cacheNamespace: CACHE_NAMESPACES.amenities,
    });
  } catch (error) {
    return next(error);
  }
};

export { recalculateBuilderRating };
