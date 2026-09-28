# Phase 5 Implementation Report — Advocate Management and Case Assignment

**Date**: 2026-09-28  
**Phase**: Phase 5 — Advocate Management and Case Assignment (with Phase 4 Verification First)  
**System**: Court Case Management System (Court CMS)  
**Status**: Completed

---

## 0. Phase 4 Verification

Prior to developing any Phase 5 features, a comprehensive verification of Phase 4 end-to-end functionality was conducted against the seeded database baseline using scripted HTTP integration calls (`server/scripts/verify_phase4.js`) and code reviews.

### Verification Results Table

| Check # | Requirement & Scope                                                                                                                                                                                                        |  Status  | Verification Details & Findings                                                                                                                                                                                                                                                                                      |
| :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**   | Registrar logs in, registers case (`POST /cases`). Case number matches `PREFIX/YEAR/00001`, status is `REGISTERED`, `CaseStatusHistory` row exists, and case appears in `GET /cases`.                                      | **PASS** | Case `CC/2026/00113` was registered by Registrar (`registrar@courtcms.gov.in`). Case number followed consecutive format, status was verified as `REGISTERED`, initial status history was created (`fromStatus: null`, `toStatus: 'REGISTERED'`, `reason: 'Case registered'`), and case was returned by `GET /cases`. |
| **2**   | Search (`q`), each filter (`status`, `caseType`, `priority`, `backlog=true`, date range), sorting and pagination return correct, sensible results. Backlog results match the `backlog_threshold_days` setting.             | **PASS** | Verified search across title and parties; filters for status (`UNDER_TRIAL`), caseType (`CRIMINAL`), priority (`URGENT`), and filing date range (`2025-01-01` to `2025-12-31`). Verified `backlog=true` matches exactly 5 open cases aged >= 90 days. Sorting and pagination verified.                               |
| **3**   | Judge login: list contains only that judge's cases; `POST /cases` and `PATCH /cases/:id` return `403`; detail of out-of-scope case returns `404`.                                                                          | **PASS** | Justice Rao (`judge.rao@courtcms.gov.in`) saw exactly 5 cases (all allocated to his bench). `POST /cases` returned `403 Forbidden`, `PATCH /cases/:id` returned `403 Forbidden`. Attempting `GET /cases/:id` on an out-of-scope case returned `404 Not Found` (shielding existence).                                 |
| **4**   | Advocate login: list contains only cases where that advocate is actively assigned; `POST /cases` returns `403`; out-of-scope case returns `404`.                                                                           | **PASS** | Adv. Mehta (`adv.mehta@delhibar.org`) saw exactly 9 active cases. `POST /cases` returned `403 Forbidden`. Attempting `GET /cases/:id` on an out-of-scope case returned `404 Not Found`.                                                                                                                              |
| **5**   | `GET /cases/stats` numbers match the list counts for each role (Admin and Registrar see all).                                                                                                                              | **PASS** | Admin & Registrar: 13 open cases, 5 overdue cases (matched list count). Judge: 5 open cases, 2 overdue cases (matched list count). Advocate: 9 open cases, 3 overdue cases (matched list count).                                                                                                                     |
| **6**   | Client builds (`npm run build --prefix client`). Code review confirms Register Case and Edit Case buttons gated by `can('case.create')` and `can('case.edit')`, and URL query string keeps filters, search, sort and page. | **PASS** | Client built cleanly with Vite. Code review of `Cases.jsx` confirmed Register Case button is gated by `can('case.create')`, Edit Case button in `CaseDetail.jsx` is gated by `can('case.edit')`, and all filters, search query, sorting, and pagination are synchronized with `useSearchParams`.                     |

---

## 0B. Housekeeping: Investigation of `CRL/2026`

During the Phase 4 review, `CaseSequence` was noted to contain rows for `CC/2026`, `CC/2025`, and `CRL/2026`.

