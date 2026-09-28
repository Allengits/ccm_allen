/**
 * Phase 5 Verification Script
 * Validates Phase 5 end-to-end functionality via scripted HTTP calls:
 * 1. Registrar assigns an advocate to a REGISTERED case: status becomes ADVOCATE_ASSIGNED
 *    and the history row has the reason and the registrar as changedBy.
 * 2. A second advocate on the same case does not change status; same advocate on both sides,
 *    third advocate on one side, and unassign without a reason are all rejected with clear messages.
 * 3. Unassigning the last advocate reverts ADVOCATE_ASSIGNED to REGISTERED; re-assigning the same
 *    advocate reuses the row and clears the unassigned fields.
 * 4. The advocate's own case list gains the case right after assignment and loses it after unassignment.
 * 5. GET /cases/:id returns assignment audit details (assignedBy, unassignedBy, reason) and the history
 *    endpoint includes assignment events.
 * 6. JUDGE and ADVOCATE get 403 on assignment endpoints; the advocate directory rules per role hold.
 * 7. Client build succeeds and Assign/Unassign/Add Advocate buttons are gated by can().
 */

import request from 'supertest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';

const DEMO_PASSWORD = 'Demo@1234';

async function runPhase5Verification() {
  console.log('===============================================================');
  console.log('       PHASE 5 END-TO-END ACCEPTANCE VERIFICATION SCRIPT       ');
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
    const judgeCookie = await getAuthCookie('judge.swaminathan@courtcms.gov.in');
    const advocateUserCookie = await getAuthCookie('adv.mehta@courtcms.gov.in');

    const mehtaAdvocate = await prisma.advocate.findFirst({
      where: { user: { email: 'adv.mehta@courtcms.gov.in' } },
    });
    const iyerAdvocate = await prisma.advocate.findFirst({
      where: { user: { email: 'adv.iyer@courtcms.gov.in' } },
    });
    const khanAdvocate = await prisma.advocate.findFirst({
      where: { user: { email: 'adv.khan@courtcms.gov.in' } },
    });

    const registrarUser = await prisma.user.findUnique({
      where: { email: 'registrar@courtcms.gov.in' },
    });

    // Create a temporary REGISTERED case for testing
    const createCaseRes = await request(app)
      .post('/api/v1/cases')
      .set('Cookie', [registrarCookie])
      .send({
        title: 'Phase 5 Verification Case',
        caseType: 'CIVIL',
        priority: 'NORMAL',
        petitioner: 'Test Petitioner',
        respondent: 'Test Respondent',
        description: 'Case specifically created for Phase 5 verification',
        filingDate: new Date().toISOString(),
      });
    const testCaseId = createCaseRes.body.data.case.id;

    // -------------------------------------------------------------
    // ITEM 1: Registrar assigns an advocate to REGISTERED case -> ADVOCATE_ASSIGNED
    // -------------------------------------------------------------
    const assign1Res = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates`)
      .set('Cookie', [registrarCookie])
      .send({
        advocateId: mehtaAdvocate.id,
        side: 'PETITIONER',
      });

    const caseAfter1 = await request(app)
      .get(`/api/v1/cases/${testCaseId}`)
      .set('Cookie', [registrarCookie]);

    const historyAfter1 = await prisma.caseStatusHistory.findFirst({
      where: { caseId: testCaseId, toStatus: 'ADVOCATE_ASSIGNED' },
      include: { changedBy: true },
    });

    const item1Pass =
      assign1Res.status === 201 &&
      caseAfter1.body.data.case.status === 'ADVOCATE_ASSIGNED' &&
      historyAfter1 &&
      historyAfter1.changedById === registrarUser.id &&
      historyAfter1.reason.includes('Advocate') &&
      historyAfter1.reason.includes('assigned');

    record(
      1,
      'Registrar assigns advocate to REGISTERED case: status becomes ADVOCATE_ASSIGNED with history row and registrar as changedBy',
      item1Pass,
      `Status: ${caseAfter1.body.data?.case?.status}, History reason: "${historyAfter1?.reason}"`
    );

    // -------------------------------------------------------------
    // ITEM 2: Second advocate does not change status; conflict, 3rd advocate, unassign without reason rejected
    // -------------------------------------------------------------
    const assign2Res = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates`)
      .set('Cookie', [registrarCookie])
      .send({
        advocateId: iyerAdvocate.id,
        side: 'RESPONDENT',
      });
    const caseAfter2 = await request(app)
      .get(`/api/v1/cases/${testCaseId}`)
      .set('Cookie', [registrarCookie]);
    const secondAdvocateNoStatusChange =
      assign2Res.status === 201 && caseAfter2.body.data.case.status === 'ADVOCATE_ASSIGNED';

    // Conflict of interest (same advocate on both sides)
    const conflictRes = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates`)
      .set('Cookie', [registrarCookie])
      .send({
        advocateId: mehtaAdvocate.id,
        side: 'RESPONDENT',
      });
    const conflictRejected =
      conflictRes.status === 400 &&
      (conflictRes.body.message.toLowerCase().includes('both') ||
        conflictRes.body.message.toLowerCase().includes('already'));

    // Third advocate on petitioner side (mehta is already on petitioner, add khan, then 4th advocate should fail)
    await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates`)
      .set('Cookie', [registrarCookie])
      .send({ advocateId: khanAdvocate.id, side: 'PETITIONER' });

    // Now petitioner has 2 advocates (mehta and khan). Try adding a 3rd advocate to petitioner side
    const nonUserAdvocate = await prisma.advocate.findFirst({
      where: { id: { notIn: [mehtaAdvocate.id, iyerAdvocate.id, khanAdvocate.id] } },
    });
    const thirdAdvocateRes = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates`)
      .set('Cookie', [registrarCookie])
      .send({ advocateId: nonUserAdvocate.id, side: 'PETITIONER' });
    const thirdRejected =
      thirdAdvocateRes.status === 400 &&
      thirdAdvocateRes.body.message.toLowerCase().includes('maximum');

    // Unassign without reason (using POST :id/advocates/:advocateId/unassign)
    const unassignNoReasonRes = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates/${khanAdvocate.id}/unassign`)
      .set('Cookie', [registrarCookie])
      .send({ reason: '' });
    const unassignNoReasonRejected =
      unassignNoReasonRes.status === 400 &&
      unassignNoReasonRes.body.errors?.some((e) => e.toLowerCase().includes('reason'));

    // Cleanup khan assignment
    await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates/${khanAdvocate.id}/unassign`)
      .set('Cookie', [registrarCookie])
      .send({ reason: 'Cleaning up test assignment for item 2' });

    const item2Pass =
      secondAdvocateNoStatusChange && conflictRejected && thirdRejected && unassignNoReasonRejected;

    record(
      2,
      'Second advocate leaves status unchanged; same advocate both sides, >2 per side, and unassign without reason all rejected',
      item2Pass,
      `Second: ${assign2Res.status}, Conflict: ${conflictRes.status} ("${conflictRes.body.message}"), Max per side: ${thirdAdvocateRes.status} ("${thirdAdvocateRes.body.message}"), Unassign blank: ${unassignNoReasonRes.status}`
    );

    // -------------------------------------------------------------
    // ITEM 3: Unassigning last advocate reverts to REGISTERED; re-assigning reuses row
    // -------------------------------------------------------------
    // Unassign Iyer
    await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates/${iyerAdvocate.id}/unassign`)
      .set('Cookie', [registrarCookie])
      .send({ reason: 'Client withdrew representation' });

    // Unassign Mehta (last active advocate)
    const unassignLastRes = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates/${mehtaAdvocate.id}/unassign`)
      .set('Cookie', [registrarCookie])
      .send({ reason: 'Removal of sole active counsel' });

    const caseAfterLastUnassign = await request(app)
      .get(`/api/v1/cases/${testCaseId}`)
      .set('Cookie', [registrarCookie]);
    const revertedToRegistered =
      unassignLastRes.status === 200 &&
      caseAfterLastUnassign.body.data.case.status === 'REGISTERED';

    // Check row in DB
    const mehtaRowBeforeReassign = await prisma.caseAdvocate.findUnique({
      where: {
        caseId_advocateId: {
          caseId: testCaseId,
          advocateId: mehtaAdvocate.id,
        },
      },
    });

    // Re-assign Mehta
    const reassignRes = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates`)
      .set('Cookie', [registrarCookie])
      .send({ advocateId: mehtaAdvocate.id, side: 'PETITIONER' });

    const mehtaRowAfterReassign = await prisma.caseAdvocate.findUnique({
      where: {
        caseId_advocateId: {
          caseId: testCaseId,
          advocateId: mehtaAdvocate.id,
        },
      },
    });

    const reusesRowAndClears =
      reassignRes.status === 201 &&
      mehtaRowBeforeReassign.id === mehtaRowAfterReassign.id &&
      mehtaRowAfterReassign.isActive === true &&
      mehtaRowAfterReassign.unassignedAt === null &&
      mehtaRowAfterReassign.unassignReason === null;

    const item3Pass = revertedToRegistered && reusesRowAndClears;
    record(
      3,
      'Unassigning last advocate reverts to REGISTERED; re-assigning reuses row and clears unassigned fields',
      item3Pass,
      `Reverted: ${caseAfterLastUnassign.body.data?.case?.status}, Reused row ID: ${mehtaRowBeforeReassign?.id === mehtaRowAfterReassign?.id}, Cleared: ${mehtaRowAfterReassign?.unassignedAt === null}`
    );

    // -------------------------------------------------------------
    // ITEM 4: Advocate case list gains case on assignment and loses it after unassignment
    // -------------------------------------------------------------
    // Mehta is assigned. Mehta calls GET /api/v1/cases
    const mehtaList1 = await request(app).get('/api/v1/cases').set('Cookie', [advocateUserCookie]);
    const mehtaHasCase = mehtaList1.body.data.items?.some((c) => c.id === testCaseId);

    // Unassign Mehta again
    await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates/${mehtaAdvocate.id}/unassign`)
      .set('Cookie', [registrarCookie])
      .send({ reason: 'Advocate withdrew from representation' });

    const mehtaList2 = await request(app).get('/api/v1/cases').set('Cookie', [advocateUserCookie]);
    const mehtaLostCase = !mehtaList2.body.data.items?.some((c) => c.id === testCaseId);

    const item4Pass = mehtaHasCase && mehtaLostCase;
    record(
      4,
      "Advocate's own case list gains the case right after assignment and loses it after unassignment",
      item4Pass,
      `Gained after assign: ${mehtaHasCase}, Lost after unassign: ${mehtaLostCase}`
    );

    // -------------------------------------------------------------
    // ITEM 5: GET /cases/:id returns assignment audit details and history includes assignment events
    // -------------------------------------------------------------
    const caseAuditRes = await request(app)
      .get(`/api/v1/cases/${testCaseId}`)
      .set('Cookie', [registrarCookie]);

    const advocatesList = caseAuditRes.body.data.case.advocates;
    const historyList = caseAuditRes.body.data.case.statusHistory;

    const mehtaAudit = advocatesList.find((a) => a.advocateId === mehtaAdvocate.id);
    const hasAuditDetails =
      mehtaAudit && mehtaAudit.assignedBy && mehtaAudit.unassignedBy && mehtaAudit.unassignReason;

    const hasAssignmentInHistory = historyList.some(
      (h) =>
        h.action === 'ADVOCATE_ASSIGNED' ||
        h.action === 'ADVOCATE_UNASSIGNED' ||
        h.reason?.includes('Advocate')
    );

    const item5Pass = hasAuditDetails && hasAssignmentInHistory;
    record(
      5,
      'GET /cases/:id returns assignment audit details (assignedBy, unassignedBy, reason) and history merges assignment events',
      item5Pass,
      `Audit details present: ${!!hasAuditDetails}, Assignment events in history: ${hasAssignmentInHistory} (Total history entries: ${historyList?.length})`
    );

    // -------------------------------------------------------------
    // ITEM 6: JUDGE and ADVOCATE get 403 on assignment endpoints; directory rules per role hold
    // -------------------------------------------------------------
    const judgeAssignRes = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates`)
      .set('Cookie', [judgeCookie])
      .send({ advocateId: mehtaAdvocate.id, side: 'PETITIONER' });

    const advocateAssignRes = await request(app)
      .post(`/api/v1/cases/${testCaseId}/advocates`)
      .set('Cookie', [advocateUserCookie])
      .send({ advocateId: mehtaAdvocate.id, side: 'PETITIONER' });

    const judgeDirectoryRes = await request(app)
      .get('/api/v1/advocates')
      .set('Cookie', [judgeCookie]);

    const advocateDirectoryRes = await request(app)
      .get('/api/v1/advocates')
      .set('Cookie', [advocateUserCookie]);

    const advocateOwnProfileRes = await request(app)
      .get(`/api/v1/advocates/${mehtaAdvocate.id}`)
      .set('Cookie', [advocateUserCookie]);

    const advocateOtherProfileRes = await request(app)
      .get(`/api/v1/advocates/${iyerAdvocate.id}`)
      .set('Cookie', [advocateUserCookie]);

    const item6Pass =
      judgeAssignRes.status === 403 &&
      advocateAssignRes.status === 403 &&
      judgeDirectoryRes.status === 200 &&
      advocateDirectoryRes.status === 403 &&
      advocateOwnProfileRes.status === 200 &&
      advocateOtherProfileRes.status === 404;

    record(
      6,
      'JUDGE and ADVOCATE get 403 on assignment endpoints; directory access rules per role strictly hold',
      item6Pass,
      `Judge assign: ${judgeAssignRes.status}, Advocate assign: ${advocateAssignRes.status}, Judge directory: ${judgeDirectoryRes.status}, Advocate directory: ${advocateDirectoryRes.status}, Own profile: ${advocateOwnProfileRes.status}, Other profile: ${advocateOtherProfileRes.status}`
    );

    // Clean up test case and status history
    await prisma.caseStatusHistory.deleteMany({ where: { caseId: testCaseId } });
    await prisma.caseAdvocate.deleteMany({ where: { caseId: testCaseId } });
    await prisma.case.delete({ where: { id: testCaseId } });

    // -------------------------------------------------------------
    // ITEM 7: npm run build --prefix client succeeds and Assign/Unassign/Add Advocate buttons are gated by can()
    // -------------------------------------------------------------
    console.log('\nChecking client build and button gating...');
    let buildPassed = false;
    try {
      execSync('npm run build --prefix client', { stdio: 'pipe' });
      buildPassed = true;
    } catch (err) {
      console.error('Client build failed:', err.message);
    }

    // Check code gating in client files
    const caseDetailCode = fs.readFileSync(
      path.resolve('client/src/pages/CaseDetail.jsx'),
      'utf-8'
    );
    const advocatesCode = fs.readFileSync(path.resolve('client/src/pages/Advocates.jsx'), 'utf-8');

    const assignGated = caseDetailCode.includes("can('advocate.assign')");
    const addAdvocateGated = advocatesCode.includes("can('advocate.manage')");

    const item7Pass = buildPassed && assignGated && addAdvocateGated;
    record(
      7,
      'npm run build --prefix client succeeds and Assign/Unassign/Add Advocate buttons are gated by can()',
      item7Pass,
      `Build: ${buildPassed ? 'SUCCESS' : 'FAILED'}, Assign/Unassign gated: ${assignGated}, Add Advocate gated: ${addAdvocateGated}`
    );

    console.log('\n===============================================================');
    console.log('                 PHASE 5 VERIFICATION SUMMARY                  ');
    console.log('===============================================================');
    console.table(results);

    const allPassed = results.every((r) => r.status === 'PASS');
    if (!allPassed) {
      console.error('\n>>> PHASE 5 VERIFICATION FAILED <<<');
      process.exit(1);
    } else {
      console.log('\n>>> ALL 7 PHASE 5 VERIFICATION CHECKS PASSED (CODE 0) <<<');
    }
  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase5Verification();
