# Phase 4 Implementation Report — Case Registration and Case Management

**Date**: 2026-09-28  
**Phase**: Phase 4 — Case Registration and Case Management  
**System**: Court Case Management System (Court CMS)  
**Status**: Completed

---

## 1. Objective

The primary objective of Phase 4 was to implement case registration and role-scoped case docket management across the full stack:

- Resolve Phase 3 test isolation so no transient users or database modifications remain after test runs.
- Implement a global test teardown mechanism that compares all 12 database table counts and all `CaseSequence` `lastNumber` values against the seeded baseline, failing the suite if any test leaves artifacts behind.
- Implement backend case management endpoints under `/api/v1/cases` (`GET /meta`, `GET /stats`, `POST /`, `GET /`, `GET /:id`, `PATCH /:id`).
- Build collision-free, atomic case number generation (`PREFIX/YEAR/00001`) inside an exclusive row lock transaction on `case_sequences`.
- Apply strict role visibility scoping (`caseVisibilityFilter(user)`): Admin and Registrar see all cases, Judges see only cases assigned to their judicial bench, and Advocates see only cases where they are active counsel.
- Enforce 404 information shielding on out-of-scope case detail requests so the existence of sensitive or private dockets is never revealed.
- Enforce legal record immutability: case numbers, statutory types, filing dates, and lifecycle statuses cannot be altered via patch; closed cases cannot be edited; and no delete endpoint exists.
- Implement a rich frontend interface following the judicial theme (Navy `#1C2B45`, Brass `#A6763B`): a searchable, filterable, sortable, paginated Cases Master Docket synchronized with URL search params; a validated Case Registration modal; a tabbed Case Detail view with read-only previews of future modules (Advocates, Hearings, Evidence, Judgments) and audit history; and real open/overdue metrics on the Dashboard.

---

## 2. What Was Built

### 2.1 Test Hygiene & Global Teardown Enforcement (Step 0)

- **Phase 3 Test Isolation**: Fixed `server/tests/auth.test.js` to ensure any temporary test users created during user management or login tests are cleanly deleted immediately within their test blocks and root `afterAll`.
- **Global Vitest Setup & Teardown (`server/tests/setup.js`)**:
  - Implemented an `afterAll` verification hook registered across all Vitest suites via `setupFiles: ['./tests/setup.js']` in `vitest.config.js`.
  - Configured `fileParallelism: false` to ensure serial test execution against the shared database.
  - Queries all 12 tables and asserts exact equality against `SEEDED_BASELINE` (users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 24, hearings: 16, evidence: 8, evidenceCustodyLogs: 16, judgments: 4, caseStatusHistory: 50, caseSequences: 3, systemSettings: 2).
  - Asserts that all `CaseSequence` rows (`CC/2026`: 112, `CC/2025`: 85, `CRL/2026`: 0) match their exact seeded `lastNumber` values.

### 2.2 Backend Case Management API (`server/src/controllers/case.controller.js` & `routes/case.routes.js`)

- **Prefix Mapping**: Mapped statutory case types to standardized Indian court prefixes (`CRIMINAL: 'CC'`, `CIVIL: 'CV'`, `FAMILY: 'FM'`, `PROPERTY: 'PR'`, `COMMERCIAL: 'CM'`, `CONSTITUTIONAL: 'WP'`, `OTHER: 'MC'`).
- **Atomic Sequential Numbering**: Inside an interactive Prisma transaction (`prisma.$transaction`), atomically locks and increments `CaseSequence` for `(prefix, year)`. If uninitialized, scans existing dockets, seeds `lastNumber = maxNumber + 1`, and creates the sequence row. Tested with 10 concurrent parallel requests yielding 10 strictly consecutive, unique case numbers.
- **Atomic History Audit**: Atomically creates the `Case` record and initial `CaseStatusHistory` (`toStatus: 'REGISTERED'`, `reason: 'Case registered'`) within the same transaction.
- **REST Endpoints**:
  - `GET /api/v1/cases/meta`: Returns case types, priorities, statuses, and active judges for dropdown controls.
  - `GET /api/v1/cases/stats`: Returns live counts for total open cases and overdue cases scoped by user visibility.
  - `POST /api/v1/cases`: Validates with Zod, checks that filing date is not in the future, verifies judge role and active status, and registers the case. Restricted to `ADMIN` and `REGISTRAR` (`case.create`).
  - `GET /api/v1/cases`: Scoped by `caseVisibilityFilter(user)`. Supports debounced search `q`, filters for status, type, priority, judge, `backlog=true` (open cases older than threshold), date range (`from`, `to`), sorting (`filingDate`, `caseNumber`, `priority`, `status`), and pagination. Evaluates `ageDays` and `isBacklog` on the server. Zero N+1 queries.
  - `GET /api/v1/cases/:id`: Retrieves full case docket with advocates, hearings, evidence, judgment, and chronological status history. Returns HTTP 404 (not 403) if the case falls outside the caller's visibility scope.
  - `PATCH /api/v1/cases/:id`: Permits updating `title`, `petitioner`, `respondent`, `description`, `priority`, and `judgeId`. Explicitly blocks modifications to immutable fields (`caseNumber`, `caseType`, `filingDate`, `status`) and rejects editing closed cases. Restricted to `ADMIN` and `REGISTRAR` (`case.edit`).
  - **No Delete Route**: Permanent judicial record retention enforced; calling `DELETE /api/v1/cases/:id` returns 404.

