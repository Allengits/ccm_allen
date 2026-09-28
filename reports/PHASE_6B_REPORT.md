# Phase 6B Report — Scope Change: Remove Evidence Module

## 1. Objective

Completely remove the Evidence module from the Court Case Management System (Court CMS) across all architectural tiers:

- Prisma schema and MySQL database (dropping `evidence` and `evidence_custody_logs` tables and enums via a clean migration named `remove_evidence`).
- Seed and integrity verification scripts (removing evidence demo records and updating `UNDER_TRIAL` case lifecycle constraints).
- Authentication and RBAC permission matrices (removing `evidence.submit` and `evidence.review`, adjusting the ADVOCATE role to read-only on assigned cases, and removing evidence review from the JUDGE role).
- Backend controllers, API routes, and case detail responses (removing the `evidence` include from `GET /api/v1/cases/:id`).
- Frontend navigation, routes, and UI components (removing the Evidence sidebar item, deleting `client/src/pages/Evidence.jsx`, removing the Evidence tab from Case Detail, and eliminating all references across dashboard cards and labels).
- Domain documentation and context (`docs/DATABASE.md`, `docs/CASES.md`, `docs/AUTH.md`, `PROJECT_CONTEXT.md`, `README.md`).
- Automated regression test suites verifying zero presence of evidence tables and payload fields while maintaining complete teardown integrity.

---

## 2. What Was Built (and Removed)

### Schema & Database Migration

- **Prisma Schema (`server/prisma/schema.prisma`)**:
  - Removed models `Evidence` and `EvidenceCustodyLog`.
  - Removed enums `EvidenceType`, `EvidenceStatus`, and `CustodyAction`.
  - Removed relation fields from `User` (`submittedEvidence`, `evidenceCustodyLogs`) and `Case` (`evidence`).
- **Migration (`20260928090500_remove_evidence`)**:
  - Added migration SQL dropping foreign keys `evidence_case_id_fkey`, `evidence_submitted_by_id_fkey`, `evidence_custody_logs_evidence_id_fkey`, and `evidence_custody_logs_performed_by_id_fkey`.
  - Dropped tables `evidence_custody_logs` and `evidence`.
  - Verified clean database rebuild on MySQL 26.7.0 via `npm run db:reset`.

### Seed, Verification, & Teardown

- **Database Seeder (`server/prisma/seed.js`)**:
  - Removed evidence deletion and seeding routines.
  - Rephrased family case petition from custody to child guardianship.
  - Rephrased trial outcome notes to eliminate all occurrences of "evidence", "custody", and "exhibit".
  - Cleaned console summary table to track exactly 10 domain tables.
- **Integrity Verifier (`server/prisma/verify.js`)**:
  - Updated table count expectation from 12 to 10 tables.
  - Removed evidence assertions.
  - Updated `UNDER_TRIAL` status check: cases in `UNDER_TRIAL` now require at least one hearing record and at least one active advocate, with zero requirement for evidence.
- **Global Teardown Baseline (`server/tests/setup.js`)**:
  - Removed `evidence` and `evidenceCustodyLogs` from `SEEDED_BASELINE`.

### Permissions & RBAC

- **Server Permissions (`server/src/config/permissions.js`)**:
  - Removed `EVIDENCE_SUBMIT` (`evidence.submit`) and `EVIDENCE_REVIEW` (`evidence.review`).
  - Total permissions reduced from 14 to 12.
  - `ADVOCATE` role now holds: `['case.view', 'dashboard.view']`.
  - `JUDGE` role now holds: `['case.view', 'hearing.update', 'judgment.record', 'judgment.deliver', 'dashboard.view']`.
- **Client Permissions (`client/src/constants/permissions.js`)**:
  - Synchronized constants and role mappings with server permissions.

### Backend Endpoints

