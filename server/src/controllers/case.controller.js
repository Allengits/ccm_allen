import { z } from 'zod';
import prisma from '../db/prisma.js';
import { caseVisibilityFilter } from '../config/permissions.js';

export const CASE_TYPE_PREFIXES = {
  CRIMINAL: 'CC',
  CIVIL: 'CV',
  FAMILY: 'FM',
  PROPERTY: 'PR',
  COMMERCIAL: 'CM',
  CONSTITUTIONAL: 'WP',
  OTHER: 'MC',
};

// Zod schemas
const registerCaseSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  caseType: z.enum(
    ['CRIMINAL', 'CIVIL', 'FAMILY', 'PROPERTY', 'COMMERCIAL', 'CONSTITUTIONAL', 'OTHER'],
    {
      errorMap: () => ({ message: 'Invalid case type' }),
    }
  ),
  priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
  petitioner: z.string().trim().min(1, 'Petitioner is required'),
  respondent: z.string().trim().min(1, 'Respondent is required'),
  description: z.string().trim().optional().nullable(),
  filingDate: z.string().min(1, 'Filing date is required'),
  judgeId: z.string().uuid().optional().nullable(),
});

const updateCaseSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').optional(),
  petitioner: z.string().trim().min(1, 'Petitioner cannot be empty').optional(),
  respondent: z.string().trim().min(1, 'Respondent cannot be empty').optional(),
  description: z.string().trim().optional().nullable(),
  priority: z.enum(['NORMAL', 'URGENT']).optional(),
  judgeId: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/v1/cases/meta
 * Returns metadata needed by case forms: types, priorities, statuses, and active judges.
 */
