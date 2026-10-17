import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Booking } from '../models/Booking';
import { Flat } from '../models/Flat';
import { Project } from '../models/Project';
import { Review } from '../models/Review';
import { User, DEFAULT_BUILDER_RATING } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendCreated, sendOk, withId, withIds } from '../utils/response';
import { invalidateReviews, invalidateBuilder } from '../services/cacheInvalidation';
import { notifySafe } from '../services/notification.service';
import { audit } from './audit.util';

const reviewSchema = z.object({
  flatId: z.string().refine(Types.ObjectId.isValid, 'Invalid flat id'),
  bookingId: z.string().refine(Types.ObjectId.isValid, 'Invalid booking id').optional(),
  rating: z.coerce.number().int().min(1, 'Rating must be 1–5').max(5),
  comment: z.string().trim().min(10, 'Please write at least 10 characters').max(1500),
  scores: z
    .object({
      onTimePossession: z.coerce.number().int().min(1).max(5).default(5),
      constructionQuality: z.coerce.number().int().min(1).max(5).default(5),
      transparency: z.coerce.number().int().min(1).max(5).default(5),
    })
    .optional(),
});

/** POST /reviews — buyers review a builder after a completed booking. */
export const createReview = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const input = reviewSchema.parse(req.body);

    const flat = await Flat.findById(input.flatId).select('projectId builderId').lean();
    if (!flat) throw ApiError.notFound('Flat not found');

    const booking = input.bookingId
      ? await Booking.findById(input.bookingId).lean()
      : await Booking.findOne({ flatId: flat._id, buyerId: req.user._id, escrowStatus: 'completed' }).lean();

    // A review only counts as verified when it is backed by a COMPLETED booking
    // that belongs to this reviewer AND is for THIS flat with THIS builder.
    // Without the flat/builder binding, any buyer holding one completed booking
    // could attach it to an unrelated listing and inflate that builder's score,
    // which would in turn game the `builderRatingMin` filter and the RERA-first
    // ranking sort.
    const isOwnBooking = Boolean(booking && String(booking.buyerId) === String(req.user._id));
    const isForThisFlat = Boolean(booking && String(booking.flatId) === String(flat._id));
    const isForThisBuilder = Boolean(booking && String(booking.builderId) === String(flat.builderId));
    const isCompleted = booking?.escrowStatus === 'completed';
    const isVerifiedBooking = isOwnBooking && isForThisFlat && isForThisBuilder && isCompleted;

    if (req.user.role !== 'admin') {
      if (!isOwnBooking) {
        throw ApiError.forbidden('You can review a builder only after completing a booking with them');
      }
      if (!isForThisFlat) {
        throw ApiError.badRequest('That booking is not for this flat');
      }
      if (!isForThisBuilder) {
        throw ApiError.badRequest('That booking is not for this builder');
      }
      if (!isCompleted) {
        throw ApiError.forbidden('You can review this builder only after completing a booking with them');
      }
    }

    const existing = await Review.findOne({ buyerId: req.user._id, flatId: flat._id });
    if (existing) throw ApiError.conflict('You have already reviewed this flat');

    const review = await Review.create({
      flatId: flat._id,
      projectId: flat.projectId,
      builderId: flat.builderId,
      buyerId: req.user._id,
      bookingId: booking?._id,
      rating: input.rating,
      comment: input.comment,
      scores: input.scores ?? {
        onTimePossession: input.rating,
        constructionQuality: input.rating,
        transparency: input.rating,
      },
      isVerifiedBooking,
    });

    await recalculateBuilderRating(String(flat.builderId));
    await invalidateReviews();

    await notifySafe({
      recipientId: String(flat.builderId),
      event: 'review_moderated',
      title: 'New review received',
      body: `${req.user.name} rated you ${input.rating}/5.`,
      data: { reviewId: String(review._id) },
    });

    return sendCreated(res, 'Review submitted successfully', { review: withId(review.toObject() as unknown as Record<string, unknown>) });
  } catch (error) {
    return next(error);
  }
};

/**
 * Builder rating engine.
 *
 * Rating blends the star rating with the two sub-scores that matter to buyers:
 * on-time possession and construction quality, then persists avg + count.
 * New builders with no reviews keep the 3.5 default.
 */
