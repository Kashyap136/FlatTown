import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Amenity } from '../models/Amenity';
import { Flat } from '../models/Flat';
import { Inquiry } from '../models/Inquiry';
import { Project } from '../models/Project';
import { Review } from '../models/Review';
import { User } from '../models/User';
import { Wishlist } from '../models/Wishlist';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendCreated, sendOk } from '../utils/response';
import { getPricingContext } from '../utils/pricingContext';
import { normaliseVisitCharge } from '../utils/tierCalculator';
import { buildKey } from '../config/redis';
import {
  buildFlatMatch,
  emptyFlatFilters,
  enrichFlat,
  flatDetailPayload,
  listQuerySchema,
  parseFlatFilters,
  searchFlats,
} from '../services/flatSearch.service';
import {
  invalidateFlat,
  invalidateProject,
  CACHE_NAMESPACES,
} from '../services/cacheInvalidation';
import { notifySafe } from '../services/notification.service';
import { recalculateProjectStats } from '../services/project.service';

/**
 * Cache key for flat discovery.
 *
 * The response body embeds a per-viewer `isWishlisted` flag, so an
 * authenticated request MUST NOT share a cache entry with another principal —
 * doing so would leak one buyer's saved flats to the next. Anonymous traffic
 * (the common case) still collapses onto a single shared key, so the hot path
 * keeps a high hit rate; signed-in users get one entry each.
 */
export const discoveryCacheKey = (req: Request): string => {
  const query = { ...req.query } as Record<string, unknown>;
  delete query.view;
  const scope = req.user?._id ? { u: String(req.user._id) } : { u: 'anon' };
  return buildKey(CACHE_NAMESPACES.flats, { ...query, ...scope });
};

/* -------------------------------------------------------------------------- */
/*                                   schemas                                   */
/* -------------------------------------------------------------------------- */

const createFlatSchema = z.object({
  projectId: z.string().refine(Types.ObjectId.isValid, 'Invalid project id'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(140),
  bhk: z.coerce.number().int().refine((n) => [1, 2, 3, 4].includes(n), 'BHK must be 1, 2, 3 or 4'),
  type: z.enum(['apartment', 'villa', 'penthouse']).default('apartment'),
  sizeSqft: z.coerce.number().min(200, 'Minimum size is 200 sqft').max(20000),
  pricePerSqft: z.coerce.number().min(100, 'Minimum rate is ₹100/sqft').max(1000000),
  floorRise: z.coerce.number().min(0).max(100000000).default(0),
  parkingCharges: z.coerce.number().min(0).max(100000000).default(0),
  floor: z.coerce.number().int().min(0).max(200),
  tower: z.string().trim().max(40).optional(),
  facing: z
    .enum(['east', 'west', 'north', 'south', 'north_east', 'north_west', 'south_east', 'south_west'])
    .optional(),
  amenities: z.array(z.string().refine(Types.ObjectId.isValid, 'Invalid amenity id')).max(40).default([]),
  possessionDate: z.coerce.date().refine((d) => d instanceof Date, 'Valid possession date required'),
  isAvailable: z.coerce.boolean().default(true),
  visitCharge: z.coerce.number().min(0).default(0),
  tokenAmount: z.coerce.number().min(1000).max(100000000).optional(),
  images: z
    .array(z.object({ url: z.string().url(), publicId: z.string().optional(), caption: z.string().optional() }))
    .max(20)
    .default([]),
  floorPlan: z.object({ url: z.string().url(), publicId: z.string().optional(), caption: z.string().optional() }).optional(),
  tour360Url: z.string().url().optional(),
});

const updateFlatSchema = createFlatSchema.partial().omit({ projectId: true }).extend({
  projectId: z.string().refine(Types.ObjectId.isValid, 'Invalid project id').optional(),
});

const paramsSchema = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid id') });

/* -------------------------------------------------------------------------- */
/*                                 controllers                                 */
/* -------------------------------------------------------------------------- */

/** GET /flats — public discovery endpoint (Redis cached). */
export const listFlats = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    // The canonical query schema lives with the search service so the controller
    // and the aggregation can never drift apart.
    const query = listQuerySchema.parse(req.query);
    const filters = parseFlatFilters(query);

    const result = await searchFlats({
      filters,
      sortBy: query.sortBy,
      page: query.page,
      limit: query.limit,
    });

    const wishlisted = new Set<string>();
    if (req.user) {
      const rows = await Wishlist.find({ buyerId: req.user._id, flatId: { $in: result.items.map((i) => i.id) } })
        .select('flatId')
        .lean();
      rows.forEach((r) => wishlisted.add(String(r.flatId)));
    }

    return sendOk(
      res,
      result.total === 0 ? 'No flats found for the selected filters' : 'Flats fetched successfully',
      result.items.map((item) => ({ ...item, isWishlisted: wishlisted.has(item.id as string) })),
      {
        ...paginationMeta(result.page, result.limit, result.total),
        sortBy: query.sortBy,
        filters: {
          city: filters.city ?? null,
          locality: filters.locality ?? null,
          bhk: filters.bhk,
          tier: filters.tiers,
          possession: filters.possessions,
          amenities: filters.amenities.map(String),
          priceMin: filters.priceMin ?? null,
          priceMax: filters.priceMax ?? null,
          reraVerified: filters.reraVerified ?? null,
          builderRatingMin: filters.builderRatingMin ?? null,
        },
      },
    );
  } catch (error) {
    return next(error);
  }
};

