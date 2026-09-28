// Database Verification Script (db:verify)
// Performs automated integrity checks against the seeded database:
// 1. Table row counts (11 tables)
// 2. Case lifecycle consistency against business rules (with IST upcoming date rule)
// 3. Absence of double-booked courtrooms, judges, or cases for SCHEDULED hearings & HearingEvent audit
// 4. One judgment per case constraint
// 5. Backlog threshold case verification (>= 3 open cases > threshold days)
// Exits with code 0 on all PASS, code 1 if any check FAILS.

import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();
const COURT_TZ = 'Asia/Kolkata';

async function runVerification() {
  console.log('===============================================================');
  console.log('       COURT CASE MANAGEMENT SYSTEM - DATABASE VERIFICATION    ');
  console.log('===============================================================\n');

  let allPassed = true;
  const results = [];

  const recordResult = (checkName, passed, details) => {
    results.push({ Check: checkName, Status: passed ? 'PASS' : 'FAIL', Details: details });
    if (!passed) allPassed = false;
  };

  try {
    // -------------------------------------------------------------
    // CHECK 1: Table Row Counts
    // -------------------------------------------------------------
    console.log('[1/5] Checking table row counts...');
    const tableCounts = {
      users: await prisma.user.count(),
      advocates: await prisma.advocate.count(),
      courtrooms: await prisma.courtroom.count(),
      cases: await prisma.case.count(),
      caseAdvocates: await prisma.caseAdvocate.count(),
      hearings: await prisma.hearing.count(),
      hearingEvents: await prisma.hearingEvent.count(),
      judgments: await prisma.judgment.count(),
      caseStatusHistory: await prisma.caseStatusHistory.count(),
      caseSequences: await prisma.caseSequence.count(),
      systemSettings: await prisma.systemSetting.count(),
    };

    const emptyTables = Object.entries(tableCounts).filter(([_, count]) => count === 0);
    const countSummary = Object.entries(tableCounts)
      .map(([tbl, cnt]) => `${tbl}: ${cnt}`)
      .join(', ');

    if (
      emptyTables.length === 0 &&
      tableCounts.cases >= 14 &&
      tableCounts.hearings >= 16 &&
      tableCounts.hearingEvents >= 25 &&
      tableCounts.users === 7 &&
      tableCounts.systemSettings >= 10
    ) {
      recordResult('Table Row Counts', true, `All 11 tables populated (${countSummary})`);
    } else {
      recordResult(
        'Table Row Counts',
        false,
        emptyTables.length > 0
          ? `Empty tables found: ${emptyTables.map(([t]) => t).join(', ')}`
          : `Cases (${tableCounts.cases}), Hearings (${tableCounts.hearings}), HearingEvents (${tableCounts.hearingEvents}) or Users (${tableCounts.users}) below expected counts`
      );
    }

    // -------------------------------------------------------------
    // CHECK 2: Case Lifecycle Status Consistency
    // -------------------------------------------------------------
    console.log('[2/5] Validating case lifecycle records consistency...');
    const cases = await prisma.case.findMany({
      include: {
        advocates: { include: { assignedBy: true, unassignedBy: true } },
        hearings: true,
        judgment: true,
      },
    });

    const now = new Date();
    const todayISTStart = DateTime.now().setZone(COURT_TZ).startOf('day');
    let statusFailures = [];

    for (const c of cases) {
      const activeAdvocates = c.advocates.filter((a) => a.isActive);
      const inactiveAdvocates = c.advocates.filter((a) => !a.isActive);

      // Audit field validation for assignments
      for (const adv of activeAdvocates) {
        if (!adv.assignedById) {
          statusFailures.push(
            `${c.caseNumber}: Active advocate assignment ${adv.id} missing assignedById`
          );
        }
      }
      for (const adv of inactiveAdvocates) {
        if (!adv.unassignedAt || !adv.unassignedById || !adv.unassignReason) {
          statusFailures.push(
            `${c.caseNumber}: Inactive advocate assignment ${adv.id} missing unassigned audit fields`
          );
        }
      }

      // Check that SCHEDULED hearings match case's judge
      for (const h of c.hearings) {
        if (h.status === 'SCHEDULED' && h.judgeId !== c.judgeId) {
          statusFailures.push(
            `${c.caseNumber}: Hearing ${h.id} judgeId (${h.judgeId}) does not match case's judgeId (${c.judgeId})`
          );
        }
      }

      switch (c.status) {
        case 'REGISTERED': {
          if (activeAdvocates.length !== 0 || c.hearings.length !== 0) {
            statusFailures.push(
              `${c.caseNumber} (REGISTERED): Expected 0 active advocates and 0 hearings, found ${activeAdvocates.length} adv, ${c.hearings.length} hearings`
            );
          }
          break;
        }
        case 'ADVOCATE_ASSIGNED': {
          if (activeAdvocates.length === 0 || c.hearings.length !== 0) {
            statusFailures.push(
              `${c.caseNumber} (ADVOCATE_ASSIGNED): Expected >= 1 active advocate and 0 hearings, found ${activeAdvocates.length} adv, ${c.hearings.length} hearings`
            );
          }
          break;
        }
        case 'HEARING_SCHEDULED': {
          const hasAdvocate = activeAdvocates.length >= 1;
          // Upcoming defined as IST calendar date >= today
          const hasUpcomingHearing = c.hearings.some((h) => {
            if (h.status !== 'SCHEDULED') return false;
            const hIST = DateTime.fromJSDate(new Date(h.scheduledAt)).setZone(COURT_TZ);
            return hIST >= todayISTStart;
          });

          if (!hasAdvocate || !hasUpcomingHearing) {
            statusFailures.push(
              `${c.caseNumber} (HEARING_SCHEDULED): Needs active advocate (has:${hasAdvocate}) and at least one upcoming SCHEDULED hearing (has:${hasUpcomingHearing})`
            );
          }
          break;
        }
        case 'UNDER_TRIAL': {
          const hasAdvocate = activeAdvocates.length >= 1;
          const hasCompletedHearing = c.hearings.some((h) => h.status === 'COMPLETED');
          if (!hasAdvocate || !hasCompletedHearing) {
            statusFailures.push(
              `${c.caseNumber} (UNDER_TRIAL): Needs active advocate (has:${hasAdvocate}) and at least one COMPLETED hearing (has:${hasCompletedHearing})`
            );
          }
          break;
        }
        case 'JUDGMENT_RESERVED': {
          if (activeAdvocates.length === 0 || !c.judgment || c.judgment.status !== 'RESERVED') {
            statusFailures.push(
              `${c.caseNumber} (JUDGMENT_RESERVED): Expected >= 1 active advocate and Judgment record with status RESERVED`
            );
          }
          break;
        }
        case 'CLOSED': {
          if (
            activeAdvocates.length === 0 ||
            !c.judgment ||
            c.judgment.status !== 'DELIVERED' ||
            !c.closedAt
          ) {
            statusFailures.push(
              `${c.caseNumber} (CLOSED): Expected >= 1 active advocate, Judgment with status DELIVERED, and non-null closedAt`
            );
          }
          break;
        }
        default:
          statusFailures.push(`${c.caseNumber}: Unknown status ${c.status}`);
      }
    }

    if (statusFailures.length === 0) {
      recordResult(
        'Case Status Consistency',
        true,
        `All ${cases.length} cases strictly conform to their lifecycle state constraints (upcoming defined in IST)`
      );
    } else {
      recordResult(
        'Case Status Consistency',
        false,
        `${statusFailures.length} violations: ${statusFailures.join('; ')}`
      );
    }

    // -------------------------------------------------------------
    // CHECK 3: Courtroom, Judge & Case Scheduling Conflicts + Hearing Events
    // -------------------------------------------------------------
    console.log(
      '[3/5] Checking for courtroom, judge and case scheduling conflicts & audit events...'
    );
    const hearings = await prisma.hearing.findMany({
      include: {
        courtroom: true,
        judge: true,
        case: { select: { id: true, caseNumber: true, judgeId: true } },
        events: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });

    const conflicts = [];
    const missingEvents = [];

    for (const h of hearings) {
      if (!h.events || h.events.length === 0) {
        missingEvents.push(`Hearing ${h.id} (${h.case.caseNumber}) has zero HearingEvents`);
      }
      if (h.status === 'SCHEDULED' && h.judgeId !== h.case.judgeId) {
        conflicts.push(
          `Judge mismatch: Hearing ${h.id} on case ${h.case.caseNumber} has judge ${h.judgeId} but case assigned judge is ${h.case.judgeId}`
        );
      }
    }

    // Check overlaps among SCHEDULED hearings (only SCHEDULED hearings block a slot)
    const scheduledHearings = hearings.filter((h) => h.status === 'SCHEDULED');
    for (let i = 0; i < scheduledHearings.length; i++) {
      for (let j = i + 1; j < scheduledHearings.length; j++) {
        const h1 = scheduledHearings[i];
        const h2 = scheduledHearings[j];

        const start1 = new Date(h1.scheduledAt).getTime();
        const end1 = start1 + h1.durationMins * 60 * 1000;
        const start2 = new Date(h2.scheduledAt).getTime();
        const end2 = start2 + h2.durationMins * 60 * 1000;

        // Check time interval overlap: (start1 < end2) && (start2 < end1)
        if (start1 < end2 && start2 < end1) {
          if (h1.courtroomId === h2.courtroomId) {
            conflicts.push(
              `Courtroom Double-Booked: ${h1.courtroom.name} booked simultaneously for hearings ${h1.id} (${h1.case.caseNumber}) and ${h2.id} (${h2.case.caseNumber}) around ${new Date(start1).toISOString()}`
            );
          }
          if (h1.judgeId === h2.judgeId) {
            conflicts.push(
              `Judge Double-Booked: ${h1.judge.name} scheduled simultaneously for hearings ${h1.id} (${h1.case.caseNumber}) and ${h2.id} (${h2.case.caseNumber}) around ${new Date(start1).toISOString()}`
            );
          }
          if (h1.caseId === h2.caseId) {
            conflicts.push(
              `Case Double-Booked: Case ${h1.case.caseNumber} scheduled simultaneously for hearings ${h1.id} and ${h2.id} around ${new Date(start1).toISOString()}`
            );
          }
        }
      }
    }

    if (conflicts.length === 0 && missingEvents.length === 0) {
      recordResult(
        'Hearing Scheduling & Audit Integrity',
        true,
        `All ${hearings.length} hearings have HearingEvents; zero courtroom, judge, or case scheduling collisions across ${scheduledHearings.length} SCHEDULED hearings`
      );
    } else {
      const errs = [...conflicts, ...missingEvents];
      recordResult(
        'Hearing Scheduling & Audit Integrity',
        false,
        `Found ${errs.length} issues: ${errs.join('; ')}`
      );
    }

    // -------------------------------------------------------------
    // CHECK 4: Judgment Uniqueness per Case
    // -------------------------------------------------------------
    console.log('[4/5] Checking judgment uniqueness per case...');
    const judgments = await prisma.judgment.findMany();
    const caseIdsInJudgments = judgments.map((j) => j.caseId);
    const uniqueCaseIds = new Set(caseIdsInJudgments);

    if (caseIdsInJudgments.length === uniqueCaseIds.size) {
      recordResult(
        'Judgment Uniqueness',
        true,
        `All ${judgments.length} judgments have unique caseId (enforces 1:1 relation)`
      );
    } else {
      recordResult('Judgment Uniqueness', false, `Duplicate caseId found among judgments!`);
    }

    // -------------------------------------------------------------
    // CHECK 5: Backlog Cases Threshold Verification
    // -------------------------------------------------------------
    console.log('[5/5] Checking backlog threshold cases...');
    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: 'backlog_threshold_days' },
    });
    const thresholdDays = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 90;

    const thresholdDate = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);

    const openBacklogCases = await prisma.case.findMany({
      where: {
        status: { not: 'CLOSED' },
        filingDate: { lt: thresholdDate },
      },
    });

    if (openBacklogCases.length >= 3) {
      const caseList = openBacklogCases.map((c) => `${c.caseNumber} (${c.status})`).join(', ');
      recordResult(
        'Backlog Cases Threshold',
        true,
        `Found ${openBacklogCases.length} open cases older than ${thresholdDays} days (Requirement >= 3). Cases: ${caseList}`
      );
    } else {
      recordResult(
        'Backlog Cases Threshold',
        false,
        `Found only ${openBacklogCases.length} open backlog cases, expected at least 3`
      );
    }

    // -------------------------------------------------------------
    // DISPLAY REPORT TABLE
    // -------------------------------------------------------------
    console.log('\n===============================================================');
    console.log('                   VERIFICATION RESULTS TABLE                   ');
    console.log('===============================================================');
    console.table(results);

    if (allPassed) {
      console.log('>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0) <<<\n');
      process.exit(0);
    } else {
      console.error('>>> ONE OR MORE VERIFICATION CHECKS FAILED (CODE 1) <<<\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal verification error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runVerification();
