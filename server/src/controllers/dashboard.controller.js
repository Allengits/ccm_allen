/**
 * Dashboard & Automation Controller
 *
 * Provides real-time, role-scoped caseload metrics, backlog worklists,
 * stale-case tracking, upcoming hearings, advocate/judge workload distribution,
 * and administrative threshold configuration.
 *
 * Real-time data with no caching layer, zero N+1 queries, fully indexed.
 */

import { z } from 'zod';
import crypto from 'crypto';
import { DateTime } from 'luxon';
import prisma from '../db/prisma.js';
import { caseVisibilityFilter } from '../config/permissions.js';
import { getCourtSettings } from '../utils/courtTime.js';
import {
  getDashboardSettings,
  getSettingsAuditLog,
  SETTING_RANGES,
  DEFAULT_DASHBOARD_SETTINGS,
} from '../utils/dashboardSettings.js';

// ==========================================
// ZOD VALIDATION SCHEMAS
// ==========================================

const backlogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z.enum(['filingDate', 'age', 'status']).default('filingDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  scope: z.enum(['all', 'my']).default('all'),
});

const staleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  rule: z.enum(['ALL', 'NO_ADVOCATE', 'NO_HEARING']).default('ALL'),
  scope: z.enum(['all', 'my']).default('all'),
});

const upcomingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  days: z.coerce.number().int().min(1).max(90).optional(),
  scope: z.enum(['all', 'my']).default('all'),
});

const updateSettingsSchema = z
  .object({
    backlog_threshold_days: z
      .number()
      .int()
      .min(SETTING_RANGES.backlog_threshold_days.min)
      .max(SETTING_RANGES.backlog_threshold_days.max)
      .optional(),
    advocate_workload_warning_threshold: z
      .number()
      .int()
      .min(SETTING_RANGES.advocate_workload_warning_threshold.min)
      .max(SETTING_RANGES.advocate_workload_warning_threshold.max)
      .optional(),
    judge_workload_warning_threshold: z
      .number()
      .int()
      .min(SETTING_RANGES.judge_workload_warning_threshold.min)
      .max(SETTING_RANGES.judge_workload_warning_threshold.max)
      .optional(),
    stale_case_no_advocate_days: z
      .number()
      .int()
      .min(SETTING_RANGES.stale_case_no_advocate_days.min)
      .max(SETTING_RANGES.stale_case_no_advocate_days.max)
      .optional(),
    stale_case_no_hearing_days: z
      .number()
      .int()
      .min(SETTING_RANGES.stale_case_no_hearing_days.min)
      .max(SETTING_RANGES.stale_case_no_hearing_days.max)
      .optional(),
    upcoming_hearings_window_days: z
      .number()
      .int()
      .min(SETTING_RANGES.upcoming_hearings_window_days.min)
      .max(SETTING_RANGES.upcoming_hearings_window_days.max)
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one threshold setting must be provided for update',
  });

// ==========================================
// CONTROLLERS
// ==========================================

/**
 * GET /api/v1/dashboard/summary
 * Returns real-time aggregate caseload metrics scoped by caller role.
 */
