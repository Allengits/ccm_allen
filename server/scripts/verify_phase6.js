/**
 * Phase 6 Verification Script
 * Validates Phase 6 end-to-end functionality via scripted HTTP calls:
 * 1. Registrar schedules a hearing on an ADVOCATE_ASSIGNED case: 201, endsAt returned,
 *    status becomes HEARING_SCHEDULED with a history row.
 * 2. Scheduling the same courtroom and time again returns 409 naming the blocking case;
 *    the same for the same judge.
 * 3. Ten simultaneous POSTs for one free slot produce exactly one hearing.
 * 4. A judge completes today's hearing: case becomes UNDER_TRIAL; another judge gets 403 on that hearing.
 * 5. Adjourn with a next hearing creates the new SCHEDULED hearing; adjourn without one behaves per the Phase 6 rules.
 * 6. Cancel of the last SCHEDULED hearing reverts HEARING_SCHEDULED to ADVOCATE_ASSIGNED.
 * 7. Cause list for today shows the 2 seeded hearings grouped by courtroom; an advocate sees only their own cases' hearings.
 * 8. GET /cases/:id/history contains hearing events sorted by time.
 */

import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';

const DEMO_PASSWORD = 'Demo@1234';

async function runPhase6Verification() {
  console.log('===============================================================');
  console.log('       PHASE 6 END-TO-END ACCEPTANCE VERIFICATION SCRIPT       ');
  console.log('===============================================================\n');

  const results = [];

  const record = (checkNumber, title, passed, details) => {
    results.push({
      item: checkNumber,
      check: title,
      status: passed ? 'PASS' : 'FAIL',
      details,
    });
    console.log(`[Item ${checkNumber}] ${passed ? '✓ PASS' : '✗ FAIL'}: ${title}`);
    if (details) console.log(`   Details: ${details}`);
  };

  try {
    // Helper to login and get cookie
    const getAuthCookie = async (email) => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: DEMO_PASSWORD });
      return res.headers['set-cookie'] ? res.headers['set-cookie'][0] : null;
    };

    const registrarCookie = await getAuthCookie('registrar@courtcms.gov.in');
    const judge1Cookie = await getAuthCookie('judge.swaminathan@courtcms.gov.in');
    const judge2Cookie = await getAuthCookie('judge.banerjee@courtcms.gov.in');
    const advocateUserCookie = await getAuthCookie('adv.mehta@courtcms.gov.in');

    const courtrooms = await prisma.courtroom.findMany({ orderBy: { name: 'asc' } });
    const cr1 = courtrooms[0];
    const cr2 = courtrooms[1];

    // Find seeded cases
    const case3 = await prisma.case.findFirst({
      where: { caseNumber: 'CC/2026/00103' },
      include: { advocates: true },
    });
    const case4 = await prisma.case.findFirst({
      where: { caseNumber: 'CC/2025/00085' },
      include: { advocates: true },
    });
    const case5 = await prisma.case.findFirst({
      where: { caseNumber: 'CC/2026/00105' },
      include: { hearings: true },
    });

    // Helper to calculate a future court date (weekdays only)
    const getFutureCourtDateISO = (offsetDays, hours = 10, minutes = 0) => {
      const d = new Date();
      let added = 0;
      while (added < offsetDays) {
        d.setDate(d.getDate() + 1);
        const day = d.getDay();
        if (day !== 0 && day !== 6) {
          added++;
        }
      }
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(hours).padStart(2, '0');
      const min = String(minutes).padStart(2, '0');
      // ISO in IST (+05:30)
      return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`;
    };

    // -------------------------------------------------------------
    // Item 1: Registrar schedules hearing on ADVOCATE_ASSIGNED case
    // -------------------------------------------------------------
    const slot1 = getFutureCourtDateISO(5, 10, 0);
    const schedRes1 = await request(app)
      .post('/api/v1/hearings')
      .set('Cookie', registrarCookie)
      .send({
        caseId: case3.id,
        courtroomId: cr1.id,
        scheduledAt: slot1,
        durationMins: 30,
        purpose: 'Verification Hearing Purpose Item 1',
      });

    const case3Updated = await prisma.case.findUnique({
      where: { id: case3.id },
      include: { statusHistory: true },
    });

    const item1Pass =
      schedRes1.status === 201 &&
      schedRes1.body.success === true &&
      schedRes1.body.data.hearing.endsAt &&
      case3Updated.status === 'HEARING_SCHEDULED' &&
      case3Updated.statusHistory.some((h) => h.toStatus === 'HEARING_SCHEDULED');

    record(
      1,
      'Registrar schedules a hearing on an ADVOCATE_ASSIGNED case: 201, endsAt returned, status becomes HEARING_SCHEDULED with a history row',
      item1Pass,
      item1Pass
        ? `Status 201, endsAt: ${schedRes1.body.data.hearing.endsAt}, case status: ${case3Updated.status}`
        : `Status: ${schedRes1.status}, body: ${JSON.stringify(schedRes1.body)}`
    );

    // -------------------------------------------------------------
    // Item 2: Double-booking rejected for courtroom and for judge
    // -------------------------------------------------------------
    // 2a. Same courtroom, same time (Case 4)
    const schedResConflictCr = await request(app)
      .post('/api/v1/hearings')
      .set('Cookie', registrarCookie)
      .send({
        caseId: case4.id,
        courtroomId: cr1.id,
        scheduledAt: slot1,
        durationMins: 30,
        purpose: 'Attempted Double Booking Courtroom',
      });

    // 2b. Different courtroom, same judge at same time
    const schedResConflictJudge = await request(app)
      .post('/api/v1/hearings')
      .set('Cookie', registrarCookie)
      .send({
        caseId: case3.id,
        courtroomId: cr2.id,
        scheduledAt: slot1,
        durationMins: 30,
        purpose: 'Attempted Double Booking Judge',
      });

    const item2Pass =
      schedResConflictCr.status === 409 &&
      schedResConflictCr.body.message.includes(case3.caseNumber) &&
      schedResConflictJudge.status === 409 &&
      schedResConflictJudge.body.message.includes(case3.caseNumber);

    record(
      2,
      'Scheduling the same courtroom and time again returns 409 naming the blocking case; the same for the same judge',
      item2Pass,
      item2Pass
        ? `Courtroom: "${schedResConflictCr.body.message}", Judge: "${schedResConflictJudge.body.message}"`
        : `CR Status: ${schedResConflictCr.status} (${schedResConflictCr.body.message}), Judge Status: ${schedResConflictJudge.status} (${schedResConflictJudge.body.message})`
    );

    // -------------------------------------------------------------
    // Item 3: Ten simultaneous POSTs produce exactly one hearing
    // -------------------------------------------------------------
    const slotConcurrent = getFutureCourtDateISO(6, 10, 0);
    const concurrentRequests = Array.from({ length: 10 }).map((_, i) =>
      request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId: case3.id,
          courtroomId: cr1.id,
          scheduledAt: slotConcurrent,
          durationMins: 30,
          purpose: `Concurrent Booking Attempt #${i + 1}`,
        })
    );

    const concurrentResponses = await Promise.all(concurrentRequests);
    const successResponses = concurrentResponses.filter((r) => r.status === 201);
    const conflictResponses = concurrentResponses.filter((r) => r.status === 409);

    const item3Pass = successResponses.length === 1 && conflictResponses.length === 9;
    record(
      3,
      'Ten simultaneous POSTs for one free slot produce exactly one hearing',
      item3Pass,
      `Successes (201): ${successResponses.length}, Conflicts (409): ${conflictResponses.length}`
    );

    // -------------------------------------------------------------
    // Item 4: Judge completes today's hearing -> UNDER_TRIAL; other judge gets 403
    // -------------------------------------------------------------
    const todayHearingCase5 = await prisma.hearing.findFirst({
      where: { caseId: case5.id, status: 'SCHEDULED' },
    });

    // 4a. Judge 2 attempts to complete Judge 1's hearing -> 403
    const forbiddenRes = await request(app)
      .post(`/api/v1/hearings/${todayHearingCase5.id}/complete`)
      .set('Cookie', judge2Cookie)
      .send({
        outcomeNotes: 'Unauthorized completion attempt by judge 2',
      });

    // 4b. Judge 1 completes their assigned hearing -> 200 and UNDER_TRIAL
    const completeRes = await request(app)
      .post(`/api/v1/hearings/${todayHearingCase5.id}/complete`)
      .set('Cookie', judge1Cookie)
      .send({
        outcomeNotes: 'Trial proceedings completed; oral depositions concluded.',
      });

    const case5AfterComplete = await prisma.case.findUnique({
      where: { id: case5.id },
    });

    const item4Pass =
      forbiddenRes.status === 403 &&
      completeRes.status === 200 &&
      case5AfterComplete.status === 'UNDER_TRIAL';

    record(
      4,
      "A judge completes today's hearing: case becomes UNDER_TRIAL; another judge gets 403 on that hearing",
      item4Pass,
      item4Pass
        ? `Forbidden status: 403, Complete status: 200, Case 5 status: ${case5AfterComplete.status}`
        : `Forbidden status: ${forbiddenRes.status}, Complete status: ${completeRes.status}, Case 5 status: ${case5AfterComplete?.status}`
    );

    // -------------------------------------------------------------
    // Item 5: Adjourn with next hearing creates new SCHEDULED hearing;
    //         adjourn without one behaves per Phase 6 rules
    // -------------------------------------------------------------
    // 5a. Schedule a temporary hearing to adjourn with next hearing
    const slotTemp5 = getFutureCourtDateISO(8, 10, 0);
    const tempSchedRes = await request(app)
      .post('/api/v1/hearings')
      .set('Cookie', registrarCookie)
      .send({
        caseId: case4.id,
        courtroomId: cr2.id,
        scheduledAt: slotTemp5,
        durationMins: 30,
        purpose: 'Hearing to be adjourned with next date',
      });

    const tempHearingId = tempSchedRes.body.data.hearing.id;
    const slotNext5 = getFutureCourtDateISO(9, 10, 0);

    const adjournWithNextRes = await request(app)
      .post(`/api/v1/hearings/${tempHearingId}/adjourn`)
      .set('Cookie', judge2Cookie)
      .send({
        reason: 'Counsel unwell; matter adjourned to next week',
        nextHearing: {
          courtroomId: cr2.id,
          scheduledAt: slotNext5,
          durationMins: 30,
          purpose: 'Continuation after adjournment',
        },
      });

    const adjournedHearingRow = await prisma.hearing.findUnique({
      where: { id: tempHearingId },
    });
    const newScheduledHearingRow = await prisma.hearing.findFirst({
      where: { caseId: case4.id, scheduledAt: new Date(slotNext5), status: 'SCHEDULED' },
    });

    // 5b. Now adjourn the new hearing WITHOUT next hearing; case 4 has no other hearings, so it should revert to ADVOCATE_ASSIGNED
    const adjournWithoutNextRes = await request(app)
      .post(`/api/v1/hearings/${newScheduledHearingRow.id}/adjourn`)
      .set('Cookie', judge2Cookie)
      .send({
        reason: 'Sine die adjournment pending forensic report',
      });

    const case4AfterAdjournWithoutNext = await prisma.case.findUnique({
      where: { id: case4.id },
    });

    const item5Pass =
      adjournWithNextRes.status === 200 &&
      adjournedHearingRow.status === 'ADJOURNED' &&
      newScheduledHearingRow !== null &&
      adjournWithoutNextRes.status === 200 &&
      case4AfterAdjournWithoutNext.status === 'ADVOCATE_ASSIGNED';

    record(
      5,
      'Adjourn with a next hearing creates the new SCHEDULED hearing; adjourn without one behaves per the Phase 6 rules',
      item5Pass,
      item5Pass
        ? `Adjourn with next created hearing ID ${newScheduledHearingRow.id}; Adjourn without next reverted case 4 to ${case4AfterAdjournWithoutNext.status}`
        : `Adjourn with: ${adjournWithNextRes.status}, Adjourn without: ${adjournWithoutNextRes.status}, Case 4 status: ${case4AfterAdjournWithoutNext?.status}`
    );

    // -------------------------------------------------------------
    // Item 6: Cancel of last SCHEDULED hearing reverts to ADVOCATE_ASSIGNED
    // -------------------------------------------------------------
    // Schedule a hearing on Case 4, then cancel it
    const slotCancel = getFutureCourtDateISO(10, 10, 0);
    const cancelSchedRes = await request(app)
      .post('/api/v1/hearings')
      .set('Cookie', registrarCookie)
      .send({
        caseId: case4.id,
        courtroomId: cr1.id,
        scheduledAt: slotCancel,
        durationMins: 30,
        purpose: 'Hearing to test cancellation',
      });

    const cancelHearingId = cancelSchedRes.body.data.hearing.id;
    const cancelRes = await request(app)
      .post(`/api/v1/hearings/${cancelHearingId}/cancel`)
      .set('Cookie', registrarCookie)
      .send({
        reason: 'Procedural defect identified in registry filing',
      });

    const case4AfterCancel = await prisma.case.findUnique({
      where: { id: case4.id },
    });

    const item6Pass = cancelRes.status === 200 && case4AfterCancel.status === 'ADVOCATE_ASSIGNED';

    record(
      6,
      'Cancel of the last SCHEDULED hearing reverts HEARING_SCHEDULED to ADVOCATE_ASSIGNED',
      item6Pass,
      item6Pass
        ? `Cancel status 200, case status reverted to ${case4AfterCancel.status}`
        : `Cancel status: ${cancelRes.status}, case status: ${case4AfterCancel?.status}`
    );

    // -------------------------------------------------------------
    // Item 7: Cause list for today shows 2 seeded hearings grouped by courtroom;
    //         advocate sees only their own cases' hearings
    // -------------------------------------------------------------
    const causeListRegistrarRes = await request(app)
      .get('/api/v1/hearings/cause-list')
      .set('Cookie', registrarCookie);

    const causeListAdvocateRes = await request(app)
      .get('/api/v1/hearings/cause-list')
      .set('Cookie', advocateUserCookie);

    const regCourtrooms = causeListRegistrarRes.body.data.courtrooms || [];
    const totalRegHearings = regCourtrooms.reduce((acc, cr) => acc + cr.hearings.length, 0);

    const advCourtrooms = causeListAdvocateRes.body.data.courtrooms || [];
    const totalAdvHearings = advCourtrooms.reduce((acc, cr) => acc + cr.hearings.length, 0);

    // Check that advocate only sees hearings for cases they represent
    const advocateCases = await prisma.caseAdvocate.findMany({
      where: { advocate: { user: { email: 'adv.mehta@courtcms.gov.in' } }, isActive: true },
      select: { caseId: true },
    });
    const advocateCaseIdSet = new Set(advocateCases.map((ca) => ca.caseId));

    let advocateOnlyOwnCases = true;
    for (const cr of advCourtrooms) {
      for (const h of cr.hearings) {
        if (!advocateCaseIdSet.has(h.caseId)) {
          advocateOnlyOwnCases = false;
        }
      }
    }

    const item7Pass =
      causeListRegistrarRes.status === 200 &&
      totalRegHearings >= 2 &&
      regCourtrooms.length >= 2 &&
      causeListAdvocateRes.status === 200 &&
      advocateOnlyOwnCases;

    record(
      7,
      "Cause list for today shows the 2 seeded hearings grouped by courtroom; an advocate sees only their own cases' hearings",
      item7Pass,
      item7Pass
        ? `Registrar sees ${totalRegHearings} hearings across ${regCourtrooms.length} courtrooms; Advocate sees ${totalAdvHearings} hearings (all strictly scoped)`
        : `Reg status: ${causeListRegistrarRes.status} (hearings: ${totalRegHearings}), Adv status: ${causeListAdvocateRes.status} (scoped: ${advocateOnlyOwnCases})`
    );

    // -------------------------------------------------------------
    // Item 8: GET /cases/:id/history contains hearing events sorted by time
    // -------------------------------------------------------------
    const historyRes = await request(app)
      .get(`/api/v1/cases/${case3.id}/history`)
      .set('Cookie', registrarCookie);

    const events = historyRes.body.data?.history || [];
    const hasHearingEvents = events.some(
      (e) =>
        e.id?.startsWith('hearing-event') ||
        e.reason?.includes('Hearing') ||
        e.eventType === 'HEARING' ||
        e.type === 'HEARING'
    );

    // Check chronological order (descending by createdAt as produced by case timeline)
    let isSorted = true;
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].createdAt || events[i - 1].timestamp).getTime();
      const curr = new Date(events[i].createdAt || events[i].timestamp).getTime();
      if (curr > prev) {
        isSorted = false;
        break;
      }
    }

    const item8Pass = historyRes.status === 200 && hasHearingEvents && isSorted;

    record(
      8,
      'GET /cases/:id/history contains hearing events sorted by time',
      item8Pass,
      item8Pass
        ? `Retrieved ${events.length} chronological history events with hearing milestones`
        : `Status: ${historyRes.status}, events count: ${events.length}, sorted: ${isSorted}, hasHearing: ${hasHearingEvents}`
    );

    console.log('\n===============================================================');
    const allPassed = results.every((r) => r.status === 'PASS');
    if (allPassed) {
      console.log('>>> ALL 8 PHASE 6 VERIFICATION CHECKS PASSED (CODE 0) <<<');
    } else {
      console.error('>>> SOME PHASE 6 VERIFICATION CHECKS FAILED <<<');
      process.exit(1);
    }
  } catch (err) {
    console.error('Phase 6 verification script failed with unhandled error:', err);
    process.exit(1);
  }
}

runPhase6Verification();