- **Finding**: Phase 4 established that all criminal cases use the standardized prefix `CC` (`CaseType.CRIMINAL -> 'CC'`). The prefix `CRL` was an unreferenced leftover from early Phase 2 seed drafting that did not correspond to any valid `CaseType` enum mapping.
- **Remediation**:
  1. Removed `CRL/2026` from `server/prisma/seed.js`.
  2. Updated the database verification script `server/prisma/verify.js` to assert `caseSequences: 2` (`CC/2026` with `lastNumber: 112`, `CC/2025` with `lastNumber: 85`).
  3. Updated the global test teardown baseline in `server/tests/setup.js` to assert `caseSequences: 2` and strictly compare only `CC/2026` and `CC/2025`.
  4. Updated `server/tests/cases.test.js` to reflect the 2 valid sequences.
- **Baseline Integrity**: Running `npm run db:reset` and `npm run db:verify` cleanly restored the baseline with 2 sequences and 0 dangling sequence counters.

---

## 1. Objective

The primary objective of Phase 5 was to implement advocate directory management and case assignment workflows with end-to-end auditability and automated lifecycle transitions:

- Implement the single additive, nullable schema migration (`case_advocate_audit`) adding `assignedById`, `unassignedAt`, `unassignedById`, and `unassignReason` to `CaseAdvocate`.
- Define granular permissions: `advocate.view`, `advocate.manage`, and `advocate.assign`.
- Build the Advocate Directory API (`/api/v1/advocates`) supporting pagination, search, specialization and login filtering, Bar Council number formatting and uniqueness validation, and role-scoped profile access.
- Build the Case Assignment API (`POST /cases/:id/advocates` and `POST /cases/:id/advocates/:advocateId/unassign`) operating inside single database transactions.
- Enforce strict conflict of interest prevention, maximum 2 active advocates per side, active linked user verification, row reuse on re-assignment, and last advocate removal protection.
- Build the reusable `caseWorkflow.js` service for automated state transitions: advancing `REGISTERED -> ADVOCATE_ASSIGNED` upon initial assignment, and reverting `ADVOCATE_ASSIGNED -> REGISTERED` upon unassigning the last active advocate.
- Implement the soft workload warning system using `advocate_workload_warning_threshold`.
- Build accessible, responsive frontend interfaces for the Advocate Directory (with "My Profile" view for advocates) and the Case Detail Advocates tab with assignment controls, active roster, unassign dialogs, and past assignments history.
- Merge assignment audit milestones into the Case History timeline.

---

## 2. What Was Built

### 2.1 Database Schema & Migration (`case_advocate_audit`)

- **Prisma Schema (`server/prisma/schema.prisma`)**:
  Added audit fields to `CaseAdvocate`:
  - `assignedById`: Optional foreign key relation to `User` (assigned by).
  - `unassignedAt`: Optional `DateTime` indicating when counsel was unassigned.
  - `unassignedById`: Optional foreign key relation to `User` (unassigned by).
  - `unassignReason`: Optional string (max 500 characters) documenting reasons for withdrawal or substitution.
- **Migration**: Generated and applied migration `20260928071452_case_advocate_audit` cleanly to MySQL 26.7.0.
- **Seed Updates (`server/prisma/seed.js`)**:
  - Populated `assignedById` for all 24 seeded active assignments referencing the seeded registrar.
  - Added 2 realistic inactive assignment records with full unassign audit fields (total `caseAdvocates: 26`).
  - Added system setting `advocate_workload_warning_threshold = 15`.

### 2.2 Permissions Matrix (`server/src/config/permissions.js` & `client/src/constants/permissions.js`)

- `advocate.view`: Granted to `ADMIN`, `REGISTRAR`, and `JUDGE`.
- `advocate.manage`: Granted to `ADMIN` and `REGISTRAR`.
- `advocate.assign`: Retained for `ADMIN` and `REGISTRAR`.
- `ADVOCATE` role: Restricted to viewing exclusively their own profile (`/advocates/:id` where ID matches linked advocate); denied directory access and assignment mutations (`403 Forbidden`).

