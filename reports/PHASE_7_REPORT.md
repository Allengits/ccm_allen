# Phase 7 Completion Report — Judgment Tracker, State Machine & Permissions

## 1. Objective

The objective of Phase 7 was threefold:

1. **Verify Phase 6 and Address Carry-Over Cleanups**:
   - Execute scripted end-to-end verification of all 8 Phase 6 hearing scheduling and lifecycle automation scenarios.
   - Implement `GET /api/v1/cases/:id/history` endpoint and improve 409 conflict error messages with blocking case numbers.
   - Create a centralized frontend unwrapper (`client/src/api/unwrap.js`) and eliminate ad-hoc dual-shape response handling.
   - Fix permission validation dev warnings and audit parity across client and server.
   - Enhance all 7 interactive dialogs with live character counters (`X/min minimum`) and clear disabled button tooltips/helper texts.
2. **Implement Judgment Tracking, State Machine & Concurrency Control**:
   - Implement two-stage judicial conclusion workflow: **Reserve Judgment** (`UNDER_TRIAL -> JUDGMENT_RESERVED`) and **Deliver Judgment** (`JUDGMENT_RESERVED -> CLOSED`).
   - Guard transitions with pessimistic row locking (`SELECT ... FOR UPDATE`) in MySQL transactions to completely prevent double-reservation and double-delivery race conditions.
   - Enforce permanent read-only status on `CLOSED` cases across all operations (case updates, advocate assignments, hearing scheduling, judgment modifications).
   - Ensure strict IST timezone handling for judgment pronouncement dates (cannot be in future, cannot precede reservation date).
3. **Build Frontend Registry & Automated Testing**:
   - Create rich `/judgments` registry page with search, state badges, outcome chips, and 160-character summary preview.
   - Implement dynamic 3-state Judgment Tab on `/cases/:id?tab=judgment`.
   - Deliver comprehensive automated test coverage with Vitest and Supertest across both UTC and Asia/Kolkata timezones, leaving baseline seed counts pristine.

---

## 2. Phase 6 Verification Results

Before implementing Phase 7 features, Phase 6 capabilities were verified end-to-end via scripted integration testing ([server/scripts/verify_phase6.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/scripts/verify_phase6.js)):

| Check # | Item Verified                                                   | Method                               | Result | Details                                                                                                                                                                                   |
| :-----: | :-------------------------------------------------------------- | :----------------------------------- | :----: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  **1**  | IST Timezone & Court Operating Hours                            | `POST /api/v1/hearings`              |  PASS  | Successfully rejected weekend slot (Saturday) with 400 Bad Request; rejected out-of-hours slot (08:00 IST); rejected lunch break slot (13:15 IST); rejected non-15m boundary (10:07 IST). |
|  **2**  | Dynamic Slot Availability Engine                                | `GET /api/v1/hearings/availability`  |  PASS  | Generated clean 15-minute slot intervals between 10:00 and 17:00 IST; correctly excluded lunch recess (13:00–14:00) and booked hearings; returned `isWorkingDay: false` on weekends.      |
|  **3**  | Daily Cause List & Bench/Advocate Scoping                       | `GET /api/v1/hearings/cause-list`    |  PASS  | Returned cause list grouped by courtroom with sequential serial numbers (1..N); Judge Banerjee saw Courtroom 2; Advocate Mehta saw only represented matters; Admin saw all courtrooms.    |
|  **4**  | Pessimistic Locking & 409 Double-Booking                        | `POST /api/v1/hearings`              |  PASS  | Dispatched 2 concurrent identical scheduling requests; exactly 1 succeeded (201 Created) and 1 failed with 409 Conflict.                                                                  |
|  **5**  | Lifecycle Automation: Advocate Assigned $\rightarrow$ Scheduled | `POST /api/v1/hearings`              |  PASS  | Scheduling first hearing on `CC/2026/00101` automatically transitioned case from `ADVOCATE_ASSIGNED` to `HEARING_SCHEDULED` with audit log.                                               |
|  **6**  | Lifecycle Automation: Completion $\rightarrow$ Under Trial      | `POST /api/v1/hearings/:id/complete` |  PASS  | Completing hearing in past time transitioned case from `HEARING_SCHEDULED` to `UNDER_TRIAL`; future hearing completion rejected.                                                          |
|  **7**  | Lifecycle Automation: Cancellation & Adjournment Reversion      | `POST /api/v1/hearings/:id/cancel`   |  PASS  | Cancelling the sole scheduled hearing safely reverted case back to `ADVOCATE_ASSIGNED`; adjournment without next date similarly reverted case.                                            |
|  **8**  | Cross-Module Judge Reassignment Protection & Timeline           | `PATCH /api/v1/cases/:id`            |  PASS  | Blocked judge reassignment on case with active scheduled hearings (400 Bad Request); merged `HearingEvent` entries into case timeline.                                                    |

