import { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import { Amenity } from '../models/Amenity';
import { Flat, type IFlat } from '../models/Flat';
import { Project, type IProject } from '../models/Project';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { getPricingContext } from '../utils/pricingContext';

/** Shape returned by the `$facet` stage: one page of rows plus a total count. */
/** `$facet` as the final stage returns exactly one document holding both branches. */
interface FacetResult {
  items?: Array<Record<string, unknown>>;
  total?: Array<{ value: number }>;
}

export type SortKey =
  | 'relevance'
  | 'price:asc'
  | 'price:desc'
  | 'pricePerSqft:asc'
  | 'pricePerSqft:desc'
  | 'possessionDate:asc'
  | 'possessionDate:desc'
  | 'rating:desc'
  | 'views:desc'
  | 'newest';

export const FLAT_SORT_KEYS: SortKey[] = [
  'relevance',
  'price:asc',
  'price:desc',
  'pricePerSqft:asc',
  'pricePerSqft:desc',
  'possessionDate:asc',
  'possessionDate:desc',
  'rating:desc',
  'views:desc',
  'newest',
];

export const listQuerySchema = z
  .object({
    city: z.string().trim().min(1).optional(),
    locality: z.string().trim().min(1).optional(),
    bhk: z.string().optional(),
    tier: z.string().optional(),
    possession: z.string().optional(),
    type: z.string().optional(),
    amenities: z.string().optional(),
    priceMin: z.coerce.number().min(0).optional(),
    priceMax: z.coerce.number().min(0).optional(),
    projectId: z.string().optional(),
    builderId: z.string().optional(),
    facing: z.string().optional(),
    reraVerified: z.enum(['true', 'false']).optional(),
    reraOnly: z.enum(['true', 'false']).optional(),
    builderRatingMin: z.coerce.number().min(0).max(5).optional(),
    available: z.enum(['true', 'false']).optional(),
    tokenMax: z.coerce.number().min(0).optional(),
    q: z.string().trim().min(1).optional(),
    sortBy: z.enum(FLAT_SORT_KEYS as [SortKey, ...SortKey[]]).default('relevance'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(60).default(20),
    includeUnavailable: z.enum(['true', 'false']).optional(),
  })
  .strip();

export type FlatListQuery = z.infer<typeof listQuerySchema>;

const csv = (value?: string): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const toObjectIds = (values: string[]): Types.ObjectId[] =>
  values.filter((v) => Types.ObjectId.isValid(v)).map((v) => new Types.ObjectId(v));

export interface FlatListFilters {
  city?: string;
  locality?: string;
  bhk: number[];
  tiers: string[];
  possessions: string[];
  types: string[];
  amenities: Types.ObjectId[];
  priceMin?: number;
  priceMax?: number;
  projectId?: Types.ObjectId;
  builderId?: Types.ObjectId;
  facing: string[];
  reraVerified?: boolean;
  builderRatingMin?: number;
  available: boolean;
  tokenMax?: number;
  search?: string;
}

/**
 * Fills in the defaults for callers that build a filter object by hand
 * (e.g. "flats in this project"), so they never have to restate the
 * array fields that `parseFlatFilters` would normally derive from the query.
 */
export const emptyFlatFilters = (overrides: Partial<FlatListFilters> = {}): FlatListFilters => ({
  bhk: [],
  tiers: [],
  possessions: [],
  types: [],
  amenities: [],
  facing: [],
  available: true,
  ...overrides,
});

export const parseFlatFilters = (query: FlatListQuery): FlatListFilters => ({
  city: query.city,
  locality: query.locality,
  bhk: csv(query.bhk).map(Number).filter((n) => [1, 2, 3, 4].includes(n)),
  tiers: csv(query.tier).filter((t) => ['budget', 'mid', 'luxury'].includes(t)),
  possessions: csv(query.possession).filter((p) =>
    ['new_launch', 'under_construction', 'ready_to_move'].includes(p),
  ),
  types: csv(query.type).filter((t) => ['apartment', 'villa', 'penthouse'].includes(t)),
  amenities: toObjectIds(csv(query.amenities)),
  priceMin: query.priceMin,
  priceMax: query.priceMax,
  projectId: query.projectId && Types.ObjectId.isValid(query.projectId) ? new Types.ObjectId(query.projectId) : undefined,
  builderId: query.builderId && Types.ObjectId.isValid(query.builderId) ? new Types.ObjectId(query.builderId) : undefined,
  facing: csv(query.facing),
  reraVerified:
    query.reraVerified === undefined
      ? query.reraOnly === 'true'
        ? true
        : undefined
      : query.reraVerified === 'true',
  builderRatingMin: query.builderRatingMin,
  available: query.includeUnavailable !== 'true',
  tokenMax: query.tokenMax,
  search: query.q,
});

export const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Builds the shared `$match` stage used by listing and aggregation pipelines.
 *
 * Readiness rule (RULE 8): `ready_to_move` requires possessionDate <= today.
 */
export const buildFlatMatch = (filters: FlatListFilters): Record<string, unknown> => {
  const match: Record<string, unknown> = {};

  if (filters.bhk.length) match.bhk = { $in: filters.bhk };
  if (filters.tiers.length) match.tier = { $in: filters.tiers };
  if (filters.types.length) match.type = { $in: filters.types };
  if (filters.facing.length) match.facing = { $in: filters.facing };
  // RULE 9: amenities use $all — every requested amenity must be present.
  if (filters.amenities.length) match.amenities = { $all: filters.amenities };

  const price: Record<string, number> = {};
  if (filters.priceMin !== undefined) price.$gte = filters.priceMin;
  if (filters.priceMax !== undefined) price.$lte = filters.priceMax;
  if (Object.keys(price).length) match.totalPrice = price;

  if (filters.tokenMax !== undefined) match.tokenAmount = { $lte: filters.tokenMax };
  if (filters.projectId) match.projectId = filters.projectId;
  if (filters.builderId) match.builderId = filters.builderId;
  if (filters.search) {
    match.$text = { $search: filters.search };
  }

  // Possession filters.
  //
  // RULE 8: readiness is date-driven, so `ready_to_move` is a flat-level
  // `possessionDate <= today` test. The two future states are NOT derivable from
  // a date — they are distinct project statuses — so they additionally require
  // the joined project's status (see `projectFilterStage`).
  //
  // A flat whose possession date has already passed is never returned for a
  // future status, even if its project is still marked under construction:
  // possession is always the more specific signal. Folding all three states
  // into a single `possessionDate > today` clause would make `new_launch` and
  // `under_construction` indistinguishable, and would make
  // `ready_to_move,under_construction` match every flat.
  const possessionClauses: Record<string, unknown>[] = [];
  if (filters.possessions.includes('ready_to_move')) {
    possessionClauses.push({ possessionDate: { $lte: startOfToday() } });
  }
  const wantsFuture =
    filters.possessions.includes('new_launch') || filters.possessions.includes('under_construction');
  if (wantsFuture) {
    possessionClauses.push({ possessionDate: { $gt: startOfToday() } });
  }
  if (possessionClauses.length) {
    match.$and = [...((match.$and as unknown[]) ?? []), { $or: possessionClauses }];
  }

  return match;
};

export interface FlatSearchOptions {
  filters: FlatListFilters;
  sortBy: SortKey;
  page: number;
  limit: number;
  includeProject?: boolean;
  includeBuilder?: boolean;
}

const BUILDER_PROJECTION = 'name companyName avatar rating.avg rating.count isRERAVerified reraNumber isVerified';

/**
 * `.select()` takes a space-separated projection string, but an aggregation
 * `$project` stage requires an object. Converting here keeps a single source of
 * truth for the builder field list.
 */
const projectionObject = (projection: string): Record<string, 1> =>
  Object.fromEntries(
    projection
      .split(/\s+/)
      .filter(Boolean)
      .map((field) => [field, 1 as const]),
  );

/**
 * Sort keys, highest priority first.
 *
 * Expressed as a single document rather than a list of documents: `$sort` only
 * accepts the array form on MongoDB 5.0+, and the tie-breaker chain below is
 * exactly equivalent to the multi-key object form.
 */
const buildSortStage = (sortBy: SortKey): Record<string, 1 | -1> => {
  switch (sortBy) {
    case 'price:asc':
      return { totalPrice: 1, _id: 1 };
    case 'price:desc':
      return { totalPrice: -1, _id: 1 };
    case 'pricePerSqft:asc':
      return { pricePerSqft: 1, totalPrice: 1, _id: 1 };
    case 'pricePerSqft:desc':
      return { pricePerSqft: -1, totalPrice: 1, _id: 1 };
    case 'possessionDate:asc':
      return { possessionDate: 1, _id: 1 };
    case 'possessionDate:desc':
      return { possessionDate: -1, _id: 1 };
    case 'views:desc':
      return { views: -1, _id: 1 };
    case 'newest':
      return { createdAt: -1, _id: 1 };
    case 'rating:desc':
      return { 'builder.rating.avg': -1, 'project.rating.avg': -1, totalPrice: 1, _id: 1 };
    case 'relevance':
    default:
      // RULE 6: RERA-verified first, then builder rating, then price.
      return {
        'project.isRERAVerified': -1,
        'builder.rating.avg': -1,
        totalPrice: 1,
        _id: 1,
      };
  }
};

/** Project-side filters (city / locality / RERA / possession status) after the lookup. */
const projectFilterStage = (filters: FlatListFilters): Record<string, unknown> => {
  const projectMatch: Record<string, unknown> = { isApproved: true };
  if (filters.city) projectMatch.city = { $regex: `^${escapeRegex(filters.city)}$`, $options: 'i' };
  if (filters.locality) projectMatch.locality = { $regex: `^${escapeRegex(filters.locality)}$`, $options: 'i' };
  if (filters.reraVerified !== undefined) projectMatch.isRERAVerified = filters.reraVerified;
  // `new_launch` and `under_construction` are distinct project statuses and are
  // not inferable from a possession date.
  const futureStatuses = filters.possessions.filter((p) => p === 'new_launch' || p === 'under_construction');
  if (futureStatuses.length) projectMatch.status = { $in: futureStatuses };
  return projectMatch;
};

const builderFilterStage = (filters: FlatListFilters): Record<string, unknown> => {
  if (filters.builderRatingMin === undefined) return {};
  return { 'builder.rating.avg': { $gte: filters.builderRatingMin } };
};

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface FlatListResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Runs the discovery aggregation pipeline:
 * match flat → match project → lookup builder → apply builder rating filter →
 * sort (RERA, rating, price) → facet → paginate.
 */
export const searchFlats = async (options: FlatSearchOptions): Promise<FlatListResult> => {
  const { filters, sortBy, page, limit } = options;
  const flatMatch = buildFlatMatch(filters);
  if (filters.available) flatMatch.isAvailable = true;

  const skip = (page - 1) * limit;

  const lookupProject: Record<string, unknown>[] = [
    {
      $lookup: {
        from: 'projects',
        localField: 'projectId',
        foreignField: '_id',
        as: 'project',
        pipeline: [{ $match: projectFilterStage(filters) }],
      },
    },
    { $unwind: { path: '$project', preserveNullAndEmptyArrays: false } },
  ];

  const lookupBuilder: Record<string, unknown>[] = [
    {
      $lookup: {
        from: 'users',
        localField: 'builderId',
        foreignField: '_id',
        as: 'builder',
        pipeline: [{ $project: projectionObject(BUILDER_PROJECTION) }],
      },
    },
    { $unwind: { path: '$builder', preserveNullAndEmptyArrays: true } },
  ];

  const postLookupMatch = builderFilterStage(filters);

  /**
   * The pipeline is assembled from loosely-typed helpers, so it is cast to
   * mongoose's `PipelineStage[]` once here rather than at every stage.
   */
  const pipeline = [
    { $match: flatMatch },
    ...lookupProject,
    ...lookupBuilder,
    ...(Object.keys(postLookupMatch).length ? [{ $match: postLookupMatch }] : []),
    { $facet: {
      items: [
        { $sort: buildSortStage(sortBy) },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            title: 1,
            bhk: 1,
            type: 1,
            sizeSqft: 1,
            pricePerSqft: 1,
            totalPrice: 1,
            tier: 1,
            floorRise: 1,
            parkingCharges: 1,
            floor: 1,
            tower: 1,
            facing: 1,
            amenities: 1,
            possessionDate: 1,
            isAvailable: 1,
            visitCharge: 1,
            tokenAmount: 1,
            images: 1,
            floorPlan: 1,
            tour360Url: 1,
            views: 1,
            projectId: 1,
            builderId: 1,
            agentId: 1,
            project: 1,
            builder: 1,
          },
        },
      ],
      total: [{ $count: 'value' }],
    } },
  ] as unknown as PipelineStage[];

  const result = (await Flat.aggregate(pipeline).exec()) as unknown as FacetResult[];
  // A trailing `$facet` always yields a single document wrapping the branches.
  const aggregate = result?.[0];
  const items = (aggregate?.items ?? []) as Array<Record<string, unknown>>;
  const total = aggregate?.total?.[0]?.value ?? 0;

  // Attach amenity details for the cards/icons.
  const amenityIds = [
    ...new Set(
      items.flatMap((item) => {
        const fromFlat = (item.amenities ?? []) as Types.ObjectId[];
        const fromProject = ((item.project as IProject | undefined)?.amenities ?? []) as Types.ObjectId[];
        return [...fromFlat, ...fromProject].map((a) => String(a));
      }),
    ),
  ];
  const amenityMap = await loadAmenityMap(amenityIds);

  const enriched = items.map((item) => enrichFlat(item, amenityMap));
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    items: enriched,
    total,
    page,
    limit,
    totalPages,
    hasNext: skip + enriched.length < total,
    hasPrev: page > 1,
  };
};

