import type { NextFunction, Request, Response } from 'express';
import { cacheGet, cacheSet } from '../config/redis';
import { env } from '../config/env';
import type { Meta } from '../utils/response';

/**
 * GET-response cache for the flat discovery endpoint.
 *
 * Cache-Control: private,max-age=0 keeps shared proxies and the browser honest
 * while Redis does the actual caching server-side.
 */
export const CACHE_TTL_FLAT_DISCOVERY = 60 * 5; // 5 minutes
export const CACHE_TTL_PROJECTS = 60 * 5;
export const CACHE_TTL_META = 60 * 30;
export const PROJECT_CACHE_TTL = CACHE_TTL_PROJECTS;

export const cacheMiddleware =
  (namespace: string, ttlSeconds: number = CACHE_TTL_FLAT_DISCOVERY, keyFrom?: (req: Request) => string) =>
  async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
    if (req.method !== 'GET') return next();

    const cacheKey = keyFrom ? keyFrom(req) : `flattown:${namespace}:${req.originalUrl}`;
    const cached = await cacheGet<{ body: unknown; meta?: Meta; cachedAt: number }>(cacheKey);

    if (cached) {
      res.setHeader('X-FlatTown-Cache', 'HIT');
      res.setHeader('Cache-Control', 'private,max-age=0,must-revalidate');
      const meta = cached.meta ? { ...cached.meta, cached: true, cachedAt: cached.cachedAt } : { cached: true };
      return res.status(200).json({
        success: true,
        message: 'Fetched from cache',
        data: cached.body,
        meta,
      });
    }

    res.setHeader('X-FlatTown-Cache', 'MISS');
    res.setHeader('Cache-Control', 'private,max-age=0,must-revalidate');

    const originalJson = res.json.bind(res);
    res.json = (payload: unknown): Response => {
      const body = payload as { data?: unknown; meta?: Meta };
      if (body && typeof body === 'object' && (body as { success?: boolean }).success) {
        const cachedAt = Date.now();
        void cacheSet(
          cacheKey,
          { body: body.data, meta: body.meta, cachedAt },
          ttlSeconds,
        );
      }
      return originalJson(payload);
    };

    if (!env.isProd) {
      // Keep cache observability in development logs.
      void ttlSeconds;
    }

    return next();
  };