---

## 3. What Was Built in Phase 7

### 3.1 Step 0 Carry-Over Cleanups

- **Case History Endpoint**: Implemented `GET /api/v1/cases/:id/history` returning chronologically merged status changes, advocate assignments/unassignments, and hearing events.
- **Enhanced 409 Conflict Messages**: Added blocking case numbers to hearing double-booking conflict error responses.
- **Centralized Client Unwrapper**: Created `client/src/api/unwrap.js` supporting standard `{ success, message, data }` envelopes, direct arrays/objects, and throwing clean `Error` instances on failures. Replaced all dual-shape parsing (`res?.data?.data?.items || res?.data?.data || []`) across `Advocates.jsx`, `Cases.jsx`, `Hearings.jsx`, `CaseDetail.jsx`, `Dashboard.jsx`, and modal components.
- **Permission Parity & Audit**: Exported `isValidPermission(key)` in `client/src/constants/permissions.js`, added console error in dev mode when `can()` is invoked with invalid permission keys, and added parity assertions in `server/tests/auth.test.js`.
- **Live Character Counters & Disabled Tooltips**: Added required-character countdowns (`X/min minimum`) and tooltip explanations to:
  - `UnassignAdvocateModal.jsx` (reason $\ge 5$ chars)
  - `AssignAdvocateModal.jsx` (valid counsel selected)
  - `ScheduleHearingModal.jsx` (purpose $\ge 5$ chars, valid slot selected)
  - `RescheduleHearingModal.jsx` (reason $\ge 5$ chars, new slot selected)
  - `CancelHearingModal.jsx` (reason $\ge 5$ chars)
  - `CompleteHearingModal.jsx` (outcome notes $\ge 5$ chars)
  - `AdjournHearingModal.jsx` (reason $\ge 5$ chars)

### 3.2 Step 1: Database Schema & Demo Seed Data

- **Additive Migration (`20260928141529_judgment_tracking`)**:
  - Activated `judgments` table with columns: `id`, `caseId` (unique), `judgeId`, `status`, `outcome`, `summary`, `reserveNote`, `reservedAt`, `reservedById`, `judgmentDate`, `deliveredAt`, `deliveredById`, `createdAt`, `updatedAt`.
  - Added `closedAt` timestamp to `cases` table.
  - Added enum `JudgmentOutcome`: `ALLOWED`, `DISMISSED`, `CONVICTED`, `ACQUITTED`, `SETTLED`, `DISPOSED`.
  - Added indexes: `status`, `outcome`, `judgmentDate`, `reservedAt`, `judgeId`.
- **Prisma Seed Realism**:
  - Exactly 14 cases across all lifecycle stages.
  - Case 10 (`CC/2026/00110`, UNDER_TRIAL, 1 completed hearing, 0 scheduled) qualifies for reservation.
  - Case 7 (`CC/2025/00045`, UNDER_TRIAL, 2 scheduled hearings) correctly blocked from reservation until hearings complete.
  - Cases 11 & 12 in `JUDGMENT_RESERVED` status.
  - Cases 13 & 14 delivered and `CLOSED`.
  - Total judgments: 4; total hearings: 16 (exactly 2 scheduled today IST); total database rows strictly conforming to baseline.

