import { Router } from 'express';
import * as projectsController from '../controllers/projects.controller';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { isBuilder, isBuilderOrAgent, roleCheck } from '../middlewares/roleCheck';
import { uploadDocument, uploadImage, enforceRealContentType } from '../middlewares/upload';

const router = Router();

router.get('/meta/cities', projectsController.listCities);
router.get('/', optionalAuth, projectsController.listProjects);

router.post('/', authenticate, isBuilder, projectsController.createProject);

router.post(
  '/upload-files',
  authenticate,
  isBuilderOrAgent,
  uploadDocument.array('files', 8),
  enforceRealContentType(['pdf', 'doc', 'image']),
  projectsController.uploadProjectFiles,
);

router.get('/:id', optionalAuth, projectsController.getProject);
router.get('/:projectId/flats', optionalAuth, projectsController.listProjectFlats);

router.put(
  '/:id',
  authenticate,
  isBuilderOrAgent,
  uploadImage.array('images', 10),
  enforceRealContentType(['image']),
  projectsController.updateProject,
);

router.put('/:id/rera-upload', authenticate, isBuilderOrAgent, projectsController.uploadRera);

router.put('/:id/approve', authenticate, roleCheck('admin'), projectsController.approveProject);

router.delete('/:id', authenticate, isBuilderOrAgent, projectsController.deleteProject);

export default router;