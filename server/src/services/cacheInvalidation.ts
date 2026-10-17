import { CACHE_KEY_ROOT, cacheDel, cacheDelByPrefix } from '../config/redis';
import type { IFlat } from '../models/Flat';
import type { IProject } from '../models/Project';
import type { IUser } from '../models/User';

export const CACHE_NAMESPACES = {
  flats: 'flats:discovery',
  projects: 'projects',
  amenities: 'amenities',
  config: 'config',
  builders: 'builders',
  reviews: 'reviews',
  meta: 'meta',
} as const;

/**
 * The full Redis key prefix for a namespace.
 *
 * `buildKey()` writes `flattown:<namespace>:<parts>`, so prefix invalidation
 * MUST scan on `flattown:<namespace>` too. Scanning on the bare namespace
 * matches zero keys and silently invalidates nothing — which meant a flat being
 * marked sold, or a builder being RERA-verified, left stale results in the
 * marketplace for the full 5-minute TTL. Routing every prefix through this
 * helper keeps writes and deletes in lockstep.
 */
const fullPrefix = (namespace: string): string => `${CACHE_KEY_ROOT}:${namespace}`;

const delMany = async (keys: string[]): Promise<void> => {
  await cacheDel(...keys);
};

const delPrefixes = async (prefixes: string[]): Promise<void> => {
  for (const prefix of prefixes) {
    await cacheDelByPrefix(fullPrefix(prefix));
  }
};

/**
 * Central invalidation entry points.
 *
 * Every mutation that can change discovery results must funnel through one of
 * these helpers: flat changes, project changes, RERA status changes,
 * availability changes, rating changes and configuration changes.
 */
export const invalidateFlat = async (flat?: Partial<IFlat>): Promise<void> => {
  await delPrefixes([CACHE_NAMESPACES.flats, CACHE_NAMESPACES.projects]);
  if (flat?._id) await delMany([`${fullPrefix('flat')}:${flat._id}`]);
};

export const invalidateProject = async (project?: Partial<IProject>): Promise<void> => {
  await delPrefixes([CACHE_NAMESPACES.flats, CACHE_NAMESPACES.projects]);
  if (project?._id) await delMany([`${fullPrefix('project')}:${project._id}`]);
};

export const invalidateBuilder = async (builder?: Partial<IUser>): Promise<void> => {
  await delPrefixes([CACHE_NAMESPACES.flats, CACHE_NAMESPACES.projects, CACHE_NAMESPACES.builders]);
  if (builder?._id) await delMany([`${fullPrefix('builder')}:${builder._id}`]);
};

/** RERA verification / approval changes alter the priority ranking. */
export const invalidateVerification = async (builder?: Partial<IUser>): Promise<void> => {
  await invalidateBuilder(builder);
  await delPrefixes([CACHE_NAMESPACES.projects]);
};

export const invalidateConfig = async (): Promise<void> => {
  await delPrefixes([CACHE_NAMESPACES.flats, CACHE_NAMESPACES.config, CACHE_NAMESPACES.meta, CACHE_NAMESPACES.amenities]);
};

export const invalidateReviews = async (): Promise<void> => {
  await delPrefixes([CACHE_NAMESPACES.reviews, CACHE_NAMESPACES.builders, CACHE_NAMESPACES.flats]);
};

export const invalidateAmenities = async (): Promise<void> => {
  await delPrefixes([CACHE_NAMESPACES.amenities, CACHE_NAMESPACES.flats]);
};

export const invalidateAllDiscovery = async (): Promise<void> => {
  await delPrefixes([
    CACHE_NAMESPACES.flats,
    CACHE_NAMESPACES.projects,
    CACHE_NAMESPACES.builders,
    CACHE_NAMESPACES.amenities,
    CACHE_NAMESPACES.reviews,
  ]);
};