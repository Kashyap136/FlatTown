import { Router } from 'express';
import * as reviewsController from '../controllers/reviews.controller';
import * as wishlistController from '../controllers/wishlist.controller';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { isBuyer, roleCheck } from '../middlewares/roleCheck';

export const reviewsRouter = Router();

reviewsRouter.get('/', optionalAuth, reviewsController.listReviews);
reviewsRouter.post('/', authenticate, isBuyer, reviewsController.createReview);
reviewsRouter.put('/:id/moderate', authenticate, roleCheck('admin'), reviewsController.moderateReview);

export const wishlistRouter = Router();

wishlistRouter.use(authenticate, isBuyer);
// `POST /wishlist/toggle` takes `{ flatId }` in the body (API reference);
// `POST /wishlist/toggle/:id` takes it in the path (web client). Same handler.
wishlistRouter.post('/toggle', wishlistController.toggleWishlist);
wishlistRouter.post('/toggle/:id', wishlistController.toggleWishlist);
wishlistRouter.get('/me', wishlistController.getMyWishlist);
wishlistRouter.get('/ids', wishlistController.getWishlistIds);
wishlistRouter.delete('/:id', wishlistController.removeFromWishlist);