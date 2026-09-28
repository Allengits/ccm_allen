// Database Verification Script (db:verify)
// Performs automated integrity checks against the seeded database:
// 1. Table row counts
// 2. Case lifecycle consistency against business rules
// 3. Absence of double-booked courtrooms or judges
// 4. One judgment per case constraint
// 5. Backlog threshold case verification (>= 3 open cases > threshold days)
// Exits with code 0 on all PASS, code 1 if any check FAILS.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      evidence: await prisma.evidence.count(),
      evidenceCustodyLogs: await prisma.evidenceCustodyLog.count(),
      judgments: await prisma.judgment.count(),
      caseStatusHistory: await prisma.caseStatusHistory.count(),
      caseSequences: await prisma.caseSequence.count(),
      systemSettings: await prisma.systemSetting.count(),
    };

    const emptyTables = Object.entries(tableCounts).filter(([_, count]) => count === 0);
    const countSummary = Object.entries(tableCounts)
      .map(([tbl, cnt]) => `${tbl}: ${cnt}`)
      .join(', ');

    if (emptyTables.length === 0 && tableCounts.cases >= 14 && tableCounts.hearings >= 15) {
      recordResult('Table Row Counts', true, `All 12 tables populated (${countSummary})`);
    } else {
      recordResult(
        'Table Row Counts',
        false,
        emptyTables.length > 0
          ? `Empty tables found: ${emptyTables.map(([t]) => t).join(', ')}`
          : `Cases (${tableCounts.cases}) or Hearings (${tableCounts.hearings}) below expected counts`
      );
    }

    // -------------------------------------------------------------
    // CHECK 2: Case Lifecycle Status Consistency
    // -------------------------------------------------------------
    console.log('[2/5] Validating case lifecycle records consistency...');
    const cases = await prisma.case.findMany({
      include: {
        advocates: { where: { isActive: true } },
        hearings: true,
        evidence: true,
        judgment: true,
      },
    });

    const now = new Date();
    let statusFailures = [];

    for (const c of cases) {
      switch (c.status) {
        case 'REGISTERED': {
          if (c.advocates.length !== 0 || c.hearings.length !== 0) {
            statusFailures.push(
              `${c.caseNumber} (REGISTERED): Expected 0 advocates and 0 hearings, found ${c.advocates.length} adv, ${c.hearings.length} hearings`
            );
          }
          break;
        }
        case 'ADVOCATE_ASSIGNED': {
          if (c.advocates.length === 0 || c.hearings.length !== 0) {
            statusFailures.push(
              `${c.caseNumber} (ADVOCATE_ASSIGNED): Expected >= 1 active advocate and 0 hearings, found ${c.advocates.length} adv, ${c.hearings.length} hearings`
            );
          }
          break;
        }
        case 'HEARING_SCHEDULED': {
          const hasAdvocate = c.advocates.length >= 1;
          const hasFutureHearing = c.hearings.some(
            (h) => h.status === 'SCHEDULED' && new Date(h.scheduledAt) > now
          );
          if (!hasAdvocate || !hasFutureHearing) {
            statusFailures.push(
              `${c.caseNumber} (HEARING_SCHEDULED): Needs active advocate and at least one future SCHEDULED hearing`
            );
          }
          break;
        }
        case 'UNDER_TRIAL': {
          const hasAdvocate = c.advocates.length >= 1;
          const hasPastCompleted = c.hearings.some(
            (h) => h.status === 'COMPLETED' && new Date(h.scheduledAt) <= now
          );
          const hasFutureHearing = c.hearings.some((h) => new Date(h.scheduledAt) > now);
          const hasEvidence = c.evidence.length >= 1;
          if (!hasAdvocate || !hasPastCompleted || !hasFutureHearing || !hasEvidence) {
            statusFailures.push(
              `${c.caseNumber} (UNDER_TRIAL): Needs advocate (has:${hasAdvocate}), past completed hearing (has:${hasPastCompleted}), future hearing (has:${hasFutureHearing}), and evidence (has:${hasEvidence})`
            );
          }
          break;
        }
        case 'JUDGMENT_RESERVED': {
          if (!c.judgment || c.judgment.status !== 'RESERVED') {
            statusFailures.push(
              `${c.caseNumber} (JUDGMENT_RESERVED): Expected Judgment record with status RESERVED`
            );
          }
          break;
        }
        case 'CLOSED': {
          if (!c.judgment || c.judgment.status !== 'DELIVERED' || !c.closedAt) {
            statusFailures.push(
              `${c.caseNumber} (CLOSED): Expected Judgment with status DELIVERED and non-null closedAt`
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
        `All ${cases.length} cases strictly conform to their lifecycle state constraints`
      );
    } else {
      recordResult(
        'Case Status Consistency',
        false,
        `${statusFailures.length} violations: ${statusFailures.join('; ')}`
      );
    }

    // -------------------------------------------------------------
    // CHECK 3: Courtroom & Judge Schedule Overlap (No Double-Booking)
    // -------------------------------------------------------------
    console.log('[3/5] Checking for courtroom and judge scheduling conflicts...');
    const hearings = await prisma.hearing.findMany({
      include: { courtroom: true, judge: true },
      orderBy: { scheduledAt: 'asc' },
    });

    const conflicts = [];
    for (let i = 0; i < hearings.length; i++) {
      for (let j = i + 1; j < hearings.length; j++) {
        const h1 = hearings[i];
        const h2 = hearings[j];

        const start1 = new Date(h1.scheduledAt).getTime();
        const end1 = start1 + h1.durationMins * 60 * 1000;
        const start2 = new Date(h2.scheduledAt).getTime();
        const end2 = start2 + h2.durationMins * 60 * 1000;

        // Check time interval overlap: (start1 < end2) && (start2 < end1)
        if (start1 < end2 && start2 < end1) {
          if (h1.courtroomId === h2.courtroomId) {
            conflicts.push(
              `Courtroom Double-Booked: ${h1.courtroom.name} booked simultaneously for hearings ${h1.id} and ${h2.id} around ${new Date(start1).toISOString()}`
            );
          }
          if (h1.judgeId === h2.judgeId) {
            conflicts.push(
              `Judge Double-Booked: ${h1.judge.name} scheduled simultaneously for hearings ${h1.id} and ${h2.id} around ${new Date(start1).toISOString()}`
            );
          }
        }
      }
    }

    if (conflicts.length === 0) {
      recordResult(
        'No Double-Booking',
        true,
        `All ${hearings.length} hearings verified: zero courtroom and zero judge scheduling collisions`
      );
    } else {
      recordResult(
        'No Double-Booking',
        false,
        `Found ${conflicts.length} conflicts: ${conflicts.join('; ')}`
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
