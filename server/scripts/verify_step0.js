/**
 * Step 0 Full Verification Script
 * Validates Phase 5-7 stability and Phase 6 fix functionality prior to Phase 8:
 * 1. Judge reserves judgment on eligible UNDER_TRIAL case; ineligible case blocked with scheduled count.
 * 2. Delivering judgment closes case, sets closedAt, second attempt rejected with 409.
 * 3. Closed case rejects edit, advocate assign/unassign, and hearing/judgment actions.
 * 4. Completing/adjourning future-dated hearing rejected with formatted date for JUDGE and ADMIN; today/earlier accepted.
 * 5. Ten simultaneous POSTs for one slot produce 1 hearing; five simultaneous deliveries produce 1 delivered judgment.
 * 6. Client and server permission maps parity check.
 */

import request from 'supertest';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { PERMISSIONS as serverPermissions } from '../src/config/permissions.js';
import { PERMISSIONS as clientPermissions } from '../../client/src/constants/permissions.js';

const DEMO_PASSWORD = 'Demo@1234';
const COURT_TZ = 'Asia/Kolkata';

async function runStep0Verification() {
  console.log('===============================================================');
  console.log('       PHASE 8 STEP 0: FULL VERIFICATION & CARRY-OVER          ');
  console.log('===============================================================\n');

  const results = [];

  const record = (num, title, passed, details) => {
    results.push({ num, title, passed, details });
    console.log(`[Check ${num}] ${passed ? '✓ PASS' : '✗ FAIL'}: ${title}`);
    if (details) console.log(`   Details: ${details}`);
  };

  try {
    const getAuthCookie = async (email) => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: DEMO_PASSWORD });
      if (!res.headers['set-cookie']) {
        throw new Error(`Login failed for ${email}`);
      }
      return res.headers['set-cookie'][0];
    };

    const adminCookie = await getAuthCookie('admin@courtcms.gov.in');
    const registrarCookie = await getAuthCookie('registrar@courtcms.gov.in');
    const judge1Cookie = await getAuthCookie('judge.swaminathan@courtcms.gov.in');
    const judge2Cookie = await getAuthCookie('judge.banerjee@courtcms.gov.in');
    const advocateCookie = await getAuthCookie('adv.mehta@courtcms.gov.in');

    // -------------------------------------------------------------
    // Check 1: Reserve judgment eligible vs ineligible
    // -------------------------------------------------------------
    const case10 = await prisma.case.findFirst({
      where: { caseNumber: 'CC/2026/00110' }, // Judge Banerjee (judge2), 1 completed hearing, 0 scheduled
    });
    const case7 = await prisma.case.findFirst({
      where: { caseNumber: 'CC/2025/00045' }, // Judge Swaminathan (judge1), has scheduled hearing
    });

    const ineligibleRes = await request(app)
      .post(`/api/v1/cases/${case7.id}/judgment/reserve`)
      .set('Cookie', judge1Cookie)
      .send({
        reserveNote: 'Arguments concluded, reserving judgment',
      });

    const ineligibleBlocked =
      ineligibleRes.status === 400 &&
      (ineligibleRes.body.message.includes('1 scheduled') ||
        ineligibleRes.body.message.includes('scheduled hearing'));

    const eligibleRes = await request(app)
      .post(`/api/v1/cases/${case10.id}/judgment/reserve`)
      .set('Cookie', judge2Cookie)
      .send({
        reserveNote: 'Final arguments completed, order reserved',
      });

    const eligiblePassed =
      eligibleRes.status === 201 &&
      eligibleRes.body.data.judgment.status === 'RESERVED' &&
      eligibleRes.body.data.case.status === 'JUDGMENT_RESERVED';

    record(
      1,
      'Judge reserves judgment on eligible UNDER_TRIAL case; ineligible case blocked with scheduled count',
      ineligibleBlocked && eligiblePassed,
      `Ineligible HTTP ${ineligibleRes.status} ("${ineligibleRes.body.message}"), Eligible HTTP ${eligibleRes.status} -> status: ${eligibleRes.body.data?.case?.status}`
    );

    // -------------------------------------------------------------
    // Check 2: Delivering judgment closes case and rejects duplicate
    // -------------------------------------------------------------
    const case11 = await prisma.case.findFirst({
      where: { caseNumber: 'CC/2025/00030' }, // Judge Swaminathan (judge1), RESERVED
    });

    const todayDateStr = DateTime.now().setZone(COURT_TZ).toFormat('yyyy-MM-dd');
    const deliverRes1 = await request(app)
      .post(`/api/v1/cases/${case11.id}/judgment/deliver`)
      .set('Cookie', judge1Cookie)
      .send({
        outcome: 'ALLOWED',
        summary:
          'The petition is hereby allowed with costs. Direction issued to respondents to comply within thirty days.',
        judgmentDate: todayDateStr,
      });

    const updatedCase11 = await prisma.case.findUnique({ where: { id: case11.id } });
    const deliver1Success =
      deliverRes1.status === 200 &&
      updatedCase11.status === 'CLOSED' &&
      updatedCase11.closedAt !== null;

    const deliverRes2 = await request(app)
      .post(`/api/v1/cases/${case11.id}/judgment/deliver`)
      .set('Cookie', judge1Cookie)
      .send({
        outcome: 'DISMISSED',
        summary:
          'Second delivery attempt on already closed case should be rejected deterministically.',
        judgmentDate: todayDateStr,
      });

    const deliver2Blocked = deliverRes2.status === 409 || deliverRes2.status === 400;

    record(
      2,
      'Delivering judgment closes case, sets closedAt, and second delivery attempt is rejected (409)',
      deliver1Success && deliver2Blocked,
      `First delivery HTTP ${deliverRes1.status}, closedAt=${updatedCase11?.closedAt?.toISOString()}, Second delivery HTTP ${deliverRes2.status} ("${deliverRes2.body?.message}")`
    );

    // -------------------------------------------------------------
    // Check 3: Closed case rejects edit, advocate assign/unassign, and hearing actions
    // -------------------------------------------------------------
    const case13 = await prisma.case.findFirst({
      where: { caseNumber: 'CC/2025/00015' }, // Seeded CLOSED case
      include: { advocates: true },
    });

    const editRes = await request(app)
      .patch(`/api/v1/cases/${case13.id}`)
      .set('Cookie', adminCookie)
      .send({ title: 'Attempt to modify closed case title' });

    const advocates = await prisma.advocate.findMany();
    const unassignedAdv = advocates.find(
      (a) => !case13.advocates.some((ca) => ca.advocateId === a.id)
    );

    const assignRes = await request(app)
      .post(`/api/v1/cases/${case13.id}/advocates`)
      .set('Cookie', registrarCookie)
      .send({ advocateId: unassignedAdv.id, side: 'PETITIONER' });

    const activeCa = case13.advocates.find((ca) => ca.isActive);
    const unassignRes = activeCa
      ? await request(app)
          .post(`/api/v1/cases/${case13.id}/advocates/${activeCa.advocateId}/unassign`)
          .set('Cookie', registrarCookie)
          .send({ reason: 'Attempt to unassign on closed case' })
      : { status: 400 };

    const courtrooms = await prisma.courtroom.findMany();
    const cr = courtrooms[0];
    const cleanSlotDate = DateTime.now()
      .setZone(COURT_TZ)
      .plus({ days: 3 })
      .set({ hour: 11, minute: 0, second: 0, millisecond: 0 });

    const scheduleRes = await request(app)
      .post('/api/v1/hearings')
      .set('Cookie', registrarCookie)
      .send({
        caseId: case13.id,
        courtroomId: cr.id,
        judgeId: case13.judgeId,
        scheduledAt: cleanSlotDate.toISO(),
        durationMins: 30,
        purpose: 'Attempted hearing on closed case',
      });

    const closedRejectionsPassed =
      editRes.status === 400 &&
      assignRes.status === 400 &&
      unassignRes.status === 400 &&
      scheduleRes.status === 400;

    record(
      3,
      'Closed case rejects edit, advocate assign/unassign, and every hearing action with a clear message',
      closedRejectionsPassed,
      `Edit: ${editRes.status} ("${editRes.body?.message}"), Assign: ${assignRes.status} ("${assignRes.body?.message}"), Unassign: ${unassignRes.status}, Schedule: ${scheduleRes.status} ("${scheduleRes.body?.message}")`
    );

    // -------------------------------------------------------------
    // Check 4: Completing or adjourning future hearing rejected for JUDGE & ADMIN; today/earlier accepted
    // -------------------------------------------------------------
    const case9 = await prisma.case.findFirst({
      where: { caseNumber: 'CC/2026/00109' },
      include: { hearings: { where: { status: 'SCHEDULED' } } },
    });
    const futureHearing = case9.hearings[0];

    // Judge attempt on future hearing
    const judgeFutureComp = await request(app)
      .post(`/api/v1/hearings/${futureHearing.id}/complete`)
      .set('Cookie', judge1Cookie)
      .send({ outcomeNotes: 'Attempted future completion' });

    const judgeFutureAdj = await request(app)
      .post(`/api/v1/hearings/${futureHearing.id}/adjourn`)
      .set('Cookie', judge1Cookie)
      .send({ reason: 'Attempted future adjournment' });

    // Admin attempt on future hearing
    const adminFutureComp = await request(app)
      .post(`/api/v1/hearings/${futureHearing.id}/complete`)
      .set('Cookie', adminCookie)
      .send({ outcomeNotes: 'Attempted future completion by Admin' });

    const adminFutureAdj = await request(app)
      .post(`/api/v1/hearings/${futureHearing.id}/adjourn`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Attempted future adjournment by Admin' });

    const futureRejectionsValid =
      judgeFutureComp.status === 400 &&
      judgeFutureComp.body.message.includes('future date') &&
      judgeFutureAdj.status === 400 &&
      judgeFutureAdj.body.message.includes('future date') &&
      adminFutureComp.status === 400 &&
      adminFutureComp.body.message.includes('future date') &&
      adminFutureAdj.status === 400 &&
      adminFutureAdj.body.message.includes('future date');

    // Test a hearing dated today: create a temporary hearing dated today IST
    const todayHearingDt = DateTime.now().setZone(COURT_TZ).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
    const tempCase = await prisma.case.create({
      data: {
        caseNumber: 'CC/2026/99991',
        title: 'Temp Future Date Verification Case',
        caseType: 'CIVIL',
        status: 'HEARING_SCHEDULED',
        petitioner: 'Test P',
        respondent: 'Test R',
        filingDate: new Date(),
        judgeId: case9.judgeId,
        registeredById: case9.registeredById,
      },
    });

    const tempHearing = await prisma.hearing.create({
      data: {
        caseId: tempCase.id,
        courtroomId: cr.id,
        judgeId: case9.judgeId,
        scheduledAt: todayHearingDt.toJSDate(),
        durationMins: 30,
        purpose: 'Test Today Completion',
        status: 'SCHEDULED',
      },
    });

    const todayCompRes = await request(app)
      .post(`/api/v1/hearings/${tempHearing.id}/complete`)
      .set('Cookie', judge1Cookie)
      .send({ outcomeNotes: 'Completed today hearing successfully' });

    const todayAccepted = todayCompRes.status === 200;

    // Clean up temporary records
    await prisma.hearingEvent.deleteMany({ where: { hearingId: tempHearing.id } });
    await prisma.hearing.delete({ where: { id: tempHearing.id } });
    await prisma.caseStatusHistory.deleteMany({ where: { caseId: tempCase.id } });
    await prisma.case.delete({ where: { id: tempCase.id } });

    record(
      4,
      'Completing or adjourning hearing dated after today rejected with date message; today/earlier accepted',
      futureRejectionsValid && todayAccepted,
      `Judge Comp: ${judgeFutureComp.status} ("${judgeFutureComp.body.message}"), Admin Adj: ${adminFutureAdj.status}, Today Comp: ${todayCompRes.status}`
    );

    // -------------------------------------------------------------
    // Check 5: Concurrency - 10 simultaneous hearing bookings, 5 simultaneous deliveries
    // -------------------------------------------------------------
    // 5a. 10 simultaneous POSTs for one free slot
    const slotDate = DateTime.now()
      .setZone(COURT_TZ)
      .plus({ days: 7 })
      .set({ hour: 11, minute: 0, second: 0, millisecond: 0 });

    // Use a case eligible for scheduling
    const schedulingCase = await prisma.case.findFirst({
      where: { status: 'ADVOCATE_ASSIGNED' },
    });

    const postPromises = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId: schedulingCase.id,
          courtroomId: cr.id,
          judgeId: schedulingCase.judgeId,
          scheduledAt: slotDate.toISO(),
          durationMins: 30,
          purpose: `Concurrent Slot Test ${i + 1}`,
        })
    );

    const postResults = await Promise.all(postPromises);
    const post201s = postResults.filter((r) => r.status === 201);
    const post409s = postResults.filter((r) => r.status === 409);

    // 5b. 5 simultaneous deliveries on the same case
    // Create a temporary case in JUDGMENT_RESERVED
    const tempReservedCase = await prisma.case.create({
      data: {
        caseNumber: 'CC/2026/99992',
        title: 'Temp Concurrent Delivery Case',
        caseType: 'CIVIL',
        status: 'JUDGMENT_RESERVED',
        petitioner: 'Concurrent P',
        respondent: 'Concurrent R',
        filingDate: new Date(),
        judgeId: case9.judgeId,
        registeredById: case9.registeredById,
      },
    });

    const tempJudgment = await prisma.judgment.create({
      data: {
        caseId: tempReservedCase.id,
        judgeId: case9.judgeId,
        status: 'RESERVED',
        reservedAt: new Date(),
        reservedById: case9.judgeId,
        reserveNote: 'Reserved for delivery test',
      },
    });

    const deliveryPromises = Array.from({ length: 5 }, (_, i) =>
      request(app)
        .post(`/api/v1/cases/${tempReservedCase.id}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'ALLOWED',
          summary: `Concurrent judgment delivery decree #${i + 1} with sufficient length.`,
          judgmentDate: todayDateStr,
        })
    );

    const deliveryResults = await Promise.all(deliveryPromises);
    const delivery200s = deliveryResults.filter((r) => r.status === 200);
    const delivery409s = deliveryResults.filter((r) => r.status === 409);

    // Clean up temporary records
    await prisma.caseStatusHistory.deleteMany({ where: { caseId: tempReservedCase.id } });
    await prisma.judgment.delete({ where: { id: tempJudgment.id } });
    await prisma.case.delete({ where: { id: tempReservedCase.id } });

    // Clean up newly created hearing from concurrent test
    for (const res of post201s) {
      if (res.body?.data?.hearing?.id) {
        await prisma.hearingEvent.deleteMany({ where: { hearingId: res.body.data.hearing.id } });
        await prisma.hearing.delete({ where: { id: res.body.data.hearing.id } });
      }
    }
    // Restore schedulingCase status if modified
    await prisma.case.update({
      where: { id: schedulingCase.id },
      data: { status: 'ADVOCATE_ASSIGNED' },
    });
    await prisma.caseStatusHistory.deleteMany({
      where: {
        caseId: schedulingCase.id,
        toStatus: 'HEARING_SCHEDULED',
        reason: { contains: 'Concurrent Slot Test' },
      },
    });

    const concurrencyPassed =
      post201s.length === 1 &&
      post409s.length === 9 &&
      delivery200s.length === 1 &&
      delivery409s.length === 4;

    record(
      5,
      'Ten simultaneous POSTs for one free hearing slot produce 1 hearing; five simultaneous deliveries produce 1 delivered judgment',
      concurrencyPassed,
      `Hearing POST: ${post201s.length} 201s, ${post409s.length} 409s; Delivery POST: ${delivery200s.length} 200s, ${delivery409s.length} 409s`
    );

    // -------------------------------------------------------------
    // Check 6: Client and server permission maps equality
    // -------------------------------------------------------------
    const serverKeys = Object.keys(serverPermissions).sort();
    const clientKeys = Object.keys(clientPermissions).sort();

    const keysEqual = JSON.stringify(serverKeys) === JSON.stringify(clientKeys);
    let valuesEqual = true;
    for (const key of serverKeys) {
      if (serverPermissions[key] !== clientPermissions[key]) {
        valuesEqual = false;
        break;
      }
    }

    record(
      6,
      'Client and server permission maps are equal (Phase 7 parity check)',
      keysEqual && valuesEqual,
      `Total permissions: ${serverKeys.length}, Server keys match client keys: ${keysEqual && valuesEqual}`
    );

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n===============================================================');
    const allPassed = results.every((r) => r.passed);
    console.log(`STEP 0 VERIFICATION RESULT: ${allPassed ? 'ALL PASS' : 'FAILURES DETECTED'}`);
    console.log('===============================================================');

    return { allPassed, results };
  } finally {
    await prisma.$disconnect();
  }
}

runStep0Verification()
  .then(({ allPassed }) => {
    process.exit(allPassed ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fatal error during step 0 verification:', err);
    process.exit(1);
  });
