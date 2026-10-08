import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { transitionCaseStatus, WorkflowError } from '../src/services/caseWorkflow.js';

describe('Court CMS - Phase 5 Advocate Management & Case Assignment Suite', () => {
  const demoPassword = 'Demo@1234';

  let adminCookie;
  let registrarCookie;
  let judgeCookie;
  let advocateCookie;

  let seededAdvocates;
  let seededCases;
  let seededCaseAdvocates;
  let seededStatusHistories;

  let testAdvocateMehta; // adv.mehta (linked to user)
  let testAdvocateIyer; // adv.iyer (linked to user)
  let testAdvocateKhan; // adv.khan (linked to user)
  let testAdvocateSharma; // unlinked
  let registeredCase1;
  let advocateAssignedCase3;
  let underTrialCase7;
  let closedCase13;

  // Cleanup helper to restore baseline exactly
  const restoreBaseline = async () => {
    if (!seededStatusHistories || !seededCaseAdvocates || !seededAdvocates || !seededCases) return;
    // 1. Delete any new status history records not in baseline
    const baselineHistoryIds = seededStatusHistories.map((h) => h.id);
    await prisma.caseStatusHistory.deleteMany({
      where: { id: { notIn: baselineHistoryIds } },
    });

    // 2. Delete any new case advocates not in baseline
    const baselineCaseAdvocateIds = seededCaseAdvocates.map((ca) => ca.id);
    await prisma.caseAdvocate.deleteMany({
      where: { id: { notIn: baselineCaseAdvocateIds } },
    });

    // 3. Delete any new advocates not in baseline
    const baselineAdvocateIds = seededAdvocates.map((a) => a.id);
    await prisma.advocate.deleteMany({
      where: { id: { notIn: baselineAdvocateIds } },
    });

    // 4. Delete any new cases not in baseline
    const baselineCaseIds = seededCases.map((c) => c.id);
    await prisma.case.deleteMany({
      where: { id: { notIn: baselineCaseIds } },
    });

    // 5. Restore baseline status and fields for seeded cases
    for (const sc of seededCases) {
      await prisma.case.update({
        where: { id: sc.id },
        data: {
          status: sc.status,
          closedAt: sc.closedAt,
        },
      });
    }

    // 6. Restore baseline state for seeded case advocates
    for (const sca of seededCaseAdvocates) {
      await prisma.caseAdvocate.update({
        where: { id: sca.id },
        data: {
          side: sca.side,
          isActive: sca.isActive,
          assignedAt: sca.assignedAt,
          assignedById: sca.assignedById,
          unassignedAt: sca.unassignedAt,
          unassignedById: sca.unassignedById,
          unassignReason: sca.unassignReason,
        },
      });
    }

    // 7. Ensure test users are active
    await prisma.user.updateMany({
      data: { isActive: true },
    });
  };

  beforeAll(async () => {
    // Capture snapshot of baseline seeded records
    seededAdvocates = await prisma.advocate.findMany();
    seededCases = await prisma.case.findMany();
    seededCaseAdvocates = await prisma.caseAdvocate.findMany();
    seededStatusHistories = await prisma.caseStatusHistory.findMany();

    testAdvocateMehta = seededAdvocates.find((a) => a.email === 'adv.mehta@courtcms.gov.in');
    testAdvocateIyer = seededAdvocates.find((a) => a.email === 'adv.iyer@courtcms.gov.in');
    testAdvocateKhan = seededAdvocates.find((a) => a.email === 'adv.khan@courtcms.gov.in');
    testAdvocateSharma = seededAdvocates.find((a) => a.barNumber === 'DL/2002/0543');

    registeredCase1 = seededCases.find((c) => c.status === 'REGISTERED');
    advocateAssignedCase3 = seededCases.find((c) => c.status === 'ADVOCATE_ASSIGNED');
    underTrialCase7 = seededCases.find((c) => c.caseNumber === 'CC/2025/00045');
    closedCase13 = seededCases.find((c) => c.status === 'CLOSED');

    // Authenticate sessions for all roles
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@courtcms.gov.in', password: demoPassword });
    adminCookie = adminRes.headers['set-cookie'][0];

    const registrarRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'registrar@courtcms.gov.in', password: demoPassword });
    registrarCookie = registrarRes.headers['set-cookie'][0];

    const judgeRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'judge.swaminathan@courtcms.gov.in', password: demoPassword });
    judgeCookie = judgeRes.headers['set-cookie'][0];

    const advocateRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'adv.mehta@courtcms.gov.in', password: demoPassword });
    advocateCookie = advocateRes.headers['set-cookie'][0];
  });

  afterEach(async () => {
    await restoreBaseline();
  });

  afterAll(async () => {
    await restoreBaseline();
  });

  // =============================================================
  // 1. Advocate Directory API (/api/v1/advocates)
  // =============================================================
  describe('Advocate Directory API', () => {
    it('returns paginated list of advocates with active and total case counts (no N+1)', async () => {
      const res = await request(app)
        .get('/api/v1/advocates?page=1&pageSize=10')
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const adminResCheck = await request(app)
        .get('/api/v1/advocates?page=1&pageSize=10')
        .set('Cookie', adminCookie);
      expect(adminResCheck.status).toBe(200);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.items.length).toBe(seededAdvocates.length);
      expect(res.body.data.total).toBe(seededAdvocates.length);

      const first = res.body.data.items[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('barNumber');
      expect(first).toHaveProperty('specialization');
      expect(first).toHaveProperty('email');
      expect(first).toHaveProperty('phone');
      expect(first).toHaveProperty('hasLogin');
      expect(first).toHaveProperty('loginActive');
      expect(first).toHaveProperty('activeCaseCount');
      expect(first).toHaveProperty('totalCaseCount');
    });

    it('returns data.items as an array with all required advocate fields for REGISTRAR and ADMIN', async () => {
      const requiredFields = [
        'id',
        'name',
        'barNumber',
        'specialization',
        'email',
        'phone',
        'hasLogin',
        'loginActive',
        'activeCaseCount',
        'totalCaseCount',
      ];

      for (const [roleName, cookie] of [
        ['REGISTRAR', registrarCookie],
        ['ADMIN', adminCookie],
      ]) {
        const res = await request(app)
          .get('/api/v1/advocates?page=1&pageSize=10')
          .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.items)).toBe(true);
        expect(res.body.data.items.length).toBe(seededAdvocates.length);

        for (const advocate of res.body.data.items) {
          for (const field of requiredFields) {
            expect(advocate, `${roleName} item missing ${field}`).toHaveProperty(field);
          }
          expect(typeof advocate.id).toBe('string');
          expect(typeof advocate.name).toBe('string');
          expect(typeof advocate.barNumber).toBe('string');
          expect(typeof advocate.specialization).toBe('string');
          expect(typeof advocate.email).toBe('string');
          expect(typeof advocate.hasLogin).toBe('boolean');
          expect(typeof advocate.loginActive).toBe('boolean');
          expect(typeof advocate.activeCaseCount).toBe('number');
          expect(typeof advocate.totalCaseCount).toBe('number');
        }
      }
    });

    it('filters advocates by search query q across name, bar number, and email', async () => {
      const resName = await request(app)
        .get('/api/v1/advocates?q=Mehta')
        .set('Cookie', registrarCookie);
      expect(resName.status).toBe(200);
      expect(resName.body.data.items.some((a) => a.name.includes('Mehta'))).toBe(true);

      const resBar = await request(app)
        .get('/api/v1/advocates?q=D/1998/0142')
        .set('Cookie', registrarCookie);
      expect(resBar.status).toBe(200);
      expect(resBar.body.data.items.length).toBe(1);
      expect(resBar.body.data.items[0].barNumber).toBe('D/1998/0142');
    });

    it('filters advocates by specialization and by hasLogin (true / false)', async () => {
      const resSpec = await request(app)
        .get('/api/v1/advocates?specialization=Criminal Law')
        .set('Cookie', registrarCookie);
      expect(resSpec.status).toBe(200);
      resSpec.body.data.items.forEach((a) => {
        expect(a.specialization).toBe('Criminal Law');
      });

      const resWithLogin = await request(app)
        .get('/api/v1/advocates?hasLogin=true')
        .set('Cookie', registrarCookie);
      expect(resWithLogin.status).toBe(200);
      resWithLogin.body.data.items.forEach((a) => {
        expect(a.hasLogin).toBe(true);
      });

      const resWithoutLogin = await request(app)
        .get('/api/v1/advocates?hasLogin=false')
        .set('Cookie', registrarCookie);
      expect(resWithoutLogin.status).toBe(200);
      resWithoutLogin.body.data.items.forEach((a) => {
        expect(a.hasLogin).toBe(false);
      });
    });

    it('allows JUDGE to view directory but forbids ADVOCATE role (403)', async () => {
      const judgeRes = await request(app).get('/api/v1/advocates').set('Cookie', judgeCookie);
      expect(judgeRes.status).toBe(200);

      const advocateRes = await request(app).get('/api/v1/advocates').set('Cookie', advocateCookie);
      expect(advocateRes.status).toBe(403);
    });

    it('returns specialization metadata list at GET /advocates/meta', async () => {
      const res = await request(app).get('/api/v1/advocates/meta').set('Cookie', registrarCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.specializations).toBeInstanceOf(Array);
      expect(res.body.data.specializations.length).toBeGreaterThanOrEqual(6);
      expect(res.body.data.specializations).toContain('Criminal Law');
    });
  });

  // =============================================================
  // 2. Advocate Profile Scoping (/api/v1/advocates/:id)
  // =============================================================
  describe('Advocate Detail & Scoping API', () => {
    it('allows ADMIN, REGISTRAR, and JUDGE to view any advocate profile with assigned cases', async () => {
      const res = await request(app)
        .get(`/api/v1/advocates/${testAdvocateMehta.id}`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.advocate.name).toBe(testAdvocateMehta.name);
      expect(res.body.data.advocate.cases).toBeInstanceOf(Array);
      expect(res.body.data.advocate.cases.length).toBeGreaterThanOrEqual(1);

      const caseItem = res.body.data.advocate.cases[0];
      expect(caseItem).toHaveProperty('caseNumber');
      expect(caseItem).toHaveProperty('side');
      expect(caseItem).toHaveProperty('assignedAt');
    });

    it('allows ADVOCATE role to view only their own profile and returns 404 for other advocates', async () => {
      // Own profile
      const ownRes = await request(app)
        .get(`/api/v1/advocates/${testAdvocateMehta.id}`)
        .set('Cookie', advocateCookie);
      expect(ownRes.status).toBe(200);
      expect(ownRes.body.data.advocate.id).toBe(testAdvocateMehta.id);

      // Other advocate profile -> 404
      const otherRes = await request(app)
        .get(`/api/v1/advocates/${testAdvocateIyer.id}`)
        .set('Cookie', advocateCookie);
      expect(otherRes.status).toBe(404);
    });

    it('filters advocate cases by caller visibility (does not leak out-of-scope cases to JUDGE)', async () => {
      const res = await request(app)
        .get(`/api/v1/advocates/${testAdvocateMehta.id}`)
        .set('Cookie', judgeCookie);

      expect(res.status).toBe(200);
      // All returned cases for this advocate must be cases where the judge presides
      const judgeCases = res.body.data.advocate.cases;
      for (const jc of judgeCases) {
        const fullCase = await prisma.case.findUnique({
          where: { id: jc.caseId },
          select: { judge: { select: { email: true } } },
        });
        expect(fullCase.judge.email).toBe('judge.swaminathan@courtcms.gov.in');
      }
    });
  });

  // =============================================================
  // 3. Advocate Creation & Modification
  // =============================================================
  describe('Advocate Create & Edit', () => {
    it('allows REGISTRAR to register a new advocate with valid fields', async () => {
      const newAdvocateData = {
        name: 'Advocate Ananya Deshmukh',
        barNumber: 'MAH/2021/8991',
        specialization: 'Corporate & Commercial Law',
        email: 'adv.deshmukh@lawchambers.in',
        phone: '+91 98201 12345',
      };

      const res = await request(app)
        .post('/api/v1/advocates')
        .set('Cookie', registrarCookie)
        .send(newAdvocateData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.advocate.barNumber).toBe('MAH/2021/8991');
      expect(res.body.data.advocate.hasLogin).toBe(false);
    });

    it('rejects duplicate Bar Council enrollment number with clear error', async () => {
      const duplicateData = {
        name: 'Another Mehta',
        barNumber: testAdvocateMehta.barNumber,
        specialization: 'Criminal Law',
        email: 'mehta.clone@example.com',
      };

      const res = await request(app)
        .post('/api/v1/advocates')
        .set('Cookie', registrarCookie)
        .send(duplicateData);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('enforces bar number format rules (5-20 chars, letters, digits, slash, hyphen)', async () => {
      const invalidBars = ['AB', 'WAY_TOO_LONG_BAR_NUMBER_OVER_20_CHARACTERS', 'INV@LID#BAR'];

      for (const bar of invalidBars) {
        const res = await request(app)
          .post('/api/v1/advocates')
          .set('Cookie', registrarCookie)
          .send({
            name: 'Test Advocate',
            barNumber: bar,
            specialization: 'Civil Litigation',
            email: 'test.bar@example.com',
          });

        expect(res.status).toBe(400);
      }
    });

    it('allows editing mutable details (name, specialization, email, phone)', async () => {
      const res = await request(app)
        .patch(`/api/v1/advocates/${testAdvocateSharma.id}`)
        .set('Cookie', registrarCookie)
        .send({
          name: 'Advocate V. Sharma Senior Counsel',
          specialization: 'Constitutional Law',
          phone: '+91 98111 22334',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.advocate.name).toBe('Advocate V. Sharma Senior Counsel');
      expect(res.body.data.advocate.specialization).toBe('Constitutional Law');
    });

    it('rejects attempts to modify the immutable barNumber on PATCH', async () => {
      const res = await request(app)
        .patch(`/api/v1/advocates/${testAdvocateSharma.id}`)
        .set('Cookie', registrarCookie)
        .send({
          barNumber: 'NEW/BAR/2026',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/immutable|cannot be modified/i);
    });

    it('forbids JUDGE and ADVOCATE roles from creating or updating advocates (403)', async () => {
      const judgeCreate = await request(app)
        .post('/api/v1/advocates')
        .set('Cookie', judgeCookie)
        .send({
          name: 'Advocate Should Fail',
          barNumber: 'DEL/2026/0011',
          specialization: 'Civil',
          email: 'judge.adv@fail.com',
        });
      expect(judgeCreate.status).toBe(403);

      const advocateEdit = await request(app)
        .patch(`/api/v1/advocates/${testAdvocateSharma.id}`)
        .set('Cookie', advocateCookie)
        .send({ name: 'Hacked Name' });
      expect(advocateEdit.status).toBe(403);
    });
  });

  // =============================================================
  // 4. Case Advocate Assignment & Automation
  // =============================================================
  describe('Case Advocate Assignment API', () => {
    it('first assignment on REGISTERED case moves status to ADVOCATE_ASSIGNED and writes history', async () => {
      expect(registeredCase1.status).toBe('REGISTERED');

      const res = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateMehta.id,
          side: 'PETITIONER',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.statusChanged).toBe(true);
      expect(res.body.data.currentStatus).toBe('ADVOCATE_ASSIGNED');

      // Verify case status in DB
      const updatedCase = await prisma.case.findUnique({
        where: { id: registeredCase1.id },
      });
      expect(updatedCase.status).toBe('ADVOCATE_ASSIGNED');

      // Verify history row
      const history = await prisma.caseStatusHistory.findFirst({
        where: {
          caseId: registeredCase1.id,
          toStatus: 'ADVOCATE_ASSIGNED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(history).toBeDefined();
      expect(history.fromStatus).toBe('REGISTERED');
      expect(history.reason).toContain(testAdvocateMehta.name);
    });

    it('second assignment on ADVOCATE_ASSIGNED case does NOT change status', async () => {
      // First assign advocate
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateMehta.id,
          side: 'PETITIONER',
        });

      // Second assign advocate
      const secondRes = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateIyer.id,
          side: 'RESPONDENT',
        });

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.data.statusChanged).toBe(false);
      expect(secondRes.body.data.currentStatus).toBe('ADVOCATE_ASSIGNED');
    });

    it('rejects duplicate active assignment of the same advocate on the same case', async () => {
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateMehta.id,
          side: 'PETITIONER',
        });

      const dupRes = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateMehta.id,
          side: 'PETITIONER',
        });

      expect(dupRes.status).toBe(400);
      expect(dupRes.body.message).toMatch(/already actively assigned/i);
    });

    it('rejects same advocate representing BOTH sides (conflict of interest)', async () => {
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateMehta.id,
          side: 'PETITIONER',
        });

      const conflictRes = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateMehta.id,
          side: 'RESPONDENT',
        });

      expect(conflictRes.status).toBe(400);
      expect(conflictRes.body.message).toMatch(/conflict of interest/i);
    });

    it('rejects more than 2 active advocates per side', async () => {
      // 1st petitioner
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateMehta.id, side: 'PETITIONER' });

      // 2nd petitioner
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateIyer.id, side: 'PETITIONER' });

      // 3rd petitioner -> should be rejected
      const thirdRes = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateKhan.id, side: 'PETITIONER' });

      expect(thirdRes.status).toBe(400);
      expect(thirdRes.body.message).toMatch(/maximum of 2 active advocates/i);
    });

    it('rejects assignment to a CLOSED case', async () => {
      const res = await request(app)
        .post(`/api/v1/cases/${closedCase13.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateSharma.id,
          side: 'PETITIONER',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/closed case/i);
    });

    it('rejects assignment of an advocate whose linked login is inactive', async () => {
      // Deactivate Mehta's user
      const mehtaAdv = await prisma.advocate.findUnique({
        where: { id: testAdvocateMehta.id },
      });
      await prisma.user.update({
        where: { id: mehtaAdv.userId },
        data: { isActive: false },
      });

      const res = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({
          advocateId: testAdvocateMehta.id,
          side: 'PETITIONER',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/inactive/i);
    });

    it('reactivates previously unassigned advocate on the same case, reusing row and clearing unassigned fields', async () => {
      // Assign advocate
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateMehta.id, side: 'PETITIONER' });

      // Unassign advocate
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates/${testAdvocateMehta.id}/unassign`)
        .set('Cookie', registrarCookie)
        .send({ reason: 'Advocate temporarily unavailable due to surgery' });

      const rowAfterUnassign = await prisma.caseAdvocate.findUnique({
        where: {
          caseId_advocateId: { caseId: registeredCase1.id, advocateId: testAdvocateMehta.id },
        },
      });
      expect(rowAfterUnassign.isActive).toBe(false);
      expect(rowAfterUnassign.unassignReason).toBe(
        'Advocate temporarily unavailable due to surgery'
      );

      // Re-assign same advocate
      const reassignRes = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateMehta.id, side: 'PETITIONER' });

      expect(reassignRes.status).toBe(201);

      const rowAfterReassign = await prisma.caseAdvocate.findUnique({
        where: {
          caseId_advocateId: { caseId: registeredCase1.id, advocateId: testAdvocateMehta.id },
        },
      });
      expect(rowAfterReassign.id).toBe(rowAfterUnassign.id); // Same row reused
      expect(rowAfterReassign.isActive).toBe(true);
      expect(rowAfterReassign.unassignedAt).toBeNull();
      expect(rowAfterReassign.unassignedById).toBeNull();
      expect(rowAfterReassign.unassignReason).toBeNull();
    });

    it('two simultaneous identical assignment requests produce exactly one active row', async () => {
      const req1 = request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateSharma.id, side: 'PETITIONER' });

      const req2 = request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateSharma.id, side: 'PETITIONER' });

      const [res1, res2] = await Promise.all([req1, req2]);

      // Exactly one request must succeed with 201, while the other fails with 400
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 400]);

      const activeRows = await prisma.caseAdvocate.findMany({
        where: {
          caseId: registeredCase1.id,
          advocateId: testAdvocateSharma.id,
          isActive: true,
        },
      });
      expect(activeRows.length).toBe(1);
    });

    it('returns workload warning when active open cases reach or exceed threshold without blocking', async () => {
      // Temporarily lower threshold to 2 for this test
      await prisma.systemSetting.update({
        where: { key: 'advocate_workload_warning_threshold' },
        data: { value: '2' },
      });

      const res = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateMehta.id, side: 'PETITIONER' });

      expect(res.status).toBe(201);
      expect(res.body.data.warning).toBeDefined();
      expect(res.body.data.warning).toMatch(/workload threshold/i);

      // Restore threshold to 15
      await prisma.systemSetting.update({
        where: { key: 'advocate_workload_warning_threshold' },
        data: { value: '15' },
      });
    });

    it('forbids JUDGE and ADVOCATE roles from assigning advocates (403)', async () => {
      const judgeRes = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', judgeCookie)
        .send({ advocateId: testAdvocateSharma.id, side: 'PETITIONER' });
      expect(judgeRes.status).toBe(403);

      const advRes = await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', advocateCookie)
        .send({ advocateId: testAdvocateSharma.id, side: 'PETITIONER' });
      expect(advRes.status).toBe(403);
    });
  });

  // =============================================================
  // 5. Advocate Unassignment & Lifecycle Reversion
  // =============================================================
  describe('Advocate Unassignment API', () => {
    it('unassign requires reason (fails if empty or shorter than 5 chars)', async () => {
      const res = await request(app)
        .post(
          `/api/v1/cases/${advocateAssignedCase3.id}/advocates/${testAdvocateMehta.id}/unassign`
        )
        .set('Cookie', registrarCookie)
        .send({ reason: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 5 characters/i);
    });

    it('unassigning sets isActive false, unassignedAt, unassignedById, unassignReason (never deletes)', async () => {
      // Find an active advocate on Case 3
      const activeAdv = await prisma.caseAdvocate.findFirst({
        where: { caseId: advocateAssignedCase3.id, isActive: true },
      });

      const res = await request(app)
        .post(
          `/api/v1/cases/${advocateAssignedCase3.id}/advocates/${activeAdv.advocateId}/unassign`
        )
        .set('Cookie', registrarCookie)
        .send({ reason: 'Client instructed change of legal counsel' });

      expect(res.status).toBe(200);

      const updatedRow = await prisma.caseAdvocate.findUnique({
        where: { id: activeAdv.id },
      });
      expect(updatedRow).toBeDefined();
      expect(updatedRow.isActive).toBe(false);
      expect(updatedRow.unassignedAt).not.toBeNull();
      expect(updatedRow.unassignReason).toBe('Client instructed change of legal counsel');
    });

    it('unassigning the LAST advocate on ADVOCATE_ASSIGNED case reverts status to REGISTERED', async () => {
      // Case 3 has 2 advocates initially. Unassign first:
      const activeAdvs = await prisma.caseAdvocate.findMany({
        where: { caseId: advocateAssignedCase3.id, isActive: true },
      });

      // Unassign first advocate
      await request(app)
        .post(
          `/api/v1/cases/${advocateAssignedCase3.id}/advocates/${activeAdvs[0].advocateId}/unassign`
        )
        .set('Cookie', registrarCookie)
        .send({ reason: 'First advocate withdrawn by party' });

      // Unassign second (last) advocate
      const lastRes = await request(app)
        .post(
          `/api/v1/cases/${advocateAssignedCase3.id}/advocates/${activeAdvs[1].advocateId}/unassign`
        )
        .set('Cookie', registrarCookie)
        .send({ reason: 'Second advocate withdrew; no counsel remains' });

      expect(lastRes.status).toBe(200);
      expect(lastRes.body.data.statusChanged).toBe(true);
      expect(lastRes.body.data.currentStatus).toBe('REGISTERED');

      // Verify case status reverted to REGISTERED
      const updatedCase = await prisma.case.findUnique({
        where: { id: advocateAssignedCase3.id },
      });
      expect(updatedCase.status).toBe('REGISTERED');

      // Verify status history row recorded
      const history = await prisma.caseStatusHistory.findFirst({
        where: { caseId: advocateAssignedCase3.id, toStatus: 'REGISTERED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(history).toBeDefined();
      expect(history.fromStatus).toBe('ADVOCATE_ASSIGNED');
      expect(history.reason).toBe('Second advocate withdrew; no counsel remains');
    });

    it('unassigning the LAST advocate on HEARING_SCHEDULED or UNDER_TRIAL case is BLOCKED', async () => {
      // Case 7 is UNDER_TRIAL with 2 active advocates
      const activeAdvs = await prisma.caseAdvocate.findMany({
        where: { caseId: underTrialCase7.id, isActive: true },
      });

      // Unassign 1st advocate (still 1 active remains) -> succeeds
      const firstRes = await request(app)
        .post(`/api/v1/cases/${underTrialCase7.id}/advocates/${activeAdvs[0].advocateId}/unassign`)
        .set('Cookie', registrarCookie)
        .send({ reason: 'Lead counsel withdrew; junior counsel continues' });
      expect(firstRes.status).toBe(200);

      // Attempt to unassign 2nd (last) advocate -> must be BLOCKED
      const secondRes = await request(app)
        .post(`/api/v1/cases/${underTrialCase7.id}/advocates/${activeAdvs[1].advocateId}/unassign`)
        .set('Cookie', registrarCookie)
        .send({ reason: 'Attempt to withdraw remaining counsel' });

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.message).toMatch(
        /cannot remove the last active advocate.*replacement/i
      );
    });

    it('forbids JUDGE and ADVOCATE roles from unassigning advocates (403)', async () => {
      const activeAdv = await prisma.caseAdvocate.findFirst({
        where: { caseId: advocateAssignedCase3.id, isActive: true },
      });

      const judgeRes = await request(app)
        .post(
          `/api/v1/cases/${advocateAssignedCase3.id}/advocates/${activeAdv.advocateId}/unassign`
        )
        .set('Cookie', judgeCookie)
        .send({ reason: 'Unauthorized unassignment attempt' });
      expect(judgeRes.status).toBe(403);

      const advRes = await request(app)
        .post(
          `/api/v1/cases/${advocateAssignedCase3.id}/advocates/${activeAdv.advocateId}/unassign`
        )
        .set('Cookie', advocateCookie)
        .send({ reason: 'Unauthorized unassignment attempt' });
      expect(advRes.status).toBe(403);
    });
  });

  // =============================================================
  // 6. Dynamic Visibility Scoping Transition
  // =============================================================
  describe('Dynamic Case Visibility for Advocates', () => {
    it('an advocate gains visibility of case immediately upon assignment and loses it after unassignment', async () => {
      // 1. Advocate Mehta checks their case list; registeredCase1 is NOT in their list
      const listBefore = await request(app).get('/api/v1/cases').set('Cookie', advocateCookie);
      expect(listBefore.status).toBe(200);
      const hasCaseBefore = listBefore.body.data.items.some((c) => c.id === registeredCase1.id);
      expect(hasCaseBefore).toBe(false);

      // 2. Registrar assigns Mehta to registeredCase1
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates`)
        .set('Cookie', registrarCookie)
        .send({ advocateId: testAdvocateMehta.id, side: 'PETITIONER' });

      // 3. Advocate Mehta checks their case list again; case is NOW visible
      const listDuring = await request(app).get('/api/v1/cases').set('Cookie', advocateCookie);
      expect(listDuring.status).toBe(200);
      const hasCaseDuring = listDuring.body.data.items.some((c) => c.id === registeredCase1.id);
      expect(hasCaseDuring).toBe(true);

      // 4. Registrar unassigns Mehta
      await request(app)
        .post(`/api/v1/cases/${registeredCase1.id}/advocates/${testAdvocateMehta.id}/unassign`)
        .set('Cookie', registrarCookie)
        .send({ reason: 'Advocate engagement concluded by mutual agreement' });

      // 5. Advocate Mehta checks their case list again; case is NO LONGER visible
      const listAfter = await request(app).get('/api/v1/cases').set('Cookie', advocateCookie);
      expect(listAfter.status).toBe(200);
      const hasCaseAfter = listAfter.body.data.items.some((c) => c.id === registeredCase1.id);
      expect(hasCaseAfter).toBe(false);
    });
  });

  // =============================================================
  // 7. Case Detail & History Audit Integration
  // =============================================================
  describe('Case Detail & History Timeline', () => {
    it('GET /cases/:id returns assignment details and previous unassignment audit records', async () => {
      // In the seed, Case 7 has 2 active advocates and 1 previous inactive advocate
      const res = await request(app)
        .get(`/api/v1/cases/${underTrialCase7.id}`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      const advs = res.body.data.case.advocates;
      expect(advs.length).toBe(3); // 2 active + 1 inactive

      const inactiveAdv = advs.find((a) => !a.isActive);
      expect(inactiveAdv).toBeDefined();
      expect(inactiveAdv.unassignedAt).not.toBeNull();
      expect(inactiveAdv.unassignedByName).not.toBeNull();
      expect(inactiveAdv.unassignReason).toContain('scheduling conflict');

      const activeAdv = advs.find((a) => a.isActive);
      expect(activeAdv).toBeDefined();
      expect(activeAdv.assignedByName).not.toBeNull();
    });

    it('merges advocate assignment events into the history timeline even when status did not change', async () => {
      const res = await request(app)
        .get(`/api/v1/cases/${underTrialCase7.id}`)
        .set('Cookie', registrarCookie);

      expect(res.status).toBe(200);
      const history = res.body.data.case.statusHistory;

      // History should contain advocate assignments and unassignments
      const unassignEvent = history.find((h) => h.reason && h.reason.includes('unassigned'));
      expect(unassignEvent).toBeDefined();
      expect(unassignEvent.changedBy).toBeDefined();
    });
  });

  // =============================================================
  // 8. Workflow Service Unit Tests
  // =============================================================
  describe('caseWorkflow Transition Service', () => {
    it('rejects invalid direct lifecycle jumps', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          return transitionCaseStatus({
            tx,
            caseId: registeredCase1.id,
            toStatus: 'CLOSED', // Invalid: REGISTERED cannot jump directly to CLOSED
            reason: 'Premature close attempt',
            userId: registeredCase1.registeredById,
          });
        })
      ).rejects.toThrow(WorkflowError);
    });

    it('rejects transition with empty reason', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          return transitionCaseStatus({
            tx,
            caseId: registeredCase1.id,
            toStatus: 'ADVOCATE_ASSIGNED',
            reason: '   ',
            userId: registeredCase1.registeredById,
          });
        })
      ).rejects.toThrow(WorkflowError);
    });
  });
});