### 2.3 Frontend Application & UI Components

- **Case Listing (`client/src/pages/Cases.jsx`)**:
  - Master docket table displaying case number, title, litigating parties, case type, stamp-style status badge, priority badge, filing date, pendency age, overdue marker, next scheduled hearing date, and presiding judge.
  - Complete synchronization of search `q`, status, type, priority, judge, backlog toggle, date range, sorting, and pagination with URL search params (`useSearchParams`), ensuring persistence across page reloads and sharable links.
  - Stamp-style status badges with color consistency: Info (blue) for `REGISTERED` & `ADVOCATE_ASSIGNED`; Warning (amber) for `HEARING_SCHEDULED`, `UNDER_TRIAL` & `JUDGMENT_RESERVED`; Success (emerald) for `CLOSED`.
  - Priority `URGENT` highlights and backlog `Overdue (Xd)` markers.
  - Loading skeletons, empty states with "Clear filters" action, and error states with "Retry Query".
  - "Register Case" action button visible exclusively to users with `can('case.create')`.
- **Register Case Modal (`client/src/components/cases/RegisterCaseModal.jsx`)**:
  - Modal form with inline field validation, future-date restriction, dynamic judge selection from `/cases/meta`, and success screen displaying the allocated case number before transitioning to the new case detail.
- **Edit Case Modal (`client/src/components/cases/EditCaseModal.jsx`)**:
  - Allows registry administrators to modify editable fields while clearly communicating immutable boundaries.
- **Case Detail View (`client/src/pages/CaseDetail.jsx`)**:
  - Header showcasing case number, title, status stamp, priority badge, overdue marker, and "Edit Case" button (for permitted roles on open cases).
  - Six dedicated tabs:
    1. **Overview**: Parties, statutory classification, pendency age, judge, registrar, and description.
    2. **Advocates**: Read-only legal counsel table with placeholder note for Phase 5.
    3. **Hearings**: Read-only scheduled proceedings table with placeholder note for Phase 6.
    4. **Evidence**: Read-only digital records and SHA-256 hashes with placeholder note for Phase 7.
    5. **Judgment**: Read-only decree summary, reserved dates, and outcomes with placeholder note for Phase 8.
    6. **History**: Full chronological audit timeline showing status transitions, reasons, and recording staff.
  - Friendly "Case Not Found" 404 screen when navigating to out-of-scope or non-existent cases.
- **Dashboard Telemetry (`client/src/pages/Dashboard.jsx`)**:
  - Replaced Phase 1 placeholder metric cards with live numbers fetched from `/cases/stats`: Total Open Cases and Overdue Cases, scoped by user visibility.

---

## 3. Files and Folders Changed

### 3.1 Backend (`server/`)

