# Phase 6 Fix 2 Report: Block Complete / Adjourn for Future-Dated Hearings

**Date:** 28 September 2026  
**System:** Court Case Management System (Court CMS)  
**Status:** Complete, Verified, and Regression-Tested

---

## 1. Executive Summary

A critical logic defect was diagnosed and resolved where the Court CMS server and client allowed completing or adjourning hearings scheduled on calendar dates in the future (relative to Indian Standard Time, UTC+05:30).

Specifically, when logged in as presiding judge `judge.swaminathan@courtcms.gov.in`, a `SCHEDULED` hearing on case docket `CC/2026/00109` dated **2 Oct 2026** (with the current court clock at **28 Sept 2026 IST**) could be adjourned sine die without a next date, and the server accepted the transition with HTTP 200 OK.

Per Phase 6 business rules, hearing proceedings may only be concluded (`COMPLETED`) or deferred (`ADJOURNED`) when the hearing's calendar date in IST is today or earlier (`hearingDayIST <= todayIST`). Hearings scheduled for future dates must be cancelled or rescheduled instead.

Both server and client have been corrected, comprehensive regression tests (including UTC date-boundary and multi-timezone runs) were added, and all quality gates have passed with zero regressions.

---

## 2. Root Cause Diagnosis

### 2.1 Server-Side Discrepancy

Investigation of `server/src/controllers/hearing.controller.js` revealed two distinct flaws:

1. **`adjournHearing`**: Completely lacked any check on the hearing's scheduled date (`hearing.scheduledAt`). While it properly validated case non-closed status, `SCHEDULED` status, and judge role ownership, it never evaluated whether `hearing.scheduledAt` was in the future.
2. **`completeHearing`**: Utilized an improper comparison:
   ```javascript
   // Previous implementation in completeHearing:
   if (new Date(hearing.scheduledAt) > now) {
     return res.status(400).json({ message: 'Cannot complete a future hearing' });
   }
   ```
   This had two severe bugs:
   - **UTC Millisecond Comparison vs IST Calendar Day**: It evaluated raw UTC millisecond timestamps instead of IST calendar dates (`Asia/Kolkata`).
   - **Intra-Day False Rejections**: For hearings scheduled for later on the current day (e.g. scheduled at 15:00 IST when the current clock is 11:00 IST), `new Date(hearing.scheduledAt) > now` evaluated to `true`, erroneously blocking judges from completing hearings on today's calendar date.

### 2.2 Client-Side Discrepancy

In the client UI:

- **`Hearings.jsx`**:
  - The Registry table rendered the Complete button only if `new Date(h.scheduledAt) <= new Date()`, hiding it completely for hearings scheduled later today or in the future.
  - The Adjourn button had no date condition at all, rendering enabled for all `SCHEDULED` hearings regardless of date.
- **`CaseDetail.jsx` (Hearings tab)**:
  - `canComplete` was conditioned on `new Date(h.scheduledAt) <= new Date()`.
  - The Adjourn button was rendered enabled for any actionable hearing without checking the scheduled date.
  - Neither page displayed disabled states or informative tooltips explaining why future-dated hearings cannot be completed or adjourned.

### 2.3 Stored Date Verification for Case CC/2026/00109

In the database seed (`server/prisma/seed.js`), case `CC/2026/00109` has a hearing scheduled using `getISTWorkingDate(4, 10, 0)`:

- Filing Date: 72 days ago
- Scheduled Date: 4 working days after 28 Sept 2026 IST, which is **Friday, 2 Oct 2026 at 10:00:00 IST** (`2026-10-02T04:30:00.000Z`).
- Presiding Judge: `judge.swaminathan@courtcms.gov.in` (Judge Swaminathan)
- Courtroom: Courtroom 4 (Main Building)

Because `adjournHearing` had no date guard, clicking Adjourn on this future hearing succeeded unconditionally.

---

## 3. Fix Implementation

### 3.1 Server-Side Fix

In `server/src/controllers/hearing.controller.js`:

- Added court timezone resolution via `getCourtSettings()` (`settings.timezone` = `'Asia/Kolkata'`).
- Converted `hearing.scheduledAt` to IST and computed start of day:
  ```javascript
  const settings = await getCourtSettings();
  const hearingDtIST = DateTime.fromJSDate(new Date(hearing.scheduledAt), {
    zone: settings.timezone,
  });
  const todayIST = DateTime.now().setZone(settings.timezone).startOf('day');
  const hearingDayIST = hearingDtIST.startOf('day');

  if (hearingDayIST > todayIST) {
    const hearingDateStr = hearingDtIST.toFormat('dd LLL yyyy');
    return res.status(400).json({
      success: false,
      message: `Cannot complete a hearing scheduled for a future date (${hearingDateStr}) (future hearing)`,
      errors: [`Cannot complete a hearing scheduled for a future date (${hearingDateStr})`],
    });
  }
  ```