### 3.3 Step 2: RBAC & Permissions Matrix

- Added `judgment.view` permission (all 4 roles).
- `judgment.record` permitted for `ADMIN` and `JUDGE`.
- `judgment.deliver` permitted for `ADMIN` and `JUDGE`.
- Client and server permission configurations synchronized with automated parity test.

### 3.4 Step 3: Case Workflow State Machine

- Extended [server/src/services/caseWorkflow.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/src/services/caseWorkflow.js):
  - Allowed transitions: `UNDER_TRIAL -> JUDGMENT_RESERVED` and `JUDGMENT_RESERVED -> CLOSED`.
  - Stamped `cases.closedAt` upon transition to `CLOSED`.
  - Blocked any transitions originating from `CLOSED`.

### 3.5 Step 4: Backend Controllers & REST APIs

- Created [server/src/controllers/judgment.controller.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/src/controllers/judgment.controller.js):
  - `GET /api/v1/judgments/meta`: Metadata choices (outcomes enum, states, judges list).
  - `GET /api/v1/judgments`: Paginated search and filtering with `summaryPreview`.
  - `GET /api/v1/cases/:id/judgment`: Single case judgment detail.
  - `POST /api/v1/cases/:id/judgment/reserve`: Pessimistic locking (`SELECT ... FOR UPDATE`), pre-condition validation ($\ge 1$ completed hearing, 0 scheduled hearings, no prior judgment, note $\ge 5$ chars), transition to `JUDGMENT_RESERVED`.
  - `POST /api/v1/cases/:id/judgment/deliver`: Pessimistic locking, validation (outcome in enum, summary $\ge 20$ chars, date not in future and not before reservation in IST), transition to `CLOSED`, stamping `closedAt`.
- Registered routes in `server/src/routes/judgment.routes.js` and `server/src/routes/case.routes.js`.
- Implemented closed case guards across `case.controller.js`, `caseAdvocate.controller.js`, and `hearing.controller.js` returning HTTP 400 Bad Request on mutation attempts.

### 3.6 Step 5: Database Verification Script

- Extended [server/prisma/verify.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/prisma/verify.js):
  - Check 1: Table row counts across all 11 tables.
  - Check 2: Case lifecycle records consistency.
  - Check 3: Hearing scheduling and audit integrity.
  - Check 4: Judgment integrity and uniqueness (unique `caseId`, closed case status, outcome constraints).
  - Check 5: Backlog threshold cases ($\ge 3$ open cases older than 90 days).
  - Ran `npm run db:verify` $\rightarrow$ Code 0, all 5 checks PASS.

### 3.7 Step 6: Frontend UI Components

- **Judgment Modals**:
  - `client/src/components/judgments/ReserveJudgmentModal.jsx`: Precondition validation, reserve note input with live character counter (`X/5 minimum`), disabled button tooltips.
  - `client/src/components/judgments/DeliverJudgmentModal.jsx`: Outcome dropdown, judgment date picker (restricted to $\le$ today in IST), operative summary textarea with live character counter (`X/20 minimum`), confirmation warnings.
- **Judgments Registry Page** (`client/src/pages/Judgments.jsx`):
  - Search input, state filters (`ALL`, `RESERVED`, `DELIVERED`), outcome dropdown, judge selector, date range filters.
  - Summary preview column with 160-character clamp and expandable full view.
  - State badges (`RESERVED` amber pill, `DELIVERED` emerald pill) and outcome chips.
  - Pagination controls and empty-state messaging.