const loadAmenityMap = async (ids: string[]): Promise<Map<string, { name: string; icon: string; category: string }>> => {
  if (!ids.length) return new Map();
  const { Amenity } = await import('../models/Amenity');
  const docs = await Amenity.find({ _id: { $in: ids } }).select('name icon category').lean();
  return new Map(
    docs.map((d) => [String(d._id), { name: d.name, icon: d.icon, category: d.category }]),
  );
};

export const enrichFlat = (
  item: Record<string, unknown>,
  amenityMap?: Map<string, { name: string; icon: string; category: string }>,
): Record<string, unknown> => {
  const project = (item.project ?? undefined) as Partial<IProject> | undefined;
  const builder = (item.builder ?? undefined) as Record<string, unknown> | undefined;
  const flatAmenities = ((item.amenities ?? []) as Types.ObjectId[]).map((id) => amenityMap?.get(String(id)));
  const projectAmenities = ((project?.amenities ?? []) as Types.ObjectId[]).map((id) => amenityMap?.get(String(id)));
  const merged = new Map<string, { name: string; icon: string; category: string }>();
  for (const a of [...projectAmenities, ...flatAmenities]) {
    if (a) merged.set(a.name, a);
  }

  return {
    id: String(item._id),
    title: item.title,
    bhk: item.bhk,
    type: item.type,
    sizeSqft: item.sizeSqft,
    pricePerSqft: item.pricePerSqft,
    totalPrice: item.totalPrice,
    tier: item.tier,
    floorRise: item.floorRise ?? 0,
    parkingCharges: item.parkingCharges ?? 0,
    floor: item.floor,
    tower: item.tower,
    facing: item.facing,
    possessionDate: item.possessionDate,
    isAvailable: item.isAvailable,
    visitCharge: item.visitCharge,
    tokenAmount: item.tokenAmount,
    images: item.images ?? [],
    floorPlan: item.floorPlan ?? null,
    tour360Url: item.tour360Url ?? project?.tour360Url ?? null,
    views: item.views,
    amenities: Array.from(merged.values()),
    project: project
      ? {
          id: String(project._id ?? project.id ?? ''),
          projectName: project.projectName,
          slug: (project as { slug?: string }).slug,
          city: project.city,
          locality: project.locality,
          fullAddress: project.fullAddress,
          geo: project.geo,
          reraNumber: project.reraNumber,
          isRERAVerified: project.isRERAVerified,
          status: project.status,
          possessionDate: project.possessionDate,
          images: project.images,
          brochureUrl: project.brochureUrl,
          builderName: project.builderName,
          rating: project.rating,
        }
      : null,
    builder: builder
      ? {
          id: String(builder._id ?? ''),
          name: builder.name,
          companyName: builder.companyName,
          avatar: builder.avatar,
          rating: builder.rating ?? { avg: 0, count: 0 },
          isRERAVerified: builder.isRERAVerified,
          reraNumber: builder.reraNumber,
          isVerified: builder.isVerified,
        }
      : null,
  };
};

