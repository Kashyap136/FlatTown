import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate } from '../middlewares/auth';
import { isAdmin, requireAuth } from '../middlewares/roleCheck';

const router = Router();

// Every admin route requires an authenticated admin (RULE 5 / RULE 12).
router.use(authenticate, isAdmin);

router.get('/dashboard', adminController.getAdminDashboard);

// Verification queue
router.get('/verification-queue', adminController.getVerificationQueue);
router.put('/verify-kyc/:builderId', adminController.verifyKyc);
router.put('/verify-rera/:builderId', adminController.verifyRera);

// Projects
router.put('/approve-project/:id', adminController.approveProject);

// Escrow + finance
router.get('/escrow', adminController.getEscrowLedger);
router.get('/revenue', adminController.getRevenue);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/bookings', adminController.listAllBookings);
router.get('/inquiries', adminController.listAllInquiries);

// Configuration (tiers, commission, agent split, tokens, visits)
router.get('/commission-config', adminController.getConfig);
router.put('/commission-config', adminController.updateConfig);

// Per-agent commission share — admin only; agents cannot set their own.
router.put('/agents/:id/commission', adminController.setAgentCommissionShare);

// Amenity master
router.get('/amenities', adminController.listAmenitiesAdmin);

// Disputes
router.get('/disputes', adminController.listDisputes);
router.put('/disputes/:id', adminController.resolveDispute);

// Ratings moderation
router.get('/reviews', adminController.listReviewsForModeration);

// Loan partners
router.get('/loan-partners', adminController.listLoanPartnersAdmin);
router.post('/loan-partners', adminController.createLoanPartner);
router.put('/loan-partners/:id', adminController.updateLoanPartner);
router.get('/loan-applications', adminController.listLoanApplicationsAdmin);
router.put('/loan-applications/:id', adminController.updateLoanApplication);

export const disputesRouter = Router();
disputesRouter.post('/', authenticate, requireAuth, adminController.createDispute);

export default router;