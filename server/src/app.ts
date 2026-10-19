import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env, hasCloudinary, placeholderFlags } from './config/env';
import { cacheStatus } from './config/redis';
import { gatewayInfo } from './utils/razorpay';
import { storageMode } from './utils/storage';
import { errorHandler, notFoundHandler } from './utils/errorHandler';
import { sendOk } from './utils/response';
import { authenticate } from './middlewares/auth';
import { localUploadsDir } from './utils/storage';
import fs from 'fs';
import path from 'path';

import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/projects.routes';
import flatRoutes from './routes/flats.routes';
import visitRoutes from './routes/visits.routes';
import bookingRoutes from './routes/bookings.routes';
import builderRoutes, { inquiriesRouter } from './routes/builders.routes';
import { amenitiesRouter as amenityRoutes } from './routes/amenities.routes';
import adminRoutes, { disputesRouter } from './routes/admin.routes';
import webhookRoutes from './routes/webhooks.routes';
import notificationRoutes from './routes/notifications.routes';
import { loanRouter, requirementsRouter } from './routes/requirements.routes';
import { reviewsRouter, wishlistRouter } from './routes/reviews.routes';

export const createApp = (): Application => {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  const origins = env.frontendUrl.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origins.includes(origin) || env.isTest) return callback(null, true);
        if (!env.isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      exposedHeaders: ['X-FlatTown-Cache'],
    }) as express.RequestHandler,
  );

  app.use(compression());
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Webhooks need the raw body for signature verification — mounted before json().
  app.use('/api/v1/webhooks', webhookRoutes);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: env.isProd ? 300 : 2000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests. Please slow down.' },
    }),
  );

  // Local development uploads (no-op when Cloudinary is configured).
  //
  // Only PUBLIC asset buckets are served statically. `documents/` holds buyer
  // Aadhaar/PAN, builder KYC and RERA certificates — serving those from an
  // unauthenticated static mount would turn each URL into a permanent bearer
  // token. They are served through the authenticated route below instead.
  if (fs.existsSync(localUploadsDir) || !env.isProd) {
    app.use('/uploads/images', express.static(path.join(localUploadsDir, 'images'), { maxAge: '7d', fallthrough: true }));
    app.use(
      '/uploads/floor_plan',
      express.static(path.join(localUploadsDir, 'floor_plan'), { maxAge: '7d', fallthrough: true }),
    );
    app.use('/uploads/brochure', express.static(path.join(localUploadsDir, 'brochure'), { maxAge: '7d', fallthrough: true }));
    // NOTE: deliberately NO catch-all `/uploads` mount — it would re-expose
    // the private `documents/` bucket that the authenticated route guards.
  }

  /**
 * Liveness / readiness probe.
 *
 * Returns `503` when MongoDB is unreachable so a platform health check (Render,
 * Kubernetes) pulls the instance out of rotation instead of serving 500s from
 * every endpoint. Cache and payment gateway state are reported but never fail
 * the probe — a Redis outage must not take the API offline, and an unconfigured
 * gateway is a deliberate development mode.
 */
app.get('/health', async (_req: Request, res: Response) => {
    const { isDbConnected } = await import('./config/db');
    const database = isDbConnected() ? 'connected' : 'disconnected';
    const healthy = database === 'connected';
    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      message: healthy ? 'Flat Town API is healthy' : 'Flat Town API cannot reach the database',
      data: {
        status: healthy ? 'ok' : 'degraded',
        environment: env.nodeEnv,
        uptimeSeconds: Math.round(process.uptime()),
        database,
        cache: cacheStatus(),
        payments: gatewayInfo(),
        storage: storageMode(),
      },
    });
  });

  const api = express.Router();

  /**
   * Authenticated access to locally-stored private documents.
   *
   * In production Cloudinary is expected and this route is unused; the local
   * fallback exists so the document workflow is testable in development without
   * turning buyer Aadhaar/PAN and builder KYC files into public bearer URLs.
   */
  api.get('/files/documents/:filename', authenticate, (req: Request, res: Response) => {
    if (hasCloudinary()) {
      return sendOk(res, 'Documents are served by Cloudinary in this deployment');
    }
    const name = path.basename(String(req.params.filename));
    const dir = path.join(localUploadsDir, 'documents');
    const target = path.join(dir, name);
    // path.basename strips traversal; containment is re-checked as defence in depth.
    if (!path.resolve(target).startsWith(path.resolve(dir)) || !fs.existsSync(target)) {
      res.status(404);
      return sendOk(res, 'Document not found');
    }
    return res.sendFile(target, { headers: { 'Cache-Control': 'private,no-store' } });
  });

  api.use('/auth', authRoutes);
  api.use('/projects', projectRoutes);
  api.use('/flats', flatRoutes);
  api.use('/visits', visitRoutes);
  api.use('/bookings', bookingRoutes);
  api.use('/builders', builderRoutes);
  api.use('/inquiries', inquiriesRouter);
  api.use('/amenities', amenityRoutes);
  api.use('/amenities-master', amenityRoutes);
  api.use('/admin', adminRoutes);
  api.use('/requirements', requirementsRouter);
  api.use('/loan', loanRouter);
  api.use('/reviews', reviewsRouter);
  api.use('/wishlist', wishlistRouter);
  api.use('/disputes', disputesRouter);
  api.use('/notifications', notificationRoutes);
  api.use('/webhooks', webhookRoutes);

  // Meta endpoints mounted at the API root for convenience.
  api.get('/tiers/config', async (_req, res, next) => {
    try {
      const { getTierConfig } = await import('./controllers/amenities.controller');
      return getTierConfig(_req, res, next);
    } catch (error) {
      return next(error);
    }
  });
  api.get('/cities', async (req, res, next) => {
    try {
      const { listCities } = await import('./controllers/projects.controller');
      return listCities(req, res, next);
    } catch (error) {
      return next(error);
    }
  });
  api.get('/stats', async (req, res, next) => {
    try {
      const { getMarketplaceStats } = await import('./controllers/amenities.controller');
      return getMarketplaceStats(req, res, next);
    } catch (error) {
      return next(error);
    }
  });

  app.use(env.apiPrefix, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (!env.isProd) {
    // eslint-disable-next-line no-console
    console.log('[config] placeholders', placeholderFlags);
  }

  return app;
};

export const uploadsPath = path.resolve(localUploadsDir);