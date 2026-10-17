import { Router } from 'express';
import * as flatsController from '../controllers/flats.controller';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { isBuilderOrAgent, requireAuth, roleCheck } from '../middlewares/roleCheck';
import { CACHE_TTL_FLAT_DISCOVERY, cacheMiddleware } from '../middlewares/cache';
import { uploadImage } from '../middlewares/upload';
import { reraVerifiedResourceCheck } from '../middlewares/reraVerifiedCheck';
import { Project } from '../models/Project';
import { User } from '../models/User';

const router = Router();

// Meta routes first so they are not shadowed by /:id
router.get('/meta/price-range', flatsController.priceRange);
router.get('/compare', optionalAuth, flatsController.compareFlats);
router.post('/upload-images', requireAuth, isBuilderOrAgent, uploadImage.array('images', 10), flatsController.uploadFlatImages);

/** Public discovery endpoint — Redis cached for 5 minutes (RULE 11). */
router.get(
  '/',
  optionalAuth,
  cacheMiddleware('flats:discovery', CACHE_TTL_FLAT_DISCOVERY, flatsController.discoveryCacheKey),
  flatsController.listFlats,
);

router.post(
  '/',
  authenticate,
  isBuilderOrAgent,
  // Flat creation requires a RERA-verified builder account.
  reraVerifiedResourceCheck(async (req) => {
    const project = await Project.findById(String(req.body?.projectId ?? ''))
      .select('builderId isRERAVerified')
      .lean();
    if (!project) return null;
    const builder = await User.findById(project.builderId).select('isRERAVerified').lean();
    return {
      isRERAVerified: Boolean(builder?.isRERAVerified),
      label: 'This project',
    };
  }),
  flatsController.createFlat,
);

router.get('/:id', optionalAuth, flatsController.getFlat);
router.get('/:id/reviews', flatsController.listFlatReviews);

// Buyers (and admins acting on their behalf) raise inquiries. Agents cannot.
router.post('/:id/inquiry', authenticate, roleCheck('buyer', 'admin'), flatsController.createInquiry);

router.put(
  '/:id',
  authenticate,
  uploadImage.array('images', 10),
  async (req, res, next) => {
    // Merge any uploaded images into the payload before validation.
    if (Array.isArray(req.files) && req.files.length > 0) {
      const { uploadBuffer } = await import('../utils/storage');
      const stored = await Promise.all(
        (req.files as Express.Multer.File[]).map((f) =>
          uploadBuffer(f.buffer, { filename: f.originalname, kind: 'image', mimetype: f.mimetype }),
        ),
      );
      req.body.images = [
        ...((req.body.images ? JSON.parse(String(req.body.images)) : []) as Array<Record<string, unknown>>),
        ...stored.map((s) => ({ url: s.url, publicId: s.publicId })),
      ];
    }
    return next();
  },
  flatsController.updateFlat,
);

router.delete('/:id', authenticate, flatsController.deleteFlat);

export default router;