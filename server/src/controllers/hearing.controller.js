import { DateTime } from 'luxon';
import prisma from '../db/prisma.js';
import { caseVisibilityFilter } from '../config/permissions.js';
import { transitionCaseStatus } from '../services/caseWorkflow.js';
import {
  getCourtSettings,
  validateSlotRules,
  parseTimeString,
  formatTimeIST,
  formatDateTimeIST,
} from '../utils/courtTime.js';
import {
  scheduleHearingSchema,
  rescheduleHearingSchema,
  cancelHearingSchema,
  completeHearingSchema,
  adjournHearingSchema,
} from '../validators/hearing.validator.js';

/**
 * Computes the endsAt timestamp for a hearing based on scheduledAt and durationMins.
 * @param {Date|string} scheduledAt
 * @param {number} durationMins
 * @returns {Date}
 */
const computeEndsAt = (scheduledAt, durationMins = 30) => {
  return new Date(new Date(scheduledAt).getTime() + (durationMins || 30) * 60 * 1000);
};

/**
 * Helper to check overlap between candidate slot and candidate hearing.
 */
const hearingOverlapsSlot = (candStart, candDurationMins, slotStart, slotEnd) => {
  const hStart = new Date(candStart).getTime();
  const hEnd = hStart + (candDurationMins || 30) * 60 * 1000;
  return hStart < slotEnd.getTime() && hEnd > slotStart.getTime();
};

/**
 * GET /api/v1/hearings/meta
 * Returns active courtrooms, available judges, hearing statuses, and court settings.
 */