- **Case Controller (`server/src/controllers/case.controller.js`)**:
  - Removed `evidence` relation include from `getCaseById`.
  - Case responses now contain: `advocates`, `hearings`, `judgment`, `statusHistory`, and `judge`.

### Frontend UI & App Shell

- **Routes & Shell (`client/src/App.jsx`, `client/src/components/layout/Sidebar.jsx`)**:
  - Deleted `client/src/pages/Evidence.jsx`.
  - Removed Evidence route (`/evidence`) from `App.jsx`.
  - Removed Evidence item from the navigation sidebar.
- **Case Detail Tabs (`client/src/pages/CaseDetail.jsx`)**:
  - Removed Evidence tab and component view.
  - Active tabs are now: `Overview`, `Advocates`, `Hearings`, `Judgment`, and `History`.
- **Dashboard (`client/src/pages/Dashboard.jsx`)**:
  - Updated quick-action phase tag for judgments from Phase 8 to Phase 7.

### Documentation & Context

- **`docs/DATABASE.md`**: Updated entity count (10 tables), Mermaid ER diagram, schema reference, data dictionary, and lifecycle integrity table.
- **`docs/AUTH.md`**: Updated permissions count (12 permissions) and role matrices.
- **`docs/CASES.md`**: Removed evidence from docket endpoints, response payloads, and field explanations.
- **`PROJECT_CONTEXT.md`**: Removed evidence from Solution and data model; added scope change note; updated roadmap to Phases 6, 7 (Judgment tracker), 8 (Automation engine and registry dashboard), 9 (Testing, polish and final documentation).
- **`README.md`**: Removed evidence mentions and updated roadmap.

---

## 3. Files and Folders Changed

| File / Folder                                                           | Status   | Description                                                   |
| :---------------------------------------------------------------------- | :------- | :------------------------------------------------------------ |
| `server/prisma/schema.prisma`                                           | Modified | Removed `Evidence` and `EvidenceCustodyLog` models and enums  |
| `server/prisma/migrations/20260928090500_remove_evidence/migration.sql` | Added    | Schema migration dropping evidence tables and foreign keys    |
| `server/prisma/seed.js`                                                 | Modified | Removed evidence data generation and cleaned copy             |
| `server/prisma/verify.js`                                               | Modified | Updated verification to 10 tables and removed evidence checks |
| `server/src/config/permissions.js`                                      | Modified | Removed `evidence.submit` and `evidence.review` permissions   |
| `server/src/controllers/case.controller.js`                             | Modified | Removed `evidence` include from `getCaseById`                 |
| `client/src/constants/permissions.js`                                   | Modified | Removed evidence permissions on frontend                      |
| `client/src/components/layout/Sidebar.jsx`                              | Modified | Removed Evidence sidebar link and icon                        |
| `client/src/pages/Evidence.jsx`                                         | Deleted  | Removed obsolete Evidence placeholder page                    |
| `client/src/App.jsx`                                                    | Modified | Removed `/evidence` route and import                          |
| `client/src/pages/CaseDetail.jsx`                                       | Modified | Removed Evidence tab and view (5 tabs remain)                 |
| `client/src/pages/Dashboard.jsx`                                        | Modified | Updated judgment phase reference                              |
| `server/tests/setup.js`                                                 | Modified | Removed evidence tables from test teardown baseline           |
| `server/tests/auth.test.js`                                             | Modified | Added assertions verifying evidence permissions are removed   |
| `server/tests/cases.test.js`                                            | Modified | Added regression checks for payload and database tables       |
| `server/tests/advocates.test.js`                                        | Modified | Updated unassign reason expectation                           |
| `docs/DATABASE.md`                                                      | Modified | Removed evidence models, Mermaid relations, and dictionary    |
| `docs/AUTH.md`                                                          | Modified | Updated permissions table and role matrices                   |
| `docs/CASES.md`                                                         | Modified | Removed evidence from endpoint docs and response examples     |
| `PROJECT_CONTEXT.md`                                                    | Modified | Updated Solution, data model, scope change note, and roadmap  |
| `README.md`                                                             | Modified | Removed evidence from features and updated roadmap            |
| `reports/PHASE_6B_REPORT.md`                                            | Added    | This comprehensive scope change milestone report              |

