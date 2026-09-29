# Court CMS — Automation Engine & Registry Dashboard Documentation

This document specifies the architectural design, configurable threshold parameters, stale-case rules, workload calculation formulas, query optimization strategies, RBAC scoping rules, and API specifications for the **Automation Engine and Registry Dashboard** (Phase 8).

---

## 1. Architectural Overview & Design Goals

The Dashboard serves as the central operational nerve center of the Court Case Management System. It delivers a live, real-time picture of court operations, backlog accumulation, stale case bottlenecks, upcoming judicial proceedings, and personnel workload distribution without introducing manual data entry.

### Core Architectural Principles

1. **100% Real-Time (Zero Caching Layer)**: Dashboard counts and lists reflect the exact instantaneous state of the database. Changing a setting or updating a case instantly reflects on the subsequent dashboard query.
2. **Zero N+1 Query Architecture**: All endpoints execute consolidated aggregate queries (`groupBy`, `count`, parameterized joins) and indexed batch queries. No per-row loops or secondary queries per item.
3. **Role-Scoped Visibility**:
   - **ADMIN & REGISTRAR**: Full registry-wide visibility across all cases, judges, advocates, and systemic court thresholds.
   - **JUDGE**: Registry-wide aggregate statistics, plus dedicated "My Bench" scoping for their assigned courtroom caseload. Presiding judge sees only their own workload row.
   - **ADVOCATE**: Strictly restricted to their own actively assigned cases. Cannot access registry-wide aggregates, personnel workloads, or threshold settings.
4. **Driven by Configurable System Thresholds**: All pendency warnings, stale detection triggers, and capacity limits are stored as `SystemSetting` rows in the database, with hardcoded fallbacks applied only if a database row is absent.

---

## 2. Configurable Thresholds (`SystemSetting`)