export const getHearingsMeta = async (req, res) => {
  try {
    const settings = await getCourtSettings();

    const [courtrooms, judges] = await Promise.all([
      prisma.courtroom.findMany({
        where: { isActive: true },
        select: { id: true, name: true, location: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: 'JUDGE', isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Hearing metadata retrieved successfully',
      data: {
        courtrooms,
        judges,
        hearingStatuses: ['SCHEDULED', 'COMPLETED', 'ADJOURNED', 'CANCELLED'],
        settings: {
          court_timezone: settings.timezone,
          court_start_time: settings.startTime,
          court_end_time: settings.endTime,
          lunch_start: settings.lunchStart,
          lunch_end: settings.lunchEnd,
          court_working_days: settings.workingDays.join(','),
          slot_minutes: settings.slotMinutes,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve hearing metadata',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/hearings/availability
 * Generates available slot start times on a given date for specified courtroom and/or judge.
 */
export const getHearingsAvailability = async (req, res) => {
  try {
    const { date, courtroomId, judgeId, durationMins: durationParam, durationMinutes } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter (YYYY-MM-DD) is required',
        errors: ['Date parameter is required'],
      });
    }

    const settings = await getCourtSettings();
    const duration = parseInt(durationParam || durationMinutes, 10) || 30;

    if (duration <= 0 || duration % settings.slotMinutes !== 0) {
      return res.status(400).json({
        success: false,
        message: `Duration must be a positive multiple of ${settings.slotMinutes} minutes`,
        errors: [`Duration must be a multiple of ${settings.slotMinutes} minutes`],
      });
    }

    const dateDt = DateTime.fromISO(date, { zone: settings.timezone });
    if (!dateDt.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format (expected YYYY-MM-DD)',
        errors: ['Invalid date format'],
      });
    }

    // Check working day
    const WEEKDAY_NAMES = ['', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const dayCode = WEEKDAY_NAMES[dateDt.weekday];
    if (!settings.workingDays.includes(dayCode)) {
      return res.status(200).json({
        success: true,
        message: 'Court is closed on this day',
        data: {
          date,
          courtroomId: courtroomId || null,
          judgeId: judgeId || null,
          durationMins: duration,
          isWorkingDay: false,
          reason: `Non-working day (${dateDt.toFormat('cccc')})`,
          availableSlots: [],
        },
      });
    }

    // Day boundaries in IST
    const dayStartIST = parseTimeString(dateDt, settings.startTime);
    const dayEndIST = parseTimeString(dateDt, settings.endTime);
    const lunchStartIST = parseTimeString(dateDt, settings.lunchStart);
    const lunchEndIST = parseTimeString(dateDt, settings.lunchEnd);

    const nowIST = DateTime.now().setZone(settings.timezone);

    // If whole day is in the past
    if (dayEndIST <= nowIST) {
      return res.status(200).json({
        success: true,
        message: 'Date is in the past',
        data: {
          date,
          courtroomId: courtroomId || null,
          judgeId: judgeId || null,
          durationMins: duration,
          isWorkingDay: true,
          availableSlots: [],
        },
      });
    }

    // Query booked scheduled hearings for courtroom and/or judge for this calendar date
    const dayStartUTC = dateDt.startOf('day').toJSDate();
    const dayEndUTC = dateDt.endOf('day').toJSDate();

    const orClauses = [];
    if (courtroomId) orClauses.push({ courtroomId });
    if (judgeId) orClauses.push({ judgeId });

    let bookedHearings = [];
    if (orClauses.length > 0) {
      bookedHearings = await prisma.hearing.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
          OR: orClauses,
        },
        select: {
          id: true,
          courtroomId: true,
          judgeId: true,
          scheduledAt: true,
          durationMins: true,
        },
      });
    }

    // Generate slots
    const availableSlots = [];
    let candidate = dayStartIST;

    while (candidate.plus({ minutes: duration }) <= dayEndIST) {
      const slotStart = candidate;
      const slotEnd = candidate.plus({ minutes: duration });
      candidate = candidate.plus({ minutes: settings.slotMinutes });

      // Reject lunch overlap: [slotStart, slotEnd) intersects [lunchStart, lunchEnd)
      if (slotStart < lunchEndIST && slotEnd > lunchStartIST) {
        continue;
      }

      // Reject past slot (if today)
      if (slotStart <= nowIST) {
        continue;
      }

      // Check conflict with booked hearings
      const slotStartJS = slotStart.toJSDate();
      const slotEndJS = slotEnd.toJSDate();

      let hasConflict = false;
      for (const bh of bookedHearings) {
        if (hearingOverlapsSlot(bh.scheduledAt, bh.durationMins, slotStartJS, slotEndJS)) {
          if (courtroomId && bh.courtroomId === courtroomId) {
            hasConflict = true;
            break;
          }
          if (judgeId && bh.judgeId === judgeId) {
            hasConflict = true;
            break;
          }
        }
      }

      if (!hasConflict) {
        availableSlots.push({
          startTime: slotStart.toFormat('HH:mm'),
          endTime: slotEnd.toFormat('HH:mm'),
          startIso: slotStartJS.toISOString(),
          endIso: slotEndJS.toISOString(),
          formattedTime: `${slotStart.toFormat('hh:mm a')} - ${slotEnd.toFormat('hh:mm a')}`,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Available slots retrieved successfully',
      data: {
        date,
        courtroomId: courtroomId || null,
        judgeId: judgeId || null,
        durationMins: duration,
        isWorkingDay: true,
        availableSlots,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve slot availability',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/hearings/cause-list
 * Returns scheduled hearings for an IST calendar date, grouped by courtroom, ordered by time.
 */
export const getCauseList = async (req, res) => {
  try {
    const settings = await getCourtSettings();
    const dateParam = req.query.date;

    const dateDt = dateParam
      ? DateTime.fromISO(dateParam, { zone: settings.timezone })
      : DateTime.now().setZone(settings.timezone);

    if (!dateDt.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format (expected YYYY-MM-DD)',
        errors: ['Invalid date format'],
      });
    }

    const targetDateStr = dateDt.toFormat('yyyy-MM-dd');
    const dayStartUTC = dateDt.startOf('day').toJSDate();
    const dayEndUTC = dateDt.endOf('day').toJSDate();

    const visibilityWhere = caseVisibilityFilter(req.user);

    // Fetch hearings for the day filtered by user's case visibility
    const hearings = await prisma.hearing.findMany({
      where: {
        scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
        case: visibilityWhere,
      },
      include: {
        courtroom: {
          select: { id: true, name: true, location: true },
        },
        judge: {
          select: { id: true, name: true },
        },
        scheduledBy: {
          select: { id: true, name: true },
        },
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            caseType: true,
            priority: true,
            status: true,
            advocates: {
              where: { isActive: true },
              include: {
                advocate: {
                  select: { id: true, name: true, barNumber: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });

    // Group hearings by courtroom
    const courtroomMap = new Map();

    for (const h of hearings) {
      const crId = h.courtroom.id;
      if (!courtroomMap.has(crId)) {
        courtroomMap.set(crId, {
          courtroom: h.courtroom,
          hearings: [],
        });
      }

      const crGroup = courtroomMap.get(crId);
      const serialNumber = crGroup.hearings.length + 1;

      const petitionerAdvocates = (h.case.advocates || [])
        .filter((a) => a.side === 'PETITIONER')
        .map((a) => `${a.advocate.name} (${a.advocate.barNumber})`);

      const respondentAdvocates = (h.case.advocates || [])
        .filter((a) => a.side === 'RESPONDENT')
        .map((a) => `${a.advocate.name} (${a.advocate.barNumber})`);

      crGroup.hearings.push({
        serialNumber,
        id: h.id,
        caseId: h.case.id,
        caseNumber: h.case.caseNumber,
        caseTitle: h.case.title,
        caseType: h.case.caseType,
        priority: h.case.priority,
        status: h.status,
        scheduledAt: h.scheduledAt,
        durationMins: h.durationMins,
        durationMinutes: h.durationMins,
        endsAt: computeEndsAt(h.scheduledAt, h.durationMins),
        purpose: h.purpose,
        outcomeNotes: h.outcomeNotes,
        judge: h.judge,
        scheduledBy: h.scheduledBy,
        petitionerAdvocates,
        respondentAdvocates,
      });
    }

    const courtrooms = Array.from(courtroomMap.values()).sort((a, b) =>
      a.courtroom.name.localeCompare(b.courtroom.name)
    );

    return res.status(200).json({
      success: true,
      message: 'Cause list retrieved successfully',
      data: {
        date: targetDateStr,
        totalHearings: hearings.length,
        courtroomsCount: courtrooms.length,
        courtrooms,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve cause list',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/hearings
 * Lists hearings filtered by role visibility, search terms, status, date, and courtroom.
 */
export const getHearings = async (req, res) => {
  try {
    const visibilityWhere = caseVisibilityFilter(req.user);
    const settings = await getCourtSettings();

    const {
      page = 1,
      pageSize = 10,
      q,
      status,
      courtroomId,
      judgeId,
      caseId,
      date,
      startDate,
      endDate,
      sortBy = 'scheduledAt',
      sortOrder = 'asc',
    } = req.query;

    const where = {
      case: visibilityWhere,
    };

    if (status) where.status = status;
    if (courtroomId) where.courtroomId = courtroomId;
    if (judgeId) where.judgeId = judgeId;
    if (caseId) where.caseId = caseId;

    // Search term across case title, caseNumber, courtroom name, judge name, purpose
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { purpose: { contains: term } },
        { case: { title: { contains: term } } },
        { case: { caseNumber: { contains: term } } },
        { courtroom: { name: { contains: term } } },
        { judge: { name: { contains: term } } },
      ];
    }

    // Exact calendar date filter in IST
    if (date) {
      const dateDt = DateTime.fromISO(date, { zone: settings.timezone });
      if (dateDt.isValid) {
        where.scheduledAt = {
          gte: dateDt.startOf('day').toJSDate(),
          lte: dateDt.endOf('day').toJSDate(),
        };
      }
    } else if (startDate || endDate) {
      where.scheduledAt = {};
      if (startDate) {
        const startDt = DateTime.fromISO(startDate, { zone: settings.timezone });
        if (startDt.isValid) {
          where.scheduledAt.gte = startDt.startOf('day').toJSDate();
        }
      }
      if (endDate) {
        const endDt = DateTime.fromISO(endDate, { zone: settings.timezone });
        if (endDt.isValid) {
          where.scheduledAt.lte = endDt.endOf('day').toJSDate();
        }
      }
    }

    // Sorting
    const allowedSortFields = ['scheduledAt', 'status', 'createdAt'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'scheduledAt';
    const direction = sortOrder === 'desc' ? 'desc' : 'asc';
    const orderBy = [{ [sortField]: direction }, { id: 'asc' }];

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 10));
    const skip = (pageNum - 1) * size;

    const [hearings, total] = await Promise.all([
      prisma.hearing.findMany({
        where,
        skip,
        take: size,
        orderBy,
        include: {
          case: {
            select: {
              id: true,
              caseNumber: true,
              title: true,
              caseType: true,
              priority: true,
              status: true,
            },
          },
          courtroom: {
            select: { id: true, name: true, location: true },
          },
          judge: {
            select: { id: true, name: true },
          },
          scheduledBy: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.hearing.count({ where }),
    ]);

    const items = hearings.map((h) => ({
      ...h,
      durationMinutes: h.durationMins,
      endsAt: computeEndsAt(h.scheduledAt, h.durationMins),
    }));

    const totalPages = Math.ceil(total / size);

    return res.status(200).json({
      success: true,
      message: 'Hearings retrieved successfully',
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
      message: 'Failed to retrieve hearings',
      errors: [error.message],
    });
  }
};

/**
 * GET /api/v1/hearings/:id
 * Retrieves hearing details with case summary, courtroom, judge, and audit events.
 */
export const getHearingById = async (req, res) => {
  try {
    const visibilityWhere = caseVisibilityFilter(req.user);

    const hearing = await prisma.hearing.findFirst({
      where: {
        id: req.params.id,
        case: visibilityWhere,
      },
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            caseType: true,
            priority: true,
            status: true,
            judgeId: true,
            advocates: {
              where: { isActive: true },
              include: {
                advocate: {
                  select: { id: true, name: true, barNumber: true },
                },
              },
            },
          },
        },
        courtroom: {
          select: { id: true, name: true, location: true },
        },
        judge: {
          select: { id: true, name: true, email: true },
        },
        scheduledBy: {
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
    });

    if (!hearing) {
      return res.status(404).json({
        success: false,
        message: 'Hearing not found',
        errors: ['Hearing not found'],
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Hearing retrieved successfully',
      data: {
        hearing: {
          ...hearing,
          durationMinutes: hearing.durationMins,
          endsAt: computeEndsAt(hearing.scheduledAt, hearing.durationMins),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve hearing',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/hearings
 * Schedules a hearing inside an atomic transaction with locks and status transitions.
 */
export const scheduleHearing = async (req, res) => {
  try {
    const parseResult = scheduleHearingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const {
      caseId,
      courtroomId,
      scheduledAt,
      judgeId: requestedJudgeId,
      purpose,
      notes,
    } = parseResult.data;

    const durationMins = parseResult.data.durationMins || parseResult.data.durationMinutes || 30;

    const settings = await getCourtSettings();

    // Validate slot time rules
    let slotStart, slotEnd;
    try {
      const slot = validateSlotRules(scheduledAt, durationMins, settings);
      slotStart = slot.startDt;
      slotEnd = slot.endDt;
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
        errors: [err.message],
      });
    }

    const slotStartJS = slotStart.toJSDate();
    const slotEndJS = slotEnd.toJSDate();

    // Execute scheduling transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate case
      const courtCase = await tx.case.findUnique({
        where: { id: caseId },
        include: {
          advocates: {
            where: { isActive: true },
            include: { advocate: true },
          },
          judge: true,
        },
      });

      if (!courtCase) {
        const err = new Error('Case not found');
        err.statusCode = 404;
        throw err;
      }

      if (courtCase.status === 'CLOSED') {
        const err = new Error('Cannot schedule hearing for a closed case');
        err.statusCode = 400;
        throw err;
      }

      if (courtCase.advocates.length === 0) {
        const err = new Error('Cannot schedule hearing: case has no active advocates assigned');
        err.statusCode = 400;
        throw err;
      }

      if (!courtCase.judgeId) {
        const err = new Error('Case has no assigned presiding judge');
        err.statusCode = 400;
        throw err;
      }

      if (requestedJudgeId && requestedJudgeId !== courtCase.judgeId) {
        const err = new Error('Specified judge does not match the case assigned presiding judge');
        err.statusCode = 400;
        throw err;
      }

      // 2. Validate courtroom
      const courtroom = await tx.courtroom.findUnique({
        where: { id: courtroomId },
      });

      if (!courtroom || !courtroom.isActive) {
        const err = new Error('Selected courtroom is invalid or inactive');
        err.statusCode = 400;
        throw err;
      }

      // 3. Acquire pessimistic locks in deterministic order (courtroom then user)
      await tx.$queryRaw`SELECT id FROM courtrooms WHERE id = ${courtroomId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${courtCase.judgeId} FOR UPDATE`;

      // 4. Overlap checks for courtroom (using locking current read)
      const dayStartUTC = slotStart.startOf('day').toJSDate();
      const dayEndUTC = slotStart.endOf('day').toJSDate();

      const existingCourtroomHearings = await tx.$queryRaw`
        SELECT h.id, h.scheduled_at AS scheduledAt, h.duration_mins AS durationMins, c.case_number AS caseNumber
        FROM hearings h
        JOIN cases c ON h.case_id = c.id
        WHERE h.courtroom_id = ${courtroomId}
          AND h.status = 'SCHEDULED'
          AND h.scheduled_at >= ${dayStartUTC}
          AND h.scheduled_at <= ${dayEndUTC}
        FOR UPDATE
      `;

      for (const h of existingCourtroomHearings) {
        if (hearingOverlapsSlot(h.scheduledAt, h.durationMins, slotStartJS, slotEndJS)) {
          const hStart = new Date(h.scheduledAt);
          const hEnd = computeEndsAt(h.scheduledAt, h.durationMins);
          const caseRef = h.caseNumber ? ` for case ${h.caseNumber}` : '';
          const err = new Error(
            `Courtroom ${courtroom.name} is already booked${caseRef} from ${formatTimeIST(hStart)} to ${formatTimeIST(hEnd)} on ${formatDateTimeIST(hStart).split(',')[0]}`
          );
          err.statusCode = 409;
          throw err;
        }
      }

      // 5. Overlap checks for judge (using locking current read)
      const existingJudgeHearings = await tx.$queryRaw`
        SELECT h.id, h.scheduled_at AS scheduledAt, h.duration_mins AS durationMins, c.case_number AS caseNumber
        FROM hearings h
        JOIN cases c ON h.case_id = c.id
        WHERE h.judge_id = ${courtCase.judgeId}
          AND h.status = 'SCHEDULED'
          AND h.scheduled_at >= ${dayStartUTC}
          AND h.scheduled_at <= ${dayEndUTC}
        FOR UPDATE
      `;

      for (const h of existingJudgeHearings) {
        if (hearingOverlapsSlot(h.scheduledAt, h.durationMins, slotStartJS, slotEndJS)) {
          const hStart = new Date(h.scheduledAt);
          const hEnd = computeEndsAt(h.scheduledAt, h.durationMins);
          const caseRef = h.caseNumber ? ` for case ${h.caseNumber}` : '';
          const err = new Error(
            `Judge ${courtCase.judge.name} already has another hearing scheduled${caseRef} from ${formatTimeIST(hStart)} to ${formatTimeIST(hEnd)} on ${formatDateTimeIST(hStart).split(',')[0]}`
          );
          err.statusCode = 409;
          throw err;
        }
      }

      // 6. Overlap checks for this specific case
      const existingCaseHearings = await tx.hearing.findMany({
        where: {
          caseId,
          status: 'SCHEDULED',
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
        },
        select: { id: true, scheduledAt: true, durationMins: true },
      });

      for (const h of existingCaseHearings) {
        if (hearingOverlapsSlot(h.scheduledAt, h.durationMins, slotStartJS, slotEndJS)) {
          const err = new Error('This case already has a hearing scheduled during this time slot');
          err.statusCode = 409;
          throw err;
        }
      }

      // 7. Check advocate warnings (soft warning if advocate is busy in another hearing)
      const warnings = [];
      const activeAdvocateIds = courtCase.advocates.map((ca) => ca.advocateId);

      const overlappingAdvocateHearings = await tx.hearing.findMany({
        where: {
          status: 'SCHEDULED',
          caseId: { not: caseId },
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
          case: {
            advocates: {
              some: {
                advocateId: { in: activeAdvocateIds },
                isActive: true,
              },
            },
          },
        },
        include: {
          case: {
            select: {
              caseNumber: true,
              advocates: {
                where: { advocateId: { in: activeAdvocateIds }, isActive: true },
                include: { advocate: true },
              },
            },
          },
        },
      });

      for (const oah of overlappingAdvocateHearings) {
        if (hearingOverlapsSlot(oah.scheduledAt, oah.durationMins, slotStartJS, slotEndJS)) {
          for (const ca of oah.case.advocates) {
            warnings.push(
              `Advocate ${ca.advocate.name} has another hearing for case ${oah.case.caseNumber} during this time slot`
            );
          }
        }
      }

      // 8. Create Hearing record
      const hearing = await tx.hearing.create({
        data: {
          caseId,
          courtroomId,
          judgeId: courtCase.judgeId,
          scheduledAt: slotStartJS,
          durationMins,
          purpose: purpose || 'Regular Hearing',
          status: 'SCHEDULED',
          scheduledById: req.user.id,
        },
        include: {
          case: { select: { id: true, caseNumber: true, title: true, status: true } },
          courtroom: { select: { id: true, name: true, location: true } },
          judge: { select: { id: true, name: true } },
          scheduledBy: { select: { id: true, name: true } },
        },
      });

      // 9. Create HearingEvent audit record
      await tx.hearingEvent.create({
        data: {
          hearingId: hearing.id,
          action: 'SCHEDULED',
          toScheduledAt: slotStartJS,
          toCourtroomId: courtroomId,
          note: notes || purpose || 'Hearing scheduled',
          performedById: req.user.id,
        },
      });

      // 10. Lifecycle transition: ADVOCATE_ASSIGNED -> HEARING_SCHEDULED
      if (courtCase.status === 'ADVOCATE_ASSIGNED') {
        const formattedDate = formatDateTimeIST(slotStartJS, settings.timezone);
        await transitionCaseStatus({
          tx,
          caseId,
          toStatus: 'HEARING_SCHEDULED',
          reason: `Hearing scheduled for ${formattedDate}`,
          userId: req.user.id,
        });
        hearing.case.status = 'HEARING_SCHEDULED';
      }

      return {
        hearing: {
          ...hearing,
          durationMinutes: hearing.durationMins,
          endsAt: computeEndsAt(hearing.scheduledAt, hearing.durationMins),
        },
        warnings,
      };
    });

    return res.status(201).json({
      success: true,
      message: 'Hearing scheduled successfully',
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to schedule hearing',
      errors: [error.message],
    });
  }
};

/**
 * PATCH /api/v1/hearings/:id
 * Reschedules a scheduled hearing with slot validations and audit event.
 */
export const rescheduleHearing = async (req, res) => {
  try {
    const parseResult = rescheduleHearingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const {
      scheduledAt,
      courtroomId: requestedCourtroomId,
      durationMins: durationParam,
      durationMinutes,
      reason,
    } = parseResult.data;

    const hearing = await prisma.hearing.findUnique({
      where: { id: req.params.id },
      include: {
        case: {
          include: {
            advocates: { where: { isActive: true }, include: { advocate: true } },
            judge: true,
          },
        },
        courtroom: true,
        judge: true,
      },
    });

    if (!hearing) {
      return res.status(404).json({
        success: false,
        message: 'Hearing not found',
        errors: ['Hearing not found'],
      });
    }

    // Role ownership check if JUDGE
    if (req.user.role === 'JUDGE' && hearing.judgeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Judges can only reschedule hearings assigned to them',
        errors: ['Insufficient permissions'],
      });
    }

    if (hearing.status !== 'SCHEDULED') {
      return res.status(400).json({
        success: false,
        message: `Only scheduled hearings can be rescheduled (current status: ${hearing.status})`,
        errors: ['Only scheduled hearings can be rescheduled'],
      });
    }

    const targetCourtroomId = requestedCourtroomId || hearing.courtroomId;
    const durationMins = durationParam || durationMinutes || hearing.durationMins;

    const settings = await getCourtSettings();

    let slotStart, slotEnd;
    try {
      const slot = validateSlotRules(scheduledAt, durationMins, settings);
      slotStart = slot.startDt;
      slotEnd = slot.endDt;
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
        errors: [err.message],
      });
    }

    const slotStartJS = slotStart.toJSDate();
    const slotEndJS = slotEnd.toJSDate();

    const result = await prisma.$transaction(async (tx) => {
      // Validate courtroom if changed
      let courtroom = hearing.courtroom;
      if (targetCourtroomId !== hearing.courtroomId) {
        courtroom = await tx.courtroom.findUnique({ where: { id: targetCourtroomId } });
        if (!courtroom || !courtroom.isActive) {
          const err = new Error('Selected courtroom is invalid or inactive');
          err.statusCode = 400;
          throw err;
        }
      }

      // Locks
      await tx.$queryRaw`SELECT id FROM courtrooms WHERE id = ${targetCourtroomId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${hearing.judgeId} FOR UPDATE`;

      const dayStartUTC = slotStart.startOf('day').toJSDate();
      const dayEndUTC = slotStart.endOf('day').toJSDate();

      // Check courtroom conflicts (excluding this hearing)
      const existingCourtroomHearings = await tx.hearing.findMany({
        where: {
          id: { not: hearing.id },
          courtroomId: targetCourtroomId,
          status: 'SCHEDULED',
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
        },
        select: { id: true, scheduledAt: true, durationMins: true },
      });

      for (const h of existingCourtroomHearings) {
        if (hearingOverlapsSlot(h.scheduledAt, h.durationMins, slotStartJS, slotEndJS)) {
          const hStart = new Date(h.scheduledAt);
          const hEnd = computeEndsAt(h.scheduledAt, h.durationMins);
          const err = new Error(
            `Courtroom ${courtroom.name} is already booked from ${formatTimeIST(hStart)} to ${formatTimeIST(hEnd)} on ${formatDateTimeIST(hStart).split(',')[0]}`
          );
          err.statusCode = 409;
          throw err;
        }
      }

      // Check judge conflicts (excluding this hearing)
      const existingJudgeHearings = await tx.hearing.findMany({
        where: {
          id: { not: hearing.id },
          judgeId: hearing.judgeId,
          status: 'SCHEDULED',
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
        },
        select: { id: true, scheduledAt: true, durationMins: true },
      });

      for (const h of existingJudgeHearings) {
        if (hearingOverlapsSlot(h.scheduledAt, h.durationMins, slotStartJS, slotEndJS)) {
          const hStart = new Date(h.scheduledAt);
          const hEnd = computeEndsAt(h.scheduledAt, h.durationMins);
          const err = new Error(
            `Judge ${hearing.judge.name} already has another hearing scheduled from ${formatTimeIST(hStart)} to ${formatTimeIST(hEnd)} on ${formatDateTimeIST(hStart).split(',')[0]}`
          );
          err.statusCode = 409;
          throw err;
        }
      }

      // Check case conflicts (excluding this hearing)
      const existingCaseHearings = await tx.hearing.findMany({
        where: {
          id: { not: hearing.id },
          caseId: hearing.caseId,
          status: 'SCHEDULED',
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
        },
        select: { id: true, scheduledAt: true, durationMins: true },
      });

      for (const h of existingCaseHearings) {
        if (hearingOverlapsSlot(h.scheduledAt, h.durationMins, slotStartJS, slotEndJS)) {
          const err = new Error('This case already has a hearing scheduled during this time slot');
          err.statusCode = 409;
          throw err;
        }
      }

      // Advocate warnings
      const warnings = [];
      const activeAdvocateIds = hearing.case.advocates.map((ca) => ca.advocateId);

      const overlappingAdvocateHearings = await tx.hearing.findMany({
        where: {
          id: { not: hearing.id },
          status: 'SCHEDULED',
          caseId: { not: hearing.caseId },
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
          case: {
            advocates: {
              some: {
                advocateId: { in: activeAdvocateIds },
                isActive: true,
              },
            },
          },
        },
        include: {
          case: {
            select: {
              caseNumber: true,
              advocates: {
                where: { advocateId: { in: activeAdvocateIds }, isActive: true },
                include: { advocate: true },
              },
            },
          },
        },
      });

      for (const oah of overlappingAdvocateHearings) {
        if (hearingOverlapsSlot(oah.scheduledAt, oah.durationMins, slotStartJS, slotEndJS)) {
          for (const ca of oah.case.advocates) {
            warnings.push(
              `Advocate ${ca.advocate.name} has another hearing for case ${oah.case.caseNumber} during this time slot`
            );
          }
        }
      }

      // Update hearing
      const updatedHearing = await tx.hearing.update({
        where: { id: hearing.id },
        data: {
          scheduledAt: slotStartJS,
          courtroomId: targetCourtroomId,
          durationMins,
        },
        include: {
          case: { select: { id: true, caseNumber: true, title: true, status: true } },
          courtroom: { select: { id: true, name: true, location: true } },
          judge: { select: { id: true, name: true } },
          scheduledBy: { select: { id: true, name: true } },
        },
      });

      // Write HearingEvent
      await tx.hearingEvent.create({
        data: {
          hearingId: hearing.id,
          action: 'RESCHEDULED',
          fromScheduledAt: hearing.scheduledAt,
          toScheduledAt: slotStartJS,
          fromCourtroomId: hearing.courtroomId,
          toCourtroomId: targetCourtroomId,
          note: reason,
          performedById: req.user.id,
        },
      });

      return {
        hearing: {
          ...updatedHearing,
          durationMinutes: updatedHearing.durationMins,
          endsAt: computeEndsAt(updatedHearing.scheduledAt, updatedHearing.durationMins),
        },
        warnings,
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Hearing rescheduled successfully',
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to reschedule hearing',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/hearings/:id/cancel
 * Cancels a scheduled hearing with reason and reverts case status if no scheduled hearings remain.
 */
export const cancelHearing = async (req, res) => {
  try {
    const parseResult = cancelHearingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { reason } = parseResult.data;

    const hearing = await prisma.hearing.findUnique({
      where: { id: req.params.id },
      include: { case: true },
    });

    if (!hearing) {
      return res.status(404).json({
        success: false,
        message: 'Hearing not found',
        errors: ['Hearing not found'],
      });
    }

    // Role ownership check if JUDGE
    if (req.user.role === 'JUDGE' && hearing.judgeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Judges can only cancel hearings assigned to them',
        errors: ['Insufficient permissions'],
      });
    }

    if (hearing.status !== 'SCHEDULED') {
      return res.status(400).json({
        success: false,
        message: `Only scheduled hearings can be cancelled (current status: ${hearing.status})`,
        errors: ['Only scheduled hearings can be cancelled'],
      });
    }

    const updatedHearing = await prisma.$transaction(async (tx) => {
      // 1. Update hearing status
      const updated = await tx.hearing.update({
        where: { id: hearing.id },
        data: {
          status: 'CANCELLED',
        },
        include: {
          case: { select: { id: true, caseNumber: true, title: true, status: true } },
          courtroom: { select: { id: true, name: true, location: true } },
          judge: { select: { id: true, name: true } },
        },
      });

      // 2. Write audit event
      await tx.hearingEvent.create({
        data: {
          hearingId: hearing.id,
          action: 'CANCELLED',
          fromScheduledAt: hearing.scheduledAt,
          fromCourtroomId: hearing.courtroomId,
          note: reason,
          performedById: req.user.id,
        },
      });

      // 3. Automated status transition check
      const remainingScheduled = await tx.hearing.count({
        where: {
          caseId: hearing.caseId,
          status: 'SCHEDULED',
        },
      });

      if (remainingScheduled === 0 && hearing.case.status === 'HEARING_SCHEDULED') {
        await transitionCaseStatus({
          tx,
          caseId: hearing.caseId,
          toStatus: 'ADVOCATE_ASSIGNED',
          reason: 'Reverted to ADVOCATE_ASSIGNED as all scheduled hearings were cancelled',
          userId: req.user.id,
        });
        updated.case.status = 'ADVOCATE_ASSIGNED';
      }

      return updated;
    });

    return res.status(200).json({
      success: true,
      message: 'Hearing cancelled successfully',
      data: {
        hearing: {
          ...updatedHearing,
          durationMinutes: updatedHearing.durationMins,
          endsAt: computeEndsAt(updatedHearing.scheduledAt, updatedHearing.durationMins),
        },
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to cancel hearing',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/hearings/:id/complete
 * Completes a scheduled hearing with outcome notes and transitions case to UNDER_TRIAL.
 */
export const completeHearing = async (req, res) => {
  try {
    const parseResult = completeHearingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { outcomeNotes } = parseResult.data;

    const hearing = await prisma.hearing.findUnique({
      where: { id: req.params.id },
      include: { case: true },
    });

    if (!hearing) {
      return res.status(404).json({
        success: false,
        message: 'Hearing not found',
        errors: ['Hearing not found'],
      });
    }

    // Role ownership check if JUDGE
    if (req.user.role === 'JUDGE' && hearing.judgeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Presiding judge can only complete their assigned hearings',
        errors: ['Insufficient permissions'],
      });
    }

    if (hearing.status !== 'SCHEDULED') {
      return res.status(400).json({
        success: false,
        message: `Only scheduled hearings can be completed (current status: ${hearing.status})`,
        errors: ['Only scheduled hearings can be completed'],
      });
    }

    // Future check: cannot complete a future hearing
    const now = new Date();
    if (new Date(hearing.scheduledAt) > now) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete a hearing that has not yet occurred (future hearing)',
        errors: ['Cannot complete a future hearing'],
      });
    }

    const updatedHearing = await prisma.$transaction(async (tx) => {
      // 1. Update hearing
      const updated = await tx.hearing.update({
        where: { id: hearing.id },
        data: {
          status: 'COMPLETED',
          outcomeNotes,
        },
        include: {
          case: { select: { id: true, caseNumber: true, title: true, status: true } },
          courtroom: { select: { id: true, name: true, location: true } },
          judge: { select: { id: true, name: true } },
        },
      });

      // 2. Write audit event
      await tx.hearingEvent.create({
        data: {
          hearingId: hearing.id,
          action: 'COMPLETED',
          fromScheduledAt: hearing.scheduledAt,
          fromCourtroomId: hearing.courtroomId,
          note: outcomeNotes.slice(0, 500),
          performedById: req.user.id,
        },
      });

      // 3. Automated status transition: HEARING_SCHEDULED -> UNDER_TRIAL
      if (hearing.case.status === 'HEARING_SCHEDULED') {
        await transitionCaseStatus({
          tx,
          caseId: hearing.caseId,
          toStatus: 'UNDER_TRIAL',
          reason: `First hearing completed: ${outcomeNotes.slice(0, 100)}`,
          userId: req.user.id,
        });
        updated.case.status = 'UNDER_TRIAL';
      }

      return updated;
    });

    return res.status(200).json({
      success: true,
      message: 'Hearing completed successfully',
      data: {
        hearing: {
          ...updatedHearing,
          durationMinutes: updatedHearing.durationMins,
          endsAt: computeEndsAt(updatedHearing.scheduledAt, updatedHearing.durationMins),
        },
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to complete hearing',
      errors: [error.message],
    });
  }
};

/**
 * POST /api/v1/hearings/:id/adjourn
 * Adjourns a scheduled hearing with reason, optional next hearing booking, and status adjustments.
 */
export const adjournHearing = async (req, res) => {
  try {
    const parseResult = adjournHearingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Validation failed',
        errors: parseResult.error.errors.map((e) => e.message),
      });
    }

    const { reason, nextHearing } = parseResult.data;

    const hearing = await prisma.hearing.findUnique({
      where: { id: req.params.id },
      include: {
        case: {
          include: {
            advocates: { where: { isActive: true }, include: { advocate: true } },
            judge: true,
          },
        },
        courtroom: true,
        judge: true,
      },
    });

    if (!hearing) {
      return res.status(404).json({
        success: false,
        message: 'Hearing not found',
        errors: ['Hearing not found'],
      });
    }

    // Role ownership check if JUDGE
    if (req.user.role === 'JUDGE' && hearing.judgeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Presiding judge can only adjourn their assigned hearings',
        errors: ['Insufficient permissions'],
      });
    }

    if (hearing.status !== 'SCHEDULED') {
      return res.status(400).json({
        success: false,
        message: `Only scheduled hearings can be adjourned (current status: ${hearing.status})`,
        errors: ['Only scheduled hearings can be adjourned'],
      });
    }

    const settings = await getCourtSettings();

    // If nextHearing provided, validate its slot
    let nextStartDt, nextEndDt, nextCourtroomId, nextDurationMins;
    if (nextHearing) {
      nextCourtroomId = nextHearing.courtroomId || hearing.courtroomId;
      nextDurationMins =
        nextHearing.durationMins || nextHearing.durationMinutes || hearing.durationMins;

      try {
        const slot = validateSlotRules(nextHearing.scheduledAt, nextDurationMins, settings);
        nextStartDt = slot.startDt;
        nextEndDt = slot.endDt;
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: `Next hearing validation failed: ${err.message}`,
          errors: [err.message],
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update current hearing to ADJOURNED
      const updated = await tx.hearing.update({
        where: { id: hearing.id },
        data: {
          status: 'ADJOURNED',
          outcomeNotes: reason,
        },
        include: {
          case: { select: { id: true, caseNumber: true, title: true, status: true } },
          courtroom: { select: { id: true, name: true, location: true } },
          judge: { select: { id: true, name: true } },
        },
      });

      // 2. Write audit event
      await tx.hearingEvent.create({
        data: {
          hearingId: hearing.id,
          action: 'ADJOURNED',
          fromScheduledAt: hearing.scheduledAt,
          fromCourtroomId: hearing.courtroomId,
          note: reason,
          performedById: req.user.id,
        },
      });

      let newlyScheduledHearing = null;
      const warnings = [];

      // 3. If next hearing is provided, book it
      if (nextHearing) {
        const nextStartJS = nextStartDt.toJSDate();
        const nextEndJS = nextEndDt.toJSDate();

        // Validate courtroom if different
        let nextCourtroom = hearing.courtroom;
        if (nextCourtroomId !== hearing.courtroomId) {
          nextCourtroom = await tx.courtroom.findUnique({ where: { id: nextCourtroomId } });
          if (!nextCourtroom || !nextCourtroom.isActive) {
            const err = new Error('Selected courtroom for next hearing is invalid or inactive');
            err.statusCode = 400;
            throw err;
          }
        }

        // Locks
        await tx.$queryRaw`SELECT id FROM courtrooms WHERE id = ${nextCourtroomId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${hearing.judgeId} FOR UPDATE`;

        const dayStartUTC = nextStartDt.startOf('day').toJSDate();
        const dayEndUTC = nextStartDt.endOf('day').toJSDate();

        // Check courtroom conflicts
        const existingCourtroomHearings = await tx.hearing.findMany({
          where: {
            courtroomId: nextCourtroomId,
            status: 'SCHEDULED',
            scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
          },
          select: { id: true, scheduledAt: true, durationMins: true },
        });

        for (const h of existingCourtroomHearings) {
          if (hearingOverlapsSlot(h.scheduledAt, h.durationMins, nextStartJS, nextEndJS)) {
            const hStart = new Date(h.scheduledAt);
            const hEnd = computeEndsAt(h.scheduledAt, h.durationMins);
            const err = new Error(
              `Courtroom ${nextCourtroom.name} is already booked from ${formatTimeIST(hStart)} to ${formatTimeIST(hEnd)} on ${formatDateTimeIST(hStart).split(',')[0]}`
            );
            err.statusCode = 409;
            throw err;
          }
        }

        // Check judge conflicts
        const existingJudgeHearings = await tx.hearing.findMany({
          where: {
            judgeId: hearing.judgeId,
            status: 'SCHEDULED',
            scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
          },
          select: { id: true, scheduledAt: true, durationMins: true },
        });

        for (const h of existingJudgeHearings) {
          if (hearingOverlapsSlot(h.scheduledAt, h.durationMins, nextStartJS, nextEndJS)) {
            const hStart = new Date(h.scheduledAt);
            const hEnd = computeEndsAt(h.scheduledAt, h.durationMins);
            const err = new Error(
              `Judge ${hearing.judge.name} already has another hearing scheduled from ${formatTimeIST(hStart)} to ${formatTimeIST(hEnd)} on ${formatDateTimeIST(hStart).split(',')[0]}`
            );
            err.statusCode = 409;
            throw err;
          }
        }

        // Create new hearing
        newlyScheduledHearing = await tx.hearing.create({
          data: {
            caseId: hearing.caseId,
            courtroomId: nextCourtroomId,
            judgeId: hearing.judgeId,
            scheduledAt: nextStartJS,
            durationMins: nextDurationMins,
            purpose: nextHearing.purpose || 'Adjourned hearing session',
            status: 'SCHEDULED',
            scheduledById: req.user.id,
          },
          include: {
            case: { select: { id: true, caseNumber: true, title: true, status: true } },
            courtroom: { select: { id: true, name: true, location: true } },
            judge: { select: { id: true, name: true } },
            scheduledBy: { select: { id: true, name: true } },
          },
        });

        // Audit event for the new hearing
        await tx.hearingEvent.create({
          data: {
            hearingId: newlyScheduledHearing.id,
            action: 'SCHEDULED',
            toScheduledAt: nextStartJS,
            toCourtroomId: nextCourtroomId,
            note: `Scheduled upon adjournment: ${reason}`,
            performedById: req.user.id,
          },
        });
      } else {
        // No next hearing: check if any scheduled hearings remain for this case
        const remainingScheduled = await tx.hearing.count({
          where: {
            caseId: hearing.caseId,
            status: 'SCHEDULED',
          },
        });

        if (remainingScheduled === 0 && hearing.case.status === 'HEARING_SCHEDULED') {
          await transitionCaseStatus({
            tx,
            caseId: hearing.caseId,
            toStatus: 'ADVOCATE_ASSIGNED',
            reason: 'Reverted to ADVOCATE_ASSIGNED as hearing was adjourned without a next date',
            userId: req.user.id,
          });
          updated.case.status = 'ADVOCATE_ASSIGNED';
        }
      }

      return {
        adjournedHearing: {
          ...updated,
          durationMinutes: updated.durationMins,
          endsAt: computeEndsAt(updated.scheduledAt, updated.durationMins),
        },
        nextHearing: newlyScheduledHearing
          ? {
              ...newlyScheduledHearing,
              durationMinutes: newlyScheduledHearing.durationMins,
              endsAt: computeEndsAt(
                newlyScheduledHearing.scheduledAt,
                newlyScheduledHearing.durationMins
              ),
            }
          : null,
        warnings,
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Hearing adjourned successfully',
      data: result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to adjourn hearing',
      errors: [error.message],
    });
  }
};
