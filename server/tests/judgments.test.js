import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { transitionCaseStatus, WorkflowError } from '../src/services/caseWorkflow.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/config/permissions.js';
import { unwrap } from '../../client/src/api/unwrap.js';
import { PERMISSIONS as clientPermissions } from '../../client/src/constants/permissions.js';

describe('Court CMS - Phase 7 Judgment Tracker, State Machine & Permissions Suite', () => {
  const demoPassword = 'Demo@1234';

  let adminCookie;
  let registrarCookie;
  let judge1Cookie;
  let judge2Cookie;
  let advocateMehtaCookie;
  let advocateIyerCookie;

  let seededUsers;
  let seededCases;
  let seededJudgments;
  let seededHearings;
  let seededHearingEvents;
  let seededStatusHistories;
  let seededCaseAdvocates;

  let judge1User;
  let judge2User;

  let underTrialCase10; // Eligible to reserve (Judge 2, 1 completed hearing, 0 scheduled hearings)
  let underTrialCase7; // Blocked from reserve (has scheduled hearings)
  let reservedCase11; // Reserved (Judge 1, ready to deliver)
  let closedCase13; // Already closed with delivered judgment

  const loginUser = async (email, password = demoPassword) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    return cookies[0].split(';')[0];
  };

  const restoreBaseline = async () => {
    // 1. Delete newly created judgments
    const baselineJudgmentIds = seededJudgments.map((j) => j.id);
    await prisma.judgment.deleteMany({
      where: { id: { notIn: baselineJudgmentIds } },
    });

    // 2. Delete newly created hearing events
    const baselineHearingEventIds = seededHearingEvents.map((he) => he.id);
    await prisma.hearingEvent.deleteMany({
      where: { id: { notIn: baselineHearingEventIds } },
    });

    // 3. Delete newly created hearings
    const baselineHearingIds = seededHearings.map((h) => h.id);
    await prisma.hearing.deleteMany({
      where: { id: { notIn: baselineHearingIds } },
    });

    // 4. Delete newly created status history
    const baselineHistoryIds = seededStatusHistories.map((h) => h.id);
    await prisma.caseStatusHistory.deleteMany({
      where: { id: { notIn: baselineHistoryIds } },
    });

    // 5. Delete newly created case advocates
    const baselineCaseAdvocateIds = seededCaseAdvocates.map((ca) => ca.id);
    await prisma.caseAdvocate.deleteMany({
      where: { id: { notIn: baselineCaseAdvocateIds } },
    });

    // 6. Delete newly created cases
    const baselineCaseIds = seededCases.map((c) => c.id);
    await prisma.case.deleteMany({
      where: { id: { notIn: baselineCaseIds } },
    });

    // 7. Restore baseline fields for seeded judgments
    for (const sj of seededJudgments) {
      await prisma.judgment.update({
        where: { id: sj.id },
        data: {
          caseId: sj.caseId,
          judgeId: sj.judgeId,
          status: sj.status,
          outcome: sj.outcome,
          summary: sj.summary,
          reserveNote: sj.reserveNote,
          reservedAt: sj.reservedAt,
          reservedById: sj.reservedById,
          judgmentDate: sj.judgmentDate,
          deliveredAt: sj.deliveredAt,
          deliveredById: sj.deliveredById,
        },
      });
    }

    // 8. Restore baseline fields for seeded cases
    for (const sc of seededCases) {
      await prisma.case.update({
        where: { id: sc.id },
        data: {
          status: sc.status,
          priority: sc.priority,
          judgeId: sc.judgeId,
          closedAt: sc.closedAt,
        },
      });
    }

    // 9. Restore baseline fields for seeded hearings
    for (const sh of seededHearings) {
      await prisma.hearing.update({
        where: { id: sh.id },
        data: {
          scheduledAt: sh.scheduledAt,
          courtroomId: sh.courtroomId,
          judgeId: sh.judgeId,
          durationMins: sh.durationMins,
          purpose: sh.purpose,
          status: sh.status,
          outcomeNotes: sh.outcomeNotes,
        },
      });
    }
  };

  beforeAll(async () => {
    adminCookie = await loginUser('admin@courtcms.gov.in');
    registrarCookie = await loginUser('registrar@courtcms.gov.in');
    judge1Cookie = await loginUser('judge.swaminathan@courtcms.gov.in');
    judge2Cookie = await loginUser('judge.banerjee@courtcms.gov.in');
    advocateMehtaCookie = await loginUser('adv.mehta@courtcms.gov.in');
    advocateIyerCookie = await loginUser('adv.iyer@courtcms.gov.in');

    [
      seededUsers,
      seededCases,
      seededJudgments,
      seededHearings,
      seededHearingEvents,
      seededCaseAdvocates,
      seededStatusHistories,
    ] = await Promise.all([
      prisma.user.findMany({ orderBy: { id: 'asc' } }),
      prisma.case.findMany({ orderBy: { caseNumber: 'asc' } }),
      prisma.judgment.findMany({ orderBy: { id: 'asc' } }),
      prisma.hearing.findMany({ orderBy: { id: 'asc' } }),
      prisma.hearingEvent.findMany({ orderBy: { id: 'asc' } }),
      prisma.caseAdvocate.findMany({ orderBy: { id: 'asc' } }),
      prisma.caseStatusHistory.findMany({ orderBy: { id: 'asc' } }),
    ]);

    judge1User = seededUsers.find((u) => u.email === 'judge.swaminathan@courtcms.gov.in');
    judge2User = seededUsers.find((u) => u.email === 'judge.banerjee@courtcms.gov.in');

    underTrialCase10 = seededCases.find((c) => c.caseNumber === 'CC/2026/00110');
    underTrialCase7 = seededCases.find((c) => c.caseNumber === 'CC/2025/00045');
    reservedCase11 = seededCases.find((c) => c.caseNumber === 'CC/2025/00030');
    closedCase13 = seededCases.find((c) => c.status === 'CLOSED');
  });

  afterEach(async () => {
    await restoreBaseline();
  });

  afterAll(async () => {
    await restoreBaseline();
  });

  // =========================================================================
  // 1. Judgment Metadata API (GET /api/v1/judgments/meta)
  // =========================================================================
  describe('Judgment Metadata API', () => {
    it('returns outcomes enum, states, and active judges for authenticated roles', async () => {
      const res = await request(app).get('/api/v1/judgments/meta').set('Cookie', judge1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.outcomes).toEqual([
        'ALLOWED',
        'DISMISSED',
        'CONVICTED',
        'ACQUITTED',
        'SETTLED',
        'DISPOSED',
      ]);
      expect(res.body.data.states).toEqual(['RESERVED', 'DELIVERED']);
      expect(Array.isArray(res.body.data.judges)).toBe(true);
      expect(res.body.data.judges.length).toBeGreaterThan(0);
    });

    it('allows ADVOCATE and REGISTRAR to read judgment metadata', async () => {
      for (const cookie of [registrarCookie, advocateMehtaCookie, adminCookie]) {
        const res = await request(app).get('/api/v1/judgments/meta').set('Cookie', cookie);
        expect(res.status).toBe(200);
      }
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/judgments/meta');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Reserve Judgment Flow (POST /api/v1/cases/:caseId/judgment/reserve)
  // =========================================================================
  describe('Reserve Judgment API', () => {
    it('successfully reserves judgment on an eligible UNDER_TRIAL case and advances status', async () => {
      // Case 10 is UNDER_TRIAL, has 1 completed hearing, 0 scheduled hearings, judge is Judge 2
      const res = await request(app)
        .post(`/api/v1/cases/${underTrialCase10.id}/judgment/reserve`)
        .set('Cookie', judge2Cookie)
        .send({
          note: 'Final arguments concluded by both sides; matter reserved for pronouncement.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.case.status).toBe('JUDGMENT_RESERVED');
      expect(res.body.data.judgment.status).toBe('RESERVED');
      expect(res.body.data.judgment.outcome).toBeNull();
      expect(res.body.data.judgment.reservedById).toBe(judge2User.id);
      expect(res.body.data.judgment.reserveNote).toContain('Final arguments concluded');

      // Verify case status in database
      const updatedCase = await prisma.case.findUnique({
        where: { id: underTrialCase10.id },
      });
      expect(updatedCase.status).toBe('JUDGMENT_RESERVED');

      // Verify CaseStatusHistory row
      const historyRow = await prisma.caseStatusHistory.findFirst({
        where: {
          caseId: underTrialCase10.id,
          toStatus: 'JUDGMENT_RESERVED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(historyRow).toBeDefined();
      expect(historyRow.fromStatus).toBe('UNDER_TRIAL');
      expect(historyRow.changedById).toBe(judge2User.id);
      expect(historyRow.reason).toContain('Judgment reserved by');
      expect(historyRow.reason).toContain(judge2User.name);
    });

    it('allows ADMIN to reserve judgment on any eligible case', async () => {
      const res = await request(app)
        .post(`/api/v1/cases/${underTrialCase10.id}/judgment/reserve`)
        .set('Cookie', adminCookie)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.case.status).toBe('JUDGMENT_RESERVED');
    });

    it('rejects reservation if note is provided but shorter than 5 characters', async () => {
      const res = await request(app)
        .post(`/api/v1/cases/${underTrialCase10.id}/judgment/reserve`)
        .set('Cookie', judge2Cookie)
        .send({ note: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('at least 5 characters');
    });

    it('rejects reservation for non-UNDER_TRIAL cases with current status in message', async () => {
      // Case 5 is HEARING_SCHEDULED
      const case5 = seededCases.find((c) => c.status === 'HEARING_SCHEDULED');
      const res = await request(app)
        .post(`/api/v1/cases/${case5.id}/judgment/reserve`)
        .set('Cookie', adminCookie)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('HEARING_SCHEDULED');
      expect(res.body.message).toContain('UNDER_TRIAL');
    });

    it('rejects reservation when case has remaining SCHEDULED hearings, naming the count', async () => {
      // Case 7 has 2 scheduled hearings remaining
      const res = await request(app)
        .post(`/api/v1/cases/${underTrialCase7.id}/judgment/reserve`)
        .set('Cookie', judge1Cookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('scheduled hearing');
      expect(res.body.message).toMatch(/2 scheduled hearing/);
    });

    it('rejects reservation when case has no completed hearings', async () => {
      // Temporarily mark all completed hearings on Case 10 to CANCELLED
      await prisma.hearing.updateMany({
        where: { caseId: underTrialCase10.id, status: 'COMPLETED' },
        data: { status: 'CANCELLED' },
      });

      const res = await request(app)
        .post(`/api/v1/cases/${underTrialCase10.id}/judgment/reserve`)
        .set('Cookie', judge2Cookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('at least one completed hearing');
    });

    it('returns 409 when case already has a judgment row', async () => {
      // First reservation on Case 10 succeeds
      const res1 = await request(app)
        .post(`/api/v1/cases/${underTrialCase10.id}/judgment/reserve`)
        .set('Cookie', judge2Cookie)
        .send({});
      expect(res1.status).toBe(201);

      // Attempting to reserve again on Case 10 returns 409 (status is now JUDGMENT_RESERVED or already has judgment)
      const res2 = await request(app)
        .post(`/api/v1/cases/${underTrialCase10.id}/judgment/reserve`)
        .set('Cookie', judge2Cookie)
        .send({});

      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/already/i);
    });

    it('forbids a judge from reserving judgment on another judge case (403 or 404)', async () => {
      // Case 10 is assigned to Judge 2; Judge 1 calls reserve
      const res = await request(app)
        .post(`/api/v1/cases/${underTrialCase10.id}/judgment/reserve`)
        .set('Cookie', judge1Cookie)
        .send({});

      expect([403, 404]).toContain(res.status);
    });

    it('forbids REGISTRAR and ADVOCATE roles from reserving judgment (403)', async () => {
      for (const cookie of [registrarCookie, advocateMehtaCookie]) {
        const res = await request(app)
          .post(`/api/v1/cases/${underTrialCase10.id}/judgment/reserve`)
          .set('Cookie', cookie)
          .send({});

        expect(res.status).toBe(403);
      }
    });

    it('returns 404 for out-of-scope or non-existent case ID', async () => {
      const res = await request(app)
        .post('/api/v1/cases/00000000-0000-0000-0000-000000000000/judgment/reserve')
        .set('Cookie', adminCookie)
        .send({});

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 3. Deliver Judgment Flow (POST /api/v1/cases/:caseId/judgment/deliver)
  // =========================================================================
  describe('Deliver Judgment API', () => {
    it('successfully delivers judgment with outcome, summary, and date, transitioning case to CLOSED', async () => {
      // Case 11 is JUDGMENT_RESERVED, assigned to Judge 1
      const res = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'CONVICTED',
          summary:
            'Prosecution has established guilt beyond reasonable doubt under Section 420/468. Accused sentenced to 3 years rigorous imprisonment.',
          judgmentDate: DateTime.now().setZone('Asia/Kolkata').toISODate(),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.case.status).toBe('CLOSED');
      expect(res.body.data.case.closedAt).toBeDefined();
      expect(res.body.data.judgment.outcome).toBe('CONVICTED');
      expect(res.body.data.judgment.deliveredById).toBe(judge1User.id);
      expect(res.body.data.judgment.status).toBe('DELIVERED');

      // Verify database case status and closedAt
      const c = await prisma.case.findUnique({ where: { id: reservedCase11.id } });
      expect(c.status).toBe('CLOSED');
      expect(c.closedAt).not.toBeNull();

      // Verify CaseStatusHistory row
      const historyRow = await prisma.caseStatusHistory.findFirst({
        where: { caseId: reservedCase11.id, toStatus: 'CLOSED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(historyRow).toBeDefined();
      expect(historyRow.fromStatus).toBe('JUDGMENT_RESERVED');
      expect(historyRow.reason).toBe('Judgment delivered: CONVICTED');
      expect(historyRow.changedById).toBe(judge1User.id);
    });

    it('allows ADMIN to deliver judgment on any reserved case', async () => {
      const res = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', adminCookie)
        .send({
          outcome: 'DISMISSED',
          summary: 'The petition lacks merit and is hereby dismissed with no order as to costs.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.case.status).toBe('CLOSED');
    });

    it('rejects delivery with invalid outcome enum', async () => {
      const res = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'INVALID_OUTCOME',
          summary: 'Valid summary text exceeding twenty characters.',
        });

      expect(res.status).toBe(400);
    });

    it('rejects delivery with summary shorter than 20 characters', async () => {
      const res = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'ALLOWED',
          summary: 'Too short text',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('at least 20 characters');
    });

    it('rejects delivery with a future judgment date', async () => {
      const futureDate = DateTime.now().setZone('Asia/Kolkata').plus({ days: 3 }).toISODate();
      const res = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'ALLOWED',
          summary: 'Valid summary text exceeding twenty characters in length.',
          judgmentDate: futureDate,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('future');
    });

    it('rejects delivery with judgment date prior to reservation date', async () => {
      // Reservation date for Case 11 is 30 days ago
      const tooOldDate = DateTime.now().setZone('Asia/Kolkata').minus({ days: 60 }).toISODate();
      const res = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'ALLOWED',
          summary: 'Valid summary text exceeding twenty characters in length.',
          judgmentDate: tooOldDate,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('reservation');
    });

    it('rejects delivery on a case that is not in JUDGMENT_RESERVED status', async () => {
      const res = await request(app)
        .post(`/api/v1/cases/${underTrialCase10.id}/judgment/deliver`)
        .set('Cookie', judge2Cookie)
        .send({
          outcome: 'ALLOWED',
          summary: 'Valid summary text exceeding twenty characters in length.',
        });

      expect([400, 409]).toContain(res.status);
      expect(res.body.message).toContain('JUDGMENT_RESERVED');
    });

    it('returns 409 when attempting a second delivery on an already delivered judgment', async () => {
      // First delivery succeeds
      const res1 = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'ALLOWED',
          summary: 'Operative decree summary granting declaration of title and perpetual injunction.',
        });
      expect(res1.status).toBe(200);

      // Second delivery attempt must return 409 Conflict (not 500)
      const res2 = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', judge1Cookie)
        .send({
          outcome: 'DISMISSED',
          summary: 'Attempting to change outcome on already delivered judgment.',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/already.*delivered/i);
    });

    it('handles 5 simultaneous deliveries producing exactly one delivered judgment and 409s for others', async () => {
      const payload = {
        outcome: 'SETTLED',
        summary: 'Compromise deed entered into between all litigating parties. Matter decreed as settled.',
      };

      const results = await Promise.all(
        Array.from({ length: 5 }).map(() =>
          request(app)
            .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
            .set('Cookie', judge1Cookie)
            .send(payload)
        )
      );

      const statusCodes = results.map((r) => r.status);
      const successes = statusCodes.filter((s) => s === 200);
      const conflicts = statusCodes.filter((s) => s === 409);

      expect(successes.length).toBe(1);
      expect(conflicts.length).toBe(4);

      // Verify exactly one CLOSED history event was created
      const historyRows = await prisma.caseStatusHistory.findMany({
        where: { caseId: reservedCase11.id, toStatus: 'CLOSED' },
      });
      expect(historyRows.length).toBe(1);
    });

    it('forbids a judge from delivering judgment on another judge case (403 or 404)', async () => {
      // Case 11 is assigned to Judge 1; Judge 2 tries to deliver
      const res = await request(app)
        .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
        .set('Cookie', judge2Cookie)
        .send({
          outcome: 'ALLOWED',
          summary: 'Valid summary text exceeding twenty characters in length.',
        });

      expect([403, 404]).toContain(res.status);
    });

    it('forbids REGISTRAR and ADVOCATE roles from delivering judgments (403)', async () => {
      for (const cookie of [registrarCookie, advocateMehtaCookie]) {
        const res = await request(app)
          .post(`/api/v1/cases/${reservedCase11.id}/judgment/deliver`)
          .set('Cookie', cookie)
          .send({
            outcome: 'ALLOWED',
            summary: 'Valid summary text exceeding twenty characters in length.',
          });

        expect(res.status).toBe(403);
      }
    });
  });

  // =========================================================================
  // 4. Closed Cases Permanent Read-Only Protection
  // =========================================================================
  describe('Closed Case Permanent Read-Only Rules', () => {
    it('rejects editing case details when case is CLOSED', async () => {
      const res = await request(app)
        .patch(`/api/v1/cases/${closedCase13.id}`)
        .set('Cookie', registrarCookie)
        .send({ title: 'New Unauthorized Title' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/closed/i);
    });

    it('rejects assigning an advocate to a CLOSED case', async () => {
      const adv = await prisma.advocate.findFirst();
      const res = await request(app)
        .post(`/api/v1/cases/${closedCase13.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: adv.id, side: 'PETITIONER' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/closed/i);
    });

    it('rejects unassigning an advocate from a CLOSED case', async () => {
      const ca = await prisma.caseAdvocate.findFirst({
        where: { caseId: closedCase13.id, isActive: true },
      });
      const res = await request(app)
        .post(`/api/v1/cases/${closedCase13.id}/advocates/${ca.advocateId}/unassign`)
        .set('Cookie', registrarCookie)
        .send({ reason: 'Cannot unassign from closed case' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/closed/i);
    });

    it('rejects scheduling a hearing on a CLOSED case', async () => {
      const cr = await prisma.courtroom.findFirst();
      const res = await request(app)
        .post('/api/v1/hearings')
        .set('Cookie', registrarCookie)
        .send({
          caseId: closedCase13.id,
          courtroomId: cr.id,
          scheduledAt: '2026-10-15T10:30:00+05:30',
          durationMins: 30,
          purpose: 'Hearing on closed case',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/closed/i);
    });

    it('rejects rescheduling, cancelling, completing, or adjourning a hearing on a CLOSED case', async () => {
      const hearingOnClosedCase = seededHearings.find((h) => h.caseId === closedCase13.id);
      expect(hearingOnClosedCase).toBeDefined();

      // 1. Reschedule
      const res1 = await request(app)
        .patch(`/api/v1/hearings/${hearingOnClosedCase.id}`)
        .set('Cookie', registrarCookie)
        .send({
          scheduledAt: '2026-10-15T11:00:00+05:30',
          reason: 'Reschedule attempt',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toMatch(/closed/i);

      // 2. Cancel
      const res2 = await request(app)
        .post(`/api/v1/hearings/${hearingOnClosedCase.id}/cancel`)
        .set('Cookie', registrarCookie)
        .send({ reason: 'Cancellation attempt on closed' });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/closed/i);

      // 3. Complete
      const res3 = await request(app)
        .post(`/api/v1/hearings/${hearingOnClosedCase.id}/complete`)
        .set('Cookie', judge1Cookie)
        .send({ outcomeNotes: 'Completion attempt on closed' });
      expect(res3.status).toBe(400);
      expect(res3.body.message).toMatch(/closed/i);

      // 4. Adjourn
      const res4 = await request(app)
        .post(`/api/v1/hearings/${hearingOnClosedCase.id}/adjourn`)
        .set('Cookie', judge1Cookie)
        .send({ reason: 'Adjournment attempt on closed' });
      expect(res4.status).toBe(400);
      expect(res4.body.message).toMatch(/closed/i);
    });

    it('rejects reassigning presiding judge on a CLOSED case', async () => {
      const res = await request(app)
        .patch(`/api/v1/cases/${closedCase13.id}`)
        .set('Cookie', registrarCookie)
        .send({ judgeId: judge2User.id });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/closed/i);
    });
  });

  // =========================================================================
  // 5. Judgments Query List & Case Detail Endpoints
  // =========================================================================
  describe('Judgments Query List & Case Detail API', () => {
    it('GET /api/v1/judgments returns paginated list with summaryPreview and state badges', async () => {
      const res = await request(app).get('/api/v1/judgments').set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);

      const first = res.body.data.items[0];
      expect(first.id).toBeDefined();
      expect(first.case).toBeDefined();
      expect(first.case.caseNumber).toBeDefined();
      expect(first.state).toBeDefined();
      expect(typeof first.summaryPreview).toBe('string');
      expect(first.summaryPreview.length).toBeLessThanOrEqual(163); // 160 + ellipsis
    });

    it('filters judgments by state (RESERVED vs DELIVERED)', async () => {
      const res = await request(app)
        .get('/api/v1/judgments?state=RESERVED')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      for (const item of res.body.data.items) {
        expect(item.state).toBe('RESERVED');
        expect(item.outcome).toBeNull();
      }
    });

    it('filters judgments by outcome', async () => {
      const res = await request(app)
        .get('/api/v1/judgments?outcome=ALLOWED')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      for (const item of res.body.data.items) {
        expect(item.outcome).toBe('ALLOWED');
      }
    });

    it('scopes judgment list according to role visibility (Advocate sees only assigned cases)', async () => {
      // Advocate Mehta
      const res = await request(app).get('/api/v1/judgments').set('Cookie', advocateMehtaCookie);

      expect(res.status).toBe(200);
      // Verify every returned judgment belongs to a case advocate Mehta represents
      const mehtaCases = await prisma.caseAdvocate.findMany({
        where: {
          advocate: { email: 'adv.mehta@courtcms.gov.in' },
        },
        select: { caseId: true },
      });
      const mehtaCaseIds = mehtaCases.map((ca) => ca.caseId);

      for (const item of res.body.data.items) {
        expect(mehtaCaseIds).toContain(item.case.id);
      }
    });

    it('GET /api/v1/cases/:caseId/judgment returns the judgment or 404', async () => {
      // Case 11 has a reserved judgment
      const res1 = await request(app)
        .get(`/api/v1/cases/${reservedCase11.id}/judgment`)
        .set('Cookie', registrarCookie);

      expect(res1.status).toBe(200);
      expect(res1.body.data.judgment.caseId).toBe(reservedCase11.id);
      expect(res1.body.data.judgment.status).toBe('RESERVED');

      // Case 3 (ADVOCATE_ASSIGNED) has no judgment
      const case3 = seededCases.find((c) => c.status === 'ADVOCATE_ASSIGNED');
      const res2 = await request(app)
        .get(`/api/v1/cases/${case3.id}/judgment`)
        .set('Cookie', registrarCookie);

      expect(res2.status).toBe(404);
    });

    it('GET /api/v1/cases/:id includes judgment details and history includes reserve/deliver events', async () => {
      const res = await request(app)
        .get(`/api/v1/cases/${closedCase13.id}`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.case.judgment).toBeDefined();
      expect(res.body.data.case.judgment.status).toBe('DELIVERED');
      expect(res.body.data.case.judgment.outcome).toBeDefined();

      // Check history
      const historyRes = await request(app)
        .get(`/api/v1/cases/${closedCase13.id}/history`)
        .set('Cookie', registrarCookie);

      expect(historyRes.status).toBe(200);
      const statuses = historyRes.body.data.history.map((h) => h.toStatus);
      expect(statuses).toContain('CLOSED');
    });
  });

  // =========================================================================
  // 6. Case Workflow State Machine Unit Verification
  // =========================================================================
  describe('caseWorkflow State Machine & Transition Rules', () => {
    it('accepts UNDER_TRIAL -> JUDGMENT_RESERVED transition', async () => {
      await prisma.$transaction(async (tx) => {
        const c = await transitionCaseStatus({
          tx,
          caseId: underTrialCase10.id,
          toStatus: 'JUDGMENT_RESERVED',
          reason: 'Unit test transition',
          userId: judge2User.id,
        });
        expect(c.status).toBe('JUDGMENT_RESERVED');
        // Rollback transaction to maintain baseline
        throw new Error('ROLLBACK_INTENTIONAL');
      }).catch((err) => {
        if (err.message !== 'ROLLBACK_INTENTIONAL') throw err;
      });
    });

    it('accepts JUDGMENT_RESERVED -> CLOSED transition and sets closedAt', async () => {
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        const c = await transitionCaseStatus({
          tx,
          caseId: reservedCase11.id,
          toStatus: 'CLOSED',
          reason: 'Unit test delivery closure',
          userId: judge1User.id,
          closedAt: now,
        });
        expect(c.status).toBe('CLOSED');
        expect(c.closedAt).toEqual(now);
        throw new Error('ROLLBACK_INTENTIONAL');
      }).catch((err) => {
        if (err.message !== 'ROLLBACK_INTENTIONAL') throw err;
      });
    });

    it('rejects illegal transitions like REGISTERED -> CLOSED or JUDGMENT_RESERVED -> HEARING_SCHEDULED', async () => {
      const regCase = seededCases.find((c) => c.status === 'REGISTERED');
      await prisma.$transaction(async (tx) => {
        await expect(
          transitionCaseStatus({
            tx,
            caseId: regCase.id,
            toStatus: 'CLOSED',
            reason: 'Invalid jump',
            userId: judge1User.id,
          })
        ).rejects.toThrow(WorkflowError);

        await expect(
          transitionCaseStatus({
            tx,
            caseId: reservedCase11.id,
            toStatus: 'HEARING_SCHEDULED',
            reason: 'Invalid backward jump',
            userId: judge1User.id,
          })
        ).rejects.toThrow(WorkflowError);
      });
    });
  });

  // =========================================================================
  // 7. Client/Server Parity & Client Helper Tests
  // =========================================================================
  describe('Permissions Parity & Shared Unwrap Helper', () => {
    it('client permission constant map exactly matches server permission config', () => {
      const serverPermissionKeys = Object.keys(PERMISSIONS).sort();
      const clientPermissionKeys = Object.keys(clientPermissions).sort();

      expect(clientPermissionKeys).toEqual(serverPermissionKeys);

      for (const key of serverPermissionKeys) {
        expect(clientPermissions[key]).toBe(PERMISSIONS[key]);
      }
    });

    it('unwrap helper extracts payload on success envelope', () => {
      const response = {
        success: true,
        message: 'Loaded successfully',
        data: { id: 123, name: 'Decree' },
      };
      const result = unwrap(response);
      expect(result).toEqual({ id: 123, name: 'Decree' });
    });

    it('unwrap helper throws an Error on failure envelope with server message', () => {
      const response = {
        success: false,
        message: 'Hearing conflict detected',
        errors: ['Hearing conflict detected'],
      };
      expect(() => unwrap(response)).toThrow('Hearing conflict detected');
    });
  });
});
