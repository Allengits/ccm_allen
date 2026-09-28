# Court CMS - Advocate Management & Case Assignment Specification

This document details the architecture, permissions, API specifications, business validation rules, workflow state transitions, and audit trail mechanics for the **Advocate Directory and Case Assignment** module in the Court Case Management System (Phase 5).

---

## 1. Module Overview & Philosophy

Legal counsel representation forms a cornerstone of adversarial judicial procedure. In Court CMS, the advocate domain fulfills two primary functions:

1. **Advocate Directory & Bar Registry**: Maintaining an official, verified directory of advocates enrolled with the Bar Council, tracking practice specializations, verified credentials, and linked portal accounts.
2. **Case Assignment & Automated Lifecycle Advancement**: Managing formal legal appearances (Vakalatnama filings) on behalf of petitioners and respondents. Advocate assignment automatically transitions a case from `REGISTERED` to `ADVOCATE_ASSIGNED`, providing a foundation for subsequent hearing scheduling.

### Immutable Record Retention & No-Delete Policy

In judicial systems, advocate appearances are legal facts referenced in court daily orders, summonses, and final decrees. Consequently:

- **No `DELETE /advocates` or `DELETE /cases/:id/advocates/:id` endpoint exists**.
- When counsel withdraws or is replaced, their assignment record is soft-deactivated (`is_active = false`), recording an unassignment timestamp, authorizing clerk ID, and mandatory recorded justification.
- Bar Council enrollment numbers (`barNumber`) are immutable post-registration to preserve cross-system verification fidelity.

---

## 2. RBAC Permissions Matrix

Granular permissions governing advocate management and assignment are defined in `server/src/config/permissions.js` and mirrored in `client/src/constants/permissions.js`:

| Permission String | Description                                                                    | Authorized Roles              | Forbidden Roles (403) |
| :---------------- | :----------------------------------------------------------------------------- | :---------------------------- | :-------------------- |
| `advocate.view`   | Browse full advocate directory, filter by specialization/login, view caseloads | `ADMIN`, `REGISTRAR`, `JUDGE` | `ADVOCATE`*           |
| `advocate.manage` | Register new advocates, modify contact info and practice specialization        | `ADMIN`, `REGISTRAR`          | `JUDGE`, `ADVOCATE`   |
| `advocate.assign` | Assign legal counsel to cases, record withdrawals/unassignments                | `ADMIN`, `REGISTRAR`          | `JUDGE`, `ADVOCATE`   |

_\* Note: The `ADVOCATE` role cannot view the directory table, but has scoped permission to view their own profile and representations via `GET /advocates/:id` when `:id` matches their own linked record._

---

## 3. Advocate Directory API (`/api/v1/advocates`)

### 3.1 List Advocates Directory

`GET /api/v1/advocates`

- **Guarded By**: `advocate.view`
- **Query Parameters**:
  - `page` (integer, default: `1`): Pagination offset page.
  - `pageSize` (integer, default: `10`, max: `50`): Number of records per page.
  - `q` (string, optional): Case-insensitive search across advocate `name`, `barNumber`, and `email`.
  - `specialization` (string, optional): Exact filter by legal specialization.
  - `hasLogin` (boolean, optional: `'true'` or `'false'`): Filter by whether advocate has an active linked court portal user account.
- **Performance & N+1 Prevention**: Active and total caseload counts are batched via eager loading (`include.caseAssignments`), eliminating N+1 SQL queries.

**Response (200 OK)**:

```json
{
  "success": true,
  "message": "Advocates directory retrieved successfully",
  "data": {
    "items": [
      {
        "id": "c7a8b9c0-1234-4567-89ab-cdef01234567",
        "name": "Harish Mehta",
        "barNumber": "D/1998/0142",
        "specialization": "Criminal Law & Constitutional Writs",
        "email": "adv.mehta@courtcms.gov.in",
        "phone": "+91 98110 23456",
        "hasLogin": true,
        "loginActive": true,
        "activeCaseCount": 4,
        "totalCaseCount": 5
      }
    ],
    "page": 1,
    "pageSize": 10,
    "total": 6,
    "totalPages": 1
  }
}
```

---

### 3.2 Get Advocate Profile & Cases

`GET /api/v1/advocates/:id`

- **Guarded By**: Authenticated session.
- **Role Scoping Rules**:
  - `ADVOCATE`: May **only** view their own linked profile. Attempting to view any other advocate returns `404 Not Found`.
  - `ADMIN`, `REGISTRAR`, `JUDGE`: May view any advocate.
