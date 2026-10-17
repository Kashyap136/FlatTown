import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Flat } from '../models/Flat';
import { Wishlist } from '../models/Wishlist';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendOk } from '../utils/response';
import { enrichFlat } from '../services/flatSearch.service';

const idParam = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid flat id') });

/**
 * POST /wishlist/toggle — add or remove a flat.
 *
 * The flat id is accepted from either the path (`/toggle/:id`, used by the web
 * client) or the request body (`/toggle` with `{ flatId }`, the form published
 * in the API reference), so both documented shapes work.
 */
export const toggleWishlist = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');

    const fromPath = typeof req.params?.id === 'string' ? req.params.id : undefined;
    const fromBody = typeof req.body?.flatId === 'string' ? req.body.flatId : undefined;
    const candidate = fromPath ?? fromBody;
    if (!candidate) {
      throw ApiError.badRequest('A flat id is required (path parameter or "flatId" in the body)');
    }
    const { id } = idParam.parse({ id: candidate });

    const flat = await Flat.findById(id).select('_id').lean();
    if (!flat) throw ApiError.notFound('Flat not found');

    const existing = await Wishlist.findOne({ buyerId: req.user._id, flatId: id });
    if (existing) {
      await existing.deleteOne();
      return sendOk(res, 'Flat removed from your wishlist', { flatId: id, wishlisted: false, count: 0 });
    }

    await Wishlist.create({ buyerId: req.user._id, flatId: id });
    const count = await Wishlist.countDocuments({ buyerId: req.user._id });
    return sendOk(res, 'Flat saved to your wishlist', { flatId: id, wishlisted: true, count });
  } catch (error) {
    return next(error);
  }
};

/** GET /wishlist/me — saved flats. */
export const getMyWishlist = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const schema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);

    const [entries, total] = await Promise.all([
      Wishlist.find({ buyerId: req.user._id })
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('flatId')
        .lean(),
      Wishlist.countDocuments({ buyerId: req.user._id }),
    ]);

    const flats = entries
      .map((e) => e.flatId as unknown as Record<string, unknown>)
      .filter((f) => f && f._id);

    // Enrich with project/builder so wishlist cards match marketplace cards.
    const { Project } = await import('../models/Project');
    const { User } = await import('../models/User');
    const [projects, builders] = await Promise.all([
      Project.find({ _id: { $in: flats.map((f) => f.projectId as Types.ObjectId) } })
        .select('projectName slug city locality fullAddress geo reraNumber isRERAVerified status builderName images')
        .lean(),
      User.find({ _id: { $in: flats.map((f) => f.builderId as Types.ObjectId) } })
        .select('name companyName avatar rating isRERAVerified reraNumber isVerified')
        .lean(),
    ]);

    const enriched = flats.map((f) => {
      const project = projects.find((p) => String(p._id) === String(f.projectId));
      const builder = builders.find((b) => String(b._id) === String(f.builderId));
      return {
        ...enrichFlat(f),
        ...(project ? { project: { ...project, _id: String(project._id), id: String(project._id) } } : {}),
        ...(builder ? { builder: { ...builder, _id: String(builder._id), id: String(builder._id) } } : {}),
      };
    });
    return sendOk(
      res,
      enriched.length ? 'Wishlist fetched successfully' : "You don't have any saved flats yet.",
      enriched,
      paginationMeta(query.page, query.limit, total),
    );
  } catch (error) {
    return next(error);
  }
};

/** DELETE /wishlist/:id */
export const removeFromWishlist = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    await Wishlist.deleteOne({ buyerId: req.user._id, flatId: id });
    return sendOk(res, 'Flat removed from your wishlist', { flatId: id, wishlisted: false });
  } catch (error) {
    return next(error);
  }
};

/** GET /wishlist/ids — flat ids only (used by compare and the nav counter). */
export const getWishlistIds = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const ids = await Wishlist.find({ buyerId: req.user._id }).select('flatId').lean();
    return sendOk(res, 'Wishlist ids fetched', ids.map((i) => String(i.flatId)), { total: ids.length });
  } catch (error) {
    return next(error);
  }
};

export const wishlistObjectId = (id: string): Types.ObjectId => new Types.ObjectId(id);