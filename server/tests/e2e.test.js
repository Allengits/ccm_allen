import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { verifyDatabaseBaseline, SEEDED_BASELINE, SEEDED_SEQUENCES } from './setup.js';

describe('Court CMS - Phase 9 End-to-End Case Lifecycle & RBAC Suite', () => {
  const demoPassword = 'Demo@1234';

  let adminCookie;
  let registrarCookie;
  let judge1Cookie;
  let judge2Cookie;
  let advocateKhanCookie;
  let advocateMehtaCookie;

  let judge1User;
  let judge2User;
  let advocateKhanUser;
  let advocateMehtaUser;
  let cr1;
  let cr2;

  let baselineCaseIds = [];
  let baselineHearingIds = [];
  let baselineHearingEventIds = [];
  let baselineJudgmentIds = [];
  let baselineStatusHistoryIds = [];
  let baselineCaseAdvocateIds = [];

  // Helper to construct a future working slot in IST (Monday-Friday, 10:00-17:00, outside lunch)
  const getFutureWorkingSlot = (daysAhead = 14, hour = 11, minute = 0) => {
    let dt = DateTime.now().setZone('Asia/Kolkata').plus({ days: daysAhead });
    while (dt.weekday > 5) {
      dt = dt.plus({ days: 1 });
    }
    return dt.set({ hour, minute, second: 0, millisecond: 0 });
  };

  // Helper to authenticate user and extract cookie
  const loginUser = async (email, password = demoPassword) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    return cookies[0].split(';')[0];
  };

  const cleanupE2ERecords = async () => {
    // 1. Delete created judgments
    await prisma.judgment.deleteMany({
      where: { id: { notIn: baselineJudgmentIds } },
    });

    // 2. Delete created hearing events
    await prisma.hearingEvent.deleteMany({
      where: { id: { notIn: baselineHearingEventIds } },
    });

    // 3. Delete created hearings
    await prisma.hearing.deleteMany({
      where: { id: { notIn: baselineHearingIds } },
    });

    // 4. Delete created status histories
    await prisma.caseStatusHistory.deleteMany({
      where: { id: { notIn: baselineStatusHistoryIds } },
    });

    // 5. Delete created case advocates
    await prisma.caseAdvocate.deleteMany({
      where: { id: { notIn: baselineCaseAdvocateIds } },
    });

    // 6. Delete created cases
    await prisma.case.deleteMany({
      where: { id: { notIn: baselineCaseIds } },
    });

    // 7. Reset CaseSequence rows back to seeded baseline
    await prisma.caseSequence.deleteMany({
      where: {
        OR: [{ prefix: { notIn: ['CC'] } }, { year: { notIn: [2025, 2026] } }],
      },
    });
    await prisma.caseSequence.updateMany({
      where: { prefix: 'CC', year: 2026 },
      data: { lastNumber: 112 },
    });
    await prisma.caseSequence.updateMany({
      where: { prefix: 'CC', year: 2025 },
      data: { lastNumber: 85 },
    });
  };

  beforeAll(async () => {
    // Record baseline database IDs
    baselineCaseIds = (await prisma.case.findMany({ select: { id: true } })).map((c) => c.id);
    baselineHearingIds = (await prisma.hearing.findMany({ select: { id: true } })).map((h) => h.id);
    baselineHearingEventIds = (await prisma.hearingEvent.findMany({ select: { id: true } })).map(
      (he) => he.id
    );
    baselineJudgmentIds = (await prisma.judgment.findMany({ select: { id: true } })).map(
      (j) => j.id
    );
    baselineStatusHistoryIds = (
      await prisma.caseStatusHistory.findMany({ select: { id: true } })
    ).map((h) => h.id);
    baselineCaseAdvocateIds = (await prisma.caseAdvocate.findMany({ select: { id: true } })).map(
      (ca) => ca.id
    );

    // Fetch test courtrooms and actors
    const courtrooms = await prisma.courtroom.findMany({ orderBy: { name: 'asc' } });
    cr1 = courtrooms.find((c) => c.name.includes('Courtroom 1')) || courtrooms[0];
    cr2 = courtrooms.find((c) => c.name.includes('Courtroom 2')) || courtrooms[1];

    judge1User = await prisma.user.findUnique({
      where: { email: 'judge.swaminathan@courtcms.gov.in' },
    });
    judge2User = await prisma.user.findUnique({
      where: { email: 'judge.banerjee@courtcms.gov.in' },
    });

    advocateKhanUser = await prisma.advocate.findFirst({
      where: { email: 'adv.khan@courtcms.gov.in' },
    });
    advocateMehtaUser = await prisma.advocate.findFirst({
      where: { email: 'adv.mehta@courtcms.gov.in' },
    });

    // Authenticate all test roles
    adminCookie = await loginUser('admin@courtcms.gov.in');
    registrarCookie = await loginUser('registrar@courtcms.gov.in');
    judge1Cookie = await loginUser('judge.swaminathan@courtcms.gov.in');
    judge2Cookie = await loginUser('judge.banerjee@courtcms.gov.in');
    advocateKhanCookie = await loginUser('adv.khan@courtcms.gov.in');
    advocateMehtaCookie = await loginUser('adv.mehta@courtcms.gov.in');
  });

  afterAll(async () => {
    await cleanupE2ERecords();
    const { tableCounts, sequences } = await verifyDatabaseBaseline();
    expect(tableCounts).toEqual(SEEDED_BASELINE);
    expect(sequences).toEqual(SEEDED_SEQUENCES);
  });

  // =========================================================================
  // 1. CRIMINAL CASE CONTINUOUS LIFECYCLE FLOW
  // =========================================================================
  describe('Continuous Lifecycle: CRIMINAL Case (Registration -> Closed Immutability)', () => {
    let caseId;
    let hearing1Id;
    let hearing2Id;
    let nextHearingId;

    it('Step 1: REGISTERED - Register new criminal case & verify stage RBAC', async () => {
      // 1. Advocate attempts to register case -> 403 Forbidden
      const advCreateRes = await request(app)
        .post('/api/v1/cases')
        .set('Cookie', advocateKhanCookie)
        .send({
          caseType: 'CRIMINAL',
          title: 'State of Maharashtra v. Rakesh Sharma',
          filingDate: '2026-03-01',
          priority: 'NORMAL',
          petitioner: 'State of Maharashtra',
          respondent: 'Rakesh Sharma',
          judgeId: judge1User.id,
        });
      expect(advCreateRes.status).toBe(403);

      // 2. Judge attempts to register case -> 403 Forbidden
      const judgeCreateRes = await request(app)
        .post('/api/v1/cases')
        .set('Cookie', judge1Cookie)
        .send({
          caseType: 'CRIMINAL',
          title: 'State of Maharashtra v. Rakesh Sharma',
          filingDate: '2026-03-01',
          priority: 'NORMAL',
          petitioner: 'State of Maharashtra',
          respondent: 'Rakesh Sharma',
          judgeId: judge1User.id,
        });
      expect(judgeCreateRes.status).toBe(403);

      // 3. Registrar registers case -> 201 Created
      const createRes = await request(app)
        .post('/api/v1/cases')
        .set('Cookie', registrarCookie)
        .send({
          caseType: 'CRIMINAL',
          title: 'State of Maharashtra v. Rakesh Sharma',
          description: 'IPC 420 criminal breach of trust and cheating',
          filingDate: '2026-03-01',
          priority: 'NORMAL',
          petitioner: 'State of Maharashtra',
          respondent: 'Rakesh Sharma',
          judgeId: judge1User.id,
        });

      expect(createRes.status).toBe(201);
      const caseData = createRes.body.data.case;
      expect(caseData.status).toBe('REGISTERED');
      expect(caseData.caseNumber).toMatch(/^CC\/\d{4}\/\d{5}$/);
      caseId = caseData.id;

      // 4. RBAC check at REGISTERED stage:
      // Advocate cannot assign counsel
      const advAssignRes = await request(app)
        .post(`/api/v1/cases/${caseId}/advocates`)
        .set('Cookie', advocateKhanCookie)
        .send({
          advocateId: advocateKhanUser.id,
          side: 'PETITIONER',
        });
      expect(advAssignRes.status).toBe(403);

      // Judge cannot assign counsel
      const judgeAssignRes = await request(app)
        .post(`/api/v1/cases/${caseId}/advocates`)
        .set('Cookie', judge1Cookie)
        .send({
          advocateId: advocateKhanUser.id,
          side: 'PETITIONER',
        });
      expect(judgeAssignRes.status).toBe(403);

      // Registrar cannot reserve judgment at REGISTERED stage
      const regReserveRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/reserve`)
        .set('Cookie', registrarCookie)
        .send({ note: 'Premature note' });
      expect(regReserveRes.status).toBe(403);
    });

    it('Step 2: ADVOCATE_ASSIGNED - Assign counsel, test step reversion (unassign), and re-progress', async () => {
      // 1. Registrar assigns Advocate Khan -> transitions to ADVOCATE_ASSIGNED
      const assignRes = await request(app)
        .post(`/api/v1/cases/${caseId}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: advocateKhanUser.id,
          side: 'PETITIONER',
        });
      expect(assignRes.status).toBe(201);

      let caseRes = await request(app)
        .get(`/api/v1/cases/${caseId}`)
        .set('Cookie', registrarCookie);
      expect(caseRes.body.data.case.status).toBe('ADVOCATE_ASSIGNED');

      // 2. Step Reversion: Unassign Advocate Khan -> 0 advocates remain, reverts to REGISTERED
      const unassignRes = await request(app)
        .post(`/api/v1/cases/${caseId}/advocates/${advocateKhanUser.id}/unassign`)
        .set('Cookie', registrarCookie)
        .send({
          reason: 'Client revoked vakalatnama; advocate unassigned',
        });
      expect(unassignRes.status).toBe(200);

      caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', registrarCookie);
      expect(caseRes.body.data.case.status).toBe('REGISTERED');

      // 3. Re-progress: Assign both Petitioner and Respondent counsel -> ADVOCATE_ASSIGNED
      await request(app)
        .post(`/api/v1/cases/${caseId}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: advocateKhanUser.id,
          side: 'PETITIONER',
        });
      await request(app)
        .post(`/api/v1/cases/${caseId}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: advocateMehtaUser.id,
          side: 'RESPONDENT',
        });

      caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', registrarCookie);
      expect(caseRes.body.data.case.status).toBe('ADVOCATE_ASSIGNED');
      expect(caseRes.body.data.case.advocates).toHaveLength(2);
    });

    it('Step 3: HEARING_SCHEDULED - Schedule hearing, test step reversion (cancel), and re-progress', async () => {
      const slot1 = getFutureWorkingSlot(14, 10, 30);

      // 1. Advocate cannot schedule hearing -> 403
      const advSchedRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', advocateKhanCookie)
        .send({
          caseId,
          judgeId: judge1User.id,
          courtroomId: cr1.id,
          scheduledAt: slot1.toISO(),
          durationMins: 30,
          purpose: 'Preliminary Hearing',
        });
      expect(advSchedRes.status).toBe(403);

      // 2. Registrar schedules hearing -> transitions to HEARING_SCHEDULED
      const schedRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId,
          judgeId: judge1User.id,
          courtroomId: cr1.id,
          scheduledAt: slot1.toISO(),
          durationMins: 30,
          purpose: 'Preliminary Hearing',
        });
      expect(schedRes.status).toBe(201);
      hearing1Id = schedRes.body.data.hearing.id;

      let caseRes = await request(app)
        .get(`/api/v1/cases/${caseId}`)
        .set('Cookie', registrarCookie);
      expect(caseRes.body.data.case.status).toBe('HEARING_SCHEDULED');
      expect(caseRes.body.data.case.judgeId).toBe(judge1User.id);

      // 3. RBAC at HEARING_SCHEDULED stage:
      // Advocate cannot cancel hearing -> 403
      const advCancelRes = await request(app)
        .post(`/api/v1/hearings/${hearing1Id}/cancel`)
        .set('Cookie', advocateKhanCookie)
        .send({ reason: 'Advocate personal emergency' });
      expect(advCancelRes.status).toBe(403);

      // 4. Step Reversion: Registrar cancels hearing -> reverts to ADVOCATE_ASSIGNED
      const cancelRes = await request(app)
        .post(`/api/v1/hearings/${hearing1Id}/cancel`)
        .set('Cookie', registrarCookie)
        .send({
          reason: 'Bench administrative reconstituting; date vacated',
        });
      expect(cancelRes.status).toBe(200);

      caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', registrarCookie);
      expect(caseRes.body.data.case.status).toBe('ADVOCATE_ASSIGNED');

      // 5. Re-progress: Schedule new hearing -> HEARING_SCHEDULED
      const slot2 = getFutureWorkingSlot(16, 11, 0);
      const reSchedRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId,
          judgeId: judge1User.id,
          courtroomId: cr1.id,
          scheduledAt: slot2.toISO(),
          durationMins: 30,
          purpose: 'Preliminary Hearing',
        });
      expect(reSchedRes.status).toBe(201);
      hearing1Id = reSchedRes.body.data.hearing.id;

      caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', registrarCookie);
      expect(caseRes.body.data.case.status).toBe('HEARING_SCHEDULED');
    });

    it('Step 4: UNDER_TRIAL - Presiding judge completes first hearing & verify trial stage RBAC', async () => {
      // Fast-forward scheduledAt to simulate hearing date having arrived
      await prisma.hearing.update({
        where: { id: hearing1Id },
        data: { scheduledAt: new Date(Date.now() - 3600000) },
      });

      // 1. Registrar attempts to complete hearing -> 403 Forbidden
      const regCompRes = await request(app)
        .post(`/api/v1/hearings/${hearing1Id}/complete`)
        .set('Cookie', registrarCookie)
        .send({ outcomeNotes: 'Registrar cannot complete trial' });
      expect(regCompRes.status).toBe(403);

      // 2. Advocate attempts to complete hearing -> 403 Forbidden
      const advCompRes = await request(app)
        .post(`/api/v1/hearings/${hearing1Id}/complete`)
        .set('Cookie', advocateKhanCookie)
        .send({ outcomeNotes: 'Advocate cannot complete' });
      expect(advCompRes.status).toBe(403);

      // 3. Non-presiding judge (Judge 2) attempts to complete Judge 1 hearing -> 403 Forbidden
      const j2CompRes = await request(app)
        .post(`/api/v1/hearings/${hearing1Id}/complete`)
        .set('Cookie', judge2Cookie)
        .send({ outcomeNotes: 'Non presiding judge' });
      expect(j2CompRes.status).toBe(403);

      // 4. Presiding Judge 1 completes hearing -> 200 OK, transitions to UNDER_TRIAL
      const compRes = await request(app)
        .post(`/api/v1/hearings/${hearing1Id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes:
            'Accused present with counsel. Charges framed under IPC 420; trial commenced.',
        });
      expect(compRes.status).toBe(200);

      const caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', judge1Cookie);
      expect(caseRes.body.data.case.status).toBe('UNDER_TRIAL');
    });

    it('Step 5: UNDER_TRIAL - Schedule second hearing, adjourn with next hearing, complete adjourned hearing', async () => {
      // 1. Registrar schedules trial examination hearing
      const slot3 = getFutureWorkingSlot(18, 11, 30);
      const sched2Res = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId,
          judgeId: judge1User.id,
          courtroomId: cr1.id,
          scheduledAt: slot3.toISO(),
          durationMins: 30,
          purpose: 'Witness Examination',
        });
      expect(sched2Res.status).toBe(201);
      hearing2Id = sched2Res.body.data.hearing.id;

      // Case remains UNDER_TRIAL
      let caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', judge1Cookie);
      expect(caseRes.body.data.case.status).toBe('UNDER_TRIAL');

      // Fast-forward hearing2 to simulate hearing date arriving for adjournment
      await prisma.hearing.update({
        where: { id: hearing2Id },
        data: { scheduledAt: new Date(Date.now() - 3600000) },
      });

      // 2. Presiding Judge 1 adjourns hearing2 with next hearing
      const slot4 = getFutureWorkingSlot(21, 14, 0);
      const adjournRes = await request(app)
        .post(`/api/v1/hearings/${hearing2Id}/adjourn`)
        .set('Cookie', judge1Cookie)
        .send({
          reason: 'Prosecution witness summoned but unserved; summons re-issued',
          nextHearing: {
            scheduledAt: slot4.toISO(),
            courtroomId: cr1.id,
            durationMins: 30,
            purpose: 'Witness Examination',
          },
        });
      expect(adjournRes.status).toBe(200);
      nextHearingId = adjournRes.body.data.nextHearing.id;
      expect(adjournRes.body.data.adjournedHearing.status).toBe('ADJOURNED');
      expect(adjournRes.body.data.nextHearing.status).toBe('SCHEDULED');

      // Case remains UNDER_TRIAL
      caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', judge1Cookie);
      expect(caseRes.body.data.case.status).toBe('UNDER_TRIAL');

      // 3. Premature reserve attempt while active hearing is scheduled -> 400 Bad Request
      const prematureReserve = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/reserve`)
        .set('Cookie', judge1Cookie)
        .send({ note: 'Premature reserve note' });
      expect(prematureReserve.status).toBe(400);

      // 4. Fast-forward next hearing date and complete it
      await prisma.hearing.update({
        where: { id: nextHearingId },
        data: { scheduledAt: new Date(Date.now() - 3600000) },
      });

      const compNextRes = await request(app)
        .post(`/api/v1/hearings/${nextHearingId}/complete`)
        .set('Cookie', judge1Cookie)
        .send({
          outcomeNotes: 'Witness examined and cross-examined. Evidence closed; arguments heard.',
        });
      expect(compNextRes.status).toBe(200);

      caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', judge1Cookie);
      expect(caseRes.body.data.case.status).toBe('UNDER_TRIAL');
    });

    it('Step 6: JUDGMENT_RESERVED - Reserve judgment & verify judicial RBAC', async () => {
      // 1. Non-presiding Judge 2 attempts to reserve judgment -> 404 (outside scope per caseVisibilityFilter)
      const j2ReserveRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/reserve`)
        .set('Cookie', judge2Cookie)
        .send({ note: 'Non presiding judge reserve attempt' });
      expect(j2ReserveRes.status).toBe(404);

      // 2. Registrar attempts to reserve judgment -> 403 Forbidden
      const regReserveRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/reserve`)
        .set('Cookie', registrarCookie)
        .send({ note: 'Registrar reserve attempt' });
      expect(regReserveRes.status).toBe(403);

      // 3. Presiding Judge 1 reserves judgment -> 201 Created, transitions to JUDGMENT_RESERVED
      const reserveRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/reserve`)
        .set('Cookie', judge1Cookie)
        .send({
          note: 'Final arguments heard. Case reserved for pronouncement of judgment.',
        });
      expect(reserveRes.status).toBe(201);

      const caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', judge1Cookie);
      expect(caseRes.body.data.case.status).toBe('JUDGMENT_RESERVED');

      // Verify Judgment record in database
      const judgment = await prisma.judgment.findUnique({ where: { caseId } });
      expect(judgment).toBeDefined();
      expect(judgment.status).toBe('RESERVED');
      expect(judgment.reservedById).toBe(judge1User.id);
    });

    it('Step 7: CLOSED - Deliver judgment & transition case to CLOSED', async () => {
      const todayIST = DateTime.now().setZone('Asia/Kolkata').toISODate();

      // 1. Registrar attempts to deliver judgment -> 403 Forbidden
      const regDeliverRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/deliver`)
        .set('Cookie', registrarCookie)
        .send({
          outcome: 'CONVICTED',
          summary: 'Registrar cannot deliver judgment without judicial authority',
          judgmentDate: todayIST,
        });
      expect(regDeliverRes.status).toBe(403);

      // 2. Non-presiding Judge 2 attempts to deliver judgment -> 404 (outside scope)
      const j2DeliverRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/deliver`)
        .set('Cookie', judge2Cookie)
        .send({
          outcome: 'CONVICTED',
          summary: 'Non-presiding judge cannot deliver judgment on another docket',
          judgmentDate: todayIST,
        });
      expect(j2DeliverRes.status).toBe(404);

      // 3. Presiding Judge 1 delivers judgment -> 200 OK, transitions to CLOSED
      const deliverRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'CONVICTED',
          summary:
            'Accused Rakesh Sharma convicted under Section 420 IPC and sentenced to 2 years simple imprisonment with fine.',
          judgmentDate: todayIST,
        });
      expect(deliverRes.status).toBe(200);

      const caseRes = await request(app).get(`/api/v1/cases/${caseId}`).set('Cookie', judge1Cookie);
      expect(caseRes.body.data.case.status).toBe('CLOSED');
      expect(caseRes.body.data.case.closedAt).toBeDefined();

      const judgment = await prisma.judgment.findUnique({ where: { caseId } });
      expect(judgment.status).toBe('DELIVERED');
      expect(judgment.outcome).toBe('CONVICTED');
    });

    it('Step 8: Closed-Case Immutability - All modifications, hearings, assignments blocked', async () => {
      // 1. Case editing blocked on closed case -> 400 Bad Request
      const editRes = await request(app)
        .patch(`/api/v1/cases/${caseId}`)
        .set('Cookie', registrarCookie)
        .send({ title: 'Attempted Post-Closing Mutation' });
      expect(editRes.status).toBe(400);

      // 2. Hearing scheduling blocked on closed case -> 400 Bad Request
      const slot5 = getFutureWorkingSlot(25, 10, 30);
      const schedRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId,
          judgeId: judge1User.id,
          courtroomId: cr1.id,
          scheduledAt: slot5.toISO(),
          durationMins: 30,
          purpose: 'Final Arguments',
        });
      expect(schedRes.status).toBe(400);

      // 3. Advocate assignment blocked on closed case -> 400 Bad Request
      const assignRes = await request(app)
        .post(`/api/v1/cases/${caseId}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: advocateKhanUser.id,
          side: 'PETITIONER',
        });
      expect(assignRes.status).toBe(400);

      // 4. Reserve judgment blocked on closed case -> 409 Conflict
      const reserveRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/reserve`)
        .set('Cookie', judge1Cookie)
        .send({ note: 'Attempted duplicate reserve' });
      expect(reserveRes.status).toBe(409);

      // 5. Deliver judgment blocked on closed case -> 409 Conflict
      const deliverRes = await request(app)
        .post(`/api/v1/cases/${caseId}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'ACQUITTED',
          summary: 'Attempted duplicate delivery of already finalized judgment',
          judgmentDate: DateTime.now().setZone('Asia/Kolkata').toISODate(),
        });
      expect(deliverRes.status).toBe(409);

      // 6. Administrator can access full audit timeline of closed case
      const historyRes = await request(app)
        .get(`/api/v1/cases/${caseId}/history`)
        .set('Cookie', adminCookie);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data.history.length).toBeGreaterThanOrEqual(5);
    });
  });

  // =========================================================================
  // 2. CIVIL CASE CONTINUOUS LIFECYCLE FLOW
  // =========================================================================
  describe('Continuous Lifecycle: CIVIL Case (Registration -> Closed Immutability)', () => {
    let civilCaseId;
    let civilHearingId;

    it('Step 1: REGISTERED - Register new civil case', async () => {
      const createRes = await request(app)
        .post('/api/v1/cases')
        .set('Cookie', registrarCookie)
        .send({
          caseType: 'CIVIL',
          title: 'Verma Properties Ltd v. Horizon Developers Corp',
          description: 'Suit for specific performance of commercial property conveyance deed',
          filingDate: '2026-02-15',
          priority: 'NORMAL',
          petitioner: 'Verma Properties Ltd',
          respondent: 'Horizon Developers Corp',
          judgeId: judge2User.id,
        });

      expect(createRes.status).toBe(201);
      const caseData = createRes.body.data.case;
      expect(caseData.status).toBe('REGISTERED');
      expect(caseData.caseType).toBe('CIVIL');
      expect(caseData.caseNumber).toMatch(/^CV\/\d{4}\/\d{5}$/);
      civilCaseId = caseData.id;
    });

    it('Step 2: ADVOCATE_ASSIGNED - Assign counsel to civil case', async () => {
      const assignRes = await request(app)
        .post(`/api/v1/cases/${civilCaseId}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: advocateMehtaUser.id,
          side: 'PETITIONER',
        });
      expect(assignRes.status).toBe(201);

      const caseRes = await request(app)
        .get(`/api/v1/cases/${civilCaseId}`)
        .set('Cookie', registrarCookie);
      expect(caseRes.body.data.case.status).toBe('ADVOCATE_ASSIGNED');

      // Assigned advocate now gains visibility of the case
      const advViewRes = await request(app)
        .get(`/api/v1/cases/${civilCaseId}`)
        .set('Cookie', advocateMehtaCookie);
      expect(advViewRes.status).toBe(200);
      expect(advViewRes.body.data.case.id).toBe(civilCaseId);
    });

    it('Step 3: HEARING_SCHEDULED - Schedule civil hearing with Judge 2 in Courtroom 2', async () => {
      const slot = getFutureWorkingSlot(20, 11, 30);
      const schedRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId: civilCaseId,
          judgeId: judge2User.id,
          courtroomId: cr2.id,
          scheduledAt: slot.toISO(),
          durationMins: 30,
          purpose: 'Framing Issues',
        });
      expect(schedRes.status).toBe(201);
      civilHearingId = schedRes.body.data.hearing.id;

      const caseRes = await request(app)
        .get(`/api/v1/cases/${civilCaseId}`)
        .set('Cookie', registrarCookie);
      expect(caseRes.body.data.case.status).toBe('HEARING_SCHEDULED');
      expect(caseRes.body.data.case.judgeId).toBe(judge2User.id);
    });

    it('Step 4: UNDER_TRIAL - Presiding Judge 2 completes hearing', async () => {
      await prisma.hearing.update({
        where: { id: civilHearingId },
        data: { scheduledAt: new Date(Date.now() - 3600000) },
      });

      const compRes = await request(app)
        .post(`/api/v1/hearings/${civilHearingId}/complete`)
        .set('Cookie', judge2Cookie)
        .send({
          outcomeNotes:
            'Issues framed regarding readiness and willingness under Section 16(c). Trial concluded.',
        });
      expect(compRes.status).toBe(200);

      const caseRes = await request(app)
        .get(`/api/v1/cases/${civilCaseId}`)
        .set('Cookie', judge2Cookie);
      expect(caseRes.body.data.case.status).toBe('UNDER_TRIAL');
    });

    it('Step 5: JUDGMENT_RESERVED - Presiding Judge 2 reserves judgment', async () => {
      const reserveRes = await request(app)
        .post(`/api/v1/cases/${civilCaseId}/judgment/reserve`)
        .set('Cookie', judge2Cookie)
        .send({
          note: 'Arguments concluded on specific performance relief. Judgment reserved.',
        });
      expect(reserveRes.status).toBe(201);

      const caseRes = await request(app)
        .get(`/api/v1/cases/${civilCaseId}`)
        .set('Cookie', judge2Cookie);
      expect(caseRes.body.data.case.status).toBe('JUDGMENT_RESERVED');
    });

    it('Step 6: CLOSED - Presiding Judge 2 delivers judgment & closes civil suit', async () => {
      const deliverRes = await request(app)
        .post(`/api/v1/cases/${civilCaseId}/judgment/deliver`)
        .set('Cookie', judge2Cookie)
        .send({
          outcome: 'ALLOWED',
          summary:
            'Suit allowed with costs. Defendant directed to execute registered conveyance deed within 60 days.',
          judgmentDate: DateTime.now().setZone('Asia/Kolkata').toISODate(),
        });
      expect(deliverRes.status).toBe(200);

      const caseRes = await request(app)
        .get(`/api/v1/cases/${civilCaseId}`)
        .set('Cookie', judge2Cookie);
      expect(caseRes.body.data.case.status).toBe('CLOSED');
      expect(caseRes.body.data.case.closedAt).toBeDefined();

      const judgment = await prisma.judgment.findUnique({ where: { caseId: civilCaseId } });
      expect(judgment.status).toBe('DELIVERED');
      expect(judgment.outcome).toBe('ALLOWED');
    });

    it('Step 7: Closed-Case Immutability - Civil closed case rejects edits and hearings', async () => {
      const editRes = await request(app)
        .patch(`/api/v1/cases/${civilCaseId}`)
        .set('Cookie', registrarCookie)
        .send({ title: 'Civil Case Modification Attempt' });
      expect(editRes.status).toBe(400);

      const slot = getFutureWorkingSlot(28, 10, 30);
      const schedRes = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId: civilCaseId,
          judgeId: judge2User.id,
          courtroomId: cr2.id,
          scheduledAt: slot.toISO(),
          durationMins: 30,
          purpose: 'Final Arguments',
        });
      expect(schedRes.status).toBe(400);
    });
  });
});
