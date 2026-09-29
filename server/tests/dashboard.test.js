import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { DEFAULT_DASHBOARD_SETTINGS } from '../src/utils/dashboardSettings.js';

describe('Court CMS - Phase 8 Automation Engine & Registry Dashboard Suite', () => {
  const demoPassword = 'Demo@1234';

  let adminCookie;
  let registrarCookie;
  let judge1Cookie;
  let judge2Cookie;
  let advocateMehtaCookie;

  let seededCases;

  const loginUser = async (email, password = demoPassword) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    return cookies[0].split(';')[0];
  };

  const restoreBaseline = async () => {
    // 1. Delete any temporary cases created during tests
    const seededCaseIds = seededCases.map((c) => c.id);
    const extraCases = await prisma.case.findMany({
      where: { id: { notIn: seededCaseIds } },
      select: { id: true },
    });

    if (extraCases.length > 0) {
      const extraIds = extraCases.map((c) => c.id);
      await prisma.caseStatusHistory.deleteMany({ where: { caseId: { in: extraIds } } });
      await prisma.caseAdvocate.deleteMany({ where: { caseId: { in: extraIds } } });
      await prisma.hearingEvent.deleteMany({ where: { hearing: { caseId: { in: extraIds } } } });
      await prisma.hearing.deleteMany({ where: { caseId: { in: extraIds } } });
      await prisma.judgment.deleteMany({ where: { caseId: { in: extraIds } } });
      await prisma.case.deleteMany({ where: { id: { in: extraIds } } });
    }

    // 2. Restore default system settings values and clear audit logs
    for (const [key, val] of Object.entries(DEFAULT_DASHBOARD_SETTINGS)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(val) },
        create: { key, value: String(val) },
      });
    }

    await prisma.systemSetting.deleteMany({
      where: { key: { startsWith: 'audit:' } },
    });

    // 3. Restore seeded case statuses and filing dates if touched
    for (const sc of seededCases) {
      await prisma.case.update({
        where: { id: sc.id },
        data: {
          status: sc.status,
          filingDate: sc.filingDate,
          priority: sc.priority,
          judgeId: sc.judgeId,
          closedAt: sc.closedAt,
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

    seededCases = await prisma.case.findMany({ orderBy: { caseNumber: 'asc' } });
  });

  afterEach(async () => {
    await restoreBaseline();
  });

  // =========================================================================
  // 1. DASHBOARD SUMMARY API (/api/v1/dashboard/summary)
  // =========================================================================
  describe('GET /api/v1/dashboard/summary', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/dashboard/summary');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns accurate registry-wide summary metrics for ADMIN matching hand-computed baseline', async () => {
      const res = await request(app).get('/api/v1/dashboard/summary').set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const d = res.body.data;
      expect(d.totalCases).toBe(14);
      expect(d.totalOpen).toBe(12);
      expect(d.totalClosed).toBe(2);

      // Status distribution matches exactly 2, 2, 2, 4, 2, 2
      expect(d.statusDistribution).toEqual({
        REGISTERED: 2,
        ADVOCATE_ASSIGNED: 2,
        HEARING_SCHEDULED: 2,
        UNDER_TRIAL: 4,
        JUDGMENT_RESERVED: 2,
        CLOSED: 2,
      });

      // Hearings: exactly 2 today, 7 upcoming within 7-day window
      expect(d.hearingsToday).toBe(2);
      expect(d.upcomingHearings).toBe(7);

      // Backlog: exactly 5 open cases > 90 days
      expect(d.backlogCount).toBe(5);

      // Stale: Rule 1 (Case 1) + Rule 2 (Case 4) = 2
      expect(d.staleCount).toBe(2);
      expect(d.staleBreakdown).toEqual({
        noAdvocate: 1,
        noHearing: 1,
      });

      // Thresholds included
      expect(d.thresholds.backlogThresholdDays).toBe(90);
      expect(d.thresholds.advocateWorkloadWarningThreshold).toBe(15);
      expect(d.thresholds.judgeWorkloadWarningThreshold).toBe(25);
      expect(d.thresholds.staleCaseNoAdvocateDays).toBe(14);
      expect(d.thresholds.staleCaseNoHearingDays).toBe(21);
      expect(d.thresholds.upcomingHearingsWindowDays).toBe(7);

      // Admin has no judge-specific caseload object
      expect(d.myCaseload).toBeNull();
    });

    it('returns identical registry-wide summary metrics for REGISTRAR', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalCases).toBe(14);
      expect(res.body.data.totalOpen).toBe(12);
      expect(res.body.data.backlogCount).toBe(5);
      expect(res.body.data.staleCount).toBe(2);
    });

    it('returns registry-wide summary PLUS scoped myCaseload metrics for JUDGE', async () => {
      const res = await request(app).get('/api/v1/dashboard/summary').set('Cookie', judge1Cookie); // Judge Swaminathan

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const d = res.body.data;
      // Registry-wide aggregate visible
      expect(d.totalCases).toBe(14);
      expect(d.totalOpen).toBe(12);
      expect(d.backlogCount).toBe(5);

      // Judge-specific caseload present
      expect(d.myCaseload).toBeDefined();
      expect(d.myCaseload.totalCases).toBe(7);
      expect(d.myCaseload.totalOpen).toBe(6);
      expect(d.myCaseload.totalClosed).toBe(1);
      expect(d.myCaseload.statusDistribution).toEqual({
        REGISTERED: 1,
        ADVOCATE_ASSIGNED: 1,
        HEARING_SCHEDULED: 1,
        UNDER_TRIAL: 2,
        JUDGMENT_RESERVED: 1,
        CLOSED: 1,
      });
      expect(d.myCaseload.hearingsToday).toBe(1); // Case 5
      expect(d.myCaseload.backlogCount).toBe(2); // Cases 7, 11
      expect(d.myCaseload.staleCount).toBe(1); // Case 1 (Rule 1)
    });

    it('returns correct myCaseload for Judge Banerjee (judge2)', async () => {
      const res = await request(app).get('/api/v1/dashboard/summary').set('Cookie', judge2Cookie);

      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.myCaseload).toBeDefined();
      expect(d.myCaseload.totalCases).toBe(7);
      expect(d.myCaseload.totalOpen).toBe(6);
      expect(d.myCaseload.totalClosed).toBe(1);
      expect(d.myCaseload.hearingsToday).toBe(1); // Case 6
      expect(d.myCaseload.backlogCount).toBe(3); // Cases 4, 6, 8
      expect(d.myCaseload.staleCount).toBe(1); // Case 4 (Rule 2)
    });

    it('strictly scopes every summary number to own assigned cases for ADVOCATE', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', advocateMehtaCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const d = res.body.data;
      // Advocate Mehta has 5 actively assigned cases (4 open, 1 closed)
      expect(d.totalCases).toBe(5);
      expect(d.totalOpen).toBe(4);
      expect(d.totalClosed).toBe(1);
      expect(d.statusDistribution).toEqual({
        REGISTERED: 0,
        ADVOCATE_ASSIGNED: 0,
        HEARING_SCHEDULED: 2,
        UNDER_TRIAL: 1,
        JUDGMENT_RESERVED: 1,
        CLOSED: 1,
      });

      // Hearings for Mehta: Cases 5 & 6 are today
      expect(d.hearingsToday).toBe(2);

      // Backlog for Mehta: Cases 6 (145d), 8 (165d), 11 (210d) = 3
      expect(d.backlogCount).toBe(3);

      // Stale for Mehta: 0 (not assigned to Case 1 or 4)
      expect(d.staleCount).toBe(0);
      expect(d.staleBreakdown).toEqual({ noAdvocate: 0, noHearing: 0 });
    });
  });

  // =========================================================================
  // 2. DASHBOARD BACKLOG WORKLIST API (/api/v1/dashboard/backlog)
  // =========================================================================
  describe('GET /api/v1/dashboard/backlog', () => {
    it('returns paginated worklist of open cases older than threshold, excluding CLOSED', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/backlog?page=1&pageSize=10')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { items, total, thresholdDays } = res.body.data;
      expect(total).toBe(5);
      expect(items.length).toBe(5);
      expect(thresholdDays).toBe(90);

      // Every returned case must have status != CLOSED and daysOpen >= 90
      for (const item of items) {
        expect(item.status).not.toBe('CLOSED');
        expect(item.daysOpen).toBeGreaterThanOrEqual(90);
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('caseNumber');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('judge');
        expect(Array.isArray(item.advocates)).toBe(true);
      }

      // Check excluded closed cases (e.g. Case 13 with filingDate 310 days ago is CLOSED)
      const caseNumbers = items.map((i) => i.caseNumber);
      expect(caseNumbers).not.toContain('CC/2025/00015');
      expect(caseNumbers).not.toContain('CC/2025/00022');
    });

    it('scopes backlog cases to own active cases for ADVOCATE', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/backlog')
        .set('Cookie', advocateMehtaCookie);

      expect(res.status).toBe(200);
      const { items, total } = res.body.data;
      expect(total).toBe(3);
      expect(items.length).toBe(3);

      // Advocate Mehta is on Cases 6, 7, 11
      const caseNumbers = items.map((i) => i.caseNumber);
      expect(caseNumbers).toContain('CC/2025/00072');
      expect(caseNumbers).toContain('CC/2025/00045');
      expect(caseNumbers).toContain('CC/2025/00030');
      // Case 4 (Iyer & Sundaram) must NOT be visible to Mehta
      expect(caseNumbers).not.toContain('CC/2025/00085');
    });

    it('supports sorting by age descending (oldest cases first)', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/backlog?sortBy=age&sortOrder=desc')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      for (let i = 0; i < items.length - 1; i++) {
        expect(items[i].daysOpen).toBeGreaterThanOrEqual(items[i + 1].daysOpen);
      }
    });

    it('enforces pagination parameters with max 50 rows per page', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/backlog?page=1&pageSize=100')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. DASHBOARD STALE CASES API (/api/v1/dashboard/stale-cases)
  // =========================================================================
  describe('GET /api/v1/dashboard/stale-cases', () => {
    it('combines Rule 1 and Rule 2 stale cases into a unified worklist', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/stale-cases')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { items, total } = res.body.data;
      expect(total).toBe(2);
      expect(items.length).toBe(2);

      const rule1Item = items.find((i) => i.staleRule === 'NO_ADVOCATE');
      const rule2Item = items.find((i) => i.staleRule === 'NO_HEARING');

      expect(rule1Item).toBeDefined();
      expect(rule1Item.caseNumber).toBe('CC/2026/00101');
      expect(rule1Item.status).toBe('REGISTERED');
      expect(rule1Item.daysStale).toBeGreaterThanOrEqual(14);
      expect(rule1Item.staleReason).toContain('REGISTERED with no advocate');

      expect(rule2Item).toBeDefined();
      expect(rule2Item.caseNumber).toBe('CC/2025/00085');
      expect(rule2Item.status).toBe('ADVOCATE_ASSIGNED');
      expect(rule2Item.daysStale).toBeGreaterThanOrEqual(21);
      expect(rule2Item.staleReason).toContain('ADVOCATE_ASSIGNED with no hearing');
    });

    it('filters stale cases by specific rule (NO_ADVOCATE vs NO_HEARING)', async () => {
      const res1 = await request(app)
        .get('/api/v1/dashboard/stale-cases?rule=NO_ADVOCATE')
        .set('Cookie', adminCookie);

      expect(res1.status).toBe(200);
      expect(res1.body.data.total).toBe(1);
      expect(res1.body.data.items[0].staleRule).toBe('NO_ADVOCATE');

      const res2 = await request(app)
        .get('/api/v1/dashboard/stale-cases?rule=NO_HEARING')
        .set('Cookie', adminCookie);

      expect(res2.status).toBe(200);
      expect(res2.body.data.total).toBe(1);
      expect(res2.body.data.items[0].staleRule).toBe('NO_HEARING');
    });

    it('excludes cases that no longer qualify (e.g. advocate assigned or hearing booked)', async () => {
      // Case 2 is REGISTERED but only 5 days old (<14) -> not stale
      // Case 3 is ADVOCATE_ASSIGNED but assigned 20 days ago (<21) -> not stale
      const res = await request(app)
        .get('/api/v1/dashboard/stale-cases')
        .set('Cookie', adminCookie);

      const caseNumbers = res.body.data.items.map((i) => i.caseNumber);
      expect(caseNumbers).not.toContain('CC/2026/00102');
      expect(caseNumbers).not.toContain('CC/2026/00103');
    });

    it('scopes stale cases strictly by role for ADVOCATE', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/stale-cases')
        .set('Cookie', advocateMehtaCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  // =========================================================================
  // 4. UPCOMING HEARINGS API (/api/v1/dashboard/upcoming-hearings)
  // =========================================================================
  describe('GET /api/v1/dashboard/upcoming-hearings', () => {
    it('returns scheduled hearings within default window (7 days)', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/upcoming-hearings')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { items, total, windowDays } = res.body.data;
      expect(windowDays).toBe(7);
      expect(total).toBe(7);
      expect(items.length).toBe(7);

      for (const item of items) {
        expect(item.status).toBe('SCHEDULED');
        expect(item).toHaveProperty('courtroom');
        expect(item).toHaveProperty('judge');
        expect(item).toHaveProperty('case');
        expect(item).toHaveProperty('endsAt');
      }
    });

    it('scopes upcoming hearings for ADVOCATE to only cases they represent', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/upcoming-hearings')
        .set('Cookie', advocateMehtaCookie);

      expect(res.status).toBe(200);
      const { items, total } = res.body.data;
      // Advocate Mehta has hearings on Case 5 (today), Case 6 (today), Case 7 (future), Case 9 (future), Case 5 (future), Case 6 (future)
      // Verify every returned hearing belongs to a case where Mehta is active advocate
      for (const item of items) {
        const hasMehta = item.case.advocates.some((a) => a.name === 'Harish Mehta');
        expect(hasMehta).toBe(true);
      }
      expect(total).toBeGreaterThanOrEqual(1);
    });

    it('supports custom days parameter within 1-90 days range', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/upcoming-hearings?days=1') // Today only
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.windowDays).toBe(1);
      // Within 1 day (today), exactly 2 hearings exist
      expect(res.body.data.total).toBe(2);
    });
  });

  // =========================================================================
  // 5. WORKLOAD API (/api/v1/dashboard/workload)
  // =========================================================================
  describe('GET /api/v1/dashboard/workload', () => {
    it('returns 403 Forbidden for ADVOCATE', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/workload')
        .set('Cookie', advocateMehtaCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns workload counts for all judges and advocates for ADMIN and REGISTRAR', async () => {
      const res = await request(app).get('/api/v1/dashboard/workload').set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { judges, advocates, thresholds } = res.body.data;
      expect(thresholds.judgeWorkloadWarningThreshold).toBe(25);
      expect(thresholds.advocateWorkloadWarningThreshold).toBe(15);

      // 2 Judges: each has exactly 6 active open cases
      expect(judges.length).toBe(2);
      for (const j of judges) {
        expect(j.activeCaseCount).toBe(6);
        expect(j.isOverloaded).toBe(false);
      }

      // 6 Advocates: Mehta=6, Iyer=5, Khan=3, Grover=2, etc.
      expect(advocates.length).toBe(6);
      const mehta = advocates.find((a) => a.name === 'Harish Mehta');
      expect(mehta).toBeDefined();
      expect(mehta.activeCaseCount).toBe(4);
      expect(mehta.isOverloaded).toBe(false);

      const iyer = advocates.find((a) => a.name === 'Priya Iyer');
      expect(iyer).toBeDefined();
      expect(iyer.activeCaseCount).toBe(4);
    });

    it('scopes judge workload to their own row only when called by JUDGE', async () => {
      const res = await request(app).get('/api/v1/dashboard/workload').set('Cookie', judge1Cookie); // Judge Swaminathan

      expect(res.status).toBe(200);
      const { judges, advocates } = res.body.data;

      // Judge sees only their own single judge row
      expect(judges.length).toBe(1);
      expect(judges[0].name).toContain('Swaminathan');
      expect(judges[0].activeCaseCount).toBe(6);

      // Advocates array omitted for judge
      expect(advocates.length).toBe(0);
    });

    it('flips the isOverloaded warning flag when workload threshold is lowered below case count', async () => {
      // Lower advocate threshold to 3 (Mehta has 4 -> should become overloaded)
      await prisma.systemSetting.update({
        where: { key: 'advocate_workload_warning_threshold' },
        data: { value: '3' },
      });

      const res = await request(app).get('/api/v1/dashboard/workload').set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const mehta = res.body.data.advocates.find((a) => a.name === 'Harish Mehta');
      expect(mehta.activeCaseCount).toBe(4);
      expect(mehta.warningThreshold).toBe(3);
      expect(mehta.isOverloaded).toBe(true);

      const khan = res.body.data.advocates.find((a) => a.name === 'Zafar Khan');
      expect(khan.activeCaseCount).toBe(2);
      expect(khan.isOverloaded).toBe(false);
    });
  });

  // =========================================================================
  // 6. SETTINGS API (/api/v1/dashboard/settings)
  // =========================================================================
  describe('GET & PATCH /api/v1/dashboard/settings', () => {
    it('GET returns 403 for JUDGE and ADVOCATE', async () => {
      const judgeRes = await request(app)
        .get('/api/v1/dashboard/settings')
        .set('Cookie', judge1Cookie);
      expect(judgeRes.status).toBe(403);

      const advRes = await request(app)
        .get('/api/v1/dashboard/settings')
        .set('Cookie', advocateMehtaCookie);
      expect(advRes.status).toBe(403);
    });

    it('GET returns thresholds for REGISTRAR and ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/settings')
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.thresholds.backlog_threshold_days).toBe(90);
      expect(res.body.data.thresholds.judge_workload_warning_threshold).toBe(25);
    });

    it('PATCH returns 403 for everyone except ADMIN (including REGISTRAR)', async () => {
      const regRes = await request(app)
        .patch('/api/v1/dashboard/settings')
        .set('Cookie', registrarCookie)
        .send({ backlog_threshold_days: 60 });
      expect(regRes.status).toBe(403);

      const judgeRes = await request(app)
        .patch('/api/v1/dashboard/settings')
        .set('Cookie', judge1Cookie)
        .send({ backlog_threshold_days: 60 });
      expect(judgeRes.status).toBe(403);

      const advRes = await request(app)
        .patch('/api/v1/dashboard/settings')
        .set('Cookie', advocateMehtaCookie)
        .send({ backlog_threshold_days: 60 });
      expect(advRes.status).toBe(403);
    });

    it('PATCH validates range limits and rejects out-of-bound values', async () => {
      // 0 is out of bounds (min is 1)
      const res1 = await request(app)
        .patch('/api/v1/dashboard/settings')
        .set('Cookie', adminCookie)
        .send({ backlog_threshold_days: 0 });
      expect(res1.status).toBe(400);

      // 4000 is out of bounds (max is 3650)
      const res2 = await request(app)
        .patch('/api/v1/dashboard/settings')
        .set('Cookie', adminCookie)
        .send({ backlog_threshold_days: 4000 });
      expect(res2.status).toBe(400);

      // Unknown keys rejected
      const res3 = await request(app)
        .patch('/api/v1/dashboard/settings')
        .set('Cookie', adminCookie)
        .send({ unknown_threshold: 50 });
      expect(res3.status).toBe(400);
    });

    it('PATCH atomically updates settings and creates audit record in transaction', async () => {
      const patchRes = await request(app)
        .patch('/api/v1/dashboard/settings')
        .set('Cookie', adminCookie)
        .send({
          backlog_threshold_days: 60,
          upcoming_hearings_window_days: 14,
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.success).toBe(true);
      expect(patchRes.body.data.thresholds.backlog_threshold_days).toBe(60);
      expect(patchRes.body.data.thresholds.upcoming_hearings_window_days).toBe(14);
      expect(patchRes.body.data.auditEntries.length).toBe(2);

      // Confirm settings audit record was created and is visible on GET
      const getRes = await request(app)
        .get('/api/v1/dashboard/settings')
        .set('Cookie', adminCookie);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.thresholds.backlog_threshold_days).toBe(60);
      expect(getRes.body.data.auditLog.length).toBeGreaterThanOrEqual(2);

      const latestAudit = getRes.body.data.auditLog[0];
      expect(latestAudit).toHaveProperty('settingKey');
      expect(latestAudit).toHaveProperty('oldValue');
      expect(latestAudit).toHaveProperty('newValue');
      expect(latestAudit).toHaveProperty('changedById');
      expect(latestAudit).toHaveProperty('changedAt');
    });

    it('immediately reflects threshold changes in GET /summary without restarting app', async () => {
      // 1. Initially backlog threshold is 90 days (5 backlog cases)
      const initSummary = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', adminCookie);
      expect(initSummary.body.data.backlogCount).toBe(5);

      // 2. Increase threshold to 160 days (cases aged 90-159d no longer count as backlog)
      const patchRes = await request(app)
        .patch('/api/v1/dashboard/settings')
        .set('Cookie', adminCookie)
        .send({ backlog_threshold_days: 160 });
      expect(patchRes.status).toBe(200);

      // 3. Re-query summary: should immediately reflect new threshold and reduced backlog count
      const updatedSummary = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', adminCookie);
      expect(updatedSummary.status).toBe(200);
      expect(updatedSummary.body.data.thresholds.backlogThresholdDays).toBe(160);
      // Cases > 160 days: Case 7 (185d), Case 11 (210d) = 2 cases
      expect(updatedSummary.body.data.backlogCount).toBe(2);
    });
  });
});