---

## 4. How to Run and Verify (Exact Commands)

From the project root (`ccm_allen`):

```powershell
# 1. Reset database and run migrations
npm run db:reset

# 2. Run database integrity and business-rule verification
npm run db:verify

# 3. Check code formatting compliance
npm run format:check

# 4. Check ESLint compliance
npm run lint

# 5. Build client for production
npm run build --prefix client

# 6. Run all automated backend tests
npm test

# 7. Check API health endpoint
node -e "import request from 'supertest'; import app from './server/src/app.js'; request(app).get('/api/v1/health').then(r => console.log(JSON.stringify(r.body, null, 2)))"
```

---

## 5. Test Evidence

### Baseline vs After Results

| Metric / Check            | Baseline (Phase 5 End)                                                                                                                                                                            | After Phase 6B Scope Change                                                                                                                                 | Delta / Status                                   |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- |
| **Total Database Tables** | 12                                                                                                                                                                                                | 10                                                                                                                                                          | -2 (`evidence`, `evidence_custody_logs` dropped) |
| **Seeded Table Counts**   | users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 26, hearings: 16, evidence: 8, evidenceCustodyLogs: 16, judgments: 4, caseStatusHistory: 50, caseSequences: 2, systemSettings: 3 | users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 26, hearings: 16, judgments: 4, caseStatusHistory: 50, caseSequences: 2, systemSettings: 3 | Zero evidence rows, identical baseline preserved |
| **Database Verification** | 5/5 PASS (users: 7)                                                                                                                                                                               | 5/5 PASS (users: 7)                                                                                                                                         | PASS (Code 0)                                    |
| **Defined Permissions**   | 14                                                                                                                                                                                                | 12                                                                                                                                                          | -2 (`evidence.submit`, `evidence.review`)        |
| **ADVOCATE Permissions**  | `case.view`, `evidence.submit`, `dashboard.view`                                                                                                                                                  | `case.view`, `dashboard.view`                                                                                                                               | Read-only representation                         |
| **Case Detail Tabs**      | 6 (Overview, Advocates, Hearings, Evidence, Judgment, History)                                                                                                                                    | 5 (Overview, Advocates, Hearings, Judgment, History)                                                                                                        | Evidence tab completely removed                  |
| **Test Suites & Tests**   | 3 suites, 97 tests passing                                                                                                                                                                        | 3 suites, 99 tests passing                                                                                                                                  | +2 regression tests passing                      |
| **Teardown Baseline**     | All 12 tables verified                                                                                                                                                                            | All 10 tables verified                                                                                                                                      | Exact match, zero leaks                          |
| **ESLint Status**         | 0 errors, 0 warnings                                                                                                                                                                              | 0 errors, 0 warnings                                                                                                                                        | PASS (Code 0)                                    |
| **Prettier Formatting**   | Passed                                                                                                                                                                                            | Passed                                                                                                                                                      | PASS (Code 0)                                    |
| **Client Vite Build**     | Built in 11.4s                                                                                                                                                                                    | Built in 11.38s                                                                                                                                             | PASS (Code 0)                                    |

---

### Repository Search Results

Execution of case-insensitive search for `"evidence"`, `"custody"`, and `"exhibit"` across the repository:

```powershell
Get-ChildItem -Recurse -File -Exclude node_modules,dist,.git | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\.git\\' -and $_.FullName -notmatch '\\dist\\' -and $_.FullName -notmatch '\\reports\\' -and $_.FullName -notmatch '\\prisma\\migrations\\' } | Select-String -Pattern "evidence|custody|exhibit" -CaseSensitive:$false
```

#### Results & Justification for Retained Occurrences:

