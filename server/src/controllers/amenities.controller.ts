import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Amenity } from '../models/Amenity';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendOk, withId, withIds } from '../utils/response';
import { buildKey, cacheGet, cacheSet } from '../config/redis';
import { CACHE_NAMESPACES, invalidateAmenities } from '../services/cacheInvalidation';
import { CACHE_TTL_META } from '../middlewares/cache';
import { slugify } from '../services/project.service';

/** GET /amenities — amenity master (public). */
export const listAmenities = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const schema = z.object({
      category: z.string().optional(),
      activeOnly: z.enum(['true', 'false']).default('true'),
      q: z.string().optional(),
    });
    const query = schema.parse(req.query);

    const cacheKey = buildKey(CACHE_NAMESPACES.amenities, query as Record<string, unknown>);
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) {
      res.setHeader('X-FlatTown-Cache', 'HIT');
      return sendOk(res, 'Amenities fetched from cache', cached, { total: cached.length });
    }

    const filter: Record<string, unknown> = {};
    if (query.activeOnly === 'true') filter.isActive = true;
    if (query.category) filter.category = query.category;
    if (query.q) filter.name = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const amenities = await Amenity.find(filter).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
    // Normalised to `id` like every other resource — the marketplace filter
    // reads `amenity.id` to build its query string.
    const shaped = withIds(amenities as unknown as Array<Record<string, unknown>>);
    await cacheSet(cacheKey, shaped, CACHE_TTL_META);
    res.setHeader('X-FlatTown-Cache', 'MISS');

    return sendOk(res, 'Amenities fetched successfully', shaped, { total: shaped.length });
  } catch (error) {
    return next(error);
  }
};

/** POST /amenities — admin create. */
export const createAmenity = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2, 'Amenity name is required').max(80),
      icon: z.string().trim().min(1).max(40).default('Sparkles'),
      category: z.enum(['lifestyle', 'parking', 'security', 'wellness', 'utility']).default('lifestyle'),
      description: z.string().trim().max(300).optional(),
      sortOrder: z.coerce.number().int().default(0),
    });
    const input = schema.parse(req.body);

    const exists = await Amenity.findOne({ name: new RegExp(`^${input.name}$`, 'i') });
    if (exists) throw ApiError.conflict('An amenity with this name already exists');

    const amenity = await Amenity.create({
      ...input,
      slug: slugify(input.name),
      isActive: true,
    });
    await invalidateAmenities();
    return sendCreated(res, 'Amenity created successfully', { amenity: withId(amenity.toObject() as unknown as Record<string, unknown>) });
  } catch (error) {
    return next(error);
  }
};

/** PUT /amenities/:id — admin update. */
export const updateAmenity = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid amenity id') }).parse(req.params);
    const schema = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      icon: z.string().trim().min(1).max(40).optional(),
      category: z.enum(['lifestyle', 'parking', 'security', 'wellness', 'utility']).optional(),
      description: z.string().trim().max(300).optional(),
      sortOrder: z.coerce.number().int().optional(),
      isActive: z.boolean().optional(),
    });
    const input = schema.parse(req.body);

    const amenity = await Amenity.findById(id);
    if (!amenity) throw ApiError.notFound('Amenity not found');
    if (input.name) {
      amenity.name = input.name;
      amenity.slug = slugify(input.name);
    }
    if (input.icon !== undefined) amenity.icon = input.icon;
    if (input.category !== undefined) amenity.category = input.category;
    if (input.description !== undefined) amenity.description = input.description;
    if (input.sortOrder !== undefined) amenity.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) amenity.isActive = input.isActive;
    await amenity.save();

    await invalidateAmenities();
    return sendOk(res, 'Amenity updated successfully', { amenity: withId(amenity.toObject() as unknown as Record<string, unknown>) });
  } catch (error) {
    return next(error);
  }
};