/** GET /flats/compare?ids=a,b,c — max 3 flats. */
export const compareFlats = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const schema = z.object({
      ids: z
        .string()
        .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
        .pipe(z.array(z.string().refine(Types.ObjectId.isValid, 'Invalid flat id')).min(1))
        .refine((ids) => ids.length <= 3, 'You can compare up to 3 flats at a time'),
    });
    const { ids } = schema.parse(req.query);

    const docs = await Flat.find({ _id: { $in: ids }, isAvailable: true }).limit(3);
    if (!docs.length) throw ApiError.notFound('No comparable flats found');

    const ordered = ids
      .map((id) => docs.find((d) => String(d._id) === id))
      .filter((d): d is NonNullable<typeof d> => Boolean(d));

    const amenityIds = Array.from(new Set(ordered.flatMap((f) => (f.amenities ?? []).map(String))));
    const amenityMap = new Map<string, { name: string; icon: string; category: string }>();
    if (amenityIds.length) {
      const amenities = await Amenity.find({ _id: { $in: amenityIds } }).select('name icon category').lean();
      amenities.forEach((a) => amenityMap.set(String(a._id), { name: a.name, icon: a.icon, category: a.category }));
    }

    const [projects, builders] = await Promise.all([
      Project.find({ _id: { $in: ordered.map((f) => f.projectId) } })
        .select('projectName slug city locality fullAddress geo reraNumber isRERAVerified status')
        .lean(),
      User.find({ _id: { $in: ordered.map((f) => f.builderId) } })
        .select('name companyName avatar rating isRERAVerified reraNumber isVerified')
        .lean(),
    ]);

    const enriched = ordered.map((f) => {
      const project = projects.find((p) => String(p._id) === String(f.projectId));
      const builder = builders.find((b) => String(b._id) === String(f.builderId));
      return {
        ...enrichFlat(
          {
            _id: f._id,
            title: f.title,
            bhk: f.bhk,
            type: f.type,
            sizeSqft: f.sizeSqft,
            pricePerSqft: f.pricePerSqft,
            totalPrice: f.totalPrice,
            tier: f.tier,
            floorRise: f.floorRise,
            parkingCharges: f.parkingCharges,
            floor: f.floor,
            tower: f.tower,
            facing: f.facing,
            amenities: f.amenities,
            possessionDate: f.possessionDate,
            isAvailable: f.isAvailable,
            visitCharge: f.visitCharge,
            tokenAmount: f.tokenAmount,
            images: f.images,
            floorPlan: f.floorPlan,
            tour360Url: f.tour360Url,
            views: f.views,
            projectId: f.projectId,
            builderId: f.builderId,
            project: project
              ? {
                  _id: project._id,
                  projectName: project.projectName,
                  slug: project.slug,
                  city: project.city,
                  locality: project.locality,
                  fullAddress: project.fullAddress,
                  geo: project.geo,
                  reraNumber: project.reraNumber,
                  isRERAVerified: project.isRERAVerified,
                  status: project.status,
                  builderName: project.builderName,
                }
              : undefined,
            builder: builder ? { ...builder, _id: builder._id } : undefined,
          } as Record<string, unknown>,
          amenityMap,
        ),
        commission: {
          percent: f.commissionPercent,
          amountOnToken: Math.round(((f.tokenAmount ?? 0) * (f.commissionPercent ?? 0)) / 100),
          basis: 'booking_token',
        },
      };
    });

    return sendOk(res, 'Comparison fetched successfully', {
      items: enriched,
      maxCompare: 3,
      amenities: Array.from(amenityMap.values()),
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /flats/:id */
export const getFlat = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { id } = paramsSchema.parse(req.params);
    const flat = await Flat.findById(id).lean();
    if (!flat) throw ApiError.notFound('Flat not found');

    const payload = await flatDetailPayload(flat as never, { incrementViews: true });

    let isWishlisted = false;
    let inquiryId: string | undefined;
    if (req.user) {
      const wish = await Wishlist.findOne({ buyerId: req.user._id, flatId: id }).lean();
      isWishlisted = Boolean(wish);
      const inquiry = await Inquiry.findOne({ buyerId: req.user._id, flatId: id }).lean();
      inquiryId = inquiry ? String(inquiry._id) : undefined;
    }

    const similar = await findSimilarFlats(flat);

    return sendOk(res, 'Flat fetched successfully', { ...payload, isWishlisted, inquiryId, similar });
  } catch (error) {
    return next(error);
  }
};