1. **`server/tests/auth.test.js`**:
   - `expect(PERMISSIONS.EVIDENCE_SUBMIT).toBeUndefined()`
   - `expect(PERMISSIONS.EVIDENCE_REVIEW).toBeUndefined()`
   - `expect(hasPermission('ADMIN', 'evidence.submit')).toBe(false)`
   - `expect(hasPermission('JUDGE', 'evidence.review')).toBe(false)`
   - _Rationale_: Explicitly required by step 7 to verify evidence permissions are purged.
2. **`server/tests/cases.test.js`**:
   - `expect(c.evidence).toBeUndefined()`
   - `expect(res.body.data.case.evidence).toBeUndefined()`
   - `expect('evidence' in res.body.data.case).toBe(false)`
   - `AND TABLE_NAME IN ('evidence', 'evidence_custody_logs')`
   - _Rationale_: Explicit regression test required by step 7 ensuring GET /cases/:id returns no evidence field and database has dropped the tables.
3. **`PROJECT_CONTEXT.md`**:
   - `> **Scope change**: The Evidence module was removed by decision in Phase 6B; the migration history still contains it, which is expected.`
   - `5. Test evidence (commands run and results)`
   - _Rationale_: Explicitly mandated note specified by step 6, and the standard reporting header in the project template.
4. **Historical Migrations & Reports**:
   - `server/prisma/migrations/20260928055230_init/migration.sql` (allowed: existing migration).
   - `reports/PHASE_2_REPORT.md` through `reports/PHASE_5_REPORT.md` (allowed: previous reports).

Zero other occurrences exist anywhere in the codebase.

---

### Command Output: `npm run db:verify`

```
> court-case-management-system@1.0.0 db:verify
> npm run db:verify --prefix server

> server@1.0.0 db:verify
> node prisma/verify.js

===============================================================
       COURT CASE MANAGEMENT SYSTEM - DATABASE VERIFICATION
===============================================================

[1/5] Checking table row counts...
[2/5] Validating case lifecycle records consistency...
[3/5] Checking for courtroom and judge scheduling conflicts...
[4/5] Checking judgment uniqueness per case...
[5/5] Checking backlog threshold cases...

===============================================================
                   VERIFICATION RESULTS TABLE
===============================================================
┌─────────┬───────────────────────────┬────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ Check                     │ Status │ Details                                                                                                                                                                                                                              │
├─────────┼───────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ 'Table Row Counts'        │ 'PASS' │ 'All 10 tables populated (users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 26, hearings: 16, judgments: 4, caseStatusHistory: 50, caseSequences: 2, systemSettings: 3)'                                              │
│ 1       │ 'Case Status Consistency' │ 'PASS' │ 'All 14 cases strictly conform to their lifecycle state constraints'                                                                                                                                                                 │
│ 2       │ 'No Double-Booking'       │ 'PASS' │ 'All 16 hearings verified: zero courtroom and zero judge scheduling collisions'                                                                                                                                                      │
│ 3       │ 'Judgment Uniqueness'     │ 'PASS' │ 'All 4 judgments have unique caseId (enforces 1:1 relation)'                                                                                                                                                                         │
│ 4       │ 'Backlog Cases Threshold' │ 'PASS' │ 'Found 5 open cases older than 90 days (Requirement >= 3). Cases: CC/2025/00030 (JUDGMENT_RESERVED), CC/2025/00045 (UNDER_TRIAL), CC/2025/00058 (UNDER_TRIAL), CC/2025/00072 (HEARING_SCHEDULED), CC/2025/00085 (ADVOCATE_ASSIGNED)' │
└─────────┴───────────────────────────┴────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0) <<<
```

---

### Command Output: `npm test`

