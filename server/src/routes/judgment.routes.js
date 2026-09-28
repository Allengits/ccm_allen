import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePermission, PERMISSIONS } from '../config/permissions.js';
import {
  getJudgmentsMeta,
  getJudgments,
} from '../controllers/judgment.controller.js';

const router = Router();

// All judgment endpoints require authentication
router.use(authenticate);

// Judgment metadata (outcomes, states, active judges)
router.get('/meta', requirePermission(PERMISSIONS.JUDGMENT_VIEW), getJudgmentsMeta);

// Judgment list with filters, pagination, search, visibility scoping
router.get('/', requirePermission(PERMISSIONS.JUDGMENT_VIEW), getJudgments);

export default router;
