import { Types } from 'mongoose';
import { Flat } from '../models/Flat';
import { Project } from '../models/Project';

/**
 * Recomputes and persists the denormalised project counters:
 * tierStats, totalFlats, availableFlats and the min/max price range.
 */
export const recalculateProjectStats = async (projectId: Types.ObjectId | string): Promise<void> => {
  const stats = await Flat.aggregate([
    { $match: { projectId: new Types.ObjectId(String(projectId)) } },
    {
      $group: {
        _id: '$tier',
        count: { $sum: 1 },
        availableCount: { $sum: { $cond: ['$isAvailable', 1, 0] } },
        minPrice: { $min: '$totalPrice' },
        maxPrice: { $max: '$totalPrice' },
      },
    },
  ]);

  const tierStats = { budget: 0, mid: 0, luxury: 0 };
  let totalFlats = 0;
  let availableFlats = 0;
  let minPrice = 0;
  let maxPrice = 0;
  let first = true;

  for (const row of stats) {
    const tier = row._id as keyof typeof tierStats;
    if (tier in tierStats) tierStats[tier] = row.count;
    totalFlats += row.count;
    availableFlats += row.availableCount;
    const rowMin = row.minPrice ?? 0;
    const rowMax = row.maxPrice ?? 0;
    if (first) {
      minPrice = rowMin;
      maxPrice = rowMax;
      first = false;
    } else {
      minPrice = Math.min(minPrice, rowMin);
      maxPrice = Math.max(maxPrice, rowMax);
    }
  }

  const project = await Project.findById(projectId);
  if (!project) return;

  // Readiness is date-driven (RULE 8): a project is ready when possession has passed.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const derivedStatus =
    project.status === 'ready_to_move' || project.possessionDate.getTime() <= today.getTime()
      ? 'ready_to_move'
      : project.status;

  await Project.updateOne(
    { _id: projectId },
    {
      $set: {
        tierStats,
        totalFlats,
        availableFlats,
        minPrice,
        maxPrice,
        status: derivedStatus,
        'geo.lat': project.geo?.lat ?? 0,
      },
    },
  );
};

export const recalculateAllProjectStats = async (): Promise<number> => {
  const projectIds = await Project.find({}).select('_id').lean();
  for (const p of projectIds) {
    await recalculateProjectStats(p._id);
  }
  return projectIds.length;
};

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const buildUniqueSlug = async (base: string, excludeId?: Types.ObjectId): Promise<string> => {
  const root = slugify(base) || 'project';
  let candidate = root;
  let suffix = 1;
  while (await Project.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
  return candidate;
};