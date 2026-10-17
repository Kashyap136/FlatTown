import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Flat } from '../models/Flat';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { paginationMeta, sendCreated, sendOk, withId } from '../utils/response';
import { buildKey, cacheGet, cacheSet } from '../config/redis';
import { CACHE_NAMESPACES, invalidateProject, invalidateVerification } from '../services/cacheInvalidation';
import { buildUniqueSlug, recalculateProjectStats } from '../services/project.service';
import { emptyFlatFilters, searchFlats } from '../services/flatSearch.service';
import { notifySafe } from '../services/notification.service';
import { uploadBuffer } from '../utils/storage';
import { PROJECT_CACHE_TTL } from '../middlewares/cache';

const mediaItem = z.object({
  url: z.string().url('Invalid file URL'),
  publicId: z.string().optional(),
  caption: z.string().trim().max(160).optional(),
  kind: z.enum(['image', 'floor_plan', 'brochure', 'video', 'tour360']).optional(),
});

const geoSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const createProjectSchema = z.object({
  projectName: z.string().trim().min(3, 'Project name must be at least 3 characters').max(160),
  description: z.string().trim().max(4000).optional(),
  city: z.string().trim().min(2, 'City is required').max(80),
  locality: z.string().trim().min(2, 'Locality is required').max(120),
  fullAddress: z.string().trim().min(10, 'Full address is required').max(500),
  geo: geoSchema,
  possessionDate: z.coerce.date(),
  status: z.enum(['new_launch', 'under_construction', 'ready_to_move']).default('new_launch'),
  reraNumber: z.string().trim().max(40).optional(),
  amenities: z.array(z.string().refine(Types.ObjectId.isValid, 'Invalid amenity id')).max(40).default([]),
  images: z.array(mediaItem).max(20).default([]),
  floorPlans: z.array(mediaItem).max(10).default([]),
  brochureUrl: z.string().url().optional(),
  tour360Url: z.string().url().optional(),
  // RERA verification is NEVER accepted from the client — see admin routes.
});

const updateProjectSchema = createProjectSchema.partial();

const idParam = z.object({ id: z.string().refine(Types.ObjectId.isValid, 'Invalid project id') });

const assertCanManage = async (project: InstanceType<typeof Project>, userId: string, role: string): Promise<unknown> => {
  if (role === 'admin') return;
  if (String(project.builderId) === String(userId)) return;
  if (role === 'agent' && String(project.agentId ?? '') === String(userId)) return;
  throw ApiError.forbidden('You can only manage your own projects');
};

