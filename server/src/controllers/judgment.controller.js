import { DateTime } from 'luxon';
import prisma from '../db/prisma.js';
import { caseVisibilityFilter } from '../config/permissions.js';
import { transitionCaseStatus, WorkflowError } from '../services/caseWorkflow.js';
import {
  JUDGMENT_OUTCOMES,
  reserveJudgmentSchema,
  deliverJudgmentSchema,
} from '../validators/judgment.validator.js';

const COURT_TZ = 'Asia/Kolkata';

/**
 * GET /api/v1/judgments/meta
 * Returns outcomes enum, judgment states, and active presiding judges.
 */
export const getJudgmentsMeta = async (req, res) => {
  try {
    const activeJudges = await prisma.user.findMany({
      where: {
        role: 'JUDGE',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({
      success: true,
      message: 'Judgment metadata retrieved successfully',
      data: {
        outcomes: JUDGMENT_OUTCOMES,
        states: ['RESERVED', 'DELIVERED'],
        judges: activeJudges,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve judgment metadata',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/judgments
 * Lists judgments with pagination (max 50), search, filters, and visibility scoping.
 */
export const getJudgments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const skip = (page - 1) * pageSize;

    const { q, state, status, outcome, judgeId, startDate, endDate, dateField, sortBy, sortOrder } =
      req.query;

    const visibilityWhere = caseVisibilityFilter(req.user);

    const where = {
      case: {
        ...visibilityWhere,
      },
    };

    // Text search on case number or title
    if (q && q.trim()) {
      const searchTerm = q.trim();
      where.case = {
        ...where.case,
        OR: [
          { caseNumber: { contains: searchTerm } },
          { title: { contains: searchTerm } },
        ],
      };
    }

    // State / status filter (RESERVED / DELIVERED)
    const targetStatus = state || status;
    if (targetStatus && ['RESERVED', 'DELIVERED'].includes(targetStatus.toUpperCase())) {
      where.status = targetStatus.toUpperCase();
    }

    // Outcome filter
    if (outcome && JUDGMENT_OUTCOMES.includes(outcome.toUpperCase())) {
      where.outcome = outcome.toUpperCase();
    }

    // Judge filter
    if (judgeId) {
      where.OR = [{ judgeId }, { case: { judgeId } }];
    }

    // Date range filter (interpreted in IST)
    if (startDate || endDate) {
      let dateStartUTC = null;
      let dateEndUTC = null;

      if (startDate) {
        dateStartUTC = DateTime.fromISO(startDate, { zone: COURT_TZ }).startOf('day').toJSDate();
      }
      if (endDate) {
        dateEndUTC = DateTime.fromISO(endDate, { zone: COURT_TZ }).endOf('day').toJSDate();
      }

      const dateCondition = {};
      if (dateStartUTC) dateCondition.gte = dateStartUTC;
      if (dateEndUTC) dateCondition.lte = dateEndUTC;

      if (dateField === 'reservedAt') {
        where.reservedAt = dateCondition;
      } else if (dateField === 'judgmentDate') {
        where.judgmentDate = dateCondition;
      } else {
        // Default: match either judgmentDate or reservedAt falling in range
        where.AND = [
          {
            OR: [{ judgmentDate: dateCondition }, { reservedAt: dateCondition }],
          },
        ];
      }
    }

    // Sorting
    const orderDirection = sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    let orderByClause = { reservedAt: orderDirection };
    if (sortBy === 'judgmentDate') {
      orderByClause = { judgmentDate: orderDirection };
    } else if (sortBy === 'createdAt') {
      orderByClause = { createdAt: orderDirection };
    }

    const [total, judgments] = await Promise.all([
      prisma.judgment.count({ where }),
      prisma.judgment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: orderByClause,
        include: {
          case: {
            select: {
              id: true,
              caseNumber: true,
              title: true,
              status: true,
              judgeId: true,
              judge: { select: { id: true, name: true } },
            },
          },
          judge: { select: { id: true, name: true } },
          reservedBy: { select: { id: true, name: true } },
          deliveredBy: { select: { id: true, name: true } },
        },
      }),
    ]);

    const items = judgments.map((j) => {
      const summaryText = j.summary || '';
      const summaryPreview =
        summaryText.length > 160 ? `${summaryText.slice(0, 160)}...` : summaryText;

      return {
        id: j.id,
        case: {
          id: j.case.id,
          caseNumber: j.case.caseNumber,
          title: j.case.title,
          status: j.case.status,
        },
        judgeName: j.deliveredBy?.name || j.judge?.name || j.case.judge?.name || 'Unassigned',
        state: j.status,
        outcome: j.outcome || null,
        reservedAt: j.reservedAt,
        judgmentDate: j.judgmentDate,
        summaryPreview,
      };
    });

    const totalPages = Math.ceil(total / pageSize);

    return res.status(200).json({
      success: true,
      message: 'Judgments retrieved successfully',
      data: {
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve judgments',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/cases/:caseId/judgment
 * Retrieves the full judgment for a specific case (404 if none or out-of-scope).
 */
export const getCaseJudgment = async (req, res) => {
  try {
    const caseId = req.params.caseId || req.params.id;
    const visibilityWhere = caseVisibilityFilter(req.user);

    // Verify case existence and visibility
    const courtCase = await prisma.case.findFirst({
      where: {
        id: caseId,
        ...visibilityWhere,
      },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        status: true,
        judgeId: true,
        judge: { select: { id: true, name: true } },
      },
    });

    if (!courtCase) {
      return res.status(404).json({
        success: false,
        message: 'Case not found or outside authorized scope',
        errors: ['Case not found'],
      });
    }

    const judgment = await prisma.judgment.findUnique({
      where: { caseId },
      include: {
        judge: { select: { id: true, name: true } },
        reservedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });

    if (!judgment) {
      return res.status(404).json({
        success: false,
        message: 'No judgment recorded for this case',
        errors: ['No judgment recorded for this case'],
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Case judgment retrieved successfully',
      data: {
        judgment: {
          id: judgment.id,
          caseId: judgment.caseId,
          status: judgment.status,
          outcome: judgment.outcome,
          summary: judgment.summary,
          reserveNote: judgment.reserveNote,
          reservedAt: judgment.reservedAt,
          reservedById: judgment.reservedById,
          reservedByName: judgment.reservedBy?.name || null,
          judgmentDate: judgment.judgmentDate,
          deliveredAt: judgment.deliveredAt,
          deliveredById: judgment.deliveredById,
          deliveredByName: judgment.deliveredBy?.name || null,
          judgeId: judgment.judgeId,
          judgeName: judgment.judge?.name || courtCase.judge?.name || null,
          case: courtCase,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve case judgment',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/cases/:caseId/judgment/reserve
 * Reserves judgment on an eligible UNDER_TRIAL case.
 * Pessimistic locking via SELECT ... FOR UPDATE within a single transaction.
 */
export const reserveJudgment = async (req, res) => {
  try {
    const caseId = req.params.caseId || req.params.id;

    const parseResult = reserveJudgmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { note } = parseResult.data;

    // Check visibility and case existence
    const visibilityWhere = caseVisibilityFilter(req.user);
    const existingCase = await prisma.case.findFirst({
      where: {
        id: caseId,
        ...visibilityWhere,
      },
      select: {
        id: true,
        caseNumber: true,
        status: true,
        judgeId: true,
      },
    });

    if (!existingCase) {
      return res.status(404).json({
        success: false,
        message: 'Case not found or outside authorized scope',
        errors: ['Case not found'],
      });
    }

    // Role ownership check: A JUDGE may reserve only on cases assigned to them
    if (req.user.role === 'JUDGE' && existingCase.judgeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Judges can only reserve judgment on cases assigned to them',
        errors: ['Insufficient permissions'],
      });
    }

    // Execute within ONE transaction with pessimistic lock
    const result = await prisma.$transaction(async (tx) => {
      // Lock the case row
      await tx.$queryRaw`SELECT id FROM cases WHERE id = ${caseId} FOR UPDATE`;

      // Fetch fresh state under row lock
      const lockedCase = await tx.case.findUnique({
        where: { id: caseId },
        include: {
          hearings: {
            select: { id: true, status: true },
          },
        },
      });

      if (!lockedCase) {
        const err = new Error('Case not found');
        err.statusCode = 404;
        throw err;
      }

      // 1. No existing judgment row for the case
      const existingJudgment = await tx.judgment.findUnique({
        where: { caseId },
      });

      if (existingJudgment) {
        const err = new Error('A judgment record already exists for this case');
        err.statusCode = 409;
        throw err;
      }

      // 2. Status must be UNDER_TRIAL
      if (lockedCase.status !== 'UNDER_TRIAL') {
        const err = new Error(
          `Cannot reserve judgment: Case status is ${lockedCase.status} (must be UNDER_TRIAL)`
        );
        err.statusCode = 409;
        throw err;
      }

      // 3. Must have at least one COMPLETED hearing
      const hasCompletedHearing = lockedCase.hearings.some((h) => h.status === 'COMPLETED');
      if (!hasCompletedHearing) {
        const err = new Error('Cannot reserve judgment: Case must have at least one completed hearing');
        err.statusCode = 400;
        throw err;
      }

      // 4. Must have NO SCHEDULED hearings
      const scheduledHearings = lockedCase.hearings.filter((h) => h.status === 'SCHEDULED');
      if (scheduledHearings.length > 0) {
        const err = new Error(
          `Cannot reserve judgment: Case has ${scheduledHearings.length} scheduled hearing(s). Complete, adjourn or cancel all scheduled hearings first.`
        );
        err.statusCode = 400;
        throw err;
      }

      const now = new Date();

      // Create Judgment record
      const judgment = await tx.judgment.create({
        data: {
          caseId,
          judgeId: lockedCase.judgeId || req.user.id,
          status: 'RESERVED',
          outcome: null,
          summary: null,
          reserveNote: note || null,
          reservedAt: now,
          reservedById: req.user.id,
          reservedOn: now,
        },
        include: {
          judge: { select: { id: true, name: true } },
          reservedBy: { select: { id: true, name: true } },
          case: { select: { id: true, caseNumber: true, title: true, status: true } },
        },
      });

      // Advance Case Status to JUDGMENT_RESERVED
      const updatedCase = await transitionCaseStatus({
        tx,
        caseId,
        toStatus: 'JUDGMENT_RESERVED',
        reason: `Judgment reserved by ${req.user.name}`,
        userId: req.user.id,
      });

      return {
        case: updatedCase,
        judgment: {
          ...judgment,
          reservedByName: judgment.reservedBy?.name || req.user.name,
          case: {
            ...judgment.case,
            status: updatedCase.status,
          },
        },
      };
    });

    return res.status(201).json({
      success: true,
      message: 'Judgment reserved successfully',
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || (error instanceof WorkflowError ? error.statusCode : 500);
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to reserve judgment',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/cases/:caseId/judgment/deliver
 * Delivers judgment with outcome, summary, and date; marks case CLOSED.
 * Pessimistic locking via SELECT ... FOR UPDATE inside ONE atomic transaction.
 */
export const deliverJudgment = async (req, res) => {
  try {
    const caseId = req.params.caseId || req.params.id;

    const parseResult = deliverJudgmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { outcome, summary, judgmentDate } = parseResult.data;

    // Validate judgment date rules in IST
    const nowIST = DateTime.now().setZone(COURT_TZ);
    const todayISTDateStr = nowIST.toISODate(); // YYYY-MM-DD
    const effectiveDateStr = judgmentDate || todayISTDateStr;
    const targetDtIST = DateTime.fromISO(effectiveDateStr, { zone: COURT_TZ }).startOf('day');
    const todayStartIST = nowIST.startOf('day');

    if (targetDtIST > todayStartIST) {
      return res.status(400).json({
        success: false,
        message: 'Judgment date cannot be in the future',
        errors: ['Judgment date cannot be in the future'],
      });
    }

    // Check visibility and case existence
    const visibilityWhere = caseVisibilityFilter(req.user);
    const existingCase = await prisma.case.findFirst({
      where: {
        id: caseId,
        ...visibilityWhere,
      },
      select: {
        id: true,
        caseNumber: true,
        status: true,
        judgeId: true,
      },
    });

    if (!existingCase) {
      return res.status(404).json({
        success: false,
        message: 'Case not found or outside authorized scope',
        errors: ['Case not found'],
      });
    }

    // Role ownership check: A JUDGE may deliver only on cases assigned to them
    if (req.user.role === 'JUDGE' && existingCase.judgeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Judges can only deliver judgment on cases assigned to them',
        errors: ['Insufficient permissions'],
      });
    }

    // Execute in ONE atomic transaction with pessimistic locks
    const result = await prisma.$transaction(async (tx) => {
      // Lock the case row
      await tx.$queryRaw`SELECT id FROM cases WHERE id = ${caseId} FOR UPDATE`;

      const lockedCase = await tx.case.findUnique({
        where: { id: caseId },
      });

      if (!lockedCase) {
        const err = new Error('Case not found');
        err.statusCode = 404;
        throw err;
      }

      // Lock judgment row
      await tx.$queryRaw`SELECT id FROM judgments WHERE case_id = ${caseId} FOR UPDATE`;

      const lockedJudgment = await tx.judgment.findUnique({
        where: { caseId },
      });

      // 1. Reject duplicate delivery attempt with 409 Conflict
      if (
        (lockedJudgment && (lockedJudgment.status === 'DELIVERED' || lockedJudgment.outcome !== null)) ||
        lockedCase.status === 'CLOSED'
      ) {
        const err = new Error('Judgment has already been delivered for this case');
        err.statusCode = 409;
        throw err;
      }

      // 2. Must be JUDGMENT_RESERVED
      if (lockedCase.status !== 'JUDGMENT_RESERVED') {
        const err = new Error(
          `Cannot deliver judgment: Case status is ${lockedCase.status} (must be JUDGMENT_RESERVED)`
        );
        err.statusCode = 400;
        throw err;
      }

      if (!lockedJudgment) {
        const err = new Error('No reserved judgment found for this case');
        err.statusCode = 400;
        throw err;
      }

      // 3. Judgment date cannot be before reservation date in IST
      if (lockedJudgment.reservedAt) {
        const reservedDtIST = DateTime.fromJSDate(lockedJudgment.reservedAt)
          .setZone(COURT_TZ)
          .startOf('day');
        if (targetDtIST < reservedDtIST) {
          const err = new Error('Judgment date cannot be before the reservation date');
          err.statusCode = 400;
          throw err;
        }
      }

      const now = new Date();
      const deliveryDateJS = targetDtIST.toJSDate();

      // Update Judgment record
      const updatedJudgment = await tx.judgment.update({
        where: { caseId },
        data: {
          status: 'DELIVERED',
          outcome,
          summary: summary.trim(),
          judgmentDate: deliveryDateJS,
          deliveredAt: now,
          deliveredById: req.user.id,
          deliveredOn: deliveryDateJS,
        },
        include: {
          judge: { select: { id: true, name: true } },
          reservedBy: { select: { id: true, name: true } },
          deliveredBy: { select: { id: true, name: true } },
          case: { select: { id: true, caseNumber: true, title: true, status: true } },
        },
      });

      // Transition case status to CLOSED and set closedAt in the same transaction
      const updatedCase = await transitionCaseStatus({
        tx,
        caseId,
        toStatus: 'CLOSED',
        reason: `Judgment delivered: ${outcome}`,
        userId: req.user.id,
        closedAt: now,
      });

      return {
        case: updatedCase,
        judgment: {
          ...updatedJudgment,
          reservedByName: updatedJudgment.reservedBy?.name || null,
          deliveredByName: updatedJudgment.deliveredBy?.name || req.user.name,
          case: {
            ...updatedJudgment.case,
            status: updatedCase.status,
            closedAt: updatedCase.closedAt,
          },
        },
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Judgment delivered and case closed successfully',
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || (error instanceof WorkflowError ? error.statusCode : 500);
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to deliver judgment',
      errors: [error.message],
    });
  }
};
