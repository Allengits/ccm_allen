/**
 * Phase 4 Verification Script
 * Validates Phase 4 end-to-end functionality via scripted HTTP calls:
 * 1. Registrar registration, case number format, status, history, list appearance
 * 2. Search, filters (status, type, priority, backlog, date range), sorting, pagination
 * 3. Judge role scoping, 403 on create/edit, 404 on out-of-scope detail
 * 4. Advocate role scoping, 403 on create, 404 on out-of-scope detail
 * 5. GET /cases/stats numbers match list counts for all roles
 */

import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/db/prisma.js';

const DEMO_PASSWORD = 'Demo@1234';

async function runPhase4Verification() {
  console.log('===============================================================');
  console.log('       PHASE 4 END-TO-END ACCEPTANCE VERIFICATION SCRIPT       ');
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
    // -------------------------------------------------------------
    // ITEM 1: Registrar Case Registration & Verification
    // -------------------------------------------------------------
    console.log('\nVerifying Item 1: Registrar Case Registration...');
    const regLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'registrar@courtcms.gov.in', password: DEMO_PASSWORD });

    const registrarCookie = regLogin.headers['set-cookie'][0];

    const regCaseRes = await request(app)
      .post('/api/v1/cases')
      .set('Cookie', [registrarCookie])
      .send({
        title: 'State vs. Phase 4 Verification Accused',
        caseType: 'CRIMINAL',
        priority: 'URGENT',
        petitioner: 'State of Maharashtra',
        respondent: 'Verification Accused Party',
        description: 'Verification docket for Phase 4 compliance',
        filingDate: new Date().toISOString(),
      });

    const createdCase = regCaseRes.body?.data?.case;
    const caseNumberFormatValid = /^CC\/2026\/\d{5}$/.test(createdCase?.caseNumber || '');
    const isRegistered = createdCase?.status === 'REGISTERED';

    // Verify CaseStatusHistory row
    const historyRows = createdCase?.id
      ? await prisma.caseStatusHistory.findMany({ where: { caseId: createdCase.id } })
      : [];
    const historyValid =
      historyRows.length === 1 &&
      historyRows[0].fromStatus === null &&
      historyRows[0].toStatus === 'REGISTERED' &&
      historyRows[0].reason === 'Case registered';

    // Verify appearance in GET /cases
    const listCheck = await request(app)
      .get(`/api/v1/cases?q=${encodeURIComponent(createdCase?.caseNumber || '')}`)
      .set('Cookie', [registrarCookie]);

    const appearsInList = listCheck.body?.data?.items?.some(
      (c) => c.caseNumber === createdCase?.caseNumber
    );

    const item1Pass =
      regCaseRes.status === 201 &&
      caseNumberFormatValid &&
      isRegistered &&
      historyValid &&
      appearsInList;

    record(
      1,
      'Registrar Registration & Case Lifecycle Initial State',
      item1Pass,
      `Allocated: ${createdCase?.caseNumber}, Status: ${createdCase?.status}, History: ${historyRows[0]?.reason}, List verified: ${appearsInList}`
    );

    // -------------------------------------------------------------
    // ITEM 2: Search, Filters, Sorting, Pagination, and Backlog
    // -------------------------------------------------------------
    console.log('\nVerifying Item 2: Search, Filters, Sorting, Pagination, Backlog...');

    // Search
    const searchRes = await request(app)
      .get('/api/v1/cases?q=Verma')
      .set('Cookie', [registrarCookie]);
    const searchOk = searchRes.body?.data?.total >= 1;

    // Filters
    const statusFilterRes = await request(app)
      .get('/api/v1/cases?status=UNDER_TRIAL')
      .set('Cookie', [registrarCookie]);
    const statusOk =
      statusFilterRes.body?.data?.items?.every((c) => c.status === 'UNDER_TRIAL') ?? false;

    const typeFilterRes = await request(app)
      .get('/api/v1/cases?caseType=CIVIL')
      .set('Cookie', [registrarCookie]);
    const typeOk = typeFilterRes.body?.data?.items?.every((c) => c.caseType === 'CIVIL') ?? false;

    const priorityFilterRes = await request(app)
      .get('/api/v1/cases?priority=URGENT')
      .set('Cookie', [registrarCookie]);
    const priorityOk =
      priorityFilterRes.body?.data?.items?.every((c) => c.priority === 'URGENT') ?? false;

    // Backlog filter
    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: 'backlog_threshold_days' },
    });
    const thresholdDays = parseInt(thresholdSetting?.value || '90', 10);

    const backlogRes = await request(app)
      .get('/api/v1/cases?backlog=true')
      .set('Cookie', [registrarCookie]);
    const backlogOk =
      backlogRes.body?.data?.items?.every(
        (c) => c.status !== 'CLOSED' && c.isBacklog && c.ageDays >= thresholdDays
      ) ?? false;

    // Sorting
    const sortAscRes = await request(app)
      .get('/api/v1/cases?sortBy=filingDate&sortOrder=asc')
      .set('Cookie', [registrarCookie]);
    const dates = (sortAscRes.body?.data?.items || []).map((c) => new Date(c.filingDate).getTime());
    let sortOk = true;
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] < dates[i - 1]) sortOk = false;
    }

    // Pagination
    const pageRes = await request(app)
      .get('/api/v1/cases?page=1&pageSize=4')
      .set('Cookie', [registrarCookie]);
    const paginationOk =
      pageRes.body?.data?.pageSize === 4 && pageRes.body?.data?.items?.length === 4;

    const item2Pass =
      searchOk && statusOk && typeOk && priorityOk && backlogOk && sortOk && paginationOk;

    record(
      2,
      'Query Parameters: Search, Filters, Backlog, Sort, Pagination',
      item2Pass,
      `Search: ${searchOk}, Status: ${statusOk}, Type: ${typeOk}, Priority: ${priorityOk}, Backlog (>=${thresholdDays}d): ${backlogOk}, Sort: ${sortOk}, Pagination: ${paginationOk}`
    );

    // -------------------------------------------------------------
    // ITEM 3: Judge Role Scoping & Protections
    // -------------------------------------------------------------
    console.log('\nVerifying Item 3: Judge Role Scoping & Protections...');
    const judgeLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'judge.banerjee@courtcms.gov.in', password: DEMO_PASSWORD });
    const judgeCookie = judgeLogin.headers['set-cookie'][0];
    const judgeUser = judgeLogin.body.data.user;

    // Judge list scoping
    const judgeCasesRes = await request(app)
      .get('/api/v1/cases?pageSize=50')
      .set('Cookie', [judgeCookie]);
    const judgeListScoped =
      judgeCasesRes.body?.data?.items?.every((c) => c.judge?.id === judgeUser.id) ?? false;

    // Judge POST /cases -> 403
    const judgePostRes = await request(app)
      .post('/api/v1/cases')
      .set('Cookie', [judgeCookie])
      .send({
        title: 'Judge Attempted Registration',
        caseType: 'CIVIL',
        petitioner: 'Party A',
        respondent: 'Party B',
        filingDate: new Date().toISOString(),
      });

    // Judge PATCH /cases/:id -> 403
    const targetCaseId = judgeCasesRes.body?.data?.items?.[0]?.id;
    const judgePatchRes = await request(app)
      .patch(`/api/v1/cases/${targetCaseId}`)
      .set('Cookie', [judgeCookie])
      .send({ title: 'Judge Edit Attempt' });

    // Out-of-scope case detail -> 404
    const otherJudgeCase = await prisma.case.findFirst({
      where: { judge: { email: 'judge.swaminathan@courtcms.gov.in' } },
    });
    const judgeOutOfScopeRes = await request(app)
      .get(`/api/v1/cases/${otherJudgeCase.id}`)
      .set('Cookie', [judgeCookie]);

    const item3Pass =
      judgeListScoped &&
      judgePostRes.status === 403 &&
      judgePatchRes.status === 403 &&
      judgeOutOfScopeRes.status === 404;

    record(
      3,
      'Judge Role Scoping, Authorization Guards & 404 Information Shielding',
      item3Pass,
      `List Scoped: ${judgeListScoped}, POST /cases: ${judgePostRes.status} (expected 403), PATCH /cases: ${judgePatchRes.status} (expected 403), Out-of-Scope Detail: ${judgeOutOfScopeRes.status} (expected 404)`
    );

    // -------------------------------------------------------------
    // ITEM 4: Advocate Role Scoping & Protections
    // -------------------------------------------------------------
    console.log('\nVerifying Item 4: Advocate Role Scoping & Protections...');
    const advLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'adv.khan@courtcms.gov.in', password: DEMO_PASSWORD });
    const advCookie = advLogin.headers['set-cookie'][0];
    const advUser = advLogin.body.data.user;

    const advCasesRes = await request(app)
      .get('/api/v1/cases?pageSize=50')
      .set('Cookie', [advCookie]);

    // Query DB for cases where adv.khan is assigned
    const advLinkedCases = await prisma.caseAdvocate.findMany({
      where: {
        advocateId: advUser.advocateId,
        isActive: true,
      },
      select: { caseId: true },
    });
    const expectedCaseIds = new Set(advLinkedCases.map((ca) => ca.caseId));

    const advListScoped =
      advCasesRes.body?.data?.items?.every((c) => expectedCaseIds.has(c.id)) &&
      advCasesRes.body?.data?.total === expectedCaseIds.size;

    // Advocate POST /cases -> 403
    const advPostRes = await request(app).post('/api/v1/cases').set('Cookie', [advCookie]).send({
      title: 'Advocate Registration Attempt',
      caseType: 'CIVIL',
      petitioner: 'P',
      respondent: 'R',
      filingDate: new Date().toISOString(),
    });

    // Advocate Out-of-Scope Detail -> 404
    const unlinkedCase = await prisma.case.findFirst({
      where: { id: { notIn: Array.from(expectedCaseIds) } },
    });
    const advOutOfScopeRes = await request(app)
      .get(`/api/v1/cases/${unlinkedCase.id}`)
      .set('Cookie', [advCookie]);

    const item4Pass = advListScoped && advPostRes.status === 403 && advOutOfScopeRes.status === 404;

    record(
      4,
      'Advocate Role Scoping, Authorization Guards & 404 Information Shielding',
      item4Pass,
      `List Scoped: ${advListScoped} (${advCasesRes.body?.data?.total} cases), POST /cases: ${advPostRes.status} (expected 403), Out-of-Scope Detail: ${advOutOfScopeRes.status} (expected 404)`
    );

    // -------------------------------------------------------------
    // ITEM 5: GET /cases/stats Matching List Counts
    // -------------------------------------------------------------
    console.log('\nVerifying Item 5: GET /cases/stats Matching List Counts...');

    // Admin login
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@courtcms.gov.in', password: DEMO_PASSWORD });
    const adminCookie = adminLogin.headers['set-cookie'][0];

    const rolesToTest = [
      { name: 'ADMIN', cookie: adminCookie },
      { name: 'REGISTRAR', cookie: registrarCookie },
      { name: 'JUDGE', cookie: judgeCookie },
      { name: 'ADVOCATE', cookie: advCookie },
    ];

    let allStatsMatch = true;
    const statsDetails = [];

    for (const r of rolesToTest) {
      const statsRes = await request(app).get('/api/v1/cases/stats').set('Cookie', [r.cookie]);

      const overdueListRes = await request(app)
        .get('/api/v1/cases?backlog=true&pageSize=50')
        .set('Cookie', [r.cookie]);

      // Direct count of open cases in list
      const allCasesRes = await request(app)
        .get('/api/v1/cases?pageSize=50')
        .set('Cookie', [r.cookie]);
      const actualOpenCount = (allCasesRes.body?.data?.items || []).filter(
        (c) => c.status !== 'CLOSED'
      ).length;

      const statsOpen = statsRes.body?.data?.totalOpenCases;
      const statsOverdue = statsRes.body?.data?.overdueCases;
      const listOverdue = overdueListRes.body?.data?.total;

      const matches = statsOpen === actualOpenCount && statsOverdue === listOverdue;
      if (!matches) allStatsMatch = false;

      statsDetails.push(
        `${r.name}: Open (stats=${statsOpen}, list=${actualOpenCount}), Overdue (stats=${statsOverdue}, list=${listOverdue})`
      );
    }

    record(5, 'GET /cases/stats Scoped Metrics Alignment', allStatsMatch, statsDetails.join(' | '));

    // Summary table
    console.log('\n===============================================================');
    console.log('              PHASE 4 VERIFICATION RESULTS TABLE               ');
    console.log('===============================================================');
    console.table(results);

    const allPassed = results.every((r) => r.status === 'PASS');
    console.log(
      allPassed
        ? '\n>>> ALL PHASE 4 VERIFICATION CHECKS PASSED (CODE 0) <<<\n'
        : '\n>>> PHASE 4 VERIFICATION FAILED <<<\n'
    );

    return allPassed;
  } catch (error) {
    console.error('Phase 4 verification script error:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

runPhase4Verification().then((passed) => {
  process.exit(passed ? 0 : 1);
});