- Replicated identical logic in `adjournHearing`:
  ```javascript
  if (hearingDayIST > todayIST) {
    const hearingDateStr = hearingDtIST.toFormat('dd LLL yyyy');
    return res.status(400).json({
      success: false,
      message: `Cannot adjourn a hearing scheduled for a future date (${hearingDateStr}) (future hearing)`,
      errors: [`Cannot adjourn a hearing scheduled for a future date (${hearingDateStr})`],
    });
  }
  ```
- Enforced strictly for both `JUDGE` and `ADMIN` roles prior to transaction execution.

### 3.2 Client-Side Fix

In `client/src/pages/Hearings.jsx` and `client/src/pages/CaseDetail.jsx`:

- Imported `DateTime` from `'luxon'`.
- Implemented IST date helpers:
  ```javascript
  const isFutureDatedIST = (scheduledAt) => {
    if (!scheduledAt) return false;
    const hearingDayIST = DateTime.fromISO(
      typeof scheduledAt === 'string' ? scheduledAt : new Date(scheduledAt).toISOString(),
      { zone: 'Asia/Kolkata' }
    ).startOf('day');
    const todayIST = DateTime.now().setZone('Asia/Kolkata').startOf('day');
    return hearingDayIST > todayIST;
  };

  const formatISTDateShort = (scheduledAt) => {
    if (!scheduledAt) return '';
    return DateTime.fromISO(
      typeof scheduledAt === 'string' ? scheduledAt : new Date(scheduledAt).toISOString(),
      { zone: 'Asia/Kolkata' }
    ).toFormat('dd LLL yyyy');
  };
  ```
- In both the Cause List / Registry views (`Hearings.jsx`) and the Case Hearings tab (`CaseDetail.jsx`):
  - Complete and Adjourn buttons remain visible for authorized roles (`ADMIN` and assigned `JUDGE`).
  - For hearings where `isFutureDatedIST(h.scheduledAt)` is `true`, buttons are rendered with `disabled={isFuture}` and styling `disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`.
  - Added HTML `title` attributes and hover tooltip popups:
    `"Cannot complete a hearing scheduled for a future date (DD Mon YYYY). Allowed on or after the hearing date."`
    `"Cannot adjourn a hearing scheduled for a future date (DD Mon YYYY). Allowed on or after the hearing date."`

---

## 4. Cross-Module Audit for Date Boundary Defects

A comprehensive audit was performed across all date-sensitive endpoints:

| Endpoint                           | Operation          | Date Rule Evaluated                                      | Audit Finding                                                                                   |
| ---------------------------------- | ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `POST /hearings`                   | Schedule Hearing   | Cannot schedule in the past                              | Validated via `validateSlotRules` (`startDt <= now` in `settings.timezone`). Safe.              |
| `PATCH /hearings/:id`              | Reschedule Hearing | Cannot reschedule to past slot                           | Validated via `validateSlotRules` in `Asia/Kolkata`. Safe.                                      |
| `POST /hearings/:id/cancel`        | Cancel Hearing     | Any scheduled hearing can be cancelled                   | Reason $\ge 5$ chars. Future hearings can be cancelled ahead of time. Safe.                     |
| `POST /cases/:id/judgment/reserve` | Reserve Judgment   | No date input (records `now`)                            | Preconditions verify $\ge 1$ completed hearing, 0 scheduled hearings, case `UNDER_TRIAL`. Safe. |
| `POST /cases/:id/judgment/deliver` | Deliver Judgment   | Judgment date $\le$ today IST and $\ge$ reservation date | Validated via `targetDtIST > todayStartIST` in `COURT_TZ` (`Asia/Kolkata`). Safe.               |
| `POST /cases`                      | Register Case      | Filing date cannot be in future                          | Validated via `parsedFilingDate.getTime() > now.getTime()`. Safe.                               |

**Conclusion:** The defect was isolated strictly to `adjournHearing` (missing date check) and `completeHearing` (raw timestamp comparison).

---

## 5. Automated Regression Test Suite

An 8-test regression suite was integrated into `server/tests/hearings.test.js` under the block:  
`describe('Future-Dated Hearing Complete & Adjourn IST Regression Suite', ...)`

### Test Coverage Details:

1. **Future Adjournment Rejection (Judge & Admin)**:
   - Presiding Judge attempting to adjourn a future hearing is rejected with HTTP 400.
   - Admin attempting to adjourn a future hearing is rejected with HTTP 400.
   - Error message contains `future date` and the formatted date string (e.g. `02 Oct 2026`).
2. **Future Completion Rejection (Judge & Admin)**:
   - Presiding Judge attempting to complete a future hearing is rejected with HTTP 400.
   - Admin attempting to complete a future hearing is rejected with HTTP 400.
   - Error message contains `future date` and the formatted date string.
3. **Same-Day Hearing Completion (Today IST)**:
   - Presiding Judge completes a hearing scheduled on today's date (`2026-09-28`).
   - Returns HTTP 200 OK; status transitions to `COMPLETED`.
