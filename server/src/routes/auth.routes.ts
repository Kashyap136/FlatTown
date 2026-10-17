import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { uploadImage } from '../middlewares/upload';
import { uploadBuffer, type StoredFile } from '../utils/storage';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // The test suite provisions many accounts in one process; the production
  // brute-force guard is intentionally kept at 30 for real traffic.
  limit: env.isTest ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authLimiter, authController.refresh);
router.post('/logout', authController.logout);

router.get('/me', authenticate, authController.me);
router.put('/profile', authenticate, authController.updateProfile);
router.put('/password', authenticate, authController.changePassword);

router.post(
  '/upload-avatar',
  authenticate,
  uploadImage.single('avatar'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No image uploaded' });
        return;
      }
      const stored: StoredFile = await uploadBuffer(req.file.buffer, {
        filename: req.file.originalname,
        kind: 'image',
        mimetype: req.file.mimetype,
      });
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      req.user.avatar = stored.url;
      await req.user.save();
      res.status(200).json({
        success: true,
        message: 'Avatar updated successfully',
        data: { url: stored.url, avatar: req.user.avatar },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;