```
> court-case-management-system@1.0.0 test
> npm run test --prefix server

> server@1.0.0 test
> vitest run

 RUN  v5.0.2 C:/Users/allen/OneDrive/Desktop/ccm_allen/server

 ✓ tests/advocates.test.js (35 tests) 18389ms
 ✓ tests/auth.test.js (36 tests) 3114ms
 ✓ tests/cases.test.js (28 tests) 2260ms

 Test Files  3 passed (3)
      Tests  99 passed (99)
   Start at  14:57:16
   Duration  29.05s (tests 85%, import 11%, transform 3%, setup 1%)
```

---

### Command Output: `/api/v1/health`

```json
{
  "success": true,
  "message": "System is healthy",
  "data": {
    "api": "ok",
    "database": "connected",
    "timestamp": "2026-09-28T09:28:30.296Z"
  }
}
```

---

## 6. Decisions and Assumptions

1. **Non-Interactive Migration Generation**:
   Dropping tables in Prisma requires user confirmation in interactive CLI mode. To guarantee non-interactive execution during automated CI/CD and scripted `npm run db:reset`, the migration was generated via `prisma migrate diff` and written directly to `server/prisma/migrations/20260928090500_remove_evidence/migration.sql`.
2. **Guardian Terminology in Seed Data**:
   To ensure complete elimination of the word `"custody"` from both schema and demo records, the seeded Family Law petition for Case 6 was rephrased from "Petition for custody and maintenance" to "Petition for child guardianship and maintenance".
3. **UNDER_TRIAL Lifecycle Definition**:
   In Phase 2, `UNDER_TRIAL` status required both a completed hearing and submitted evidence. With evidence removed, `UNDER_TRIAL` requires at least one hearing record and at least one active advocate, reflecting typical judicial trial progression.
4. **Advocate Role Permissions**:
   With evidence submission removed, the `ADVOCATE` role retains read-only access to their assigned client dockets (`case.view`) and dashboard access (`dashboard.view`).

---

## 7. Issues and Limitations

1. **Windows File Locking on Native DLLs**:
   The Prisma query engine binary (`query_engine-windows.dll.node`) is locked while Node processes are active. Any operations regenerating Prisma clients or running reset migrations require terminating running dev processes first.

---

## 8. Deviations from the Prompt

None. All Phase 6B requirements, constraints, and instructions were executed strictly as specified:

- Exactly 1 new migration created (`remove_evidence`) without altering previous migrations.
- Complete removal of models, enums, relations, seed data, routes, controllers, permissions, UI tabs, and sidebar links.
- 0 unpermitted occurrences of target terms across the repository.
- No other features were built or altered.

---

## 9. Ready-for-Next-Phase Checklist

- [x] Precheck completed: `git status` clean and baseline recorded.
- [x] Models `Evidence` and `EvidenceCustodyLog` removed from `schema.prisma`.
- [x] Enums `EvidenceType`, `EvidenceStatus`, and `CustodyAction` removed.
- [x] Relation fields removed from `Case` and `User`.
- [x] Migration `remove_evidence` created and applied.
- [x] `npm run db:reset` runs cleanly on MySQL 26.7.0.
- [x] Evidence seeding removed from `seed.js`.
- [x] `verify.js` updated to 10 tables; `npm run db:verify` PASS with `users: 7`.
- [x] Global test teardown updated; 0 row leaks across all 10 tables.
- [x] Permissions `evidence.submit` and `evidence.review` removed from server and client.
- [x] Backend controller cleaned of `evidence` include.
- [x] Frontend sidebar, routes, and Case Detail tabs updated (5 tabs remain).
- [x] `docs/DATABASE.md`, `docs/CASES.md`, and `docs/AUTH.md` updated.
- [x] `PROJECT_CONTEXT.md` and `README.md` updated with scope change note and revised roadmap.
- [x] Whole-repository search completed and documented.
- [x] `npm run lint` and `npm run format:check` pass cleanly.
- [x] `npm test` passes all 99 tests across 3 suites.
- [x] `npm run build --prefix client` succeeds.
- [x] `/api/v1/health` verified and operational.