export const recalculateBuilderRating = async (builderId: string): Promise<{ avg: number; count: number }> => {
  const [result] = await Review.aggregate([
    { $match: { builderId: new Types.ObjectId(builderId), isPublished: true } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        ratingAvg: { $avg: '$rating' },
        possessionAvg: { $avg: '$scores.onTimePossession' },
        qualityAvg: { $avg: '$scores.constructionQuality' },
      },
    },
  ]);

  let avg = DEFAULT_BUILDER_RATING;
  let count = 0;

  if (result && result.count > 0) {
    count = result.count;
    // Weighted: star rating 50%, possession 25%, quality 25%.
    avg =
      result.ratingAvg * 0.5 +
      (result.possessionAvg ?? result.ratingAvg) * 0.25 +
      (result.qualityAvg ?? result.ratingAvg) * 0.25;
    avg = Math.round(avg * 10) / 10;
  }

  await User.updateOne({ _id: builderId }, { $set: { 'rating.avg': avg, 'rating.count': count } });

  if (count > 0) {
    await Project.updateMany({ builderId: new Types.ObjectId(builderId) }, { $set: { 'rating.avg': avg, 'rating.count': count } });
  }

  await invalidateBuilder({ _id: builderId } as never);
  return { avg, count };
};

/** GET /reviews — public list with filters. */
export const listReviews = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const schema = z.object({
      builderId: z.string().optional(),
      projectId: z.string().optional(),
      flatId: z.string().optional(),
      rating: z.coerce.number().int().min(1).max(5).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    });
    const query = schema.parse(req.query);

    const filter: Record<string, unknown> = { isPublished: true };
    if (query.builderId && Types.ObjectId.isValid(query.builderId)) filter.builderId = query.builderId;
    if (query.projectId && Types.ObjectId.isValid(query.projectId)) filter.projectId = query.projectId;
    if (query.flatId && Types.ObjectId.isValid(query.flatId)) filter.flatId = query.flatId;
    if (query.rating) filter.rating = query.rating;

    const [reviews, total, summary] = await Promise.all([
      Review.find(filter)
        .populate('buyerId', 'name avatar')
        .populate('flatId', 'title bhk images')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: { ...filter, isPublished: true } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
    ]);

    return sendOk(
      res,
      'Reviews fetched successfully',
      {
        // Normalised to `id` like every other resource.
        reviews: withIds(reviews as unknown as Array<Record<string, unknown>>),
        summary: summary[0] ? { avg: Math.round(summary[0].avg * 10) / 10, count: summary[0].count } : { avg: 0, count: 0 },
      },
      paginationMeta(query.page, query.limit, total),
    );
  } catch (error) {
    return next(error);
  }
};

/** PUT /reviews/:id/moderate — admin moderation. */
export const moderateReview = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user || req.user.role !== 'admin') throw ApiError.forbidden('Admin access required');
    const { id } = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid review id') }).parse(req.params);
    const schema = z.object({
      action: z.enum(['approve', 'reject', 'hide']),
      note: z.string().trim().max(300).optional(),
    });
    const input = schema.parse(req.body);

    const review = await Review.findById(id);
    if (!review) throw ApiError.notFound('Review not found');

    review.moderation = {
      status: input.action === 'approve' ? 'approved' : 'rejected',
      note: input.note,
      by: req.user._id,
      at: new Date(),
    };
    review.isPublished = input.action === 'hide' ? false : input.action === 'approve';
    await review.save();

    await recalculateBuilderRating(String(review.builderId));
    await invalidateReviews();
    await audit({
      action: `review_${input.action}`,
      entity: 'review',
      entityId: String(review._id),
      actorId: String(req.user._id),
      metadata: { note: input.note },
      req,
    });

    await notifySafe({
      recipientId: String(review.buyerId),
      event: 'review_moderated',
      title: `Your review was ${input.action}d`,
      body: input.note ? `Moderator note: ${input.note}` : 'Your review was updated by the Flat Town moderation team.',
      data: { reviewId: String(review._id) },
    });

    return sendOk(res, `Review ${input.action}d`, { review: withId(review.toObject() as unknown as Record<string, unknown>) });
  } catch (error) {
    return next(error);
  }
};