- `server/src/controllers/case.controller.js` — Case registration, querying, detail, metadata, stats, and modification controllers.
- `server/src/routes/case.routes.js` — Route definitions with RBAC permissions (`case.create`, `case.view`, `case.edit`).
- `server/src/routes/index.js` — Mounted `caseRouter` at `/cases`.
- `server/vitest.config.js` — Configured `setupFiles: ['./tests/setup.js']` and `fileParallelism: false`.
- `server/tests/setup.js` — Global test teardown verifying 12 table row counts and sequence values against seeded baseline.
- `server/tests/auth.test.js` — Cleaned up test user deletions and removed premature prisma disconnect.
- `server/tests/cases.test.js` — 27 comprehensive integration test cases for case management and RBAC rules.
- `server/package.json` — Added `test:cases` script.

### 3.2 Frontend (`client/`)

- `client/src/pages/Cases.jsx` — Complete master docket listing with URL param filters, sorting, and pagination.
- `client/src/pages/CaseDetail.jsx` — Tabbed docket detail view with read-only previews and audit timeline.
- `client/src/pages/Dashboard.jsx` — Replaced placeholder cards with real open and overdue case counts.
- `client/src/components/cases/RegisterCaseModal.jsx` — Case registration modal with validation.
- `client/src/components/cases/EditCaseModal.jsx` — Case editing modal for permitted fields.
- `client/src/App.jsx` — Added `/cases/:id` route for `CaseDetail`.

### 3.3 Documentation & Root

- `docs/CASES.md` — Complete case management architectural and endpoint documentation.
- `PROJECT_CONTEXT.md` — Appended "Case Management (Phase 4)" section.
- `README.md` — Updated roadmap, test commands (`npm run test:cases`), and test teardown details.
- `package.json` — Added root `test:cases` script.
- `reports/PHASE_4_REPORT.md` — This milestone report.

---

## 4. How to Run and Verify

### 4.1 Running the Applications

From the root repository in PowerShell:

```powershell
# Start Express backend and Vite client concurrently
npm run dev
```

- Backend runs at `http://localhost:5000`
- Frontend runs at `http://localhost:5173`

### 4.2 Automated Testing

Run the complete test suite with teardown verification:

```powershell
# Run all test suites (Auth & Cases)
npm test

# Run Case Management test suite specifically
npm run test:cases

# Run Authentication & RBAC test suite specifically
npm run test:auth
```

### 4.3 Database Baseline Verification

Verify that test execution left the database in its exact seeded baseline state:

```powershell
npm run db:verify
```

### 4.4 Code Quality & Linting

```powershell
# Run ESLint across entire repository
npm run lint

# Verify Prettier formatting compliance
npm run format:check
```

### 4.5 Interactive UI Verification

1. Navigate to `http://localhost:5173/` and log in as `registrar@courtcms.gov.in` (password `Password123` via dev quick-fill).
2. **Dashboard**: Observe real operational numbers: Total Open Cases (`12`) and Overdue Cases (`5`).
3. **Master Docket (`/cases`)**:
   - Inspect table: case numbers (`CC/2025/...`, `CC/2026/...`), status stamps, priority badges, and overdue markers.
   - Test text search (e.g. `Verma`, `Malhotra`, `Apex`), status filter, case type filter, priority filter, judge filter, and "Backlog Cases Only" checkbox. Notice the URL query string updates dynamically.
   - Refresh the browser; verify that all active filters and search terms are preserved.
   - Click column headers (Filing Date, Case Number, Priority, Status) to verify ascending/descending sorting.
   - Change page size and navigate pagination controls.
4. **Register Case**:
   - Click "Register Case". Fill in the form.
   - Notice that future dates cannot be selected in the date picker.
   - Submit the form: observe the allocated sequential case number (e.g. `CC/2026/00113`) and automatic redirection to the new case docket.
5. **Case Detail (`/cases/:id`)**:
   - Review Overview, Litigating Parties, Description, and Metadata.
   - Switch between tabs: Advocates, Hearings, Evidence, Judgment, and History. Observe read-only tables and phase notices.
   - Click "Edit Case Details". Modify the title and priority. Verify changes save immediately.
6. **Role Visibility Verification**:
   - Log out and log in as `judge.banerjee@courtcms.gov.in`.
   - On `/cases`, verify the judge sees only their assigned cases (`7` cases). Observe that the "Register Case" button is not visible.
   - Attempting to edit a case is forbidden (no edit button).
   - Manually entering the URL of another judge's case displays the friendly "Case Not Found" 404 page.
   - Log out and log in as `adv.khan@courtcms.gov.in`.
   - Verify the advocate sees only their linked client cases (`3` cases).