/** Full detail payload for /flats/:id (client components fetch this). */
export const flatDetailPayload = async (flat: IFlat, opts: { incrementViews?: boolean } = {}) => {
  const [project, builder] = await Promise.all([
    Project.findById(flat.projectId).lean(),
    User.findById(flat.builderId).select(BUILDER_PROJECTION).lean(),
  ]);

  // Amenities come from both the flat and its project, so this depends on `project`
  // and therefore cannot be part of the same destructured Promise.all above.
  const amenities = await Amenity.find({
    _id: { $in: [...(flat.amenities ?? []), ...((project?.amenities as Types.ObjectId[]) ?? [])] },
  }).lean();

  if (opts.incrementViews) {
    await Flat.updateOne({ _id: flat._id }, { $inc: { views: 1 } });
  }

  const { thresholds } = getPricingContext();
  return {
    id: String(flat._id),
    title: flat.title,
    bhk: flat.bhk,
    type: flat.type,
    sizeSqft: flat.sizeSqft,
    pricePerSqft: flat.pricePerSqft,
    floorRise: flat.floorRise ?? 0,
    parkingCharges: flat.parkingCharges ?? 0,
    totalPrice: flat.totalPrice,
    tier: flat.tier,
    floor: flat.floor,
    tower: flat.tower,
    facing: flat.facing,
    possessionDate: flat.possessionDate,
    isAvailable: flat.isAvailable,
    visitCharge: flat.visitCharge,
    tokenAmount: flat.tokenAmount,
    commissionPercent: flat.commissionPercent,
    images: flat.images ?? [],
    floorPlan: flat.floorPlan ?? null,
    tour360Url: flat.tour360Url ?? project?.tour360Url ?? null,
    views: flat.views,
    inquiriesCount: flat.inquiriesCount,
    visitCount: flat.visitCount,
    amenities: amenities.map((a) => ({ id: String(a._id), name: a.name, icon: a.icon, category: a.category })),
    project: project
      ? {
          id: String(project._id),
          projectName: project.projectName,
          slug: project.slug,
          city: project.city,
          locality: project.locality,
          fullAddress: project.fullAddress,
          geo: project.geo,
          reraNumber: project.reraNumber,
          isRERAVerified: project.isRERAVerified,
          status: project.status,
          possessionDate: project.possessionDate,
          images: project.images,
          floorPlans: project.floorPlans,
          brochureUrl: project.brochureUrl,
          tour360Url: project.tour360Url,
          builderName: project.builderName,
          rating: project.rating,
          tierStats: project.tierStats,
          isApproved: project.isApproved,
        }
      : null,
    builder: builder
      ? {
          id: String(builder._id),
          name: builder.name,
          companyName: (builder as unknown as { companyName?: string }).companyName,
          avatar: (builder as unknown as { avatar?: string }).avatar,
          rating: (builder as unknown as { rating?: { avg: number; count: number } }).rating,
          isRERAVerified: (builder as unknown as { isRERAVerified?: boolean }).isRERAVerified,
          reraNumber: (builder as unknown as { reraNumber?: string }).reraNumber,
          isVerified: (builder as unknown as { isVerified?: boolean }).isVerified,
        }
      : null,
    priceBreakdown: {
      baseTotal: (flat.sizeSqft ?? 0) * (flat.pricePerSqft ?? 0),
      floorRise: flat.floorRise ?? 0,
      parkingCharges: flat.parkingCharges ?? 0,
      totalPrice: flat.totalPrice,
      tier: flat.tier,
      tierThresholds: thresholds,
    },
    commission: {
      // Explicitly token-based — never derived from totalPrice.
      basis: 'booking_token',
      percent: flat.commissionPercent,
      amountOnDefaultToken: Math.round(((flat.tokenAmount ?? 0) * (flat.commissionPercent ?? 0)) / 100),
      note: 'Platform commission is charged on the booking token only, not on the property price.',
    },
  };
};

export const ensureProjectOwnership = async (projectId: string, userId: string): Promise<IProject> => {
  const project = await Project.findById(projectId);
  if (!project) throw ApiError.notFound('Project not found');
  if (String(project.builderId) !== String(userId)) {
    throw ApiError.forbidden('You can only modify your own projects');
  }
  return project;
};

export const ensureFlatOwnership = async (
  flatId: string,
  userId: string,
  role: string,
): Promise<IFlat> => {
  const flat = await Flat.findById(flatId);
  if (!flat) throw ApiError.notFound('Flat not found');
  if (role === 'admin') return flat;
  if (String(flat.builderId) === String(userId)) return flat;
  if (role === 'agent' && String(flat.agentId) === String(userId)) return flat;
  throw ApiError.forbidden('You can only modify flats you own or are assigned to');
};