All threshold settings are stored in the `system_settings` table and queried dynamically via [dashboardSettings.js](file:///server/src/utils/dashboardSettings.js).

| Setting Key                           | Default |  Valid Range   | Scope / Purpose                                                                                                             |
| :------------------------------------ | :-----: | :------------: | :-------------------------------------------------------------------------------------------------------------------------- |
| `backlog_threshold_days`              |  `90`   | 1 – 3,650 days | Number of calendar days since filing beyond which an open case is classified as overdue backlog.                            |
| `advocate_workload_warning_threshold` |  `15`   | 1 – 500 cases  | Active open caseload threshold beyond which an advocate is flagged with an overload warning.                                |
| `judge_workload_warning_threshold`    |  `25`   | 1 – 500 cases  | Active open caseload threshold beyond which a judge bench is flagged with an overload warning.                              |
| `stale_case_no_advocate_days`         |  `14`   |  1 – 365 days  | Pendency threshold beyond which a `REGISTERED` case with no active advocate is flagged as stale (Rule 1).                   |
| `stale_case_no_hearing_days`          |  `21`   |  1 – 365 days  | Pendency threshold beyond which an `ADVOCATE_ASSIGNED` case with zero hearings ever scheduled is flagged as stale (Rule 2). |
| `upcoming_hearings_window_days`       |   `7`   |  1 – 90 days   | Forward-looking calendar window (in days) monitored on the registry dashboard.                                              |

---

## 3. Automation Rules & Metric Calculations

### 3.1 Status Distribution & Aggregate Metrics

- **Total Cases**: Count of cases visible to caller (`Case` count scoped by `caseVisibilityFilter`).
- **Total Open**: Sum of active cases with status in `['REGISTERED', 'ADVOCATE_ASSIGNED', 'HEARING_SCHEDULED', 'UNDER_TRIAL', 'JUDGMENT_RESERVED']`.
- **Total Closed**: Count of cases with status `'CLOSED'`.
- **Hearings Today**: Count of `SCHEDULED` hearings occurring between 00:00:00 and 23:59:59 IST today.
- **Upcoming Hearings**: Count of `SCHEDULED` hearings occurring within `upcoming_hearings_window_days` from now.

### 3.2 Overdue Backlog Rule

A case is classified as an **Overdue Backlog** if and only if:

1. `status != 'CLOSED'` (active open case)
2. `filingDate <= (now - backlog_threshold_days)`

Cases that have reached `CLOSED` status are strictly excluded from the backlog calculation.

### 3.3 The Two Stale-Case Rules

Stale cases represent stalled dockets requiring immediate administrative intervention:

- **Rule 1 (`NO_ADVOCATE`)**:
  - `status == 'REGISTERED'`
  - `filingDate <= (now - stale_case_no_advocate_days)`
  - `advocates: { none: { isActive: true } }` (Zero active advocates on record)
  - _Remedial Action_: Registry must assign legal counsel or legal aid.
- **Rule 2 (`NO_HEARING`)**:
  - `status == 'ADVOCATE_ASSIGNED'`
  - `advocates: { some: { isActive: true, assignedAt <= (now - stale_case_no_hearing_days) } }`
  - `hearings: { none: {} }` (Zero hearings ever scheduled on the case docket)
  - _Remedial Action_: Registry or judge must list initial preliminary hearing on cause list.

### 3.4 Workload Calculation & Overload Flagging

- **Advocate Workload**: Count of distinct active cases (`status != 'CLOSED'`) where the advocate has an active assignment (`CaseAdvocate.isActive = true`).
  - `isOverloaded = activeCaseCount > advocate_workload_warning_threshold`
- **Judge Workload**: Count of distinct active cases (`status != 'CLOSED'`) assigned to the judge (`Case.judgeId = judge.id`).
  - `isOverloaded = activeCaseCount > judge_workload_warning_threshold`

---

## 4. Query Optimization & Indexing (Zero N+1)

To guarantee sub-second response times without caching:

1. **Single Aggregate Grouping**: Status distribution is computed via `prisma.case.groupBy({ by: ['status'], _count: { id: true } })`, aggregating all 6 statuses in one database trip.
2. **Indexed Foreign Keys & Composite Filter Indexes**:
   - `cases(status)`: B-tree index for filtering open vs closed cases.
   - `cases(filing_date)`: B-tree index for threshold cutoffs.
   - `cases(judge_id)`: B-tree index for bench scoping.
   - `case_advocates(case_id, advocate_id, is_active)`: Composite index for advocate filtering.
   - `hearings(scheduled_at, status)`: B-tree index for upcoming window queries.
3. **No Per-Row Queries**: Backlog and Stale endpoints use `skip`, `take`, and Prisma relation joins (`include: { judge, advocates }`) in a single SQL query.
4. **Workload In-Memory Grouping**: Computed using a single query on `Advocate.findMany({ include: { caseAssignments: { where: { isActive: true, case: { status: { not: 'CLOSED' } } } } } })`, eliminating iterative database queries per advocate.

---

## 5. REST API Specifications

Base route: `/api/v1/dashboard`

### 5.1 `GET /api/v1/dashboard/summary`

Returns real-time caseload totals, status breakdown, backlog count, and stale count.

**Permissions**: `dashboard.view.all` (ADMIN, REGISTRAR, JUDGE) or `dashboard.view.own` (ADVOCATE).

**Response (ADMIN / REGISTRAR)**:

```json
{
  "success": true,
  "message": "Dashboard summary retrieved successfully",
  "data": {
    "totalCases": 14,
    "totalOpen": 12,
    "totalClosed": 2,
    "hearingsToday": 2,
    "upcomingHearings": 5,
    "backlogCount": 5,
    "staleCount": 2,
    "staleBreakdown": {
      "noAdvocate": 1,
      "noHearing": 1
    },
    "statusDistribution": {
      "REGISTERED": 1,
      "ADVOCATE_ASSIGNED": 1,
      "HEARING_SCHEDULED": 4,
      "UNDER_TRIAL": 5,
      "JUDGMENT_RESERVED": 1,
      "CLOSED": 2
    },
    "thresholds": {
      "backlogThresholdDays": 90,
      "advocateWorkloadWarningThreshold": 15,
      "judgeWorkloadWarningThreshold": 25,
      "staleCaseNoAdvocateDays": 14,
      "staleCaseNoHearingDays": 21,
      "upcomingHearingsWindowDays": 7
    },
    "myCaseload": null
  }
}
```

_Note: For `JUDGE`, `myCaseload` contains an identically-shaped summary object scoped to `judgeId = req.user.id`._

---

### 5.2 `GET /api/v1/dashboard/backlog`

Returns paginated worklist of open cases older than `backlog_threshold_days`.

**Query Parameters**:

- `page` (integer, default: 1)
- `pageSize` (integer, default: 10, max: 50)
- `sortBy` (`age` | `filingDate` | `status`, default: `filingDate`)
- `sortOrder` (`asc` | `desc`, default: `asc`)
- `scope` (`all` | `my`, default: `all`)

**Response**:

```json
{
  "success": true,
  "message": "Backlog cases retrieved successfully",
  "data": {
    "items": [
      {
        "id": "cm7case...",
        "caseNumber": "CC/2025/00030",
        "title": "State of Maharashtra vs R.K. Builders",
        "status": "JUDGMENT_RESERVED",
        "caseType": "CRIMINAL",
        "priority": "HIGH",
        "filingDate": "2025-08-31T05:00:00.000Z",
        "daysOpen": 210,
        "judge": { "id": "cm7...", "name": "Hon. Justice D. Y. Swaminathan" },
        "advocates": [
          { "id": "cm7...", "name": "Harish Mehta", "barNumber": "D/1998/0142", "side": "DEFENSE" }
        ]
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 10,
    "totalPages": 1,
    "thresholdDays": 90
  }
}
```

---

### 5.3 `GET /api/v1/dashboard/stale-cases`

Returns paginated worklist of stale cases matching Rule 1 or Rule 2.

**Query Parameters**:

- `page` (integer, default: 1)
- `pageSize` (integer, default: 10, max: 50)
- `rule` (`ALL` | `NO_ADVOCATE` | `NO_HEARING`, default: `ALL`)
- `scope` (`all` | `my`, default: `all`)

**Response**:

```json
{
  "success": true,
  "message": "Stale cases retrieved successfully",
  "data": {
    "items": [
      {
        "id": "cm7case101...",
        "caseNumber": "CC/2026/00101",
        "title": "State vs Rameshwar Prasad",
        "status": "REGISTERED",
        "filingDate": "2026-09-13T05:00:00.000Z",
        "daysPending": 16,
        "matchedRule": "NO_ADVOCATE",
        "ruleLabel": "Rule 1: Registered with No Advocate",
        "thresholdDays": 14,
        "judge": { "id": "cm7...", "name": "Hon. Justice D. Y. Swaminathan" },
        "advocates": []
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 10,
    "totalPages": 1,
    "staleRules": {
      "staleCaseNoAdvocateDays": 14,
      "staleCaseNoHearingDays": 21
    }
  }
}
```

---

### 5.4 `GET /api/v1/dashboard/upcoming-hearings`

Returns scheduled hearings occurring within the configured window.

**Query Parameters**:

- `page` (integer, default: 1)
- `pageSize` (integer, default: 10, max: 50)
- `days` (integer, 1–90, optional)
- `scope` (`all` | `my`, default: `all`)

---

### 5.5 `GET /api/v1/dashboard/workload`

Returns active docket counts per advocate and judge with overload flags.

**Permissions**: ADMIN, REGISTRAR, JUDGE (403 for ADVOCATE).

**Response**:

```json
{
  "success": true,
  "message": "Workload distribution retrieved successfully",
  "data": {
    "thresholdSettings": {
      "advocateWarningThreshold": 15,
      "judgeWarningThreshold": 25
    },
    "judges": [
      {
        "id": "cm7judge1...",
        "name": "Hon. Justice D. Y. Swaminathan",
        "email": "judge.swaminathan@courtcms.gov.in",
        "activeCaseCount": 6,
        "isOverloaded": false,
        "warningThreshold": 25
      }
    ],
    "advocates": [
      {
        "id": "cm7adv1...",
        "name": "Harish Mehta",
        "barNumber": "D/1998/0142",
        "specialization": "Criminal Law & Constitutional Writs",
        "activeCaseCount": 4,
        "isOverloaded": false,
        "warningThreshold": 15
      }
    ]
  }
}
```

---

### 5.6 `GET /api/v1/dashboard/settings`

Returns current threshold configurations and recent audit history.

**Permissions**: ADMIN, REGISTRAR (403 for JUDGE, ADVOCATE).

---

### 5.7 `PATCH /api/v1/dashboard/settings`

Atomically updates one or more court threshold settings and appends audit trail entries in a single database transaction.

**Permissions**: ADMIN only (403 for REGISTRAR, JUDGE, ADVOCATE).

**Request Body**:

```json
{
  "backlog_threshold_days": 120,
  "upcoming_hearings_window_days": 14
}
```

**Response**:

```json
{
  "success": true,
  "message": "Successfully updated 2 threshold setting(s)",
  "data": {
    "thresholds": {
      "backlog_threshold_days": 120,
      "advocate_workload_warning_threshold": 15,
      "judge_workload_warning_threshold": 25,
      "stale_case_no_advocate_days": 14,
      "stale_case_no_hearing_days": 21,
      "upcoming_hearings_window_days": 14
    },
    "updatedKeys": ["backlog_threshold_days", "upcoming_hearings_window_days"],
    "auditEntries": [
      {
        "id": "audit:1774849200000:a1b2c3d4",
        "settingKey": "backlog_threshold_days",
        "oldValue": "90",
        "newValue": "120",
        "changedById": "cm7admin...",
        "changedByName": "Rajesh Varma (Registrar Admin)",
        "changedAt": "2026-09-29T10:45:00.000Z"
      }
    ]
  }
}
```