- **Case Detail Page Integration** (`client/src/pages/CaseDetail.jsx`):
  - Added dedicated Judgment tab with URL query sync (`?tab=judgment`).
  - Implemented 3 dynamic visual states: Eligible for Reserve, Reserved, Delivered.
  - Added permanent closed-case banner locking tabs and displaying closure metadata.
  - Added disabled action button tooltips explaining exact preconditions.
- **Navigation & Shell**:
  - Added Judgments navigation item to `client/src/components/layout/Sidebar.jsx` (visible to all 4 roles).
  - Registered route in `client/src/App.jsx`.
  - Updated quick-action link on `client/src/pages/Dashboard.jsx`.
  - Clean client production build via `npm run build` (Code 0).

### 3.8 Step 7: Automated Tests

- Created [server/tests/judgments.test.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/tests/judgments.test.js) with 42 unit and integration tests.
- Full test suite passes: 177 tests passing across all 5 test files (`auth.test.js`: 37, `cases.test.js`: 28, `advocates.test.js`: 36, `hearings.test.js`: 34, `judgments.test.js`: 42).
- Cross-timezone test runner `npm run test:tz` succeeds across both `UTC` and `Asia/Kolkata`.

---

## 4. Files and Folders Changed

### 4.1 Created Files

- `client/src/api/unwrap.js` — Centralized API response envelope unwrapper.
- `client/src/components/judgments/ReserveJudgmentModal.jsx` — Reserve judgment modal dialog.
- `client/src/components/judgments/DeliverJudgmentModal.jsx` — Deliver judgment modal dialog.
- `client/src/pages/Judgments.jsx` — Judgments registry table view with filtering.
- `server/prisma/migrations/20260928141529_judgment_tracking/migration.sql` — Additive schema migration.
- `server/scripts/verify_phase6.js` — Phase 6 end-to-end verification script.
- `server/src/controllers/judgment.controller.js` — Judgment endpoints controller.
- `server/src/routes/judgment.routes.js` — Express routes for `/api/v1/judgments`.
- `server/src/validators/judgment.validator.js` — Zod schema validation for reservation and delivery.
- `server/tests/judgments.test.js` — Vitest test suite for judgment tracker.
- `docs/JUDGMENTS.md` — Complete module architecture and API documentation.
- `reports/PHASE_7_REPORT.md` — Phase 7 completion milestone report.

### 4.2 Modified Files

- `client/src/App.jsx` — Registered `/judgments` route.
- `client/src/components/layout/Sidebar.jsx` — Added Judgments navigation link with Gavel icon.
- `client/src/constants/permissions.js` — Added `judgment.view`, exported `isValidPermission`, added dev warning.
- `client/src/pages/CaseDetail.jsx` — Integrated 3-state Judgment tab, closed case banner, unwrapper.
- `client/src/pages/Dashboard.jsx` — Updated quick action link and unwrapper.
- `client/src/pages/Advocates.jsx` — Migrated to unwrap helper.
- `client/src/pages/Cases.jsx` — Migrated to unwrap helper.
- `client/src/pages/Hearings.jsx` — Migrated to unwrap helper.
- `client/src/components/advocates/AssignAdvocateModal.jsx` — Added character counters and tooltip hints.
- `client/src/components/advocates/UnassignAdvocateModal.jsx` — Added character counters and tooltip hints.
- `client/src/components/hearings/ScheduleHearingModal.jsx` — Added character counters and tooltip hints.
- `client/src/components/hearings/RescheduleHearingModal.jsx` — Added character counters and tooltip hints.
- `client/src/components/hearings/CancelHearingModal.jsx` — Added character counters and tooltip hints.
- `client/src/components/hearings/CompleteHearingModal.jsx` — Added character counters and tooltip hints.
- `client/src/components/hearings/AdjournHearingModal.jsx` — Added character counters and tooltip hints.
- `server/package.json` — Added `test:judgments` npm script.
- `server/prisma/schema.prisma` — Updated Judgment model, Case.closedAt, JudgmentOutcome enum.
- `server/prisma/seed.js` — Populated Phase 7 cases, judgments, and hearing distributions.
- `server/prisma/verify.js` — Added judgment integrity and uniqueness verification.
- `server/src/config/permissions.js` — Added `judgment.view` permission.
- `server/src/controllers/case.controller.js` — Added closed case guards and `getCaseHistory` endpoint.
- `server/src/controllers/caseAdvocate.controller.js` — Added closed case guards.
- `server/src/controllers/hearing.controller.js` — Added closed case guards and enhanced 409 conflict messages.
- `server/src/routes/case.routes.js` — Mounted history and judgment subroutes.
- `server/src/routes/index.js` — Mounted judgment routes.
- `server/src/services/caseWorkflow.js` — Added judgment transitions and closedAt timestamp.
- `server/tests/auth.test.js` — Added client/server permission parity tests.
- `server/tests/hearings.test.js` — Maintained baseline integrity.
- `docs/DATABASE.md` — Updated ER diagram and data dictionary.
- `docs/AUTH.md` — Updated permissions table and matrix.
- `docs/CASES.md` — Updated lifecycle, history endpoint, and permanent read-only rules.
- `docs/HEARINGS.md` — Updated closed case rules and preconditions.
- `PROJECT_CONTEXT.md` — Updated Phase 7 roadmap and architectural summary.
- `README.md` — Updated test scripts, documentation links, and roadmap.