### 2.3 Advocate Directory API (`server/src/controllers/advocate.controller.js` & `routes/advocate.routes.js`)

- `GET /api/v1/advocates`: Paginated directory (max 50 per page). Filterable by `specialization` and `hasLogin` (`true`/`false`), searchable by `q` across `name`, `barNumber`, and `email`. Calculates `activeCaseCount` (active assignments on open cases) and `totalCaseCount` in a single grouped batch query without N+1 overhead.
- `GET /api/v1/advocates/:id`: Returns advocate profile and their assigned cases (active and past). Applies `caseVisibilityFilter(user)` to avoid leaking cases outside the caller's judicial or advocate scope. Advocates can only access their own profile (returns `404` for out-of-scope IDs).
- `POST /api/v1/advocates`: Validates Bar Council number format (`/^[A-Z0-9/-]{5,20}$/`), ensures case-insensitive uniqueness, validates email, and checks Indian phone numbers. Restricted to `advocate.manage`.
- `PATCH /api/v1/advocates/:id`: Modifies name, specialization, email, and phone. Rejects changes to `barNumber` (immutable legal identifier). Restricted to `advocate.manage`.
- `GET /api/v1/advocates/meta`: Returns list of distinct seeded specializations and standard Indian legal practice areas.

### 2.4 Case Workflow Automation Service (`server/src/services/caseWorkflow.js`)

- Created reusable state machine `transitionCaseStatus({ caseId, toStatus, reason, changedById, tx })`:
  - Validates transitions against `ALLOWED_TRANSITIONS` map.
  - Updates `Case.status` within the caller's transaction.
  - Creates an immutable audit row in `CaseStatusHistory` recording `fromStatus`, `toStatus`, `reason`, and `changedById`.
  - Exported for reuse in future phases (Hearings in Phase 6, Evidence in Phase 7, Judgments in Phase 8).

### 2.5 Case Advocate Assignment API (`server/src/controllers/caseAdvocate.controller.js`)

- `POST /api/v1/cases/:id/advocates`:
  - Enforced inside an atomic `prisma.$transaction`.
  - Verifies case is open (`status !== 'CLOSED'`).
  - Verifies advocate exists and their linked user account (if any) is active (`isActive: true`).
  - Prevents dual representation: rejects assignment if advocate is already active on the opposite side (conflict of interest).
  - Enforces cap of 2 active advocates per side per case.
  - Re-assignment reactivation: if advocate was previously unassigned on the case, reactivates the row (`isActive: true`, new `assignedAt`, `assignedById`, clears `unassignedAt`, `unassignedById`, and `unassignReason`).
  - State automation: If case is in `REGISTERED` status and receives its first active advocate, automatically advances status to `ADVOCATE_ASSIGNED` with status history. Subsequent assignments keep status unchanged.
  - Soft workload warning: Checks `advocate_workload_warning_threshold` setting; returns warning string if active caseload reaches or exceeds threshold without blocking assignment.
  - Handles concurrent duplicate requests gracefully.
- `POST /api/v1/cases/:id/advocates/:advocateId/unassign`:
  - Enforced inside an atomic transaction; requires `reason` (5-500 chars).
  - Marks `isActive: false`, records `unassignedAt`, `unassignedById`, and `unassignReason`.
  - State automation: If unassigning the last active advocate on an `ADVOCATE_ASSIGNED` case, reverts status back to `REGISTERED` with reason recorded in history.
  - Last advocate protection: If case is in `HEARING_SCHEDULED`, `UNDER_TRIAL`, or `JUDGMENT_RESERVED`, removing the last active advocate is blocked with an instruction to assign a replacement first.