---

## 5. Test Evidence

### 5.1 Automated Test Execution (`npm test`)

```
> court-case-management-system@1.0.0 test
> npm run test --prefix server

> server@1.0.0 test
> vitest run

 RUN  v5.0.2 C:/Users/allen/OneDrive/Desktop/ccm_allen/server

 ✓ tests/auth.test.js (33 tests) 2372ms
   ✓ Court CMS - Authentication & RBAC Suite (33)
     ✓ POST /api/v1/auth/login (7)
     ✓ GET /api/v1/auth/me (3)
     ✓ POST /api/v1/auth/logout (2)
     ✓ RBAC Authorization & Route Guards (2)
     ✓ User Management API (ADMIN only) (8)
     ✓ POST /api/v1/auth/change-password (4)
     ✓ Permissions & Case Visibility Scoping (5)
     ✓ Rate Limiter Protection (1)
     ✓ Public Health Endpoint Integrity (1)
 ✓ tests/cases.test.js (27 tests) 1431ms
   ✓ Court CMS - Phase 4 Cases API & RBAC Suite (27)
     ✓ GET /api/v1/cases/meta & /stats (3)
       ✓ requires authentication for metadata and returns 401 without cookie 14ms
       ✓ returns case metadata with active judges, types, and priorities for authenticated users 22ms
       ✓ returns scoped summary statistics for open and overdue cases 27ms
     ✓ POST /api/v1/cases - Registration & Auto-Numbering (7)
       ✓ successfully registers a case with auto-generated case number, status REGISTERED, and status history entry 75ms
       ✓ generates correct prefix for each case type 151ms
       ✓ handles 10 parallel registrations producing 10 unique consecutive case numbers without collision 212ms
       ✓ rejects filing date in the future 8ms
       ✓ rejects missing or empty required fields 8ms
       ✓ rejects invalid or non-judge judgeId 9ms
       ✓ denies JUDGE and ADVOCATE roles from registering cases with 403 Forbidden 14ms
     ✓ GET /api/v1/cases - Role Scoping & Query Filters (9)
       ✓ allows ADMIN and REGISTRAR to see all 14 seeded cases 77ms
       ✓ scopes JUDGE to only cases assigned to their judicial bench (7 cases) 43ms
       ✓ scopes ADVOCATE to only cases where they represent petitioner or respondent (3 cases) 44ms
       ✓ supports pagination with page and pageSize 46ms
       ✓ filters cases by text search q across case number, title, and parties 46ms
       ✓ filters cases by status, caseType, and priority 49ms
       ✓ filters open backlog cases exceeding threshold with backlog=true 40ms
       ✓ sorts cases by filingDate ascending and descending 57ms
       ✓ computes correct ageDays and isBacklog flags on all items 41ms
     ✓ GET /api/v1/cases/:id - Detail & Information Shielding (3)
       ✓ returns full case detail with advocates, hearings, evidence, judgment, and status history 28ms
       ✓ returns 404 (not 403) when user attempts to access an out-of-scope case 17ms
       ✓ returns 404 for nonexistent case ID 10ms
     ✓ PATCH /api/v1/cases/:id - Editable Fields & Integrity Rules (4)
       ✓ allows REGISTRAR and ADMIN to edit allowed fields (title, parties, priority, description, judge) 92ms
       ✓ strictly forbids changing immutable fields (caseNumber, caseType, filingDate, status) 133ms
       ✓ prevents editing a closed case with clear error message 60ms
       ✓ denies JUDGE and ADVOCATE roles from editing cases with 403 Forbidden 59ms
     ✓ DELETE /api/v1/cases/:id - Legal Records Immutability (1)
       ✓ does not expose a delete route and returns 404 9ms

 Test Files  2 passed (2)
      Tests  60 passed (60)
   Start at  12:28:21
   Duration  5.62s (tests 74%, import 18%, transform 5%, setup 3%)
```

