import { Router } from 'express';
import * as buildersController from '../controllers/builders.controller';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { isBuilder, roleCheck } from '../middlewares/roleCheck';

const router = Router();

/** Public: top-rated builders for the marketplace. */
router.get('/top-rated', optionalAuth, buildersController.listTopBuilders);
router.get('/:id/rating', optionalAuth, buildersController.getBuilderRating);

/** Builder-only dashboard data. */
router.get('/me/dashboard', authenticate, isBuilder, buildersController.getBuilderDashboard);
router.get('/me/inquiries', authenticate, roleCheck('builder', 'agent'), buildersController.listBuilderInquiries);
router.get('/me/agents', authenticate, isBuilder, buildersController.listBuilderAgents);

export const inquiriesRouter = Router();
inquiriesRouter.put('/:id/status', authenticate, roleCheck('builder', 'agent', 'admin'), buildersController.updateInquiryStatus);

export default router;