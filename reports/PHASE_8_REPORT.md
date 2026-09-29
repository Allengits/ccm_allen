# Phase 8 Report: Automation Engine and Registry Dashboard

**Date**: 2026-09-29  
**Branch**: `master`  
**Commit (Step 0 Carry-over)**: `aa8fbc3`  
**Commit (Phase 8 Implementation)**: `c0e29a3`  
**Status**: Completed successfully

---

## 1. Carry-Over from Phases 5–7

As mandated by Step 0.1, the "Issues and limitations" and "Deviations from the prompt" sections from previous milestone reports are quoted below, accompanied by action assessments:

### 1.1 From `reports/PHASE_5_REPORT.md`

> **Quoted Issues and limitations**:
>
> 1. "Advocate user self-registration is out of scope; credentials must be provisioned by an Admin via User Management."
> 2. "Single active assignment limit: An advocate cannot be assigned to both Petitioner and Respondent on the same case."
> 3. "No historical audit view for unassignments on the client frontend in Phase 5 (backend stores and returns it, but client UI only shows active counsel)."
>
> **Quoted Deviations from the prompt**: "None."

- **Assessment & Action**:
  - Item 1: No action in Phase 8; out of scope by design (Indian court CMS pattern requires Bar enrollment verification before account provisioning).
  - Item 2: No action needed; this is a permanent legal ethics guarantee enforced in Phase 5 and verified in all test suites.
  - Item 3: Addressed in Phase 7 case detail timeline; unassignment events and audit reasons are seamlessly surfaced.

### 1.2 From `reports/PHASE_6_REPORT.md`

> **Quoted Issues and limitations**:
>
> 1. "The cause list view is limited to single calendar dates; multi-day cause list ranges are deferred."
> 2. "Court working days and holidays are evaluated against static system settings without gazetted holiday calendars."
>
> **Quoted Deviations from the prompt**: "None."

- **Assessment & Action**:
  - Item 1: Phase 8 implements `GET /api/v1/dashboard/upcoming-hearings` and the `UpcomingHearingsWidget` monitoring forward-looking windows (default 7 days, configurable 1–90 days). The daily cause list remains day-focused for courtroom efficiency.
  - Item 2: No action in Phase 8; gazetted calendar integration is an enterprise extension suitable for future post-v1 deployments.

### 1.3 From `reports/PHASE_6_FIX_REPORT.md` and `reports/PHASE_6_FIX2_REPORT.md`

> **Quoted Issues and limitations**: "None."
> **Quoted Deviations from the prompt**: "None."

- **Assessment & Action**:
  - No action needed. Timezone-aware date boundary logic (`DateTime.setZone('Asia/Kolkata')`) is consistently maintained and validated across all Phase 8 endpoints.

### 1.4 From `reports/PHASE_7_REPORT.md`

> **Quoted Issues and limitations**:
>
> 1. "Post-decree amendments, clerical corrections (Section 152 CPC), review petitions, and execution proceedings are explicitly out of scope."
> 2. "Hard deletion of judgments is forbidden; delivered judgments are immutable legal artifacts."
>
> **Quoted Deviations from the prompt**: "None."

- **Assessment & Action**:
  - Item 1: No action needed; confirmed out of scope for Phase 8.
  - Item 2: Permanent legal immutability of closed cases and delivered orders is preserved and re-verified.

---

## 2. Step 0.3 Pre-Implementation Verification Results

All 7 checks specified in Step 0.3 were executed against a freshly reset database using cookie session automation (`server/scripts/verify_step0.js`):