4. **Same-Day Hearing Adjournment (Today IST)**:
   - Admin adjourns a hearing scheduled on today's date.
   - Returns HTTP 200 OK; status transitions to `ADJOURNED`.
5. **Earlier Today Hearing Completion / Adjournment**:
   - Hearing scheduled earlier today (09:30 IST today) is accepted with HTTP 200 OK.
6. **UTC Date Boundary - 00:30 IST Today (19:00 UTC Yesterday)**:
   - A hearing at 00:30 IST falls on yesterday's date in UTC calendar time (`-1 day 19:00Z`).
   - Server correctly evaluates calendar day in `Asia/Kolkata` as today.
   - Completion succeeds with HTTP 200 OK.
7. **UTC Date Boundary - 23:30 IST Today (18:00 UTC Today)**:
   - A hearing at 23:30 IST falls on today's date in UTC.
   - Server correctly evaluates calendar day in `Asia/Kolkata` as today.
   - Adjournment succeeds with HTTP 200 OK.
8. **UTC Date Boundary - 00:30 IST Tomorrow (19:00 UTC Today)**:
   - A hearing at 00:30 IST tomorrow falls on "today" in UTC (`19:00Z today`).
   - Server correctly evaluates calendar day in `Asia/Kolkata` as tomorrow (future).
   - Both complete and adjourn are rejected with HTTP 400 and clear message containing the date.

---

## 6. Verification and Quality Evidence

All required quality checks passed cleanly:

```bash
# 1. ESLint Check
$ npm run lint
✖ 10 problems (0 errors, 10 warnings)  # PASS

# 2. Prettier Formatting
$ npm run format:check
Checking formatting...
All matched files use Prettier code style!  # PASS

# 3. Full Test Suite Execution
$ npm test
✓ server/tests/advocates.test.js (36 tests)
✓ server/tests/auth.test.js (37 tests)
✓ server/tests/cases.test.js (28 tests)
✓ server/tests/hearings.test.js (42 tests)
✓ server/tests/judgments.test.js (42 tests)
Test Files  5 passed (5)
     Tests  185 passed (185)  # PASS

# 4. Multi-Timezone Execution
$ npm run test:tz
✔ All tests passed under TZ=UTC (185 tests)
✔ All tests passed under TZ=Asia/Kolkata (185 tests)
>>> ALL TIMEZONE TEST RUNS PASSED SUCCESSFULLY (CODE 0) <<<  # PASS

# 5. Client Production Build
$ npm run build --prefix client
✓ 1681 modules transformed.
✓ built in 14.76s  # PASS (Code 0)

# 6. Database Baseline Verification
$ npm run db:verify
[1/5] Checking table row counts... PASS (users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 26, hearings: 16, hearingEvents: 25, judgments: 4, caseStatusHistory: 50, caseSequences: 2, systemSettings: 10)
[2/5] Validating case lifecycle records consistency... PASS
[3/5] Checking for courtroom, judge and case scheduling conflicts & audit events... PASS (7 SCHEDULED hearings, zero collisions)
[4/5] Checking judgment uniqueness and lifecycle constraints... PASS (4 judgments)
[5/5] Checking backlog threshold cases... PASS (5 open cases > 90 days)
>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0) <<<

# 7. System Health Endpoint
$ curl http://localhost:5000/api/v1/health
{"success":true,"message":"System is healthy","data":{"api":"ok","database":"connected"}}
```

---

## 7. Modified Files Summary

| File                                                                                                                                           | Change Description                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [server/src/controllers/hearing.controller.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/src/controllers/hearing.controller.js) | Added IST calendar date comparison (`hearingDayIST > todayIST`) in `completeHearing` and `adjournHearing`, returning HTTP 400 with formatted date for future-dated hearings.                                        |
| [server/tests/hearings.test.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/tests/hearings.test.js)                               | Added `beforeEach` import and 8-test regression suite covering future rejection, same-day acceptance, earlier today acceptance, and UTC boundary edge cases (00:30 IST today, 23:30 IST today, 00:30 IST tomorrow). |
| [client/src/pages/Hearings.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/pages/Hearings.jsx)                               | Imported `DateTime` from `luxon`, implemented `isFutureDatedIST` and `formatISTDateShort`, disabled Complete and Adjourn buttons with tooltips for future hearings across Cause List and Registry.                  |
| [client/src/pages/CaseDetail.jsx](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/client/src/pages/CaseDetail.jsx)                           | Imported `DateTime` from `luxon`, added `isFutureDatedIST` and `formatISTDateShort`, updated hearings table action column to disable Complete and Adjourn with tooltips for future hearings.                        |
| [docs/HEARINGS.md](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/docs/HEARINGS.md)                                                         | Documented the IST date restriction (`hearingDayIST <= todayIST`) on `/hearings/:id/complete` and `/hearings/:id/adjourn`.                                                                                          |
| [reports/PHASE_6_FIX2_REPORT.md](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/reports/PHASE_6_FIX2_REPORT.md)                             | This fix report.                                                                                                                                                                                                    |