const shape = (project: Record<string, unknown>) => ({
  id: String(project._id ?? ''),
  projectName: project.projectName,
  slug: project.slug,
  description: project.description,
  builderId: String(project.builderId ?? ''),
  builderName: project.builderName,
  city: project.city,
  locality: project.locality,
  fullAddress: project.fullAddress,
  geo: project.geo,
  reraNumber: project.reraNumber,
  isRERAVerified: project.isRERAVerified,
  reraVerifiedAt: project.reraVerifiedAt,
  // Populated amenities are normalised to `id` like every other resource.
  amenities: Array.isArray(project.amenities)
    ? project.amenities.map((a) =>
        a && typeof a === 'object' ? withId(a as unknown as Record<string, unknown>) : a,
      )
    : project.amenities,
  possessionDate: project.possessionDate,
  status: project.status,
  isApproved: project.isApproved,
  rejectedReason: project.rejectedReason,
  images: project.images,
  floorPlans: project.floorPlans,
  brochureUrl: project.brochureUrl,
  tour360Url: project.tour360Url,
  rating: project.rating,
  tierStats: project.tierStats,
  totalFlats: project.totalFlats,
  availableFlats: project.availableFlats,
  minPrice: project.minPrice,
  maxPrice: project.maxPrice,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

/** GET /projects — public listing (approved only) with city/locality filters. */
export const listProjects = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const schema = z.object({
      city: z.string().optional(),
      locality: z.string().optional(),
      status: z.enum(['new_launch', 'under_construction', 'ready_to_move']).optional(),
      reraVerified: z.enum(['true', 'false']).optional(),
      builderId: z.string().optional(),
      mine: z.enum(['true', 'false']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(12),
      sortBy: z.enum(['newest', 'price:asc', 'price:desc', 'rating:desc', 'rera']).default('newest'),
    });
    const query = schema.parse(req.query);

    if (query.mine === 'true' && !req.user) throw ApiError.unauthorized('Authentication required');

    // `mine=true` is a per-user dashboard view that includes projects awaiting
    // approval (and their rejection reasons). It must never be written to or
    // read from the shared discovery cache, or one builder's private list would
    // be served to the next builder on the same query.
    const cacheable = query.mine !== 'true';
    const cacheKey = buildKey(CACHE_NAMESPACES.projects, query as Record<string, unknown>);
    if (cacheable) {
      const cached = await cacheGet<{ items: unknown[]; total: number }>(cacheKey);
      if (cached) {
        res.setHeader('X-FlatTown-Cache', 'HIT');
        return sendOk(res, 'Projects fetched from cache', cached.items, {
          ...paginationMeta(query.page, query.limit, cached.total),
        });
      }
    }

    const filter: Record<string, unknown> = { isApproved: true };
    if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
    if (query.locality) filter.locality = new RegExp(`^${escapeRegex(query.locality)}$`, 'i');
    if (query.status) filter.status = query.status;
    if (query.reraVerified) filter.isRERAVerified = query.reraVerified === 'true';
    if (query.builderId) filter.builderId = query.builderId;
    if (query.mine === 'true') {
      filter.isApproved = { $exists: true };
      delete filter.isApproved;
      if (req.user?.role === 'builder') filter.builderId = req.user._id;
      else if (req.user?.role === 'agent') filter.agentId = req.user._id;
      else if (req.user?.role === 'admin') Object.assign(filter, {});
      else throw ApiError.forbidden('Not permitted');
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      'price:asc': { minPrice: 1 },
      'price:desc': { maxPrice: -1 },
      'rating:desc': { 'rating.avg': -1 },
      rera: { isRERAVerified: -1, 'rating.avg': -1 },
    };

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .populate('amenities', 'name icon category')
        .sort(sortMap[query.sortBy])
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Project.countDocuments(filter),
    ]);

    const items = projects.map((p) => shape(p as unknown as Record<string, unknown>));
    if (cacheable) await cacheSet(cacheKey, { items, total }, PROJECT_CACHE_TTL);
    res.setHeader('X-FlatTown-Cache', cacheable ? 'MISS' : 'BYPASS');

    return sendOk(res, 'Projects fetched successfully', items, paginationMeta(query.page, query.limit, total));
  } catch (error) {
    return next(error);
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** POST /projects — builder only. */
export const createProject = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const input = createProjectSchema.parse(req.body);

    if (req.user.role === 'builder' && !req.user.isAdminVerified) {
      // Builders may create projects before verification; they stay unapproved
      // until an admin reviews them (RULE 5 still holds: no self-verification).
      req.user.verificationRequestedAt ??= new Date();
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const status =
      input.possessionDate.getTime() <= today.getTime() ? 'ready_to_move' : input.status;

    const project = await Project.create({
      builderId: req.user._id,
      builderName: req.user.companyName ?? req.user.name,
      projectName: input.projectName,
      slug: await buildUniqueSlug(`${input.projectName}-${input.locality}`),
      description: input.description,
      city: input.city,
      locality: input.locality,
      fullAddress: input.fullAddress,
      geo: input.geo,
      reraNumber: input.reraNumber,
      isRERAVerified: false, // never client-controlled
      amenities: input.amenities,
      possessionDate: input.possessionDate,
      status,
      images: input.images,
      floorPlans: input.floorPlans,
      brochureUrl: input.brochureUrl,
      tour360Url: input.tour360Url,
      isApproved: false,
    });

    await invalidateProject(project);

    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    await Promise.all(
      admins.map((a) =>
        notifySafe({
          recipientId: String(a._id),
          event: 'project_approved',
          title: 'New project awaiting approval',
          body: `${project.projectName} in ${project.locality}, ${project.city} was submitted by ${project.builderName}.`,
          inAppOnly: true,
          data: { projectId: String(project._id) },
        }),
      ),
    );

    return sendCreated(res, 'Project created successfully. It will appear publicly after admin approval.', {
      project: shape(project.toObject() as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /projects/:id — public detail (approved) or owner/admin view. */
export const getProject = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { id } = idParam.parse(req.params);
    const cacheKey = `flattown:${CACHE_NAMESPACES.projects}:detail:${id}`;

    const project = await Project.findById(id).populate('amenities', 'name icon category').lean();
    if (!project) throw ApiError.notFound('Project not found');

    const isOwner =
      req.user &&
      (String(project.builderId) === String(req.user._id) || String(project.agentId ?? '') === String(req.user._id));
    if (!project.isApproved && !isOwner && req.user?.role !== 'admin') {
      throw ApiError.notFound('Project not found');
    }

    const builder = await User.findById(project.builderId)
      .select('name companyName avatar rating isRERAVerified reraNumber isVerified bio location createdAt')
      .lean();

    const flatFilter: Record<string, unknown> = { projectId: project._id, isAvailable: true };
    const [flats, tierCounts, builderReviews] = await Promise.all([
      Flat.find(flatFilter).sort({ totalPrice: 1 }).limit(100).lean(),
      Flat.aggregate([{ $match: { projectId: project._id } }, { $group: { _id: '$tier', count: { $sum: 1 } } }]),
      import('../models/Review').then(({ Review }) =>
        Review.find({ projectId: project._id, isPublished: true })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate('buyerId', 'name avatar')
          .lean(),
      ),
    ]);

    const priced = flats.map((f) => ({
      id: String(f._id),
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
      possessionDate: f.possessionDate,
      isAvailable: f.isAvailable,
      visitCharge: f.visitCharge,
      tokenAmount: f.tokenAmount,
      images: f.images,
    }));

    const payload = {
      ...shape(project as unknown as Record<string, unknown>),
      builder: builder
        ? {
            id: String(builder._id),
            name: builder.name,
            companyName: builder.companyName,
            avatar: builder.avatar,
            rating: builder.rating,
            isRERAVerified: builder.isRERAVerified,
            reraNumber: builder.reraNumber,
            isVerified: builder.isVerified,
            bio: builder.bio,
          }
        : null,
      flats: priced,
      flatCount: priced.length,
      tierDistribution: tierCounts.map((t) => ({ tier: t._id, count: t.count })),
      reviews: builderReviews,
    };

    await cacheSet(cacheKey, payload, PROJECT_CACHE_TTL);
    return sendOk(res, 'Project fetched successfully', payload);
  } catch (error) {
    return next(error);
  }
};

/** GET /projects/:projectId/flats — flats belonging to a project. */
export const listProjectFlats = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { projectId } = z.object({ projectId: z.string().refine(Types.ObjectId.isValid, 'Invalid project id') }).parse(
      req.params,
    );
    const schema = z.object({
      bhk: z.string().optional(),
      tier: z.string().optional(),
      priceMin: z.coerce.number().min(0).optional(),
      priceMax: z.coerce.number().min(0).optional(),
      sortBy: z
        .enum(['relevance', 'price:asc', 'price:desc', 'pricePerSqft:asc', 'pricePerSqft:desc', 'possessionDate:asc', 'possessionDate:desc', 'rating:desc', 'views:desc', 'newest'])
        .default('price:asc'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(60).default(20),
    });
    const query = schema.parse(req.query);

    const project = await Project.findById(projectId).lean();
    if (!project) throw ApiError.notFound('Project not found');

    const result = await searchFlats({
      filters: emptyFlatFilters({
        projectId: new Types.ObjectId(projectId),
        available: true,
        bhk: (query.bhk ?? '').split(',').map(Number).filter((n) => [1, 2, 3, 4].includes(n)),
        tiers: (query.tier ?? '').split(',').filter(Boolean),
        priceMin: query.priceMin,
        priceMax: query.priceMax,
      }),
      sortBy: query.sortBy,
      page: query.page,
      limit: query.limit,
    });

    return sendOk(
      res,
      'Project flats fetched successfully',
      result.items,
      paginationMeta(result.page, result.limit, result.total),
    );
  } catch (error) {
    return next(error);
  }
};

/** PUT /projects/:id */
export const updateProject = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const input = updateProjectSchema.parse(req.body);

    const project = await Project.findById(id);
    if (!project) throw ApiError.notFound('Project not found');
    await assertCanManage(project, String(req.user._id), req.user.role);

    // Verification/approval fields can never be set by a non-admin.
    delete (input as Record<string, unknown>).isRERAVerified;
    delete (input as Record<string, unknown>).isApproved;

    if (input.projectName && input.projectName !== project.projectName) {
      project.projectName = input.projectName;
      project.slug = await buildUniqueSlug(`${input.projectName}-${project.locality}`, project._id);
    }
    if (input.reraNumber !== undefined) {
      const nextRera = input.reraNumber.toUpperCase();
      // Any change to the RERA number invalidates the previous verification.
      project.isRERAVerified = false;
      project.reraVerifiedAt = undefined;
      project.reraNumber = nextRera;
    }

    const fields = [
      'description',
      'city',
      'locality',
      'fullAddress',
      'geo',
      'possessionDate',
      'status',
      'amenities',
      'images',
      'floorPlans',
      'brochureUrl',
      'tour360Url',
    ] as const;
    for (const field of fields) {
      if (input[field] !== undefined) {
        (project as unknown as Record<string, unknown>)[field] = input[field];
      }
    }

    await project.save();
    await Promise.all([recalculateProjectStats(project._id), invalidateProject(project), invalidateVerification()]);

    return sendOk(res, 'Project updated successfully', {
      project: shape(project.toObject() as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return next(error);
  }
};

/** DELETE /projects/:id */
export const deleteProject = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const project = await Project.findById(id);
    if (!project) throw ApiError.notFound('Project not found');
    await assertCanManage(project, String(req.user._id), req.user.role);

    const activeFlats = await Flat.countDocuments({ projectId: project._id, isAvailable: true });
    const activeBookings = await import('../models/Booking').then(({ Booking }) =>
      Booking.countDocuments({
        projectId: project._id,
        escrowStatus: { $in: ['created', 'token_paid', 'builder_accepted', 'docs_pending'] },
      }),
    );

    if (activeBookings > 0) {
      throw ApiError.conflict('This project has live bookings and cannot be deleted');
    }

    if (activeFlats > 0) {
      await Flat.updateMany({ projectId: project._id }, { $set: { isAvailable: false } });
      await project.deleteOne();
      await Promise.all([invalidateProject(project), invalidateVerification()]);
      return sendOk(res, 'Project deleted. Its flats were marked unavailable.', { deleted: true, flatsRetired: activeFlats });
    }

    await Flat.deleteMany({ projectId: project._id });
    await project.deleteOne();
    await Promise.all([invalidateProject(project), invalidateVerification()]);
    return sendOk(res, 'Project deleted successfully', { deleted: true });
  } catch (error) {
    return next(error);
  }
};

/** PUT /projects/:id/rera-upload — builder submits RERA number + documents. */
export const uploadRera = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      reraNumber: z.string().trim().min(4, 'RERA number is required').max(40),
      reraState: z.string().trim().max(60).optional(),
      note: z.string().trim().max(500).optional(),
      documents: z.array(z.object({ url: z.string().url(), publicId: z.string().optional(), caption: z.string().optional() })).max(6).default([]),
    });
    const input = schema.parse(req.body);

    const project = await Project.findById(id);
    if (!project) throw ApiError.notFound('Project not found');
    await assertCanManage(project, String(req.user._id), req.user.role);

    project.reraNumber = input.reraNumber.toUpperCase();
    // Submitting documents always resets verification — only admin can set it back.
    project.isRERAVerified = false;
    project.reraVerifiedAt = undefined;
    project.reraDocuments = input.documents.map((d) => ({ ...d, kind: 'document' as const }));

    const builder = await User.findById(project.builderId);
    if (builder) {
      builder.reraNumber = input.reraNumber.toUpperCase();
      builder.reraState = input.reraState;
      builder.isRERAVerified = false;
      builder.verificationRequestedAt = new Date();
      await builder.save();
    }

    await project.save();
    await invalidateVerification(builder ?? undefined);
    await invalidateProject(project);

    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    await Promise.all(
      admins.map((a) =>
        notifySafe({
          recipientId: String(a._id),
          event: 'rera_verified',
          title: 'RERA submission pending review',
          body: `RERA ${input.reraNumber} was submitted for ${project.projectName}.`,
          inAppOnly: true,
          data: { projectId: String(project._id), builderId: String(project.builderId) },
        }),
      ),
    );

    return sendOk(res, 'RERA documents submitted for admin verification', {
      project: shape(project.toObject() as unknown as Record<string, unknown>),
      isRERAVerified: false,
      note: 'Verification is granted only by a Flat Town admin.',
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /projects/:id/approve — admin only. */
export const approveProject = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user || req.user.role !== 'admin') throw ApiError.forbidden('Admin access required');
    const { id } = idParam.parse(req.params);
    const schema = z.object({
      approve: z.boolean().default(true),
      reason: z.string().trim().max(300).optional(),
    });
    const input = schema.parse(req.body ?? {});

    const project = await Project.findById(id);
    if (!project) throw ApiError.notFound('Project not found');

    project.isApproved = input.approve;
    project.approvedAt = input.approve ? new Date() : undefined;
    project.approvedBy = input.approve ? req.user._id : undefined;
    project.rejectedReason = input.approve ? undefined : input.reason ?? 'Did not meet listing criteria';
    await project.save();

    await Promise.all([invalidateProject(project), invalidateVerification(), recalculateProjectStats(project._id)]);

    await notifySafe({
      recipientId: String(project.builderId),
      event: 'project_approved',
      title: input.approve ? 'Project approved and live' : 'Project submission needs changes',
      body: input.approve
        ? `${project.projectName} is now visible in the Flat Town marketplace.`
        : `${project.projectName} was not approved: ${project.rejectedReason}`,
      email: { subject: `Flat Town — ${project.projectName}`, cta: { label: 'Open project', url: `/project/${project._id}` } },
      data: { projectId: String(project._id) },
    });

    return sendOk(res, input.approve ? 'Project approved' : 'Project rejected', {
      project: shape(project.toObject() as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return next(error);
  }
};

/** POST /projects/upload-images — multipart upload helper for projects. */
export const uploadProjectFiles = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('No files uploaded');
    const kind = (req.body?.kind as 'image' | 'document') === 'document' ? 'document' : 'image';
    const stored = await Promise.all(
      files.map((f) => uploadBuffer(f.buffer, { filename: f.originalname, kind, mimetype: f.mimetype })),
    );
    return sendCreated(res, 'Files uploaded successfully', { files: stored });
  } catch (error) {
    return next(error);
  }
};

/** GET /projects/meta/cities — city master for the header selector. */
export const listCities = async (_req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { PlatformConfig } = await import('../models/PlatformConfig');
    const config = await PlatformConfig.findOne({ key: 'default' }).lean();
    if (config?.cities?.length) {
      return sendOk(res, 'Cities fetched successfully', config.cities.map((c) => ({ name: c.name, localities: c.localities })));
    }
    // `$addToSet` is a group *accumulator*, so it cannot appear inside `_id`
    // (an expression context). Localities are accumulated per city and then
    // de-duplicated in memory.
    const cities = await Project.aggregate<{ _id: string | null; localities: string[]; count: number }>([
      { $group: { _id: '$city', localities: { $addToSet: '$locality' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return sendOk(
      res,
      'Cities fetched successfully',
      cities
        .filter((c) => Boolean(c._id))
        .map((c) => ({
          name: c._id,
          localities: (c.localities ?? []).filter(Boolean).sort(),
          projectCount: c.count,
        })),
    );
  } catch (error) {
    return next(error);
  }
};