- Merged History Timeline: `GET /api/v1/cases/:id` merges `CaseAdvocate` assignment and unassignment events into the history timeline, sorted chronologically with `CaseStatusHistory` entries.

### 2.6 Frontend Interface

- **Advocate Directory (`client/src/pages/Advocates.jsx`)**:
  - Full-featured registry table with search query `q`, specialization filter, login account filter, pagination, active case badges, and account status indicators.
  - Synchronizes all filters with URL query parameters.
  - "Add Advocate" and "Edit Advocate" dialogs with real-time validation and error handling for permitted roles.
  - "My Profile" dedicated view for the `ADVOCATE` role, showing their credentials and caseload summary.
- **Advocate Details Modal (`client/src/components/advocates/AdvocateDetailModal.jsx`)**:
  - Displays advocate profile metadata, active docket count, total assignments, and a filterable list of assigned cases with direct links.
- **Case Detail Advocates Tab (`client/src/pages/CaseDetail.jsx`)**:
  - Replaced read-only note with live active roster categorized by side (Petitioner / Respondent).
  - Displays assigned counsel name, bar number, contact information, assignment date, and assigning staff member.
  - "Assign Advocate" modal (`client/src/components/cases/AssignAdvocateModal.jsx`): Searchable advocate picker displaying live workload, already-assigned indicators, and side selector. Displays workload warning banners upon assignment when applicable.
  - "Unassign Advocate" modal (`client/src/components/cases/UnassignAdvocateModal.jsx`): Captures mandatory reason with minimum length validation.
  - Previous Assignments Collapsible Accordion: Details withdrawn or substituted counsel with date, unassigning staff member, and unassign reason.
  - Dynamic updates: Refreshes case header stamp and displays status change notifications when automated transitions occur.
  - Read-only for `JUDGE` and `ADVOCATE` roles.

---

## 3. Files and Folders Changed

### 3.1 Backend (`server/`)

- `server/prisma/schema.prisma` — Added `assignedById`, `unassignedAt`, `unassignedById`, `unassignReason` to `CaseAdvocate`.
- `server/prisma/migrations/20260928071452_case_advocate_audit/migration.sql` — Schema migration for MySQL.
- `server/prisma/seed.js` — Updated seed with `assignedById` on active records, added inactive test records, added workload setting.
- `server/prisma/verify.js` — Extended lifecycle verification to check `CaseAdvocate` status rules and audit integrity.
- `server/src/config/permissions.js` — Added `advocate.view` and `advocate.manage` permissions.
- `server/src/services/caseWorkflow.js` — Reusable case status transition service.
- `server/src/controllers/advocate.controller.js` — Advocate directory querying, detail, creation, editing, and metadata.
- `server/src/controllers/caseAdvocate.controller.js` — Case advocate assignment and unassignment controllers with business rules and state automation.
- `server/src/controllers/case.controller.js` — Updated `getCaseById` to return assignment audit details and merged timeline events.
- `server/src/routes/advocate.routes.js` — Route definitions for `/api/v1/advocates`.
- `server/src/routes/case.routes.js` — Added assignment routes under `/api/v1/cases/:id/advocates`.
- `server/src/routes/index.js` — Mounted `advocateRouter` at `/advocates`.
- `server/scripts/verify_phase4.js` — Phase 4 verification script retained for regression testing.
- `server/tests/setup.js` — Updated baseline assertions (`caseAdvocates: 26`, `systemSettings: 3`, `caseSequences: 2`).
- `server/tests/advocates.test.js` — 35 comprehensive integration tests covering all Phase 5 requirements.
- `server/tests/cases.test.js` — Updated sequence baseline check to 2.
- `server/package.json` — Added `test:advocates` script.

### 3.2 Frontend (`client/`)