export async function getDashboardSummary(req, res) {
  try {
    const user = req.user;
    const courtSettings = await getCourtSettings();
    const thresholds = await getDashboardSettings();
    const tz = courtSettings.timezone;

    const todayStart = DateTime.now().setZone(tz).startOf('day').toJSDate();
    const todayEnd = DateTime.now().setZone(tz).endOf('day').toJSDate();
    const windowEnd = DateTime.now()
      .setZone(tz)
      .plus({ days: thresholds.upcomingHearingsWindowDays })
      .endOf('day')
      .toJSDate();

    const backlogCutoff = DateTime.now()
      .setZone(tz)
      .minus({ days: thresholds.backlogThresholdDays })
      .toJSDate();
    const staleAdvCutoff = DateTime.now()
      .setZone(tz)
      .minus({ days: thresholds.staleCaseNoAdvocateDays })
      .toJSDate();
    const staleHearingCutoff = DateTime.now()
      .setZone(tz)
      .minus({ days: thresholds.staleCaseNoHearingDays })
      .toJSDate();

    // Determine query scope
    const isAdvocate = user.role === 'ADVOCATE';
    const isJudge = user.role === 'JUDGE';
    const baseCaseFilter = isAdvocate ? caseVisibilityFilter(user) : {};

    // Helper to compute summary for any given case filter
    const computeSummaryForFilter = async (caseFilter, hearingJudgeId = null) => {
      // 1. Status distribution via single groupBy query
      const statusGroups = await prisma.case.groupBy({
        by: ['status'],
        _count: { id: true },
        where: caseFilter,
      });

      const statusDistribution = {
        REGISTERED: 0,
        ADVOCATE_ASSIGNED: 0,
        HEARING_SCHEDULED: 0,
        UNDER_TRIAL: 0,
        JUDGMENT_RESERVED: 0,
        CLOSED: 0,
      };

      for (const group of statusGroups) {
        statusDistribution[group.status] = group._count.id;
      }

      const totalClosed = statusDistribution.CLOSED;
      const totalOpen =
        statusDistribution.REGISTERED +
        statusDistribution.ADVOCATE_ASSIGNED +
        statusDistribution.HEARING_SCHEDULED +
        statusDistribution.UNDER_TRIAL +
        statusDistribution.JUDGMENT_RESERVED;
      const totalCases = totalOpen + totalClosed;

      // 2. Hearings today count
      const hearingTodayWhere = {
        status: 'SCHEDULED',
        scheduledAt: { gte: todayStart, lte: todayEnd },
      };
      if (isAdvocate) {
        hearingTodayWhere.case = caseFilter;
      } else if (hearingJudgeId) {
        hearingTodayWhere.judgeId = hearingJudgeId;
      }

      const hearingsToday = await prisma.hearing.count({ where: hearingTodayWhere });

      // 3. Upcoming hearings count
      const hearingUpcomingWhere = {
        status: 'SCHEDULED',
        scheduledAt: { gte: todayStart, lte: windowEnd },
      };
      if (isAdvocate) {
        hearingUpcomingWhere.case = caseFilter;
      } else if (hearingJudgeId) {
        hearingUpcomingWhere.judgeId = hearingJudgeId;
      }

      const upcomingHearings = await prisma.hearing.count({ where: hearingUpcomingWhere });

      // 4. Backlog count
      const backlogCount = await prisma.case.count({
        where: {
          AND: [
            caseFilter,
            {
              status: { not: 'CLOSED' },
              filingDate: { lte: backlogCutoff },
            },
          ],
        },
      });

      // 5. Stale case counts
      const staleRule1Count = await prisma.case.count({
        where: {
          AND: [
            caseFilter,
            {
              status: 'REGISTERED',
              filingDate: { lte: staleAdvCutoff },
              advocates: { none: { isActive: true } },
            },
          ],
        },
      });

      const staleRule2Count = await prisma.case.count({
        where: {
          AND: [
            caseFilter,
            {
              status: 'ADVOCATE_ASSIGNED',
              hearings: { none: {} },
              advocates: { some: { isActive: true, assignedAt: { lte: staleHearingCutoff } } },
            },
          ],
        },
      });

      const staleCount = staleRule1Count + staleRule2Count;

      return {
        statusDistribution,
        totalCases,
        totalOpen,
        totalClosed,
        hearingsToday,
        upcomingHearings,
        backlogCount,
        staleCount,
        staleBreakdown: {
          noAdvocate: staleRule1Count,
          noHearing: staleRule2Count,
        },
      };
    };

    // Primary summary
    const summary = await computeSummaryForFilter(baseCaseFilter);

    // If JUDGE, also compute their specific assigned caseload
    let myCaseload = null;
    if (isJudge) {
      myCaseload = await computeSummaryForFilter({ judgeId: user.id }, user.id);
    }

    return res.status(200).json({
      success: true,
      message: 'Dashboard summary retrieved successfully',
      data: {
        ...summary,
        thresholds: {
          backlogThresholdDays: thresholds.backlogThresholdDays,
          advocateWorkloadWarningThreshold: thresholds.advocateWorkloadWarningThreshold,
          judgeWorkloadWarningThreshold: thresholds.judgeWorkloadWarningThreshold,
          staleCaseNoAdvocateDays: thresholds.staleCaseNoAdvocateDays,
          staleCaseNoHearingDays: thresholds.staleCaseNoHearingDays,
          upcomingHearingsWindowDays: thresholds.upcomingHearingsWindowDays,
        },
        myCaseload,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard summary',
      errors: [error.message],
    });
  }
}

/**
 * GET /api/v1/dashboard/backlog
 * Returns paginated worklist of open cases exceeding the backlog pendency threshold.
 */
export async function getDashboardBacklog(req, res) {
  try {
    const parseResult = backlogQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backlog query parameters',
        errors: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
    }

    const { page, pageSize, sortBy, sortOrder, scope } = parseResult.data;
    const user = req.user;
    const courtSettings = await getCourtSettings();
    const thresholds = await getDashboardSettings();
    const tz = courtSettings.timezone;

    const backlogCutoff = DateTime.now()
      .setZone(tz)
      .minus({ days: thresholds.backlogThresholdDays })
      .toJSDate();

    const where = {
      status: { not: 'CLOSED' },
      filingDate: { lte: backlogCutoff },
    };

    if (user.role === 'ADVOCATE') {
      Object.assign(where, caseVisibilityFilter(user));
    } else if (user.role === 'JUDGE' && scope === 'my') {
      where.judgeId = user.id;
    }

    // Determine sorting: if sortBy is 'age', age is inverse of filingDate
    let orderBy = {};
    if (sortBy === 'age') {
      // Age descending means oldest cases first = filingDate asc
      orderBy = { filingDate: sortOrder === 'desc' ? 'asc' : 'desc' };
    } else if (sortBy === 'status') {
      orderBy = { status: sortOrder };
    } else {
      orderBy = { filingDate: sortOrder };
    }

    const [total, cases] = await Promise.all([
      prisma.case.count({ where }),
      prisma.case.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
          judge: { select: { id: true, name: true, email: true } },
          advocates: {
            where: { isActive: true },
            include: {
              advocate: {
                select: { id: true, name: true, barNumber: true, specialization: true },
              },
            },
          },
        },
      }),
    ]);

    const now = Date.now();
    const items = cases.map((c) => {
      const daysOpen = Math.floor((now - new Date(c.filingDate).getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: c.id,
        caseNumber: c.caseNumber,
        title: c.title,
        status: c.status,
        caseType: c.caseType,
        priority: c.priority,
        filingDate: c.filingDate,
        daysOpen,
        judge: c.judge ? { id: c.judge.id, name: c.judge.name } : null,
        advocates: c.advocates.map((ca) => ({
          id: ca.advocate.id,
          name: ca.advocate.name,
          barNumber: ca.advocate.barNumber,
          side: ca.side,
        })),
      };
    });

    const totalPages = Math.ceil(total / pageSize) || 1;

    return res.status(200).json({
      success: true,
      message: 'Backlog cases retrieved successfully',
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages,
        thresholdDays: thresholds.backlogThresholdDays,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve backlog cases',
      errors: [error.message],
    });
  }
}

