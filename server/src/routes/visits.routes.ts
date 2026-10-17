import { Router } from 'express';
import * as visitsController from '../controllers/visits.controller';
import { authenticate } from '../middlewares/auth';
import { isBuyer } from '../middlewares/roleCheck';

const router = Router();

router.get('/', authenticate, visitsController.listVisits);
router.get('/availability', authenticate, visitsController.getAvailability);
router.get('/:id', authenticate, visitsController.getVisit);

/** Buyer books a site visit (free or paid via Razorpay on the next step). */
router.post('/request', authenticate, isBuyer, visitsController.requestVisit);
router.post('/:id/pay', authenticate, isBuyer, visitsController.payVisit);
router.put('/:id/status', authenticate, visitsController.updateVisitStatus);

export default router;