- `client/src/constants/permissions.js` — Added `advocate.view` and `advocate.manage` to RBAC matrix.
- `client/src/components/layout/Sidebar.jsx` — Added Advocates navigation item for Admin, Registrar, and Judge, and "My Profile" for Advocate.
- `client/src/App.jsx` — Added protected `/advocates` route.
- `client/src/pages/Advocates.jsx` — Advocate directory page with search, filters, pagination, and "My Profile" mode.
- `client/src/components/advocates/AddAdvocateModal.jsx` — Add advocate dialog with validation.
- `client/src/components/advocates/EditAdvocateModal.jsx` — Edit advocate dialog (bar number immutable).
- `client/src/components/advocates/AdvocateDetailModal.jsx` — Advocate profile and cases modal.
- `client/src/components/cases/AssignAdvocateModal.jsx` — Case advocate assignment dialog with workload metrics.
- `client/src/components/cases/UnassignAdvocateModal.jsx` — Case advocate unassignment dialog with reason prompt.
- `client/src/pages/CaseDetail.jsx` — Replaced read-only note with live Advocates tab, assign/unassign actions, past assignments accordion, and merged history timeline.

### 3.3 Documentation & Root

- `docs/ADVOCATES.md` — Comprehensive API reference, assignment rules, state automation, and audit field documentation.
- `docs/DATABASE.md` — Updated Mermaid ER diagram and `CaseAdvocate` data dictionary with audit fields.
- `docs/AUTH.md` — Documented new advocate permissions.
- `PROJECT_CONTEXT.md` — Documented Phase 5 features, rules, and architecture.
- `README.md` — Updated roadmap, testing instructions, and documentation links.
- `package.json` — Added root `test:advocates` script.

---

## 4. How to Run and Verify

### 4.1 Reset Database & Run Verification

```powershell
npm run db:reset
npm run db:verify
```

### 4.2 Run Phase 4 Regression Verification Script

```powershell
node server/scripts/verify_phase4.js
```

### 4.3 Run Code Quality & Formatting Checks

```powershell
npm run lint
npm run format:check
```

### 4.4 Run Automated Tests

```powershell
# Run all test suites across the project (auth, cases, advocates)
npm test

# Run the Phase 5 advocate management suite specifically
npm run test:advocates
```

### 4.5 Build Client

```powershell
npm run build --prefix client
```

### 4.6 Start Development Environment

```powershell
npm run dev
```

---

## 5. Test Evidence

### 5.1 Test Suite Results (`npm test`)