---

## 5. How to Run and Verify

### 5.1 Prerequisites

Ensure MySQL is running on port `3307`:

```powershell
# Verify MySQL connection and seed baseline
cd c:\Users\allen\OneDrive\Desktop\ccm_allen\server
npm run db:verify
```

### 5.2 Running Automated Tests

```powershell
cd c:\Users\allen\OneDrive\Desktop\ccm_allen\server

# Run the Judgment test suite (42 tests)
npm run test:judgments

# Run all 5 test suites (177 tests)
npm test

# Run cross-timezone tests (UTC and Asia/Kolkata)
npm run test:tz
```

### 5.3 Building Client

```powershell
cd c:\Users\allen\OneDrive\Desktop\ccm_allen\client
npm run build
```

---

## 6. Test Evidence

### 6.1 Database Verification (`npm run db:verify`)

```
===============================================================
       COURT CASE MANAGEMENT SYSTEM - DATABASE VERIFICATION
===============================================================

[1/5] Checking table row counts...
[2/5] Validating case lifecycle records consistency...
[3/5] Checking for courtroom, judge and case scheduling conflicts & audit events...
[4/5] Checking judgment uniqueness and lifecycle constraints...
[5/5] Checking backlog threshold cases...

===============================================================
                   VERIFICATION RESULTS TABLE
===============================================================
┌─────────┬────────────────────────────────────────┬────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ Check                                  │ Status │ Details                                                                                                                                                                                                                              │
├─────────┼────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ 'Table Row Counts'                     │ 'PASS' │ 'All 11 tables populated (users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 26, hearings: 16, hearingEvents: 25, judgments: 4, caseStatusHistory: 50, caseSequences: 2, systemSettings: 10)'                          │
│ 1       │ 'Case Status Consistency'              │ 'PASS' │ 'All 14 cases strictly conform to their lifecycle state constraints (upcoming defined in IST)'                                                                                                                                       │
│ 2       │ 'Hearing Scheduling & Audit Integrity' │ 'PASS' │ 'All 16 hearings have HearingEvents; zero courtroom, judge, or case scheduling collisions across 7 SCHEDULED hearings'                                                                                                               │
│ 3       │ 'Judgment Integrity & Uniqueness'      │ 'PASS' │ 'All 4 judgments have unique caseId, conform to lifecycle constraints, and delivered cases are CLOSED'                                                                                                                               │
│ 4       │ 'Backlog Cases Threshold'              │ 'PASS' │ 'Found 5 open cases older than 90 days (Requirement >= 3). Cases: CC/2025/00030 (JUDGMENT_RESERVED), CC/2025/00045 (UNDER_TRIAL), CC/2025/00058 (UNDER_TRIAL), CC/2025/00072 (HEARING_SCHEDULED), CC/2025/00085 (ADVOCATE_ASSIGNED)' │
└─────────┴────────────────────────────────────────┴────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0) <<<
```

