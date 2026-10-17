import { Router } from 'express';
import * as amenitiesController from '../controllers/amenities.controller';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { roleCheck } from '../middlewares/roleCheck';

export const amenitiesRouter = Router();

// Public amenity master + tier configuration.
amenitiesRouter.get('/', optionalAuth, amenitiesController.listAmenities);

amenitiesRouter.post('/', authenticate, roleCheck('admin'), amenitiesController.createAmenity);
amenitiesRouter.put('/:id', authenticate, roleCheck('admin'), amenitiesController.updateAmenity);
amenitiesRouter.delete('/:id', authenticate, roleCheck('admin'), amenitiesController.deleteAmenity);