/** Flats in the same project / nearby tier with a similar size. */
const findSimilarFlats = async (flat: {
  _id: unknown;
  projectId: unknown;
  bhk: number;
  sizeSqft: number;
  tier: string;
  city?: string;
  locality?: string;
}): Promise<Array<Record<string, unknown>>> => {
  const { items } = await searchFlats({
    filters: emptyFlatFilters({
      available: true,
      bhk: [flat.bhk],
      tiers: [flat.tier],
      city: flat.city,
      locality: flat.locality,
    }),
    sortBy: 'relevance',
    page: 1,
    limit: 5,
  });
  const filtered = items.filter((i) => String(i.id) !== String(flat._id));
  if (filtered.length >= 3) return filtered.slice(0, 3);

  const sameProject = await Flat.find({
    projectId: flat.projectId,
    isAvailable: true,
    _id: { $ne: flat._id },
  })
    .limit(3)
    .lean();
  if (sameProject.length) {
    const projects = await Project.find({ _id: { $in: sameProject.map((f) => f.projectId) } })
      .select('projectName slug city locality fullAddress geo reraNumber isRERAVerified status builderName')
      .lean();
    return sameProject.map((f) =>
      enrichFlat({
        _id: f._id,
        title: f.title,
        bhk: f.bhk,
        type: f.type,
        sizeSqft: f.sizeSqft,
        pricePerSqft: f.pricePerSqft,
        totalPrice: f.totalPrice,
        tier: f.tier,
        floor: f.floor,
        tower: f.tower,
        facing: f.facing,
        amenities: f.amenities,
        possessionDate: f.possessionDate,
        isAvailable: f.isAvailable,
        visitCharge: f.visitCharge,
        tokenAmount: f.tokenAmount,
        images: f.images,
        views: f.views,
        project: projects.find((p) => String(p._id) === String(f.projectId)),
      } as Record<string, unknown>),
    );
  }
  return filtered;
};