### 6.2 Full Test Suite Run (`npm test`)

```
 Test Files  5 passed (5)
      Tests  177 passed (177)
   Start at  21:04:14
   Duration  89.20s (transform 877ms, setup 698ms, collect 7.18s, tests 76.65s, environment 2ms, prepare 1.77s)
```

### 6.3 Cross-Timezone Test Run (`npm run test:tz`)

```
✔ All tests passed under TZ=UTC (177/177)
✔ All tests passed under TZ=Asia/Kolkata (177/177)

===============================================================
>>> ALL TIMEZONE TEST RUNS PASSED SUCCESSFULLY (CODE 0) <<<
===============================================================
```

### 6.4 Client Production Build (`npm run build`)

```
vite v6.4.3 building for production...
transforming...
✓ 1680 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   1.12 kB │ gzip:   0.59 kB
dist/assets/index-g1kaeq9n.css   38.87 kB │ gzip:   7.02 kB
dist/assets/index-CjiKp7uh.js   492.27 kB │ gzip: 123.38 kB
✓ built in 33.54s
```

---

## 7. Decisions and Assumptions

1. **Pessimistic Locking Over Optimistic**:
   - In high-throughput court registries, judgments represent permanent legal determinations. Optimistic locking with retry loops can lead to indeterminate state branches. Using `SELECT ... FOR UPDATE` row locks inside single atomic Prisma transactions guarantees deterministic linearizability.
2. **Permanent Read-Only Policy for Closed Cases**:
   - Rather than allowing administrative overrides or post-decree edits in Phase 7, a strict immutability rule was applied across every mutating endpoint. Reopening cases, appellate remand, and decree correction are specialized procedural pathways reserved for future phases.
3. **Calendar Date Enforcement in IST**:
   - Judgment delivery dates are validated against the Indian Standard Time (`Asia/Kolkata`) calendar date. A delivery cannot be recorded for a future date, nor can it precede the date on which judgment was reserved.
4. **Summary Preview Calculation**:
   - In the judgments registry API, `summaryPreview` truncates the operative text at 160 characters followed by `...`, allowing fast tabular rendering while the full text remains available in detail views.

---

## 8. Issues and Limitations

1. **No Post-Judgment Review / Correction**:
   - By design, Section 152 CPC clerical corrections or review petitions are not supported in Phase 7. Delivered judgments are immutable.
2. **Sequential vitest Execution**:
   - Because all integration tests run against the live MySQL instance on port 3307 and enforce strict baseline teardown, Vitest runs test files sequentially to prevent concurrent transaction rollback interference.

---

## 9. Deviations from the Prompt

None. All Phase 7 requirements, carry-over cleanups, pessimistic locking guarantees, schema constraints, seed distributions, UI components, tests, and documentation were implemented strictly as specified without building ahead into Phase 8.

---

## 10. Ready-for-Next-Phase Checklist

- [x] Phase 6 verification completed and documented.
- [x] Step 0 carry-over cleanups committed (`9bc646a`).
- [x] Additive migration `20260928141529_judgment_tracking` applied cleanly to MySQL 3307.
- [x] Database seed preserves exact baseline row counts across all 11 tables.
- [x] `npm run db:verify` passes with code 0 (all 5 checks PASS).
- [x] All 5 test suites pass (177 tests total).
- [x] `npm run test:tz` passes under both UTC and Asia/Kolkata.
- [x] Client production build succeeds without errors.
- [x] Complete documentation written in `docs/JUDGMENTS.md` and updated across all existing docs.
- [x] No Phase 8 features (automation engine, background cron scheduler, backlog worklist dashboard) were built ahead.
