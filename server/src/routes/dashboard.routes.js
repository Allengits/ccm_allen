import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requirePermission, requireAnyPermission, PERMISSIONS } from '../config/permissions.js';
import {
  getDashboardSummary,
  getDashboardBacklog,
  getDashboardStaleCases,
  getDashboardUpcomingHearings,
  getDashboardWorkload,
  getDashboardSettingsEndpoint,
  patchDashboardSettings,
} from '../controllers/dashboard.controller.js';

const router = Router();

// All dashboard endpoints require authentication
router.use(authenticate);

// 1. Dashboard Summary: Scoped caseload metrics, pendency, stale breakdown, upcoming hearings
router.get(
  '/summary',
  requireAnyPermission([PERMISSIONS.DASHBOARD_VIEW_ALL, PERMISSIONS.DASHBOARD_VIEW_OWN]),
  getDashboardSummary
);

// 2. Backlog Worklist: Open cases exceeding backlog threshold
router.get(
  '/backlog',
  requireAnyPermission([PERMISSIONS.DASHBOARD_VIEW_ALL, PERMISSIONS.DASHBOARD_VIEW_OWN]),
  getDashboardBacklog
);

// 3. Stale Cases Worklist: Cases matching Rule 1 or Rule 2
router.get(
  '/stale-cases',
  requireAnyPermission([PERMISSIONS.DASHBOARD_VIEW_ALL, PERMISSIONS.DASHBOARD_VIEW_OWN]),
  getDashboardStaleCases
);

// 4. Upcoming Hearings: Hearings within configurable forward-looking window
router.get(
  '/upcoming-hearings',
  requireAnyPermission([PERMISSIONS.DASHBOARD_VIEW_ALL, PERMISSIONS.DASHBOARD_VIEW_OWN]),
  getDashboardUpcomingHearings
);

// 5. Workload Distribution: Active caseload per judge and advocate (REGISTRAR, ADMIN, JUDGE)
router.get('/workload', requirePermission(PERMISSIONS.DASHBOARD_VIEW_ALL), getDashboardWorkload);

// 6. Settings Configuration: Thresholds view (ADMIN and REGISTRAR)
router.get('/settings', getDashboardSettingsEndpoint);

// 7. Settings Configuration: Thresholds update with audit log (ADMIN only)
router.patch('/settings', patchDashboardSettings);

export default router;