export const getCasesMeta = async (req, res) => {
  try {
    const judges = await prisma.user.findMany({
      where: {
        role: 'JUDGE',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Case metadata retrieved successfully',
      data: {
        caseTypes: [
          'CRIMINAL',
          'CIVIL',
          'FAMILY',
          'PROPERTY',
          'COMMERCIAL',
          'CONSTITUTIONAL',
          'OTHER',
        ],
        priorities: ['NORMAL', 'URGENT'],
        statuses: [
          'REGISTERED',
          'ADVOCATE_ASSIGNED',
          'HEARING_SCHEDULED',
          'UNDER_TRIAL',
          'JUDGMENT_RESERVED',
          'CLOSED',
        ],
        judges,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve case metadata',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/cases/stats
 * Returns summary statistics for open and overdue cases scoped by user visibility.
 */
export const getCasesStats = async (req, res) => {
  try {
    const visibilityWhere = caseVisibilityFilter(req.user);

    // Read backlog threshold
    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: 'backlog_threshold_days' },
    });
    const thresholdDays = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 90;
    const cutoffDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

    const [totalOpenCases, overdueCases] = await Promise.all([
      prisma.case.count({
        where: {
          ...visibilityWhere,
          status: { not: 'CLOSED' },
        },
      }),
      prisma.case.count({
        where: {
          ...visibilityWhere,
          status: { not: 'CLOSED' },
          filingDate: { lte: cutoffDate },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Case statistics retrieved successfully',
      data: {
        totalOpenCases,
        overdueCases,
        backlogThresholdDays: thresholdDays,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve case statistics',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/cases
 * Registers a new case with an atomic auto-generated case number inside a transaction.
 */
export const registerCase = async (req, res) => {
  try {
    const parseResult = registerCaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { title, caseType, priority, petitioner, respondent, description, filingDate, judgeId } =
      parseResult.data;

    // Validate filing date
    const parsedFilingDate = new Date(filingDate);
    if (isNaN(parsedFilingDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filing date format',
        errors: ['Filing date must be a valid date'],
      });
    }

    const now = new Date();
    if (parsedFilingDate.getTime() > now.getTime()) {
      return res.status(400).json({
        success: false,
        message: 'Filing date cannot be in the future',
        errors: ['Filing date cannot be in the future'],
      });
    }

    // Validate judge if specified
    if (judgeId) {
      const judge = await prisma.user.findUnique({
        where: { id: judgeId },
        select: { id: true, role: true, isActive: true },
      });

      if (!judge || judge.role !== 'JUDGE' || !judge.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Assigned judge must be an active user with role JUDGE',
          errors: ['Assigned judge must be an active user with role JUDGE'],
        });
      }
    }

    const registrationYear = now.getFullYear();
    const prefix = CASE_TYPE_PREFIXES[caseType] || 'MC';

    // Execute atomic sequential case number generation and case creation inside ONE transaction
    const createdCase = await prisma.$transaction(async (tx) => {
      // Find or initialize sequence
      const sequence = await tx.caseSequence.findUnique({
        where: {
          prefix_year: {
            prefix,
            year: registrationYear,
          },
        },
      });

      let nextNumber;

      if (!sequence) {
        // Query existing cases to find highest number for this prefix and year
        const prefixYearPattern = `${prefix}/${registrationYear}/`;
        const existingCases = await tx.case.findMany({
          where: {
            caseNumber: {
              startsWith: prefixYearPattern,
            },
          },
          select: { caseNumber: true },
        });

        let maxNum = 0;
        for (const c of existingCases) {
          const parts = c.caseNumber.split('/');
          if (parts.length === 3) {
            const num = parseInt(parts[2], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }

        nextNumber = maxNum + 1;

        try {
          await tx.caseSequence.create({
            data: {
              prefix,
              year: registrationYear,
              lastNumber: nextNumber,
            },
          });
        } catch {
          // In case of concurrent creation, increment safely
          const updated = await tx.caseSequence.update({
            where: {
              prefix_year: {
                prefix,
                year: registrationYear,
              },
            },
            data: {
              lastNumber: { increment: 1 },
            },
          });
          nextNumber = updated.lastNumber;
        }
      } else {
        const updated = await tx.caseSequence.update({
          where: {
            prefix_year: {
              prefix,
              year: registrationYear,
            },
          },
          data: {
            lastNumber: { increment: 1 },
          },
        });
        nextNumber = updated.lastNumber;
      }

      const paddedNumber = String(nextNumber).padStart(5, '0');
      const caseNumber = `${prefix}/${registrationYear}/${paddedNumber}`;

      // Create master case record
      const newCase = await tx.case.create({
        data: {
          caseNumber,
          title,
          caseType,
          status: 'REGISTERED',
          priority: priority || 'NORMAL',
          petitioner,
          respondent,
          description: description || null,
          filingDate: parsedFilingDate,
          judgeId: judgeId || null,
          registeredById: req.user.id,
        },
        include: {
          judge: { select: { id: true, name: true } },
          registeredBy: { select: { id: true, name: true } },
        },
      });

      // Write immutable audit trail
      await tx.caseStatusHistory.create({
        data: {
          caseId: newCase.id,
          fromStatus: null,
          toStatus: 'REGISTERED',
          reason: 'Case registered',
          changedById: req.user.id,
        },
      });

      return newCase;
    });

    return res.status(201).json({
      success: true,
      message: 'Case registered successfully',
      data: {
        case: createdCase,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to register case',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/cases
 * Lists cases filtered by role visibility, search terms, status, type, priority, and backlog.
 */
export const getCases = async (req, res) => {
  try {
    const visibilityWhere = caseVisibilityFilter(req.user);

    // Read backlog threshold
    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: 'backlog_threshold_days' },
    });
    const thresholdDays = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 90;
    const cutoffDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

    const {
      page = 1,
      pageSize = 10,
      q,
      status,
      caseType,
      priority,
      judgeId,
      backlog,
      from,
      to,
      sortBy = 'filingDate',
      sortOrder = 'desc',
    } = req.query;

    const where = {
      ...visibilityWhere,
    };

    // Text search across caseNumber, title, petitioner, respondent
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { caseNumber: { contains: term } },
        { title: { contains: term } },
        { petitioner: { contains: term } },
        { respondent: { contains: term } },
      ];
    }

    if (status) where.status = status;
    if (caseType) where.caseType = caseType;
    if (priority) where.priority = priority;
    if (judgeId) where.judgeId = judgeId;

    // Backlog filter (open cases older than threshold)
    if (backlog === 'true' || backlog === true || backlog === '1') {
      where.status = { not: 'CLOSED' };
      where.filingDate = { lte: cutoffDate };
    }

    // Filing date range
    if (from || to) {
      where.filingDate = where.filingDate || {};
      if (from) {
        where.filingDate.gte = new Date(from);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        if (where.filingDate.lte) {
          where.filingDate.lte = where.filingDate.lte < toDate ? where.filingDate.lte : toDate;
        } else {
          where.filingDate.lte = toDate;
        }
      }
    }

    // Sorting
    const allowedSortFields = ['filingDate', 'caseNumber', 'priority', 'status'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'filingDate';
    const direction = sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy = [{ [sortField]: direction }, { id: 'asc' }];

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 10));
    const skip = (pageNum - 1) * size;

    const now = new Date();

    // Query cases and total count concurrently without N+1 overhead
    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        skip,
        take: size,
        orderBy,
        include: {
          judge: {
            select: { id: true, name: true },
          },
          advocates: {
            where: { isActive: true },
            include: {
              advocate: {
                select: { id: true, name: true, barNumber: true },
              },
            },
          },
          hearings: {
            where: {
              status: 'SCHEDULED',
              scheduledAt: { gte: now },
            },
            orderBy: { scheduledAt: 'asc' },
            take: 1,
            select: {
              id: true,
              scheduledAt: true,
              purpose: true,
            },
          },
        },
      }),
      prisma.case.count({ where }),
    ]);

    const items = cases.map((c) => {
      const ageDays = Math.floor(
        (now.getTime() - new Date(c.filingDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      const isBacklog = c.status !== 'CLOSED' && ageDays >= thresholdDays;
      const primaryAdvocateNames = c.advocates.map((ca) => ca.advocate.name);
      const nextHearingDate = c.hearings[0]?.scheduledAt || null;

      return {
        id: c.id,
        caseNumber: c.caseNumber,
        title: c.title,
        caseType: c.caseType,
        status: c.status,
        priority: c.priority,
        petitioner: c.petitioner,
        respondent: c.respondent,
        filingDate: c.filingDate,
        ageDays,
        isBacklog,
        judgeName: c.judge?.name || null,
        judge: c.judge,
        primaryAdvocateNames,
        nextHearingDate,
      };
    });

    const totalPages = Math.ceil(total / size);

    return res.status(200).json({
      success: true,
      message: 'Cases retrieved successfully',
      data: {
        items,
        page: pageNum,
        pageSize: size,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve cases',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/cases/:id
 * Retrieves full case details with related records.
 * Returns 404 (not 403) if the case is outside the user's visibility filter.
 */
export const getCaseById = async (req, res) => {
  try {
    const visibilityWhere = caseVisibilityFilter(req.user);

    const c = await prisma.case.findFirst({
      where: {
        id: req.params.id,
        ...visibilityWhere,
      },
      include: {
        judge: {
          select: { id: true, name: true, email: true },
        },
        registeredBy: {
          select: { id: true, name: true, email: true },
        },
        advocates: {
          include: {
            advocate: {
              select: {
                id: true,
                name: true,
                barNumber: true,
                specialization: true,
                email: true,
                phone: true,
              },
            },
            assignedBy: {
              select: { id: true, name: true, email: true },
            },
            unassignedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { assignedAt: 'asc' },
        },
        hearings: {
          include: {
            courtroom: {
              select: { id: true, name: true, location: true },
            },
            judge: {
              select: { id: true, name: true },
            },
            events: {
              include: {
                performedBy: {
                  select: { id: true, name: true, role: true },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { scheduledAt: 'asc' },
        },
        judgment: {
          include: {
            judge: {
              select: { id: true, name: true },
            },
          },
        },
        statusHistory: {
          include: {
            changedBy: {
              select: { id: true, name: true, role: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!c) {
      return res.status(404).json({
        success: false,
        message: 'Case not found',
        errors: ['Case not found'],
      });
    }

    // Read backlog threshold
    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: 'backlog_threshold_days' },
    });
    const thresholdDays = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 90;
    const now = new Date();
    const ageDays = Math.floor(
      (now.getTime() - new Date(c.filingDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const isBacklog = c.status !== 'CLOSED' && ageDays >= thresholdDays;

    // Format advocates with direct access to assignedByName and unassignedByName
    const formattedAdvocates = c.advocates.map((a) => ({
      id: a.id,
      caseId: a.caseId,
      advocateId: a.advocateId,
      side: a.side,
      isActive: a.isActive,
      assignedAt: a.assignedAt,
      assignedById: a.assignedById,
      assignedBy: a.assignedBy,
      assignedByName: a.assignedBy?.name || null,
      unassignedAt: a.unassignedAt,
      unassignedById: a.unassignedById,
      unassignedBy: a.unassignedBy,
      unassignedByName: a.unassignedBy?.name || null,
      unassignReason: a.unassignReason,
      advocate: a.advocate,
    }));

    // Format hearings with computed endsAt and durationMinutes
    const formattedHearings = c.hearings.map((h) => ({
      ...h,
      durationMinutes: h.durationMins,
      endsAt: new Date(new Date(h.scheduledAt).getTime() + (h.durationMins || 30) * 60 * 1000),
    }));

    // Merge advocate assignment/unassignment & hearing events into timeline
    const timeline = [...c.statusHistory];
    const existingReasons = new Set(c.statusHistory.map((h) => h.reason));

    for (const a of c.advocates) {
      // Check assignment event
      const assignReasonStr = `Advocate ${a.advocate.name} assigned`;
      if (!existingReasons.has(assignReasonStr)) {
        timeline.push({
          id: `adv-assign-${a.id}`,
          fromStatus: null,
          toStatus: null,
          reason: `Advocate ${a.advocate.name} assigned to ${a.side}`,
          changedById: a.assignedById,
          changedBy: a.assignedBy
            ? { id: a.assignedBy.id, name: a.assignedBy.name, role: 'REGISTRAR' }
            : null,
          createdAt: a.assignedAt,
        });
      }

      // Check unassignment event
      if (!a.isActive && a.unassignedAt && a.unassignReason) {
        if (!existingReasons.has(a.unassignReason)) {
          timeline.push({
            id: `adv-unassign-${a.id}`,
            fromStatus: null,
            toStatus: null,
            reason: `Advocate ${a.advocate.name} unassigned from ${a.side}: ${a.unassignReason}`,
            changedById: a.unassignedById,
            changedBy: a.unassignedBy
              ? { id: a.unassignedBy.id, name: a.unassignedBy.name, role: 'REGISTRAR' }
              : null,
            createdAt: a.unassignedAt,
          });
        }
      }
    }

    // Merge hearing events into history timeline
    for (const h of c.hearings) {
      for (const he of h.events || []) {
        timeline.push({
          id: `hearing-event-${he.id}`,
          fromStatus: null,
          toStatus: null,
          reason: `Hearing [${he.action}]: ${he.note || he.action}`,
          changedById: he.performedById,
          changedBy: he.performedBy
            ? { id: he.performedBy.id, name: he.performedBy.name, role: he.performedBy.role }
            : null,
          createdAt: he.createdAt,
        });
      }
    }

    // Sort timeline chronologically descending
    timeline.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());

    return res.status(200).json({
      success: true,
      message: 'Case retrieved successfully',
      data: {
        case: {
          ...c,
          advocates: formattedAdvocates,
          hearings: formattedHearings,
          statusHistory: timeline,
          ageDays,
          isBacklog,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve case detail',
      errors: [error.message],
    });
  }
};

/**
 * PATCH /api/v1/cases/:id
 * Modifies editable fields on an active case. Closed cases cannot be modified.
 * Immutable fields: caseType, caseNumber, filingDate, status.
 */
export const updateCase = async (req, res) => {
  try {
    // Prohibit attempts to change immutable fields
    if (
      'caseNumber' in req.body ||
      'caseType' in req.body ||
      'filingDate' in req.body ||
      'status' in req.body
    ) {
      return res.status(400).json({
        success: false,
        message: 'Modifying caseNumber, caseType, filingDate, or status is prohibited',
        errors: [
          'Case number, case type, filing date, and status cannot be modified via this endpoint',
        ],
      });
    }

    const parseResult = updateCaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const existingCase = await prisma.case.findUnique({
      where: { id: req.params.id },
    });

    if (!existingCase) {
      return res.status(404).json({
        success: false,
        message: 'Case not found',
        errors: ['Case not found'],
      });
    }

    if (existingCase.status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Closed cases cannot be edited',
        errors: ['Closed cases cannot be edited'],
      });
    }

    const { title, petitioner, respondent, description, priority, judgeId } = parseResult.data;

    // Validate judge if specified
    if (judgeId !== undefined && judgeId !== null) {
      const judge = await prisma.user.findUnique({
        where: { id: judgeId },
        select: { id: true, role: true, isActive: true },
      });

      if (!judge || judge.role !== 'JUDGE' || !judge.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Assigned judge must be an active user with role JUDGE',
          errors: ['Assigned judge must be an active user with role JUDGE'],
        });
      }

      // Cross-module rule: reject changing case's judge if upcoming SCHEDULED hearings exist
      if (judgeId !== existingCase.judgeId) {
        const scheduledHearingsCount = await prisma.hearing.count({
          where: {
            caseId: existingCase.id,
            status: 'SCHEDULED',
          },
        });

        if (scheduledHearingsCount > 0) {
          return res.status(400).json({
            success: false,
            message:
              'Cannot reassign presiding judge while scheduled hearings exist for this case. Cancel or reschedule existing hearings first.',
            errors: [
              'Cannot reassign presiding judge while scheduled hearings exist for this case',
            ],
          });
        }
      }
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (petitioner !== undefined) updateData.petitioner = petitioner;
    if (respondent !== undefined) updateData.respondent = respondent;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (judgeId !== undefined) updateData.judgeId = judgeId;

    const updatedCase = await prisma.case.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        judge: { select: { id: true, name: true } },
        registeredBy: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Case updated successfully',
      data: {
        case: updatedCase,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update case',
      errors: [error.message],
    });
  }
};
