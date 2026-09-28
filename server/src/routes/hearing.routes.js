import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePermission, requireAnyPermission, PERMISSIONS } from '../config/permissions.js';
import {
  getHearingsMeta,
  getHearingsAvailability,
  getCauseList,
  getHearings,
  getHearingById,
  scheduleHearing,
  rescheduleHearing,
  cancelHearing,
  completeHearing,
  adjournHearing,
} from '../controllers/hearing.controller.js';

const router = Router();

// All hearing routes require authentication
router.use(authenticate);

// Hearing metadata and availability
router.get('/meta', requirePermission(PERMISSIONS.HEARING_VIEW), getHearingsMeta);
router.get('/availability', requirePermission(PERMISSIONS.HEARING_VIEW), getHearingsAvailability);

// Cause list for daily court proceedings (ADMIN, REGISTRAR, JUDGE, ADVOCATE)
router.get('/cause-list', requirePermission(PERMISSIONS.HEARING_VIEW), getCauseList);

// Hearings query list and details
router.get('/', requirePermission(PERMISSIONS.HEARING_VIEW), getHearings);
router.get('/:id', requirePermission(PERMISSIONS.HEARING_VIEW), getHearingById);

// Schedule a new hearing (ADMIN, REGISTRAR)
router.post('/', requirePermission(PERMISSIONS.HEARING_SCHEDULE), scheduleHearing);

// Reschedule a hearing (ADMIN, REGISTRAR, or presiding JUDGE)
router.patch(
  '/:id',
  requireAnyPermission([PERMISSIONS.HEARING_SCHEDULE, PERMISSIONS.HEARING_UPDATE]),
  rescheduleHearing
);

// Cancel a hearing (ADMIN, REGISTRAR, or presiding JUDGE)
router.post(
  '/:id/cancel',
  requireAnyPermission([PERMISSIONS.HEARING_SCHEDULE, PERMISSIONS.HEARING_UPDATE]),
  cancelHearing
);

// Complete a hearing (ADMIN, or presiding JUDGE)
router.post('/:id/complete', requirePermission(PERMISSIONS.HEARING_UPDATE), completeHearing);

// Adjourn a hearing (ADMIN, or presiding JUDGE)
router.post('/:id/adjourn', requirePermission(PERMISSIONS.HEARING_UPDATE), adjournHearing);

export default router;