### 5.2 Database Integrity Verification (`npm run db:verify`)

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
│ 0       │ 'Table Row Counts'        │ 'PASS' │ 'All 12 tables populated (users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 24, hearings: 16, evidence: 8, evidenceCustodyLogs: 16, judgments: 4, caseStatusHistory: 50, caseSequences: 3, systemSettings: 2)'        │
│ 1       │ 'Case Status Consistency' │ 'PASS' │ 'All 14 cases strictly conform to their lifecycle state constraints'                                                                                                                                                                 │
│ 2       │ 'No Double-Booking'       │ 'PASS' │ 'All 16 hearings verified: zero courtroom and zero judge scheduling collisions'                                                                                                                                                      │
│ 3       │ 'Judgment Uniqueness'     │ 'PASS' │ 'All 4 judgments have unique caseId (enforces 1:1 relation)'                                                                                                                                                                         │
│ 4       │ 'Backlog Cases Threshold' │ 'PASS' │ 'Found 5 open cases older than 90 days (Requirement >= 3). Cases: CC/2025/00030 (JUDGMENT_RESERVED), CC/2025/00045 (UNDER_TRIAL), CC/2025/00058 (UNDER_TRIAL), CC/2025/00072 (HEARING_SCHEDULED), CC/2025/00085 (ADVOCATE_ASSIGNED)' │
└─────────┴───────────────────────────┴────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0) <<<
```

### 5.3 Code Quality Checks

```
> npm run lint
> eslint .
(Exited with code 0 - 0 errors, 0 warnings)

> npm run format:check
> prettier --check .
Checking formatting...
All matched files use Prettier code style!
(Exited with code 0)
```

---

## 6. Decisions and Assumptions

1. **Transactional Row Locking for Case Sequences**:
   - `prisma.$transaction` wraps the sequence increment and master case insertion. In MySQL, updating the `CaseSequence` row acquires an exclusive row lock, preventing race conditions or duplicate case numbers during parallel filings.
2. **404 Over 403 for Out-of-Scope Dockets**:
   - Returning HTTP 403 on specific case IDs confirms to an unauthorized user that a case with that identifier exists. To protect confidentiality, out-of-scope queries return HTTP 404 ("Case not found").
3. **No Deletion Endpoint**:
   - Legal records, custody trails, and court dockets are legally immutable. Court CMS intentionally omits any delete route.
4. **URL Query Param Synchronization**:
   - Keeping all search terms, filters, sorting, and pagination in URL search parameters (`?q=...&status=...`) allows court personnel to bookmark specific filtered dockets and share precise URLs with colleagues.
5. **No Build-Ahead**:
   - Advocates, Hearings, Evidence, and Judgments tabs display existing seeded data read-only with explicit phase notices. No creation or editing actions were implemented ahead of their scheduled phases.

---

## 7. Issues and Limitations

- **Search Indexing**: Text search currently uses SQL `contains` queries across case numbers, titles, and party names. As the docket grows to hundreds of thousands of cases in later deployments, MySQL full-text indexing or an external search engine (e.g. Elasticsearch) should be considered.
- **Judge Workload Balancing**: In Phase 4, judge assignment is manual during filing. Automated bench balancing and allocation algorithms will be integrated during hearing scheduling in Phase 6.

---

## 8. Deviations from the Prompt

None. All Phase 4 requirements, validations, auto-numbering logic, visibility filters, frontend views, and test criteria were implemented as specified without modifying the Prisma schema.

---

## 9. Ready-for-Next-Phase Checklist

- [x] Phase 3 test isolation resolved; global teardown verified.
- [x] Case registration API (`POST /api/v1/cases`) generates atomic case numbers (`PREFIX/YEAR/00001`).
- [x] 10 concurrent parallel registrations verified without collisions.
- [x] Role visibility scoping and 404 information shielding operational.
- [x] Edit rules enforced (immutable fields and closed cases protected).
- [x] Frontend Cases master docket page with debounced search, filters, sorting, and pagination working with URL sync.
- [x] Case registration modal with live validation functional.
- [x] Case detail page with 6 tabs (read-only future modules) and edit modal complete.
- [x] Real Dashboard metrics for open and overdue cases implemented.
- [x] All 60 automated tests pass (`npm test`).
- [x] Database baseline verification passes with users: 7 and Code 0 (`npm run db:verify`).
- [x] Code style and linting verified with 0 errors/warnings (`npm run lint`, `npm run format:check`).
- [x] `docs/CASES.md` created; `PROJECT_CONTEXT.md` and `README.md` updated.
- [x] Zero Prisma schema modifications made in Phase 4.