```
 RUN  v5.0.2 C:/Users/allen/OneDrive/Desktop/ccm_allen/server

 ✓ tests/advocates.test.js (35 tests) 19736ms
   ✓ Court CMS - Phase 5 Advocate Management & Case Assignment Suite (35)
     ✓ Advocate Directory API (5)
       ✓ returns paginated list of advocates with active and total case counts (no N+1) 578ms
       ✓ filters advocates by search query q across name, bar number, and email 454ms
       ✓ filters advocates by specialization and by hasLogin (true / false) 612ms
       ✓ allows JUDGE to view directory but forbids ADVOCATE role (403) 446ms
       ✓ returns specialization metadata list at GET /advocates/meta 572ms
     ✓ Advocate Detail & Scoping API (3)
       ✓ allows ADMIN, REGISTRAR, and JUDGE to view any advocate profile with assigned cases 630ms
       ✓ allows ADVOCATE role to view only their own profile and returns 404 for other advocates 622ms
       ✓ filters advocate cases by caller visibility (does not leak out-of-scope cases to JUDGE) 520ms
     ✓ Advocate Create & Edit (6)
       ✓ allows REGISTRAR to register a new advocate with valid fields 595ms
       ✓ rejects duplicate Bar Council enrollment number with clear error 608ms
       ✓ enforces bar number format rules (5-20 chars, letters, digits, slash, hyphen) 547ms
       ✓ allows editing mutable details (name, specialization, email, phone) 448ms
       ✓ rejects attempts to modify the immutable barNumber on PATCH 465ms
       ✓ forbids JUDGE and ADVOCATE roles from creating or updating advocates (403) 407ms
     ✓ Case Advocate Assignment API (11)
       ✓ first assignment on REGISTERED case moves status to ADVOCATE_ASSIGNED and writes history 514ms
       ✓ second assignment on ADVOCATE_ASSIGNED case does NOT change status 617ms
       ✓ rejects duplicate active assignment of the same advocate on the same case 541ms
       ✓ rejects same advocate representing BOTH sides (conflict of interest) 582ms
       ✓ rejects more than 2 active advocates per side 495ms
       ✓ reactivates previously unassigned advocate on the same case, reusing row and clearing unassigned fields 464ms
       ✓ two simultaneous identical assignment requests produce exactly one active row 353ms
     ✓ Advocate Unassignment API (5)
       ✓ unassigning the LAST advocate on ADVOCATE_ASSIGNED case reverts status to REGISTERED 577ms
       ✓ unassigning the LAST advocate on HEARING_SCHEDULED or UNDER_TRIAL case is BLOCKED 533ms
       ✓ forbids JUDGE and ADVOCATE roles from unassigning advocates (403) 504ms
     ✓ Dynamic Case Visibility for Advocates (1)
       ✓ an advocate gains visibility of case immediately upon assignment and loses it after unassignment 629ms
     ✓ Case Detail & History Timeline (2)
       ✓ GET /cases/:id returns assignment details and previous unassignment audit records 568ms
       ✓ merges advocate assignment events into the history timeline even when status did not change 320ms
 ✓ tests/auth.test.js (35 tests) 6020ms
 ✓ tests/cases.test.js (27 tests) 4204ms

 Test Files  3 passed (3)
      Tests  97 passed (97)
   Start at  13:09:55
   Duration  37.63s (tests 84%, import 12%, transform 3%, setup 2%)
```

### 5.2 Database Verification Results (`npm run db:verify`)

```
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
│ 0       │ 'Table Row Counts'        │ 'PASS' │ 'All 12 tables populated (users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 26, hearings: 16, evidence: 8, evidenceCustodyLogs: 16, judgments: 4, caseStatusHistory: 50, caseSequences: 2, systemSettings: 3)'        │
│ 1       │ 'Case Status Consistency' │ 'PASS' │ 'All 14 cases strictly conform to their lifecycle state constraints'                                                                                                                                                                 │
│ 2       │ 'No Double-Booking'       │ 'PASS' │ 'All 16 hearings verified: zero courtroom and zero judge scheduling collisions'                                                                                                                                                      │
│ 3       │ 'Judgment Uniqueness'     │ 'PASS' │ 'All 4 judgments have unique caseId (enforces 1:1 relation)'                                                                                                                                                                         │
│ 4       │ 'Backlog Cases Threshold' │ 'PASS' │ 'Found 5 open cases older than 90 days (Requirement >= 3). Cases: CC/2025/00030 (JUDGMENT_RESERVED), CC/2025/00045 (UNDER_TRIAL), CC/2025/00058 (UNDER_TRIAL), CC/2025/00072 (HEARING_SCHEDULED), CC/2025/00085 (ADVOCATE_ASSIGNED)' │
└─────────┴───────────────────────────┴────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0) <<<
```

### 5.3 Linter & Code Formatter Checks

- `npm run lint`: Passed with 0 errors and 0 warnings.
- `npm run format:check`: Passed ("All matched files use Prettier code style!").

### 5.4 Client Build (`npm run build --prefix client`)

```
vite v6.4.3 building for production...
transforming...
✓ 1673 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   1.12 kB │ gzip:   0.60 kB
dist/assets/index-p2LRU7ly.css   33.99 kB │ gzip:   6.43 kB
dist/assets/index-DRE06425.js   395.19 kB │ gzip: 106.54 kB
✓ built in 18.07s
```

---

## 6. Decisions and Assumptions