/** DELETE /amenities/:id — admin delete (blocks if in use). */
export const deleteAmenity = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid amenity id') }).parse(req.params);
    const amenity = await Amenity.findById(id);
    if (!amenity) throw ApiError.notFound('Amenity not found');

    const { Flat } = await import('../models/Flat');
    const { Project } = await import('../models/Project');
    const [flatUsage, projectUsage] = await Promise.all([
      Flat.countDocuments({ amenities: id }),
      Project.countDocuments({ amenities: id }),
    ]);
    if (flatUsage > 0 || projectUsage > 0) {
      amenity.isActive = false;
      await amenity.save();
      await invalidateAmenities();
      return sendOk(res, 'Amenity is in use and was deactivated instead of deleted', {
        deactivated: true,
        flatUsage,
        projectUsage,
      });
    }

    await amenity.deleteOne();
    await invalidateAmenities();
    return sendOk(res, 'Amenity deleted successfully', { deleted: true });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /tiers/config — published pricing policy (public).
 *
 * This is deliberately not admin-only: the marketplace advertises its token
 * amounts, visit charges and commission basis to anonymous visitors, and the
 * booking wizard has to offer exactly the amounts the API will accept. Without
 * `booking.allowedTokenAmounts` here the wizard would fall back to hardcoded
 * defaults and could offer a token the server rejects.
 */
export const getTierConfig = async (_req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { getPricingContext } = await import('../utils/pricingContext');
    const { PlatformConfig } = await import('../models/PlatformConfig');
    const { thresholds, commissionPercent } = getPricingContext();
    const doc = await PlatformConfig.findOne({ key: 'default' }).lean();
    const visits = doc?.visits ?? { freeVisitsForVerifiedBuilders: 0, freeVisitsForAll: 0, allowedCharges: [0], chargeGoesToPlatform: true, refundableOnBooking: true };
    const booking = doc?.booking ?? { defaultTokenAmount: 50_000, allowedTokenAmounts: [50_000, 100_000, 200_000, 500_000], requireDocumentsBeforeRelease: true };
    return sendOk(res, 'Tier configuration fetched successfully', {
      tiers: {
        budget: { label: 'Budget', maxExclusive: thresholds.budget, description: 'Total price below ₹50L' },
        mid: { label: 'Mid', minInclusive: thresholds.budget, maxExclusive: thresholds.mid, description: '₹50L – ₹1.5Cr' },
        luxury: { label: 'Luxury', minInclusive: thresholds.mid, description: '₹1.5Cr and above' },
      },
      thresholds,
      commission: {
        percent: commissionPercent,
        basis: 'booking_token',
        note: 'Commission is charged on the booking token only.',
      },
      visits: {
        freeVisitsForVerifiedBuilders: visits.freeVisitsForVerifiedBuilders,
        freeVisitsForAll: visits.freeVisitsForAll,
        allowedCharges: visits.allowedCharges,
        chargeGoesToPlatform: visits.chargeGoesToPlatform,
        refundableOnBooking: visits.refundableOnBooking,
      },
      booking: {
        defaultTokenAmount: booking.defaultTokenAmount,
        allowedTokenAmounts: booking.allowedTokenAmounts,
        requireDocumentsBeforeRelease: booking.requireDocumentsBeforeRelease,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /meta/stats — public marketplace counters for the home page. */
export const getMarketplaceStats = async (_req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { Flat } = await import('../models/Flat');
    const { Project } = await import('../models/Project');
    const { User } = await import('../models/User');

    const [flatAgg, projectCount, builderCount, cityAgg] = await Promise.all([
      Flat.aggregate([
        { $match: { isAvailable: true } },
        { $group: { _id: '$tier', count: { $sum: 1 } } },
      ]),
      Project.countDocuments({ isApproved: true }),
      User.countDocuments({ role: 'builder' }),
      Project.aggregate([
        { $match: { isApproved: true } },
        { $group: { _id: '$city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
    ]);

    const tiers = flatAgg.reduce<Record<string, number>>((acc, row) => {
      acc[String(row._id)] = row.count;
      return acc;
    }, {});

    return sendOk(res, 'Marketplace stats fetched successfully', {
      totalFlats: Object.values(tiers).reduce((a, b) => a + b, 0),
      tiers: { budget: tiers.budget ?? 0, mid: tiers.mid ?? 0, luxury: tiers.luxury ?? 0 },
      projects: projectCount,
      builders: builderCount,
      cities: cityAgg.map((c) => ({ name: c._id, projectCount: c.count })),
    });
  } catch (error) {
    return next(error);
  }
};