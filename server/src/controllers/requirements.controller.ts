import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Requirement } from '../models/Requirement';
import { LoanPartner } from '../models/LoanPartner';
import { Booking } from '../models/Booking';
import { PlatformConfig } from '../models/PlatformConfig';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendCreated, sendOk } from '../utils/response';
import { emptyFlatFilters, searchFlats } from '../services/flatSearch.service';
import { notifySafe } from '../services/notification.service';
import { audit } from './audit.util';
import { currentUser } from '../middlewares/roleCheck';

const requirementSchema = z.object({
  bhk: z.coerce.number().int().refine((n) => [1, 2, 3, 4].includes(n), 'BHK must be 1, 2, 3 or 4').optional(),
  budgetMin: z.coerce.number().min(0).default(0),
  budgetMax: z.coerce.number().min(1, 'Maximum budget is required'),
  city: z.string().trim().min(2, 'City is required').max(80),
  locality: z.string().trim().max(120).optional(),
  loanNeeded: z.coerce.boolean().default(false),
  preferredTiers: z.array(z.enum(['budget', 'mid', 'luxury'])).max(3).default([]),
  amenities: z.array(z.string().refine(Types.ObjectId.isValid, 'Invalid amenity id')).max(20).default([]),
  possessionPreference: z
    .array(z.enum(['new_launch', 'under_construction', 'ready_to_move']))
    .max(3)
    .default([]),
  notes: z.string().trim().max(500).optional(),
});

/** POST /requirements — buyer creates a requirement. */
export const createRequirement = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const input = requirementSchema.parse(req.body);
    if (input.budgetMax < input.budgetMin) {
      throw ApiError.badRequest('Maximum budget must be greater than the minimum budget');
    }

    const requirement = await Requirement.create({
      buyerId: req.user._id,
      bhk: input.bhk,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      city: input.city,
      locality: input.locality,
      loanNeeded: input.loanNeeded,
      preferredTiers: input.preferredTiers,
      amenities: input.amenities,
      possessionPreference: input.possessionPreference,
      notes: input.notes,
    });

    const matches = await matchRequirement(requirement);
    requirement.matchCount = matches.total;
    requirement.lastMatchedAt = new Date();
    await requirement.save();

    return sendCreated(res, 'Requirement created successfully', {
      requirement,
      matchCount: matches.total,
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /requirements/matches — flats matching the buyer's requirements. */
export const listRequirementMatches = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const schema = z.object({
      id: z.string().refine(Types.ObjectId.isValid, 'Invalid requirement id').optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);

    const requirement = query.id
      ? await Requirement.findOne({ _id: query.id, buyerId: req.user._id }).lean()
      : await Requirement.findOne({ buyerId: req.user._id, isActive: true }).sort({ createdAt: -1 }).lean();

    if (!requirement) {
      return sendOk(res, 'No requirement found. Create one to see matching flats.', { requirement: null, matches: [] });
    }

    const { items, total, page, limit } = await matchRequirement(requirement, query.page, query.limit);
    return sendOk(
      res,
      total ? `${total} flats match your requirement` : 'No flats match your requirement yet',
      { requirement, matches: items },
      paginationMeta(page, limit, total),
    );
  } catch (error) {
    return next(error);
  }
};

/** GET /requirements — buyer requirement list. */
export const listRequirements = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const requirements = await Requirement.find({ buyerId: req.user._id }).sort({ createdAt: -1 }).lean();
    return sendOk(res, 'Requirements fetched successfully', requirements, { total: requirements.length });
  } catch (error) {
    return next(error);
  }
};

/** DELETE /requirements/:id */
export const deleteRequirement = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid id') }).parse(req.params);
    const requirement = await Requirement.findOne({ _id: id, buyerId: req.user._id });
    if (!requirement) throw ApiError.notFound('Requirement not found');
    await requirement.deleteOne();
    return sendOk(res, 'Requirement deleted successfully', { deleted: true });
  } catch (error) {
    return next(error);
  }
};

/**
 * The subset of a requirement that feeds the discovery engine.
 *
 * Deliberately narrower than `IRequirement` so it accepts both a hydrated
 * document and a `.lean()` projection.
 */
interface MatchableRequirement {
  city?: string;
  locality?: string;
  bhk?: number;
  preferredTiers?: string[];
  amenities?: Array<Types.ObjectId | string>;
  budgetMin?: number;
  budgetMax?: number;
}

/** Runs the requirement against the discovery engine. */
const matchRequirement = async (
  requirement: MatchableRequirement,
  page = 1,
  limit = 20,
): Promise<{ items: Array<Record<string, unknown>>; total: number; page: number; limit: number }> => {
  const result = await searchFlats({
    filters: emptyFlatFilters({
      city: requirement.city,
      locality: requirement.locality,
      bhk: requirement.bhk ? [Number(requirement.bhk)] : [],
      tiers: requirement.preferredTiers ?? [],
      amenities: (requirement.amenities ?? []).map((a) => new Types.ObjectId(String(a))),
      priceMin: Number(requirement.budgetMin) || undefined,
      priceMax: Number(requirement.budgetMax) || undefined,
      available: true,
    }),
    sortBy: 'relevance',
    page,
    limit,
  });
  return { items: result.items, total: result.total, page: result.page, limit: result.limit };
};