- **Case Visibility Scoping**: Cases listed under the advocate profile are strictly filtered using `caseVisibilityFilter(req.user)`. A presiding judge only sees cases within their bench allocation; out-of-scope cases are never leaked.

**Response (200 OK)**:

```json
{
  "success": true,
  "message": "Advocate profile retrieved successfully",
  "data": {
    "advocate": {
      "id": "c7a8b9c0-1234-4567-89ab-cdef01234567",
      "name": "Harish Mehta",
      "barNumber": "D/1998/0142",
      "specialization": "Criminal Law & Constitutional Writs",
      "email": "adv.mehta@courtcms.gov.in",
      "phone": "+91 98110 23456",
      "hasLogin": true,
      "loginActive": true,
      "activeCaseCount": 4,
      "totalCaseCount": 5,
      "cases": [
        {
          "caseId": "e1f2a3b4-5678-90ab-cdef-1234567890ab",
          "caseNumber": "CC/2026/00101",
          "title": "State vs. Rajesh Kumar & Ors.",
          "status": "HEARING_SCHEDULED",
          "caseType": "CRIMINAL",
          "filingDate": "2026-08-15T00:00:00.000Z",
          "side": "RESPONDENT",
          "isActive": true,
          "assignedAt": "2026-08-20T10:00:00.000Z",
          "unassignedAt": null,
          "unassignReason": null
        }
      ]
    }
  }
}
```

---

### 3.3 Register Advocate

`POST /api/v1/advocates`

- **Guarded By**: `advocate.manage` (`ADMIN`, `REGISTRAR`)
- **Validation Rules**:
  - `name`: String, 2-100 characters.
  - `barNumber`: Required, trimmed, uppercased. Must match `/^[A-Z0-9/-]{5,20}$/`. Must be globally unique in database.
  - `specialization`: Required string, 2-100 characters.
  - `email`: Valid RFC email format.
  - `phone`: Optional. Validated against Indian mobile/landline formats (`+91 98XXX XXXXX`, `011-XXXXXXXX`).

**Request Payload**:

```json
{
  "name": "Advocate Ananya Deshmukh",
  "barNumber": "MAH/2021/8991",
  "specialization": "Corporate & Commercial Law",
  "email": "adv.deshmukh@lawchambers.in",
  "phone": "+91 98201 12345"
}
```

**Response (201 Created)**:

```json
{
  "success": true,
  "message": "Advocate registered successfully",
  "data": {
    "advocate": {
      "id": "d8b9c0d1-2345-6789-01bc-def012345678",
      "name": "Advocate Ananya Deshmukh",
      "barNumber": "MAH/2021/8991",
      "specialization": "Corporate & Commercial Law",
      "email": "adv.deshmukh@lawchambers.in",
      "phone": "+91 98201 12345",
      "hasLogin": false,
      "loginActive": false,
      "activeCaseCount": 0,
      "totalCaseCount": 0
    }
  }
}
```

---

### 3.4 Update Advocate

`PATCH /api/v1/advocates/:id`

- **Guarded By**: `advocate.manage` (`ADMIN`, `REGISTRAR`)
- **Mutable Fields**: `name`, `specialization`, `email`, `phone`.
- **Immutable Rule**: Including `barNumber` in payload returns `400 Bad Request` ("Bar Council enrollment number cannot be modified after registration").

---

### 3.5 Advocate Metadata

`GET /api/v1/advocates/meta`
Returns distinctive list of all registered practice specializations combined with standard Indian legal domains.

---

## 4. Case Advocate Assignment API

### 4.1 Assign Advocate to Case

`POST /api/v1/cases/:id/advocates`

- **Guarded By**: `advocate.assign` (`ADMIN`, `REGISTRAR`)
- **Body Schema**:
  ```json
  {
    "advocateId": "UUID",
    "side": "PETITIONER" | "RESPONDENT"
  }
  ```

#### Core Business Rules & Preconditions:

1. **Case Status**: Target case must not be `CLOSED`. Returns `400 Bad Request`.
2. **Advocate User State**: If the advocate has a linked user account, it must be active (`isActive = true`). Inactive users return `400 Bad Request`.
3. **Conflict of Interest**: An advocate cannot actively represent both sides on the same docket. Attempting to assign counsel to `RESPONDENT` when already representing `PETITIONER` returns `400 Bad Request` ("Conflict of interest").
4. **Duplicate Active Assignment**: An advocate cannot be assigned twice to the same side while active. Returns `400 Bad Request`.
5. **Side Representation Limit**: Maximum 2 active advocates allowed per side per case (`PETITIONER`: $\le 2$, `RESPONDENT`: $\le 2$). Returns `400 Bad Request`.
6. **Reactivation of Prior Counsel**: If an advocate was previously assigned and unassigned on this case, the existing row is reactivated: `is_active` set to `true`, new `assigned_at` timestamp, new `assigned_by_id`, and unassigned fields (`unassigned_at`, `unassigned_by_id`, `unassign_reason`) cleared.
7. **Soft Workload Warning Threshold**: System setting `advocate_workload_warning_threshold` (seeded as `15`). If the advocate's open active case count $\ge$ threshold, assignment is permitted, but a warning string is returned in `data.warning`.
8. **Concurrency Resilience**: Database composite unique constraint on `(case_id, advocate_id)` prevents duplicate race conditions during simultaneous requests.