/** POST /flats — builder (own project) or agent acting for a builder. */
export const createFlat = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const input = createFlatSchema.parse(req.body);

    const project = await Project.findById(input.projectId);
    if (!project) throw ApiError.notFound('Project not found');

    const isOwnerBuilder = String(project.builderId) === String(req.user._id);
    const isAssignedAgent =
      req.user.role === 'agent' && String(project.agentId ?? '') === String(req.user._id);
    if (!isOwnerBuilder && !isAssignedAgent && req.user.role !== 'admin') {
      throw ApiError.forbidden('You can only add flats to your own project or a project assigned to you');
    }

    const { thresholds, commissionPercent, defaultTokenAmount } = getPricingContext();
    const possessionDate = input.possessionDate;

    // totalPrice + tier are computed by the model hook using admin thresholds.
    const flat = await Flat.create({
      projectId: project._id,
      builderId: project.builderId,
      agentId: isAssignedAgent ? req.user._id : undefined,
      title: input.title,
      bhk: input.bhk,
      type: input.type,
      sizeSqft: input.sizeSqft,
      pricePerSqft: input.pricePerSqft,
      floorRise: input.floorRise,
      parkingCharges: input.parkingCharges,
      floor: input.floor,
      tower: input.tower,
      facing: input.facing,
      amenities: input.amenities,
      possessionDate,
      isAvailable: input.isAvailable,
      visitCharge: normaliseVisitCharge(input.visitCharge),
      tokenAmount: input.tokenAmount ?? defaultTokenAmount,
      commissionPercent,
      images: input.images.map((i) => ({ ...i, kind: 'image' as const })),
      floorPlan: input.floorPlan ? { ...input.floorPlan, kind: 'floor_plan' as const } : undefined,
      tour360Url: input.tour360Url,
    });

    await Promise.all([
      recalculateProjectStats(project._id),
      invalidateFlat(flat),
      invalidateProject(project),
    ]);

    if (isAssignedAgent) {
      await notifySafe({
        recipientId: String(project.builderId),
        event: 'inquiry_created',
        title: 'New flat listed by your agent',
        body: `${input.title} (${input.bhk} BHK) was added to ${project.projectName}.`,
        inAppOnly: true,
      });
    }

    return sendCreated(res, 'Flat created successfully', {
      flat: await flatDetailPayload(flat.toObject() as never),
      tierContext: thresholds,
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /flats/:id */
export const updateFlat = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = paramsSchema.parse(req.params);
    const input = updateFlatSchema.parse(req.body);

    const flat = await Flat.findById(id);
    if (!flat) throw ApiError.notFound('Flat not found');
    if (req.user.role !== 'admin') {
      const owns = String(flat.builderId) === String(req.user._id);
      const isAgent = req.user.role === 'agent' && String(flat.agentId ?? '') === String(req.user._id);
      if (!owns && !isAgent) throw ApiError.forbidden('You can only edit flats you own or are assigned to');
    }

    const protectedFields = ['totalPrice', 'tier', 'commissionPercent', 'builderId', 'projectId'];
    for (const field of protectedFields) {
      if (field in input && field !== 'commissionPercent') {
        delete (input as Record<string, unknown>)[field];
      }
    }

    const updatable = [
      'title',
      'bhk',
      'type',
      'sizeSqft',
      'pricePerSqft',
      'floorRise',
      'parkingCharges',
      'floor',
      'tower',
      'facing',
      'amenities',
      'possessionDate',
      'isAvailable',
      'images',
      'floorPlan',
      'tour360Url',
    ] as const;

    for (const field of updatable) {
      if (input[field] !== undefined) {
        (flat as unknown as Record<string, unknown>)[field] = input[field];
      }
    }
    if (input.visitCharge !== undefined) flat.visitCharge = normaliseVisitCharge(input.visitCharge);
    if (input.tokenAmount !== undefined) flat.tokenAmount = input.tokenAmount;
    if (input.projectId && input.projectId !== String(flat.projectId)) {
      const targetProject = await Project.findById(input.projectId);
      if (!targetProject) throw ApiError.notFound('Target project not found');
      flat.projectId = targetProject._id;
      flat.builderId = targetProject.builderId;
    }

    await flat.save();
    await Promise.all([
      recalculateProjectStats(flat.projectId),
      invalidateFlat(flat),
      invalidateProject(),
    ]);

    return sendOk(res, 'Flat updated successfully', { flat: await flatDetailPayload(flat.toObject() as never) });
  } catch (error) {
    return next(error);
  }
};

/** DELETE /flats/:id — soft delete if bookings exist, hard delete otherwise. */
export const deleteFlat = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = paramsSchema.parse(req.params);
    const flat = await Flat.findById(id);
    if (!flat) throw ApiError.notFound('Flat not found');

    const isOwner = String(flat.builderId) === String(req.user._id);
    const isAgent = req.user.role === 'agent' && String(flat.agentId ?? '') === String(req.user._id);
    if (!isOwner && !isAgent && req.user.role !== 'admin') {
      throw ApiError.forbidden('You can only delete flats you own or are assigned to');
    }

    const { Booking } = await import('../models/Booking');
    const bookings = await Booking.countDocuments({ flatId: id, escrowStatus: { $ne: 'refunded' } });
    const { SiteVisit } = await import('../models/SiteVisit');
    const visits = await SiteVisit.countDocuments({ flatId: id, status: { $in: ['requested', 'confirmed'] } });

    if (bookings > 0 || visits > 0) {
      // Preserve history: retire the listing instead of destroying records.
      flat.isAvailable = false;
      await flat.save();
      await Promise.all([recalculateProjectStats(flat.projectId), invalidateFlat(flat)]);
      return sendOk(res, 'Flat has active bookings or visits — it was marked unavailable instead of deleted', {
        softDeleted: true,
        bookings,
        visits,
      });
    }

    await flat.deleteOne();
    await Promise.all([recalculateProjectStats(flat.projectId), invalidateFlat(flat), invalidateProject()]);
    return sendOk(res, 'Flat deleted successfully', { deleted: true });
  } catch (error) {
    return next(error);
  }
};

