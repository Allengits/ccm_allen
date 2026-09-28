import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';

describe('Court CMS - Phase 4 Cases API & RBAC Suite', () => {
  const demoPassword = 'Demo@1234';

  let adminCookie = '';
  let registrarCookie = '';
  let judgeCookie = '';
  let advocateCookie = '';

  let judgeUser;
  let registrarUser;
  let advocateUser;

  let seededCaseIds = [];
  const createdCaseIds = [];

  const cleanupTestRecords = async () => {
    // Delete any created status history records
    if (createdCaseIds.length > 0) {
      await prisma.caseStatusHistory.deleteMany({
        where: { caseId: { in: createdCaseIds } },
      });
      await prisma.case.deleteMany({
        where: { id: { in: createdCaseIds } },
      });
      createdCaseIds.length = 0;
    }

    // Also clean up any orphan cases not in seeded baseline
    if (seededCaseIds.length > 0) {
      await prisma.caseStatusHistory.deleteMany({
        where: { caseId: { notIn: seededCaseIds } },
      });
      await prisma.case.deleteMany({
        where: { id: { notIn: seededCaseIds } },
      });
    }

    // Reset CaseSequence rows back to seeded baseline
    await prisma.caseSequence.deleteMany({
      where: {
        OR: [{ prefix: { notIn: ['CC', 'CRL'] } }, { year: { notIn: [2025, 2026] } }],
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
    await prisma.caseSequence.updateMany({
      where: { prefix: 'CRL', year: 2026 },
      data: { lastNumber: 0 },
    });
  };

  beforeAll(async () => {
    // Record baseline seeded case IDs
    const seededCases = await prisma.case.findMany({ select: { id: true } });
    seededCaseIds = seededCases.map((c) => c.id);

    // Fetch user IDs
    judgeUser = await prisma.user.findUnique({
      where: { email: 'judge.banerjee@courtcms.gov.in' },
    });
    registrarUser = await prisma.user.findUnique({
      where: { email: 'registrar@courtcms.gov.in' },
    });
    advocateUser = await prisma.user.findUnique({
      where: { email: 'adv.khan@courtcms.gov.in' },
    });

    // Authenticate all 4 roles
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@courtcms.gov.in', password: demoPassword });
    adminCookie = adminLogin.headers['set-cookie'][0];

    const registrarLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'registrar@courtcms.gov.in', password: demoPassword });
    registrarCookie = registrarLogin.headers['set-cookie'][0];

    const judgeLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'judge.banerjee@courtcms.gov.in', password: demoPassword });
    judgeCookie = judgeLogin.headers['set-cookie'][0];

    const advocateLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'adv.khan@courtcms.gov.in', password: demoPassword });
    advocateCookie = advocateLogin.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await cleanupTestRecords();
  });

  // -------------------------------------------------------------
  // 1. GET /api/v1/cases/meta and /stats
  // -------------------------------------------------------------
  describe('GET /api/v1/cases/meta & /stats', () => {
    it('requires authentication for metadata and returns 401 without cookie', async () => {
      const res = await request(app).get('/api/v1/cases/meta');
      expect(res.status).toBe(401);
    });

    it('returns case metadata with active judges, types, and priorities for authenticated users', async () => {
      const res = await request(app).get('/api/v1/cases/meta').set('Cookie', [registrarCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.caseTypes).toEqual([
        'CRIMINAL',
        'CIVIL',
        'FAMILY',
        'PROPERTY',
        'COMMERCIAL',
        'CONSTITUTIONAL',
        'OTHER',
      ]);
      expect(res.body.data.priorities).toEqual(['NORMAL', 'URGENT']);
      expect(res.body.data.judges.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.judges[0]).toHaveProperty('id');
      expect(res.body.data.judges[0]).toHaveProperty('name');
    });

    it('returns scoped summary statistics for open and overdue cases', async () => {
      const res = await request(app).get('/api/v1/cases/stats').set('Cookie', [registrarCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalOpenCases).toBe(12); // 14 total - 2 closed
      expect(res.body.data.overdueCases).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------
  // 2. Case Registration (POST /api/v1/cases)
  // -------------------------------------------------------------
  describe('POST /api/v1/cases - Registration & Auto-Numbering', () => {
    it('successfully registers a case with auto-generated case number, status REGISTERED, and status history entry', async () => {
      const filingDate = new Date().toISOString();
      const res = await request(app).post('/api/v1/cases').set('Cookie', [registrarCookie]).send({
        title: 'State vs Test Accused',
        caseType: 'CRIMINAL',
        priority: 'URGENT',
        petitioner: 'State of Maharashtra',
        respondent: 'Test Accused Person',
        description: 'Test criminal prosecution filing',
        filingDate,
        judgeId: judgeUser.id,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const created = res.body.data.case;
      createdCaseIds.push(created.id);

      expect(created.caseNumber).toBe('CC/2026/00113'); // Seeded CC/2026 lastNumber was 112
      expect(created.status).toBe('REGISTERED');
      expect(created.priority).toBe('URGENT');
      expect(created.title).toBe('State vs Test Accused');
      expect(created.registeredById).toBe(registrarUser.id);
      expect(created.judgeId).toBe(judgeUser.id);

      // Verify status history row created in the same transaction
      const history = await prisma.caseStatusHistory.findMany({
        where: { caseId: created.id },
      });
      expect(history.length).toBe(1);
      expect(history[0].fromStatus).toBeNull();
      expect(history[0].toStatus).toBe('REGISTERED');
      expect(history[0].reason).toBe('Case registered');
      expect(history[0].changedById).toBe(registrarUser.id);
    });

    it('generates correct prefix for each case type', async () => {
      const filingDate = new Date().toISOString();
      const types = [
        { type: 'CIVIL', prefix: 'CV' },
        { type: 'FAMILY', prefix: 'FM' },
        { type: 'PROPERTY', prefix: 'PR' },
        { type: 'COMMERCIAL', prefix: 'CM' },
        { type: 'CONSTITUTIONAL', prefix: 'WP' },
        { type: 'OTHER', prefix: 'MC' },
      ];

      for (const { type, prefix } of types) {
        const res = await request(app)
          .post('/api/v1/cases')
          .set('Cookie', [adminCookie])
          .send({
            title: `Test Case for ${type}`,
            caseType: type,
            priority: 'NORMAL',
            petitioner: 'Party Alpha',
            respondent: 'Party Beta',
            filingDate,
          });

        expect(res.status).toBe(201);
        const created = res.body.data.case;
        createdCaseIds.push(created.id);

        expect(created.caseNumber).toMatch(new RegExp(`^${prefix}/2026/\\d{5}$`));
      }
    });

    it('handles 10 parallel registrations producing 10 unique consecutive case numbers without collision', async () => {
      const filingDate = new Date().toISOString();
      const parallelRequests = Array.from({ length: 10 }).map((_, idx) =>
        request(app)
          .post('/api/v1/cases')
          .set('Cookie', [adminCookie])
          .send({
            title: `Concurrent Test Registration ${idx + 1}`,
            caseType: 'CRIMINAL',
            priority: 'NORMAL',
            petitioner: `Petitioner ${idx + 1}`,
            respondent: `Respondent ${idx + 1}`,
            filingDate,
          })
      );

      const responses = await Promise.all(parallelRequests);
      const numbers = [];

      for (const res of responses) {
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        const c = res.body.data.case;
        createdCaseIds.push(c.id);
        numbers.push(c.caseNumber);
      }

      // Assert all 10 case numbers are unique
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(10);

      // Verify they are strictly consecutive
      const suffixes = numbers.map((num) => parseInt(num.split('/')[2], 10)).sort((a, b) => a - b);

      for (let i = 1; i < suffixes.length; i++) {
        expect(suffixes[i]).toBe(suffixes[i - 1] + 1);
      }
    });

    it('rejects filing date in the future', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
      const res = await request(app).post('/api/v1/cases').set('Cookie', [registrarCookie]).send({
        title: 'Future Date Case',
        caseType: 'CIVIL',
        petitioner: 'Party A',
        respondent: 'Party B',
        filingDate: futureDate,
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('future');
    });

    it('rejects missing or empty required fields', async () => {
      const res = await request(app).post('/api/v1/cases').set('Cookie', [registrarCookie]).send({
        title: '   ',
        caseType: 'INVALID_TYPE',
        petitioner: '',
        respondent: '',
        filingDate: '',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid or non-judge judgeId', async () => {
      const res = await request(app).post('/api/v1/cases').set('Cookie', [registrarCookie]).send({
        title: 'Invalid Judge Case',
        caseType: 'CIVIL',
        petitioner: 'Party A',
        respondent: 'Party B',
        filingDate: new Date().toISOString(),
        judgeId: advocateUser.id, // User with role ADVOCATE, not JUDGE
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Assigned judge must be an active user with role JUDGE');
    });

    it('denies JUDGE and ADVOCATE roles from registering cases with 403 Forbidden', async () => {
      const payload = {
        title: 'Unauthorized Case',
        caseType: 'CIVIL',
        petitioner: 'Party A',
        respondent: 'Party B',
        filingDate: new Date().toISOString(),
      };

      const judgeRes = await request(app)
        .post('/api/v1/cases')
        .set('Cookie', [judgeCookie])
        .send(payload);
      expect(judgeRes.status).toBe(403);

      const advocateRes = await request(app)
        .post('/api/v1/cases')
        .set('Cookie', [advocateCookie])
        .send(payload);
      expect(advocateRes.status).toBe(403);
    });
  });

  // -------------------------------------------------------------
  // 3. Case Visibility Scoping & Filtering (GET /api/v1/cases)
  // -------------------------------------------------------------
  describe('GET /api/v1/cases - Role Scoping & Query Filters', () => {
    beforeEach(async () => {
      // Clean temporary test cases so queries run against exact seeded data
      await cleanupTestRecords();
    });

    it('allows ADMIN and REGISTRAR to see all 14 seeded cases', async () => {
      const adminRes = await request(app)
        .get('/api/v1/cases?pageSize=50')
        .set('Cookie', [adminCookie]);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.total).toBe(14);
      expect(adminRes.body.data.items.length).toBe(14);

      const registrarRes = await request(app)
        .get('/api/v1/cases?pageSize=50')
        .set('Cookie', [registrarCookie]);
      expect(registrarRes.status).toBe(200);
      expect(registrarRes.body.data.total).toBe(14);
    });

    it('scopes JUDGE to only cases assigned to their judicial bench (7 cases)', async () => {
      const res = await request(app).get('/api/v1/cases?pageSize=50').set('Cookie', [judgeCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(7);
      expect(res.body.data.items.length).toBe(7);
      expect(res.body.data.items.every((c) => c.judge?.id === judgeUser.id)).toBe(true);
    });

    it('scopes ADVOCATE to only cases where they represent petitioner or respondent (3 cases)', async () => {
      const res = await request(app)
        .get('/api/v1/cases?pageSize=50')
        .set('Cookie', [advocateCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.items.length).toBe(3);
    });

    it('supports pagination with page and pageSize', async () => {
      const res = await request(app)
        .get('/api/v1/cases?page=1&pageSize=5')
        .set('Cookie', [registrarCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(5);
      expect(res.body.data.items.length).toBe(5);
      expect(res.body.data.total).toBe(14);
      expect(res.body.data.totalPages).toBe(3);
    });

    it('filters cases by text search q across case number, title, and parties', async () => {
      const res = await request(app).get('/api/v1/cases?q=Verma').set('Cookie', [registrarCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.items.some(
          (c) =>
            c.title.includes('Verma') ||
            c.petitioner.includes('Verma') ||
            c.respondent.includes('Verma')
        )
      ).toBe(true);
    });

    it('filters cases by status, caseType, and priority', async () => {
      const res = await request(app)
        .get('/api/v1/cases?status=UNDER_TRIAL&caseType=CRIMINAL&priority=URGENT')
        .set('Cookie', [registrarCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((c) => c.status === 'UNDER_TRIAL')).toBe(true);
      expect(res.body.data.items.every((c) => c.caseType === 'CRIMINAL')).toBe(true);
      expect(res.body.data.items.every((c) => c.priority === 'URGENT')).toBe(true);
    });

    it('filters open backlog cases exceeding threshold with backlog=true', async () => {
      const res = await request(app)
        .get('/api/v1/cases?backlog=true')
        .set('Cookie', [registrarCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(5); // Seeded database has 5 backlog cases
      expect(res.body.data.items.every((c) => c.status !== 'CLOSED')).toBe(true);
      expect(res.body.data.items.every((c) => c.isBacklog === true)).toBe(true);
      expect(res.body.data.items.every((c) => c.ageDays >= 90)).toBe(true);
    });

    it('sorts cases by filingDate ascending and descending', async () => {
      const ascRes = await request(app)
        .get('/api/v1/cases?sortBy=filingDate&sortOrder=asc')
        .set('Cookie', [registrarCookie]);
      expect(ascRes.status).toBe(200);
      const datesAsc = ascRes.body.data.items.map((c) => new Date(c.filingDate).getTime());
      for (let i = 1; i < datesAsc.length; i++) {
        expect(datesAsc[i]).toBeGreaterThanOrEqual(datesAsc[i - 1]);
      }

      const descRes = await request(app)
        .get('/api/v1/cases?sortBy=filingDate&sortOrder=desc')
        .set('Cookie', [registrarCookie]);
      expect(descRes.status).toBe(200);
      const datesDesc = descRes.body.data.items.map((c) => new Date(c.filingDate).getTime());
      for (let i = 1; i < datesDesc.length; i++) {
        expect(datesDesc[i]).toBeLessThanOrEqual(datesDesc[i - 1]);
      }
    });

    it('computes correct ageDays and isBacklog flags on all items', async () => {
      const res = await request(app).get('/api/v1/cases').set('Cookie', [registrarCookie]);

      expect(res.status).toBe(200);
      for (const item of res.body.data.items) {
        expect(typeof item.ageDays).toBe('number');
        expect(item.ageDays).toBeGreaterThanOrEqual(0);
        expect(typeof item.isBacklog).toBe('boolean');
        if (item.status === 'CLOSED') {
          expect(item.isBacklog).toBe(false);
        }
      }
    });
  });

  // -------------------------------------------------------------
  // 4. Case Detail (GET /api/v1/cases/:id)
  // -------------------------------------------------------------
  describe('GET /api/v1/cases/:id - Detail & Information Shielding', () => {
    it('returns full case detail with advocates, hearings, evidence, judgment, and status history', async () => {
      // Find a case with full related records (e.g. under trial case CC/2025/00045)
      const targetCase = await prisma.case.findUnique({
        where: { caseNumber: 'CC/2025/00045' },
      });

      const res = await request(app)
        .get(`/api/v1/cases/${targetCase.id}`)
        .set('Cookie', [registrarCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const c = res.body.data.case;
      expect(c.id).toBe(targetCase.id);
      expect(c.caseNumber).toBe('CC/2025/00045');
      expect(c.advocates).toBeDefined();
      expect(c.hearings).toBeDefined();
      expect(c.evidence).toBeDefined();
      expect(c.statusHistory).toBeDefined();
      expect(c.statusHistory.length).toBeGreaterThanOrEqual(1);
      expect(c.judge).toBeDefined();
      expect(c.registeredBy).toBeDefined();
      expect(c.ageDays).toBeGreaterThan(90);
      expect(c.isBacklog).toBe(true);
    });

    it('returns 404 (not 403) when user attempts to access an out-of-scope case', async () => {
      // Find a case assigned to Judge Swaminathan, not Judge Banerjee
      const outOfScopeCase = await prisma.case.findFirst({
        where: {
          judge: { email: 'judge.swaminathan@courtcms.gov.in' },
        },
      });

      // Judge Banerjee requests Judge Swaminathan's case
      const res = await request(app)
        .get(`/api/v1/cases/${outOfScopeCase.id}`)
        .set('Cookie', [judgeCookie]);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Case not found');
    });

    it('returns 404 for nonexistent case ID', async () => {
      const res = await request(app)
        .get('/api/v1/cases/00000000-0000-0000-0000-000000000000')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------
  // 5. Case Modification (PATCH /api/v1/cases/:id)
  // -------------------------------------------------------------
  describe('PATCH /api/v1/cases/:id - Editable Fields & Integrity Rules', () => {
    let testCaseId = '';

    beforeEach(async () => {
      await cleanupTestRecords();
      // Register a fresh case for editing
      const createRes = await request(app)
        .post('/api/v1/cases')
        .set('Cookie', [registrarCookie])
        .send({
          title: 'Original Title',
          caseType: 'CIVIL',
          priority: 'NORMAL',
          petitioner: 'Original Petitioner',
          respondent: 'Original Respondent',
          description: 'Original description text',
          filingDate: new Date().toISOString(),
        });

      testCaseId = createRes.body.data.case.id;
      createdCaseIds.push(testCaseId);
    });

    it('allows REGISTRAR and ADMIN to edit allowed fields (title, parties, priority, description, judge)', async () => {
      const res = await request(app)
        .patch(`/api/v1/cases/${testCaseId}`)
        .set('Cookie', [registrarCookie])
        .send({
          title: 'Modified Case Title',
          petitioner: 'Modified Petitioner',
          respondent: 'Modified Respondent',
          description: 'Updated case notes',
          priority: 'URGENT',
          judgeId: judgeUser.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const c = res.body.data.case;
      expect(c.title).toBe('Modified Case Title');
      expect(c.petitioner).toBe('Modified Petitioner');
      expect(c.respondent).toBe('Modified Respondent');
      expect(c.description).toBe('Updated case notes');
      expect(c.priority).toBe('URGENT');
      expect(c.judgeId).toBe(judgeUser.id);
    });

    it('strictly forbids changing immutable fields (caseNumber, caseType, filingDate, status)', async () => {
      const attempts = [
        { caseNumber: 'CC/2026/99999' },
        { caseType: 'CRIMINAL' },
        { filingDate: '2020-01-01T00:00:00.000Z' },
        { status: 'CLOSED' },
      ];

      for (const payload of attempts) {
        const res = await request(app)
          .patch(`/api/v1/cases/${testCaseId}`)
          .set('Cookie', [adminCookie])
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('prohibited');
      }
    });

    it('prevents editing a closed case with clear error message', async () => {
      // CC/2025/00022 is a seeded CLOSED case
      const closedCase = await prisma.case.findUnique({
        where: { caseNumber: 'CC/2025/00022' },
      });

      const res = await request(app)
        .patch(`/api/v1/cases/${closedCase.id}`)
        .set('Cookie', [adminCookie])
        .send({ title: 'Attempted Edit on Closed Case' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Closed cases cannot be edited');
    });

    it('denies JUDGE and ADVOCATE roles from editing cases with 403 Forbidden', async () => {
      const judgeRes = await request(app)
        .patch(`/api/v1/cases/${testCaseId}`)
        .set('Cookie', [judgeCookie])
        .send({ title: 'Judge Edit Attempt' });
      expect(judgeRes.status).toBe(403);

      const advRes = await request(app)
        .patch(`/api/v1/cases/${testCaseId}`)
        .set('Cookie', [advocateCookie])
        .send({ title: 'Advocate Edit Attempt' });
      expect(advRes.status).toBe(403);
    });
  });

  // -------------------------------------------------------------
  // 6. Delete Route Non-Existence
  // -------------------------------------------------------------
  describe('DELETE /api/v1/cases/:id - Legal Records Immutability', () => {
    it('does not expose a delete route and returns 404', async () => {
      const targetCase = await prisma.case.findFirst();
      const res = await request(app)
        .delete(`/api/v1/cases/${targetCase.id}`)
        .set('Cookie', [adminCookie]);

      // Route does not exist in legal case management
      expect([404, 405]).toContain(res.status);
    });
  });
});