#### Automated State Transition:

When the first active advocate is assigned to a case in `REGISTERED` status:

- Case status automatically updates: `REGISTERED` $\rightarrow$ `ADVOCATE_ASSIGNED`.
- An immutable `CaseStatusHistory` record is written:
  - `fromStatus`: `'REGISTERED'`
  - `toStatus`: `'ADVOCATE_ASSIGNED'`
  - `reason`: `'Advocate <Name> assigned'`
  - `changedById`: Authenticated staff user ID.
- Assignments on cases already in `ADVOCATE_ASSIGNED` or later statuses do not modify case status.

---

### 4.2 Unassign Advocate from Case

`POST /api/v1/cases/:id/advocates/:advocateId/unassign`

- **Guarded By**: `advocate.assign` (`ADMIN`, `REGISTRAR`)
- **Body Schema**:
  ```json
  {
    "reason": "String (5-500 characters, required)"
  }
  ```

#### Rules & Automation:

1. **Mandatory Reason**: Unassignment requires a recorded reason between 5 and 500 characters.
2. **Soft Deactivation**: Sets `is_active = false`, `unassigned_at = NOW()`, `unassigned_by_id = req.user.id`, and `unassign_reason = reason`. No records are deleted.
3. **Last Advocate Protection**:
   - Removing the **last active advocate** is permitted only while the case is in `ADVOCATE_ASSIGNED` status.
   - If the case has progressed to `HEARING_SCHEDULED`, `UNDER_TRIAL`, or `JUDGMENT_RESERVED`, unassigning the sole remaining counsel is **blocked** with `400 Bad Request` ("Cannot remove the last active advocate when case is in <STATUS> status. Please assign a replacement advocate first.").
4. **Lifecycle Reversion Automation**:
   - When the last active counsel is unassigned from an `ADVOCATE_ASSIGNED` case, status automatically reverts: `ADVOCATE_ASSIGNED` $\rightarrow$ `REGISTERED`.
   - An immutable `CaseStatusHistory` record is created recording the withdrawal reason.

---

## 5. Case Workflow Service (`server/src/services/caseWorkflow.js`)

Centralizes status transitions across all system phases:

```javascript
import { transitionCaseStatus, WorkflowError } from '../services/caseWorkflow.js';

// Within a Prisma transaction:
await transitionCaseStatus({
  tx,
  caseId: targetCase.id,
  toStatus: 'ADVOCATE_ASSIGNED',
  reason: 'Advocate Harish Mehta assigned',
  userId: req.user.id,
});
```

### Transition Validation Graph:

- `REGISTERED` $\rightarrow$ `['ADVOCATE_ASSIGNED']`
- `ADVOCATE_ASSIGNED` $\rightarrow$ `['REGISTERED', 'HEARING_SCHEDULED']`
- `HEARING_SCHEDULED` $\rightarrow$ `['UNDER_TRIAL', 'ADVOCATE_ASSIGNED']`
- `UNDER_TRIAL` $\rightarrow$ `['JUDGMENT_RESERVED']`
- `JUDGMENT_RESERVED` $\rightarrow$ `['CLOSED']`
- `CLOSED` $\rightarrow$ `[]` (Terminal)

---

## 6. Audit Trail & Timeline Merging

In addition to state-machine status transitions, `GET /api/v1/cases/:id` merges `CaseAdvocate` audit events into the `statusHistory` array if they did not trigger an immediate status change (e.g., secondary advocate assignments or withdrawals during ongoing trial):

```json
{
  "id": "adv-assign-ca-id",
  "fromStatus": null,
  "toStatus": null,
  "reason": "Advocate Priya Iyer assigned to RESPONDENT",
  "changedById": "user-registrar-id",
  "changedBy": { "id": "...", "name": "Sunita Sharma", "role": "REGISTRAR" },
  "createdAt": "2026-08-20T10:00:00.000Z"
}
```

All events are sorted in descending chronological order, presenting a complete, unified historical record.