|   #   | Check Description                                                                                                                  |  Status  | Verification Details                                                                                                                                                                                                                                                                                                                       |
| :---: | :--------------------------------------------------------------------------------------------------------------------------------- | :------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Judge reserves judgment on eligible `UNDER_TRIAL` case; ineligible case (with scheduled hearing) blocked with hearing count        | **PASS** | Reserving judgment on Case 7 (`CC/2025/00058`) succeeded with 200 OK (`JUDGMENT_RESERVED`). Attempting to reserve Case 6 (`CC/2025/00072`) with 1 scheduled hearing was rejected with 400 Bad Request: `"Cannot reserve judgment: case has 1 scheduled hearing(s)"`.                                                                       |
| **2** | Delivering a judgment closes the case, sets `closedAt`, and a second delivery attempt is rejected (409 Conflict)                   | **PASS** | Delivering decree on Case 7 set status `CLOSED` and populated `closedAt`. A subsequent second delivery attempt returned 409 Conflict: `"Judgment has already been delivered for this case"`.                                                                                                                                               |
| **3** | A closed case rejects edit, advocate assign/unassign, and every hearing action with a clear message                                | **PASS** | All mutation attempts against closed Case 7 (`PATCH /cases/:id`, `POST /cases/:id/advocates`, `DELETE /cases/:id/advocates/:id`, `POST /hearings`, `PATCH /hearings/:id/reschedule`, `PATCH /hearings/:id/cancel`, `PATCH /hearings/:id/complete`, `PATCH /hearings/:id/adjourn`) rejected with 400 Bad Request naming closed case policy. |
| **4** | Completing or adjourning a hearing dated after today (IST) is rejected naming the date; hearing dated today or earlier is accepted | **PASS** | Completing hearing dated tomorrow rejected with `"Cannot complete a future hearing scheduled on ... (IST)"`. Completing hearing scheduled today IST succeeded with 200 OK. Error message repeats no redundant `(future hearing)` suffix.                                                                                                   |
| **5** | 10 simultaneous POSTs for one free slot produce exactly 1 hearing; 5 simultaneous deliveries produce exactly 1 delivered judgment  | **PASS** | 10 concurrent requests to book Slot 1 produced exactly 1 booking (`201 Created`) and 9 conflict rejections (`409 Conflict`). 5 concurrent judgment deliveries on Case 10 produced exactly 1 delivery (`200 OK`) and 4 conflict rejections (`409 Conflict`).                                                                                |
| **6** | Client and server permission maps are strictly equal (Phase 7 parity check)                                                        | **PASS** | PARITY VERIFIED: Both client and server permission maps identically match across all 15 permission identifiers.                                                                                                                                                                                                                            |
| **7** | `npm run build --prefix client` succeeds with 0 console errors                                                                     | **PASS** | Client bundle built in 7.92s with 0 errors across Dashboard, Cases, Advocates, Hearings, and Judgments.                                                                                                                                                                                                                                    |

---

## 3. Objective

Build Phase 8 of the Court Case Management System:

1. Provide a single, responsive, role-scoped Dashboard giving the judicial registry a live picture of caseload health: status distribution breakdown, an overdue backlog worklist, stale-case detection (Rule 1 & Rule 2), upcoming hearings window, and personnel workload distribution for advocates and judges.
2. Centralize configurable systemic thresholds in `SystemSetting`, avoiding hardcoded business constants.
3. Ensure zero manual data entry—every dashboard figure is computed real-time from existing case data with zero caching layer and zero N+1 queries.
4. Provide administrative configuration controls with range validation and atomic transactional audit trails.

---

## 4. What Was Built

### 4.1 Configurable Threshold System (`SystemSetting`)

Added 4 systemic dashboard threshold rows (and preserved existing backlog and advocate settings):

- `judge_workload_warning_threshold` (default: 25)
- `stale_case_no_advocate_days` (default: 14)
- `stale_case_no_hearing_days` (default: 21)
- `upcoming_hearings_window_days` (default: 7)
- Central utility [dashboardSettings.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/src/utils/dashboardSettings.js) provides cached default fallbacks, schema ranges, and audit trail query helpers.

### 4.2 Granular RBAC Permissions

- Replaced monolithic `dashboard.view` with:
  - `dashboard.view.all` (`ADMIN`, `REGISTRAR`, `JUDGE`)
  - `dashboard.view.own` (`ADVOCATE`)
- Updated permission configs on both server and client, preserving complete parity.

### 4.3 Backend Dashboard API (`/api/v1/dashboard`)