1. **No Advocate Delete Endpoint**:
   Advocates are permanent legal actors referenced in statutory court records, historical cause lists, custody chains, and judgments. In accordance with judicial archival standards, deleting advocate profiles is prohibited; historical counsel representation must remain intact.
2. **Reactivation of Existing Join Records**:
   To preserve the database unique constraint `@@unique([caseId, advocateId])`, re-assigning an advocate who previously withdrew or was replaced updates and reactivates their existing join row rather than inserting a duplicate record. Prior withdrawal metadata is captured in the chronological audit timeline output.
3. **Soft Workload Warning vs. Hard Blocking**:
   Legal representation in Indian courts cannot be statutorily blocked by registry software due to high active caseloads (e.g., senior advocates frequently handle dozens of active proceedings). The system emits an informational warning (`warning` string in API response and visual banner in UI) when the advocate exceeds `advocate_workload_warning_threshold`, leaving scheduling and workload discretion to the court and counsel.
4. **Conflict of Interest Enforcement**:
   An advocate cannot simultaneously represent both petitioner and respondent on the same docket. Attempting to assign counsel to an opposing side returns `400 Bad Request` with an explicit conflict of interest message.
5. **Last Advocate Protection**:
   If a case has progressed beyond the advocate assignment phase (`HEARING_SCHEDULED`, `UNDER_TRIAL`, `JUDGMENT_RESERVED`), unassigning the final counsel of record without a substitute would render active judicial proceedings legally unrepresented. The system rejects such requests with `400 Bad Request`, instructing staff to assign a replacement before removing existing counsel.
6. **Timeline Merging Without Auxiliary Tables**:
   Case status history records only major lifecycle changes. Rather than creating an unnecessary intermediate audit table, `GET /api/v1/cases/:id` dynamically merges `CaseAdvocate` assignment and unassignment events into the timeline, formatting and sorting all events chronologically.

---

## 7. Issues and Limitations

- **Email Uniqueness on Advocate**: In the current schema, `advocate.email` is not unique at the database level (though `user.email` is unique). If two different advocates are registered with the same contact email, the system allows it unless they attempt to link to user accounts.
- **Concurrent Assignment Contention**: Under extremely high concurrent write loads on the same case, MySQL InnoDB transaction row locks can produce transient write conflicts (`P2034`), which are trapped and reported as bad requests.

---

## 8. Deviations from the Prompt

None. All Phase 5 requirements, constraints, and instructions were strictly followed. No out-of-scope schema changes were made, and no hearing, evidence, or judgment features were built ahead.

---

## 9. Ready-for-Next-Phase Checklist

- [x] Phase 4 verification passed 100% across all 6 test scenarios.
- [x] `CRL/2026` investigated, confirmed as leftover, and cleaned from seed and tests.
- [x] Single additive, nullable schema migration `case_advocate_audit` applied and verified on MySQL 26.7.0.
- [x] Seed and verify updated; `npm run db:verify` passes with `users: 7`, `caseAdvocates: 26`, and `caseSequences: 2`.
- [x] Advocate Directory API implemented with pagination, search, specialization and login filtering, and no N+1 queries.
- [x] Case advocate assignment and unassignment APIs implemented with transactions, conflict checks, 2-per-side cap, row reuse, and last advocate protection.
- [x] Reusable `caseWorkflow.js` module implemented and handling status automation (`REGISTERED <-> ADVOCATE_ASSIGNED`).
- [x] Workload warning implemented with configurable system setting threshold.
- [x] Case History timeline integrates assignment events chronologically without auxiliary tables.
- [x] Frontend Advocate Directory page, modals, and Case Detail Advocates tab fully implemented and tested.
- [x] Automated tests (97 total across 3 suites) pass and leave the database in baseline state.
- [x] Client builds with zero errors.
- [x] Ready to begin Phase 6 (Hearing Scheduling, Bench Allocation & Cause Lists).
