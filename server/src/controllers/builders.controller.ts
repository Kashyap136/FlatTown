import type { NextFunction, Request, Response } from 'express';
import { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import { Flat } from '../models/Flat';
import { Inquiry } from '../models/Inquiry';
import { Project } from '../models/Project';
import { Review } from '../models/Review';
import { SiteVisit } from '../models/SiteVisit';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendOk } from '../utils/response';
import { buildKey, cacheGet, cacheSet } from '../config/redis';
import { CACHE_NAMESPACES } from '../services/cacheInvalidation';
import { CACHE_TTL_META } from '../middlewares/cache';
import { currentUser } from '../middlewares/roleCheck';
import { calcTier, type Tier } from '../utils/tierCalculator';
import { getPricingContext } from '../utils/pricingContext';

/** GET /builders/top-rated?city= — ranked, verified-first builder list. */
export const listTopBuilders = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const schema = z.object({
      city: z.string().optional(),
      locality: z.string().optional(),
      reraVerified: z.enum(['true', 'false']).optional(),
      minRating: z.coerce.number().min(0).max(5).optional(),
      limit: z.coerce.number().int().min(1).max(60).default(12),
      page: z.coerce.number().int().min(1).default(1),
    });
    const query = schema.parse(req.query);

    const cacheKey = buildKey(CACHE_NAMESPACES.builders, query as Record<string, unknown>);
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) {
      res.setHeader('X-FlatTown-Cache', 'HIT');
      return sendOk(res, 'Builders fetched from cache', (cached as { items: unknown }).items, {
        ...(cached as { meta?: Record<string, unknown> }).meta,
      });
    }

    const match: Record<string, unknown> = { role: 'builder', isAdminVerified: true };
    if (query.reraVerified) match.isRERAVerified = query.reraVerified === 'true';
    if (query.minRating !== undefined) match['rating.avg'] = { $gte: query.minRating };

    const projectMatch: Record<string, unknown> = { isApproved: true };
    if (query.city) projectMatch.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
    if (query.locality) projectMatch.locality = new RegExp(`^${escapeRegex(query.locality)}$`, 'i');

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'projects',
          localField: '_id',
          foreignField: 'builderId',
          as: 'projects',
          pipeline: [{ $match: projectMatch }, { $sort: { isRERAVerified: -1, createdAt: -1 } }, { $limit: 6 }],
        },
      },
      {
        $lookup: {
          from: 'flats',
          localField: '_id',
          foreignField: 'builderId',
          as: 'flats',
          pipeline: [{ $match: { isAvailable: true } }, { $group: { _id: '$projectId', minPrice: { $min: '$totalPrice' } } }],
        },
      },
      // RULE 6: verified builders are ranked ahead of unverified ones.
      { $sort: { isRERAVerified: -1, 'rating.avg': -1, 'rating.count': -1, name: 1 } },
      { $skip: (query.page - 1) * query.limit },
      { $limit: query.limit },
      {
        $project: {
          name: 1,
          companyName: 1,
          avatar: 1,
          rating: 1,
          isRERAVerified: 1,
          reraNumber: 1,
          location: 1,
          createdAt: 1,
          projects: 1,
          flats: 1,
        },
      },
    ];

    const [builders, total] = await Promise.all([
      // Assembled from loosely-typed helpers, so it is cast to mongoose's stage union once.
User.aggregate(pipeline as unknown as PipelineStage[]).exec(),
      User.countDocuments(match),
    ]);

    const { thresholds } = getPricingContext();
    const items = builders.map((b) => {
      const prices = ((b.flats ?? []) as Array<{ minPrice: number }>).map((f) => f.minPrice).filter(Boolean);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      const maxPrice = prices.length ? Math.max(...prices) : 0;
      return {
        id: String(b._id),
        name: b.name,
        companyName: b.companyName,
        avatar: b.avatar,
        rating: b.rating ?? { avg: 0, count: 0 },
        isRERAVerified: b.isRERAVerified,
        reraNumber: b.reraNumber,
        location: b.location,
        projects: (b.projects ?? []).map((p: Record<string, unknown>) => ({
          id: String(p._id),
          projectName: p.projectName,
          slug: (p as { slug?: string }).slug,
          city: p.city,
          locality: p.locality,
          isRERAVerified: p.isRERAVerified,
          status: p.status,
          images: p.images,
        })),
        projectCount: ((b.projects ?? []) as unknown[]).length,
        minPrice,
        maxPrice,
        primaryTier: minPrice ? (calcTier(minPrice, thresholds) as Tier) : null,
      };
    });

    const meta = paginationMeta(query.page, query.limit, total);
    await cacheSet(cacheKey, { items, meta }, CACHE_TTL_META);
    res.setHeader('X-FlatTown-Cache', 'MISS');

    return sendOk(res, 'Builders fetched successfully', items, meta);
  } catch (error) {
    return next(error);
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** GET /builders/:id/rating — public rating breakdown. */
export const getBuilderRating = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid builder id') }).parse(req.params);

    // `role` must be selected — the guard below distinguishes a builder profile
// from any other account type.
    const builder = await User.findById(id)
      .select('name companyName avatar rating isRERAVerified reraNumber location createdAt bio role')
      .lean();
    if (!builder || builder.role !== 'builder') throw ApiError.notFound('Builder not found');

    const [scoreAgg, distribution, projectAgg, reviewCount] = await Promise.all([
      Review.aggregate([
        { $match: { builderId: new Types.ObjectId(id), isPublished: true } },
        {
          $group: {
            _id: null,
            avg: { $avg: '$rating' },
            onTimePossession: { $avg: '$scores.onTimePossession' },
            constructionQuality: { $avg: '$scores.constructionQuality' },
            transparency: { $avg: '$scores.transparency' },
            count: { $sum: 1 },
          },
        },
      ]),
      Review.aggregate([
        { $match: { builderId: new Types.ObjectId(id), isPublished: true } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
      Project.aggregate([
        { $match: { builderId: new Types.ObjectId(id), isApproved: true } },
        {
          $group: {
            _id: null,
            projects: { $sum: 1 },
            reraVerifiedProjects: { $sum: { $cond: ['$isRERAVerified', 1, 0] } },
          },
        },
      ]),
      Review.countDocuments({ builderId: new Types.ObjectId(id), isPublished: true }),
    ]);

    const scores = scoreAgg[0];

    return sendOk(res, 'Builder rating fetched successfully', {
      builder: {
        id: String(builder._id),
        name: builder.name,
        companyName: builder.companyName,
        avatar: builder.avatar,
        bio: builder.bio,
        location: builder.location,
        isRERAVerified: builder.isRERAVerified,
        reraNumber: builder.reraNumber,
        memberSince: builder.createdAt,
      },
      rating: {
        avg: scores?.avg ? Math.round(scores.avg * 10) / 10 : builder.rating?.avg ?? 0,
        count: scores?.count ?? reviewCount,
        breakdown: {
          onTimePossession: scores?.onTimePossession ? Math.round(scores.onTimePossession * 10) / 10 : null,
          constructionQuality: scores?.constructionQuality ? Math.round(scores.constructionQuality * 10) / 10 : null,
          transparency: scores?.transparency ? Math.round(scores.transparency * 10) / 10 : null,
        },
        distribution: [5, 4, 3, 2, 1].map((star) => ({
          rating: star,
          count: distribution.find((d) => d._id === star)?.count ?? 0,
        })),
      },
      portfolio: projectAgg[0] ?? { projects: 0, reraVerifiedProjects: 0 },
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /builders/me/dashboard — builder dashboard statistics (live from DB). */
export const getBuilderDashboard = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');

    const builderId = new Types.ObjectId(String(req.user._id));

    const [projects, flats, viewsAgg, inquiries, visits, bookings, reviews] = await Promise.all([
      Project.find({ builderId }).select('projectName isRERAVerified isApproved status tierStats availableFlats totalFlats minPrice maxPrice images city locality possessionDate').lean(),
      Flat.find({ builderId }).select('views inquiriesCount visitCharge tokenAmount totalPrice tier bhk isAvailable').lean(),
      Flat.aggregate([
        { $match: { builderId } },
        { $group: { _id: null, views: { $sum: '$views' }, inquiries: { $sum: '$inquiriesCount' } } },
      ]),
      Inquiry.find({ builderId }).sort({ createdAt: -1 }).limit(50).populate('buyerId', 'name phone email avatar').populate('flatId', 'title bhk totalPrice tier').lean(),
      SiteVisit.find({ builderId }).sort({ 'slot.date': 1 }).limit(50).populate('buyerId', 'name phone avatar').populate('flatId', 'title bhk totalPrice').lean(),
      Booking.find({ builderId }).sort({ createdAt: -1 }).limit(50).populate('buyerId', 'name phone avatar').populate('flatId', 'title bhk totalPrice tier').lean(),
      Review.find({ builderId, isPublished: true }).sort({ createdAt: -1 }).limit(20).populate('buyerId', 'name avatar').lean(),
    ]);

    const visitsByStatus = await SiteVisit.aggregate([
      { $match: { builderId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const bookingsByEscrow = await Booking.aggregate([
      { $match: { builderId } },
      { $group: { _id: '$escrowStatus', count: { $sum: 1 }, amount: { $sum: '$tokenAmount' } } },
    ]);

    const escrow = await Booking.aggregate([
      { $match: { builderId, escrowStatus: { $in: ['token_paid', 'builder_accepted', 'docs_pending'] } } },
      {
        $group: {
          _id: null,
          heldAmount: { $sum: '$escrow.heldAmount' },
          pendingBuilderAmount: { $sum: '$escrow.builderAmount' },
          platformCommission: { $sum: '$commissionAmount' },
        },
      },
    ]);

    const released = await Booking.aggregate([
      { $match: { builderId, escrowStatus: 'completed' } },
      { $group: { _id: null, amount: { $sum: '$escrow.releasedAmount' }, count: { $sum: 1 } } },
    ]);

    return sendOk(res, 'Builder dashboard fetched successfully', {
      stats: {
        projects: projects.length,
        flats: flats.length,
        availableFlats: flats.filter((f) => f.isAvailable).length,
        views: viewsAgg[0]?.views ?? 0,
        inquiries: viewsAgg[0]?.inquiries ?? inquiries.length,
        visits: visitsByStatus.reduce<number>((acc, v) => acc + v.count, 0),
        visitsByStatus: visitsByStatus.reduce<Record<string, number>>((acc, v) => {
          acc[String(v._id)] = v.count;
          return acc;
        }, {}),
        bookings: bookingsByEscrow.reduce<number>((acc, b) => acc + b.count, 0),
        bookingsByEscrow: bookingsByEscrow.reduce<Record<string, { count: number; amount: number }>>((acc, b) => {
          acc[String(b._id)] = { count: b.count, amount: b.amount };
          return acc;
        }, {}),
        rating: req.user.rating ?? { avg: 0, count: 0 },
      },
      payouts: {
        heldInEscrow: escrow[0]?.heldAmount ?? 0,
        pendingToBuilder: escrow[0]?.pendingBuilderAmount ?? 0,
        platformCommissionRetained: escrow[0]?.platformCommission ?? 0,
        releasedToBuilder: released[0]?.amount ?? 0,
        releasedBookings: released[0]?.count ?? 0,
        accountId: escrow.length ? undefined : 'flattown-escrow',
      },
      verification: {
        isAdminVerified: req.user.isAdminVerified,
        isRERAVerified: req.user.isRERAVerified,
        reraNumber: req.user.reraNumber,
        kycStatus: req.user.kycStatus,
        kycDocs: req.user.kycDocs?.length ?? 0,
        verificationRequestedAt: req.user.verificationRequestedAt,
      },
      projects,
      recentInquiries: inquiries,
      upcomingVisits: visits.filter((v) => ['requested', 'confirmed'].includes(v.status)),
      recentBookings: bookings,
      reviews,
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /builders/me/inquiries */
export const listBuilderInquiries = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const schema = z.object({
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = { builderId: req.user._id };
    if (query.status) filter.status = { $in: query.status.split(',') };

    const [inquiries, total] = await Promise.all([
      Inquiry.find(filter)
        .populate('buyerId', 'name phone email avatar')
        .populate('flatId', 'title bhk totalPrice tier images')
        .populate('projectId', 'projectName slug')
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

/** PUT /inquiries/:id/status — builder/agent marks inquiry state. */
export const updateInquiryStatus = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid inquiry id') }).parse(req.params);
    const { status } = z
      .object({ status: z.enum(['new', 'contacted', 'visit_booked', 'booked', 'closed']) })
      .parse(req.body);

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) throw ApiError.notFound('Inquiry not found');
    const allowed = [inquiry.builderId, inquiry.agentId].some((u) => String(u) === String(currentUser(req)._id));
    if (!allowed && req.user.role !== 'admin') throw ApiError.forbidden('You cannot update this inquiry');

    inquiry.status = status;
    await inquiry.save();
    return sendOk(res, 'Inquiry status updated', { inquiry });
  } catch (error) {
    return next(error);
  }
};

/** GET /builders/me/agents — agents assigned to this builder's projects. */
export const listBuilderAgents = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const projects = await Project.find({ builderId: req.user._id }).select('agentId').lean();
    const agentIds = [...new Set(projects.map((p) => String(p.agentId)).filter(Boolean))];
    const agents = agentIds.length
      ? await User.find({ _id: { $in: agentIds }, role: 'agent' })
          .select('name phone email avatar commissionSharePercent rating')
          .lean()
      : [];
    return sendOk(res, 'Assigned agents fetched successfully', agents, { total: agents.length });
  } catch (error) {
    return next(error);
  }
};