Implemented under [dashboard.controller.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/src/controllers/dashboard.controller.js) and [dashboard.routes.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/src/routes/dashboard.routes.js):

- `GET /api/v1/dashboard/summary`: Status distribution (single `groupBy` query), open vs closed counts, today's hearings count, upcoming window count, backlog count, and stale count. Scoped strictly by role.
- `GET /api/v1/dashboard/backlog`: Paginated worklist of open cases older than `backlog_threshold_days`, sortable by age or filing date, with direct case links.
- `GET /api/v1/dashboard/stale-cases`: Paginated worklist combining Rule 1 (Registered > 14d, 0 advocates) and Rule 2 (Advocate Assigned > 21d, 0 hearings) with matched rule badges.
- `GET /api/v1/dashboard/upcoming-hearings`: Scheduled hearings within the forward-looking window, formatted in IST.
- `GET /api/v1/dashboard/workload`: Active docket distribution per advocate and judge with `isOverloaded` flag. Restricted to Admin, Registrar, and Judge (Judge sees own bench row).
- `GET /api/v1/dashboard/settings`: Current threshold values and recent audit log (Admin and Registrar only; 403 for Judge and Advocate).
- `PATCH /api/v1/dashboard/settings`: Atomic transactional update of threshold settings with integer range validation (1–3650 days) and individual audit trail row insertion (`audit:<timestamp>:<uuid>`).

### 4.4 Frontend Dashboard Application

Implemented in [Dashboard.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/pages/Dashboard.jsx) and modular components:

- [StatusDistributionStamp.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/components/dashboard/StatusDistributionStamp.jsx): 6-stage lifecycle cards with percentage bars, count stamps, and quick filter links. Supports Judge bench toggle.
- [BacklogWorklist.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/components/dashboard/BacklogWorklist.jsx): Compact worklist with age warning highlights, pagination, and sorting.
- [StaleCasesWorklist.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/components/dashboard/StaleCasesWorklist.jsx): Stale case table with rule filter tabs (All, Rule 1, Rule 2) and direct assignment/scheduling action links.
- [UpcomingHearingsWidget.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/components/dashboard/UpcomingHearingsWidget.jsx): Upcoming hearing schedule with IST date/time, courtroom, and bench information.
- [WorkloadMonitor.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/components/dashboard/WorkloadMonitor.jsx): Advocate and Judge workload capacity tables with overload warning badges (omitted for Advocate).
- [ThresholdSettingsModal.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/components/dashboard/ThresholdSettingsModal.jsx): Accessible configuration modal for Admin with input range validation, audit history log, and instant dashboard refetch.

---

## 5. Files and Folders Changed

### New Files Created

- `server/src/utils/dashboardSettings.js`: Settings constants, defaults, range bounds, and audit trail query helpers.
- `server/src/controllers/dashboard.controller.js`: Zero N+1 dashboard queries, aggregations, and transactional settings update handler.
- `server/src/routes/dashboard.routes.js`: Route definitions mounted at `/api/v1/dashboard`.
- `server/tests/dashboard.test.js`: 27 integration tests covering all dashboard endpoints, RBAC scoping, overload flag flipping, range validation, and teardown baseline.
- `client/src/components/dashboard/StatusDistributionStamp.jsx`: Lifecycle stage breakdown cards.
- `client/src/components/dashboard/BacklogWorklist.jsx`: Backlog worklist table with sorting and pagination.
- `client/src/components/dashboard/StaleCasesWorklist.jsx`: Stale case worklist with rule filtering.
- `client/src/components/dashboard/UpcomingHearingsWidget.jsx`: Upcoming hearings widget in IST.
- `client/src/components/dashboard/WorkloadMonitor.jsx`: Workload distribution tables.
- `client/src/components/dashboard/ThresholdSettingsModal.jsx`: Modal for editing thresholds and reviewing audit trail.
- `docs/DASHBOARD.md`: Comprehensive technical specification for Phase 8.

### Existing Files Modified

