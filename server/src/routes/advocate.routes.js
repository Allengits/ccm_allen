import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePermission, PERMISSIONS } from '../config/permissions.js';
import {
  getAdvocates,
  getAdvocateById,
  createAdvocate,
  updateAdvocate,
  getAdvocateMeta,
} from '../controllers/advocate.controller.js';

const router = Router();

// All advocate routes require authentication
router.use(authenticate);

// Specialization metadata
router.get('/meta', getAdvocateMeta);

// Directory query (ADMIN, REGISTRAR, JUDGE)
router.get('/', requirePermission(PERMISSIONS.ADVOCATE_VIEW), getAdvocates);

// Advocate detail profile (Scoper: ADVOCATE can only view self)
router.get('/:id', getAdvocateById);

// Advocate registration (ADMIN, REGISTRAR)
router.post('/', requirePermission(PERMISSIONS.ADVOCATE_MANAGE), createAdvocate);

// Advocate update (ADMIN, REGISTRAR - bar number immutable)
router.patch('/:id', requirePermission(PERMISSIONS.ADVOCATE_MANAGE), updateAdvocate);

export default router;
