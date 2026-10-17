import { Router } from 'express';
import * as requirementsController from '../controllers/requirements.controller';
import { authenticate } from '../middlewares/auth';
import { isBuyer } from '../middlewares/roleCheck';

export const requirementsRouter = Router();

requirementsRouter.use(authenticate, isBuyer);
requirementsRouter.post('/', requirementsController.createRequirement);
requirementsRouter.get('/', requirementsController.listRequirements);
requirementsRouter.get('/matches', requirementsController.listRequirementMatches);
requirementsRouter.delete('/:id', requirementsController.deleteRequirement);

export const loanRouter = Router();

loanRouter.post('/apply', authenticate, isBuyer, requirementsController.applyLoan);
loanRouter.get('/application', authenticate, isBuyer, requirementsController.listLoanApplications);
loanRouter.get('/partners', authenticate, requirementsController.listLoanPartners);