/* ------------------------------- loan flow -------------------------------- */

const loanApplySchema = z.object({
  bookingId: z.string().refine(Types.ObjectId.isValid, 'Invalid booking id').optional(),
  flatId: z.string().refine(Types.ObjectId.isValid, 'Invalid flat id').optional(),
  loanAmount: z.coerce.number().min(100000, 'Minimum loan amount is ₹1,00,000').optional(),
  employmentType: z.enum(['salaried', 'self_employed', 'business', 'other']).optional(),
  annualIncome: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});

/** POST /loan/apply — buyer applies for home-loan assistance. */
export const applyLoan = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const input = loanApplySchema.parse(req.body);
    if (!input.bookingId && !input.flatId) {
      throw ApiError.badRequest('A booking or flat reference is required');
    }

    const config = await PlatformConfig.findOne({ key: 'default' }).lean();
    if (config && config.loan && config.loan.enabled === false) {
      throw ApiError.badRequest('Loan assistance is currently unavailable');
    }

    const booking = input.bookingId
      ? await Booking.findOne({ _id: input.bookingId, buyerId: req.user._id })
      : null;
    if (input.bookingId && !booking) throw ApiError.notFound('Booking not found');

    if (booking) {
      if (booking.loanStatus === 'approved') throw ApiError.conflict('Loan assistance is already approved for this booking');
      booking.loanStatus = 'applied';
      booking.loan.status = 'applied';
      booking.loan.required = true;
      booking.loan.appliedAt = new Date();
      if (input.notes) booking.loan.notes = input.notes;
      await booking.save();

      await notifySafe({
        recipientId: String(booking.builderId),
        event: 'loan_status_changed',
        title: 'Buyer applied for loan assistance',
        body: `${req.user.name} applied for home-loan assistance on booking ${booking.reference}.`,
        email: { subject: 'Loan assistance requested', cta: { label: 'View booking', url: '/builder/bookings' } },
        data: { bookingId: String(booking._id) },
      });

      const admins = await import('../models/User').then(({ User }) =>
        User.find({ role: 'admin' }).select('_id').lean(),
      );
      await Promise.all(
        admins.map((a) =>
          notifySafe({
            recipientId: String(a._id),
            event: 'loan_status_changed',
            title: 'Loan assistance lead',
            body: `New loan lead from ${currentUser(req).name} for booking ${booking.reference}.`,
            inAppOnly: true,
            data: { bookingId: String(booking._id) },
          }),
        ),
      );

      await audit({
        action: 'loan_applied',
        entity: 'booking',
        entityId: String(booking._id),
        actorId: String(req.user._id),
        metadata: { loanAmount: input.loanAmount, employmentType: input.employmentType },
        req,
      });

      return sendOk(res, 'Loan assistance requested. A partner will be assigned shortly.', {
        bookingId: String(booking._id),
        loanStatus: booking.loanStatus,
      });
    }

    // Pre-booking lead: no booking exists yet.
    const { LoanApplication } = await import('../models/LoanApplication');
    const application = await LoanApplication.create({
      buyerId: req.user._id,
      flatId: new Types.ObjectId(input.flatId!),
      loanAmount: input.loanAmount,
      employmentType: input.employmentType,
      annualIncome: input.annualIncome,
      notes: input.notes,
      status: 'applied',
    });

    return sendCreated(res, 'Loan assistance requested', { application });
  } catch (error) {
    return next(error);
  }
};

/** GET /loan/application — buyer's loan applications. */
export const listLoanApplications = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { LoanApplication } = await import('../models/LoanApplication');
    const applications = await LoanApplication.find({ buyerId: req.user._id }).sort({ createdAt: -1 }).lean();
    return sendOk(res, 'Loan applications fetched successfully', applications, { total: applications.length });
  } catch (error) {
    return next(error);
  }
};

/** GET /loan/partners — active loan partners (public-ish, buyer only). */
export const listLoanPartners = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const partners = await LoanPartner.find({ isActive: true }).sort({ name: 1 }).lean();
    return sendOk(
      res,
      'Loan partners fetched successfully',
      partners.map((p) => ({
        id: String(p._id),
        name: p.name,
        code: p.code,
        logoUrl: p.logoUrl,
        interestRateMin: p.interestRateMin,
        interestRateMax: p.interestRateMax,
        maxTenureYears: p.maxTenureYears,
        maxLoanAmount: p.maxLoanAmount,
        avgDisbursalDays: p.avgDisbursalDays,
      })),
      { total: partners.length },
    );
  } catch (error) {
    return next(error);
  }
};
