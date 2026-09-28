import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePermission, PERMISSIONS } from '../config/permissions.js';
import {
  getCasesMeta,
  getCasesStats,
  registerCase,
  getCases,
  getCaseById,
  getCaseHistory,
  updateCase,
} from '../controllers/case.controller.js';
import {
  assignAdvocateToCase,
  unassignAdvocateFromCase,
} from '../controllers/caseAdvocate.controller.js';

const router = Router();

// All case routes require authentication
router.use(authenticate);

// Case metadata and statistics
router.get('/meta', requirePermission(PERMISSIONS.CASE_VIEW), getCasesMeta);
router.get('/stats', requirePermission(PERMISSIONS.CASE_VIEW), getCasesStats);

// Case registration (ADMIN, REGISTRAR)
router.post('/', requirePermission(PERMISSIONS.CASE_CREATE), registerCase);

// Case query list (filtered by role visibility)
router.get('/', requirePermission(PERMISSIONS.CASE_VIEW), getCases);

// Case history audit timeline (returns 404 if out of scope)
router.get('/:id/history', requirePermission(PERMISSIONS.CASE_VIEW), getCaseHistory);

// Case detail (returns 404 if out of scope)
router.get('/:id', requirePermission(PERMISSIONS.CASE_VIEW), getCaseById);

// Case modification (ADMIN, REGISTRAR - closed cases blocked)
router.patch('/:id', requirePermission(PERMISSIONS.CASE_EDIT), updateCase);

// Case advocate assignment & unassignment (ADMIN, REGISTRAR)
router.post('/:id/advocates', requirePermission(PERMISSIONS.ADVOCATE_ASSIGN), assignAdvocateToCase);
router.post(
  '/:id/advocates/:advocateId/unassign',
  requirePermission(PERMISSIONS.ADVOCATE_ASSIGN),
  unassignAdvocateFromCase
);

export default router;