/**
 * GET /api/v1/dashboard/stale-cases
 * Returns paginated worklist combining Rule 1 (no advocate) and Rule 2 (no hearing) stale cases.
 */
export async function getDashboardStaleCases(req, res) {
  try {
    const parseResult = staleQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid stale cases query parameters',
        errors: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
    }

    const { page, pageSize, rule, scope } = parseResult.data;
    const user = req.user;
    const courtSettings = await getCourtSettings();
    const thresholds = await getDashboardSettings();
    const tz = courtSettings.timezone;

    const staleAdvCutoff = DateTime.now()
      .setZone(tz)
      .minus({ days: thresholds.staleCaseNoAdvocateDays })
      .toJSDate();
    const staleHearingCutoff = DateTime.now()
      .setZone(tz)
      .minus({ days: thresholds.staleCaseNoHearingDays })
      .toJSDate();

    // Define rules
    const rule1Clause = {
      status: 'REGISTERED',
      filingDate: { lte: staleAdvCutoff },
      advocates: { none: { isActive: true } },
    };

    const rule2Clause = {
      status: 'ADVOCATE_ASSIGNED',
      hearings: { none: {} },
      advocates: { some: { isActive: true, assignedAt: { lte: staleHearingCutoff } } },
    };

    let filterClause;
    if (rule === 'NO_ADVOCATE') {
      filterClause = rule1Clause;
    } else if (rule === 'NO_HEARING') {
      filterClause = rule2Clause;
    } else {
      filterClause = { OR: [rule1Clause, rule2Clause] };
    }

    const where = { ...filterClause };

    if (user.role === 'ADVOCATE') {
      Object.assign(where, caseVisibilityFilter(user));
    } else if (user.role === 'JUDGE' && scope === 'my') {
      where.judgeId = user.id;
    }

    const [total, cases] = await Promise.all([
      prisma.case.count({ where }),
      prisma.case.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { filingDate: 'asc' },
        include: {
          judge: { select: { id: true, name: true } },
          advocates: {
            where: { isActive: true },
            include: {
              advocate: {
                select: { id: true, name: true, barNumber: true },
              },
            },
            orderBy: { assignedAt: 'asc' },
          },
        },
      }),
    ]);

    const now = Date.now();
    const items = cases.map((c) => {
      let staleRule;
      let staleReason;
      let daysStale;

      if (c.status === 'REGISTERED') {
        staleRule = 'NO_ADVOCATE';
        staleReason = `REGISTERED with no advocate for > ${thresholds.staleCaseNoAdvocateDays} days`;
        daysStale = Math.floor((now - new Date(c.filingDate).getTime()) / (1000 * 60 * 60 * 24));
      } else {
        staleRule = 'NO_HEARING';
        staleReason = `ADVOCATE_ASSIGNED with no hearing ever scheduled for > ${thresholds.staleCaseNoHearingDays} days`;
        const earliestAssignment = c.advocates[0]?.assignedAt || c.filingDate;
        daysStale = Math.floor(
          (now - new Date(earliestAssignment).getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      return {
        id: c.id,
        caseNumber: c.caseNumber,
        title: c.title,
        status: c.status,
        caseType: c.caseType,
        priority: c.priority,
        filingDate: c.filingDate,
        staleRule,
        staleReason,
        daysStale,
        judge: c.judge ? { id: c.judge.id, name: c.judge.name } : null,
        advocates: c.advocates.map((ca) => ({
          id: ca.advocate.id,
          name: ca.advocate.name,
          barNumber: ca.advocate.barNumber,
          side: ca.side,
        })),
      };
    });

    const totalPages = Math.ceil(total / pageSize) || 1;

    return res.status(200).json({
      success: true,
      message: 'Stale cases retrieved successfully',
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages,
        thresholds: {
          staleCaseNoAdvocateDays: thresholds.staleCaseNoAdvocateDays,
          staleCaseNoHearingDays: thresholds.staleCaseNoHearingDays,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve stale cases',
      errors: [error.message],
    });
  }
}

/**
 * GET /api/v1/dashboard/upcoming-hearings
 * Returns paginated hearings within the configured forward-looking window.
 */
export async function getDashboardUpcomingHearings(req, res) {
  try {
    const parseResult = upcomingQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid upcoming hearings query parameters',
        errors: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
    }

    const { page, pageSize, days, scope } = parseResult.data;
    const user = req.user;
    const courtSettings = await getCourtSettings();
    const thresholds = await getDashboardSettings();
    const tz = courtSettings.timezone;

    const windowDays = days || thresholds.upcomingHearingsWindowDays;
    const todayStart = DateTime.now().setZone(tz).startOf('day').toJSDate();
    const windowEnd = DateTime.now().setZone(tz).plus({ days: windowDays }).endOf('day').toJSDate();

    const where = {
      status: 'SCHEDULED',
      scheduledAt: { gte: todayStart, lte: windowEnd },
    };

    if (user.role === 'ADVOCATE') {
      const advocateId = user.advocateId || user.advocateProfile?.id;
      where.case = {
        advocates: {
          some: {
            advocateId: advocateId || '__UNLINKED__',
            isActive: true,
          },
        },
      };
    } else if (user.role === 'JUDGE' && scope === 'my') {
      where.judgeId = user.id;
    }

    const [total, hearings] = await Promise.all([
      prisma.hearing.count({ where }),
      prisma.hearing.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { scheduledAt: 'asc' },
        include: {
          courtroom: { select: { id: true, name: true, location: true } },
          judge: { select: { id: true, name: true } },
          case: {
            select: {
              id: true,
              caseNumber: true,
              title: true,
              status: true,
              priority: true,
              caseType: true,
              advocates: {
                where: { isActive: true },
                include: {
                  advocate: { select: { id: true, name: true, barNumber: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const items = hearings.map((h) => {
      const endsAt = new Date(new Date(h.scheduledAt).getTime() + h.durationMins * 60 * 1000);
      return {
        id: h.id,
        scheduledAt: h.scheduledAt,
        durationMins: h.durationMins,
        endsAt,
        purpose: h.purpose,
        status: h.status,
        courtroom: h.courtroom,
        judge: h.judge,
        case: {
          id: h.case.id,
          caseNumber: h.case.caseNumber,
          title: h.case.title,
          status: h.case.status,
          priority: h.case.priority,
          caseType: h.case.caseType,
          advocates: h.case.advocates.map((ca) => ({
            id: ca.advocate.id,
            name: ca.advocate.name,
            barNumber: ca.advocate.barNumber,
            side: ca.side,
          })),
        },
      };
    });

    const totalPages = Math.ceil(total / pageSize) || 1;

    return res.status(200).json({
      success: true,
      message: 'Upcoming hearings retrieved successfully',
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages,
        windowDays,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve upcoming hearings',
      errors: [error.message],
    });
  }
}

/**
 * GET /api/v1/dashboard/workload
 * Returns active case distribution across advocates and judges with workload warning flags.
 * Accessible to ADMIN, REGISTRAR, JUDGE. (403 for ADVOCATE).
 */
export async function getDashboardWorkload(req, res) {
  try {
    const user = req.user;
    if (user.role === 'ADVOCATE') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient permissions to view workload statistics',
        errors: ["Role 'ADVOCATE' lacks permission 'dashboard.view.all'"],
      });
    }

    const thresholds = await getDashboardSettings();
    const isJudge = user.role === 'JUDGE';

    // 1. Judge workload computation via single groupBy query
    const judgeCaseGroups = await prisma.case.groupBy({
      by: ['judgeId'],
      _count: { id: true },
      where: {
        status: { not: 'CLOSED' },
        judgeId: { not: null },
      },
    });

    const judgeCountMap = new Map();
    for (const group of judgeCaseGroups) {
      if (group.judgeId) {
        judgeCountMap.set(group.judgeId, group._count.id);
      }
    }

    // Retrieve judge users
    const judgeWhere = { role: 'JUDGE', isActive: true };
    if (isJudge) {
      judgeWhere.id = user.id; // JUDGE sees only their own row
    }

    const judgesList = await prisma.user.findMany({
      where: judgeWhere,
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });

    const judges = judgesList.map((j) => {
      const activeCaseCount = judgeCountMap.get(j.id) || 0;
      return {
        id: j.id,
        name: j.name,
        email: j.email,
        activeCaseCount,
        warningThreshold: thresholds.judgeWorkloadWarningThreshold,
        isOverloaded: activeCaseCount > thresholds.judgeWorkloadWarningThreshold,
      };
    });

    // 2. Advocate workload computation via single groupBy query
    let advocates = [];
    if (!isJudge) {
      // REGISTRAR and ADMIN see advocate workloads
      const advocateCaseGroups = await prisma.caseAdvocate.groupBy({
        by: ['advocateId'],
        _count: { caseId: true },
        where: {
          isActive: true,
          case: { status: { not: 'CLOSED' } },
        },
      });

      const advCountMap = new Map();
      for (const group of advocateCaseGroups) {
        advCountMap.set(group.advocateId, group._count.caseId);
      }

      const allAdvocates = await prisma.advocate.findMany({
        select: {
          id: true,
          name: true,
          barNumber: true,
          specialization: true,
          email: true,
        },
        orderBy: { name: 'asc' },
      });

      advocates = allAdvocates.map((a) => {
        const activeCaseCount = advCountMap.get(a.id) || 0;
        return {
          id: a.id,
          name: a.name,
          barNumber: a.barNumber,
          specialization: a.specialization,
          email: a.email,
          activeCaseCount,
          warningThreshold: thresholds.advocateWorkloadWarningThreshold,
          isOverloaded: activeCaseCount > thresholds.advocateWorkloadWarningThreshold,
        };
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Workload statistics retrieved successfully',
      data: {
        judges,
        advocates,
        thresholds: {
          judgeWorkloadWarningThreshold: thresholds.judgeWorkloadWarningThreshold,
          advocateWorkloadWarningThreshold: thresholds.advocateWorkloadWarningThreshold,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve workload statistics',
      errors: [error.message],
    });
  }
}

/**
 * GET /api/v1/dashboard/settings
 * Returns current threshold setting values and change history.
 * Accessible to ADMIN and REGISTRAR only (403 for others).
 */
export async function getDashboardSettingsEndpoint(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'ADMIN' && user.role !== 'REGISTRAR') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient permissions to view system thresholds',
        errors: [`Role '${user.role}' lacks permission to view threshold settings`],
      });
    }

    const thresholds = await getDashboardSettings();
    const auditLog = await getSettingsAuditLog();

    return res.status(200).json({
      success: true,
      message: 'Dashboard settings retrieved successfully',
      data: {
        thresholds: thresholds.raw,
        ranges: SETTING_RANGES,
        auditLog: auditLog.slice(-20).reverse(), // Most recent 20 edits
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard settings',
      errors: [error.message],
    });
  }
}

/**
 * PATCH /api/v1/dashboard/settings
 * Updates one or more threshold SystemSetting rows in an atomic transaction with audit logging.
 * ADMIN only (403 for others).
 */
export async function patchDashboardSettings(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Only ADMIN users can modify court threshold settings',
        errors: [`Role '${user.role}' lacks administrator authority`],
      });
    }

    const parseResult = updateSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed for threshold settings',
        errors: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
    }

    const updates = parseResult.data;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Read existing values to record in audit trail
      const existingSettings = await tx.systemSetting.findMany({
        where: { key: { in: Object.keys(updates) } },
      });

      const existingMap = new Map();
      for (const s of existingSettings) {
        existingMap.set(s.key, s.value);
      }

      const nowIso = new Date().toISOString();
      const newAuditEntries = [];

      // 2. Update each setting row and write audit row
      for (const [key, val] of Object.entries(updates)) {
        const strVal = String(val);
        const oldVal = existingMap.get(key) || String(DEFAULT_DASHBOARD_SETTINGS[key] || '');

        await tx.systemSetting.upsert({
          where: { key },
          update: { value: strVal },
          create: {
            key,
            value: strVal,
            description: SETTING_RANGES[key]?.label || 'Configurable dashboard threshold',
          },
        });

        const auditKey = `audit:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
        const auditPayload = JSON.stringify({
          settingKey: key,
          oldValue: oldVal,
          newValue: strVal,
          changedById: user.id,
        });

        await tx.systemSetting.create({
          data: {
            key: auditKey,
            value: auditPayload,
            description: (user.name || 'Admin User').slice(0, 100),
          },
        });

        newAuditEntries.push({
          id: auditKey,
          settingKey: key,
          oldValue: oldVal,
          newValue: strVal,
          changedById: user.id,
          changedByName: user.name,
          changedAt: nowIso,
        });
      }

      return { updatedKeys: Object.keys(updates), auditEntries: newAuditEntries };
    });

    const refreshedThresholds = await getDashboardSettings();

    return res.status(200).json({
      success: true,
      message: `Successfully updated ${result.updatedKeys.length} threshold setting(s)`,
      data: {
        thresholds: refreshedThresholds.raw,
        updatedKeys: result.updatedKeys,
        auditEntries: result.auditEntries,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update dashboard settings',
      errors: [error.message],
    });
  }
}