/** POST /flats/:id/inquiry — "I'm interested". */
export const createInquiry = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = paramsSchema.parse(req.params);
    const schema = z.object({
      message: z.string().trim().max(500).optional(),
      loanAssistanceRequired: z.coerce.boolean().default(false),
    });
    const input = schema.parse(req.body ?? {});

    const flat = await Flat.findById(id);
    if (!flat) throw ApiError.notFound('Flat not found');
    if (!flat.isAvailable) throw ApiError.badRequest('This flat is no longer available');
    if (String(flat.builderId) === String(req.user._id)) {
      throw ApiError.badRequest('You cannot raise an inquiry on your own listing');
    }

    const existing = await Inquiry.findOne({ buyerId: req.user._id, flatId: id });
    let inquiry;
    if (existing) {
      existing.message = input.message ?? existing.message;
      existing.loanAssistanceRequired = input.loanAssistanceRequired;
      if (existing.status === 'closed') existing.status = 'new';
      await existing.save();
      inquiry = existing;
    } else {
      inquiry = await Inquiry.create({
        flatId: flat._id,
        projectId: flat.projectId,
        buyerId: req.user._id,
        builderId: flat.builderId,
        agentId: flat.agentId,
        message: input.message,
        loanAssistanceRequired: input.loanAssistanceRequired,
      });
      await Flat.updateOne({ _id: flat._id }, { $inc: { inquiriesCount: 1 } });
      await invalidateFlat(flat);
    }

    await notifySafe({
      recipientId: String(flat.builderId),
      event: 'inquiry_created',
      title: 'New inquiry received',
      body: `${req.user.name} is interested in ${flat.title}.`,
      email: {
        subject: `New inquiry for ${flat.title}`,
        cta: { label: 'Open builder dashboard', url: '/builder/inquiries' },
      },
      sms: `Flat Town: New inquiry for ${flat.title}. Log in to respond.`,
      data: { flatId: String(flat._id), inquiryId: String(inquiry._id) },
    });

    return sendCreated(res, 'Inquiry created successfully', { inquiry });
  } catch (error) {
    return next(error);
  }
};

/** GET /flats/:id/reviews */
export const listFlatReviews = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { id } = paramsSchema.parse(req.params);
    const schema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
      rating: z.coerce.number().int().min(1).max(5).optional(),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = { flatId: id, isPublished: true };
    if (query.rating) filter.rating = query.rating;

    const [reviews, total, agg] = await Promise.all([
      Review.find(filter)
        .populate('buyerId', 'name avatar')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: { flatId: new Types.ObjectId(id), isPublished: true } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]),
    ]);

    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      rating: star,
      count: agg.find((a) => a._id === star)?.count ?? 0,
    }));
    return sendOk(res, 'Reviews fetched successfully', { reviews, distribution }, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

/** POST /flats/upload-images — multipart gallery upload (builder/agent). */
export const uploadFlatImages = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('No images uploaded');
    const { uploadBuffer } = await import('../utils/storage');
    const stored = await Promise.all(
      files.map((f) => uploadBuffer(f.buffer, { filename: f.originalname, kind: 'image', mimetype: f.mimetype })),
    );
    return sendCreated(res, 'Images uploaded successfully', { images: stored });
  } catch (error) {
    return next(error);
  }
};

/** GET /flats/meta/price-range — filter metadata (budget range in a city). */
export const priceRange = async (_req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { thresholds } = getPricingContext();
    const min = await Flat.find({ isAvailable: true }).sort({ totalPrice: 1 }).limit(1).select('totalPrice').lean();
    const max = await Flat.find({ isAvailable: true }).sort({ totalPrice: -1 }).limit(1).select('totalPrice').lean();
    return sendOk(res, 'Price range fetched', {
      min: min[0]?.totalPrice ?? thresholds.budget,
      max: max[0]?.totalPrice ?? thresholds.mid,
      tiers: { budget: thresholds.budget, mid: thresholds.mid },
    });
  } catch (error) {
    return next(error);
  }
};

export const buildFlatMatchExport = buildFlatMatch;