- `client/src/pages/Dashboard.jsx`: Replaced placeholder cards with Phase 8 components and URL search param state binding.
- `client/src/constants/permissions.js`: Split `DASHBOARD_VIEW` into `DASHBOARD_VIEW_ALL` and `DASHBOARD_VIEW_OWN`.
- `client/src/api/unwrap.js`: Cleaned multiline comment header.
- `server/src/config/permissions.js`: Split dashboard permissions and updated role permission matrix.
- `server/src/routes/index.js`: Mounted `/dashboard` routes under `/api/v1/dashboard`.
- `server/prisma/seed.js`: Seeded the 4 additional threshold settings and adjusted Case 1 filing date (16 days ago) to demonstrate Stale Rule 1.
- `server/prisma/verify.js`: Added Check 6 validating Stale Rule 1 and Rule 2 cases, and updated system settings count check.
- `server/tests/setup.js`: Updated baseline `systemSettings` count to 14.
- `server/tests/auth.test.js`: Updated permission parity and role permission assertions.
- `docs/DATABASE.md`: Documented all 14 `SystemSetting` keys and audit trail structure.
- `docs/AUTH.md`: Updated permissions matrix with `dashboard.view.all` and `dashboard.view.own`.
- `PROJECT_CONTEXT.md`: Added Phase 8 technical summary and updated roadmap.
- `README.md`: Added dashboard test documentation and marked Phase 8 complete.

---

## 6. How to Run and Verify

```powershell
# 1. Reset database and run automated verification
npm run db:reset
npm run db:verify

# 2. Run linting (0 errors, 0 warnings)
npm run lint

# 3. Verify code formatting
npm run format:check

# 4. Run all server unit & integration tests
npm test

# 5. Run tests across both UTC and Asia/Kolkata timezones
npm run test:tz

# 6. Build the client application
npm run build --prefix client
```

---

## 7. Test Evidence

### 7.1 Database Verification (`npm run db:verify`)

```
===============================================================
       COURT CASE MANAGEMENT SYSTEM - DATABASE VERIFICATION
===============================================================
[1/6] Checking table row counts...
[2/6] Validating case lifecycle records consistency...
[3/6] Checking for courtroom, judge and case scheduling conflicts & audit events...
[4/6] Checking judgment uniqueness and lifecycle constraints...
[5/6] Checking backlog threshold cases...
[6/6] Checking stale cases rules...

===============================================================
                   VERIFICATION RESULTS TABLE
===============================================================
┌─────────┬────────────────────────────────────────┬────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ Check                                  │ Status │ Details                                                                                                                                                                                                                              │
├─────────┼────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ 'Table Row Counts'                     │ 'PASS' │ 'All 11 tables populated (users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 26, hearings: 16, hearingEvents: 25, judgments: 4, caseStatusHistory: 50, caseSequences: 2, systemSettings: 14)'                          │
│ 1       │ 'Case Status Consistency'              │ 'PASS' │ 'All 14 cases strictly conform to their lifecycle state constraints (upcoming defined in IST)'                                                                                                                                       │
│ 2       │ 'Hearing Scheduling & Audit Integrity' │ 'PASS' │ 'All 16 hearings have HearingEvents; zero courtroom, judge, or case scheduling collisions across 7 SCHEDULED hearings'                                                                                                               │
│ 3       │ 'Judgment Integrity & Uniqueness'      │ 'PASS' │ 'All 4 judgments have unique caseId, conform to lifecycle constraints, and delivered cases are CLOSED'                                                                                                                               │
│ 4       │ 'Backlog Cases Threshold'              │ 'PASS' │ 'Found 5 open cases older than 90 days (Requirement >= 3). Cases: CC/2025/00030 (JUDGMENT_RESERVED), CC/2025/00045 (UNDER_TRIAL), CC/2025/00058 (UNDER_TRIAL), CC/2025/00072 (HEARING_SCHEDULED), CC/2025/00085 (ADVOCATE_ASSIGNED)' │
│ 5       │ 'Stale Cases Rules Verification'       │ 'PASS' │ 'Rule 1 (REGISTERED without advocate > 14d): 1 case(s) [CC/2026/00101]; Rule 2 (ADVOCATE_ASSIGNED without hearing > 21d): 1 case(s) [CC/2025/00085]'                                                                                 │
└─────────┴────────────────────────────────────────┴────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0) <<<
```

### 7.2 Full Server Test Run (`npm test`)

```
 RUN  v3.2.7 C:/Users/allen/OneDrive/Desktop/ccm_allen/server

 ✓ tests/judgments.test.js (42 tests) 8843ms
 ✓ tests/advocates.test.js (36 tests) 8528ms
 ✓ tests/hearings.test.js (42 tests) 7019ms
 ✓ tests/dashboard.test.js (27 tests) 3053ms
 ✓ tests/auth.test.js (38 tests) 2216ms
 ✓ tests/cases.test.js (28 tests) 1608ms

 Test Files  6 passed (6)
      Tests  213 passed (213)
   Duration  36.90s
```

### 7.3 Timezone Test Variants (`npm run test:tz`)

```
>>> [1/2] Running tests under TZ=UTC...
✔ All tests passed under TZ=UTC

>>> [2/2] Running tests under TZ=Asia/Kolkata...
✔ All tests passed under TZ=Asia/Kolkata

===============================================================
>>> ALL TIMEZONE TEST RUNS PASSED SUCCESSFULLY (CODE 0) <<<
===============================================================
```

### 7.4 Linting & Formatting Check

```
> court-case-management-system@1.0.0 lint
> eslint .
(0 errors, 0 warnings)

> court-case-management-system@1.0.0 format:check
> prettier --check .
All matched files use Prettier code style!
```

---

## 8. Decisions and Assumptions

1. **Audit Trail Storage**:
   - The `system_settings` table uses `VARCHAR(191)` for the `value` column. Attempting to serialize an arbitrary-length JSON array into a single row eventually violates this column constraint.
   - We adopted an individual row pattern: every administrative threshold update writes a row with key `audit:<timestamp>:<uuid>`, value containing a compact JSON record (`settingKey`, `oldValue`, `newValue`, `changedById`), and `description` storing the user name. This preserves complete auditability while staying strictly within database column limits without requiring schema changes.
2. **Case Count Constraint**:
   - The required demonstration cases (backlog cases $\ge 3$, Stale Rule 1 $\ge 1$, Stale Rule 2 $\ge 1$) were cleanly accommodated within the existing 14 cases by minimally adjusting Case 1's filing date from 10 days ago to 16 days ago (>14 days), satisfying Rule 1 while maintaining exact case count parity (14 cases).
3. **Frontend Charting**:
   - As mandated, no heavy external charting library was added. We implemented a stamp-style breakdown with proportional progress indicators, badges, and percentage counters matching the formal navy/brass judicial registry theme.

---

## 9. Issues and Limitations

1. **Email / SMS Notification Dispatch**:
   - Stale case alerts and backlog warnings are currently visual indicators on the registry dashboard. Background push dispatch (SMTP / SMS gateway) is not implemented in this phase.
2. **Read-Only Settings for Registrar**:
   - While the Registrar can view system thresholds via `GET /dashboard/settings` and the frontend modal, modifying threshold values is strictly restricted to Admin users.

---

## 10. Deviations from the Prompt

None. All implementation details strictly conform to the Phase 8 instructions.

---

## 11. Ready-for-Next-Phase Checklist

- [x] All 7 Step 0.3 verification checks passed and recorded
- [x] Linting is clean with 0 errors and 0 warnings
- [x] Prettier formatting passes across all files
- [x] 213 tests across 6 test suites pass under both UTC and Asia/Kolkata
- [x] `npm run db:verify` passes all 6 integrity checks with users: 7 and cases: 14
- [x] Client production bundle builds cleanly
- [x] Documentation updated in `docs/DASHBOARD.md`, `docs/DATABASE.md`, `docs/AUTH.md`, `PROJECT_CONTEXT.md`, and `README.md`
- [x] Only Phase 9 remains on the project roadmap
