# Case Management & Docket Registry Documentation

This document describes the case registration architecture, automated sequential case numbering, role-based visibility scoping, editability constraints, backlog pendency calculations, and REST API contracts implemented in Phase 4 of the Court Case Management System (Court CMS).

---

## 1. Overview & Architectural Principles

Phase 4 introduces master case registration, lifecycle docket tracking, and information shielding. The system guarantees that:

- Every case registered receives an **atomic, collision-free case number** generated sequentially within a transactional lock.
- Case visibility is strictly enforced by the caller's judicial role on both list and detail queries.
- Requests for cases outside a user's authorized visibility return **HTTP 404 Not Found** (rather than 403 Forbidden) to shield the existence of sensitive dockets.
- **No deletion endpoint exists**: Court records, dockets, and audit trails are immutable legal artifacts and cannot be destroyed.

---

## 2. Automated Sequential Case Number Generation

Case numbers strictly adhere to the standardized Indian judicial format:

$$\text{PREFIX} / \text{YEAR} / \text{NUMBER}$$

- **PREFIX**: Determined strictly by the case's statutory classification (`CaseType`).
- **YEAR**: The 4-digit calendar year of registration (e.g. `2026`).
- **NUMBER**: A 5-digit, zero-padded integer representing the sequential filing index for that prefix and year (e.g. `00113`).

### 2.1 Prefix Mapping Table

| CaseType Enum    | Docket Prefix | Description                           | Example Number  |
| :--------------- | :-----------: | :------------------------------------ | :-------------- |
| `CRIMINAL`       |     `CC`      | Calendar Case / Criminal Case         | `CC/2026/00113` |
| `CIVIL`          |     `CV`      | Civil Suit / Original Suit            | `CV/2026/00001` |
| `FAMILY`         |     `FM`      | Family Dispute / Matrimonial Petition | `FM/2026/00001` |
| `PROPERTY`       |     `PR`      | Property & Land Title Dispute         | `PR/2026/00001` |
| `COMMERCIAL`     |     `CM`      | Commercial Suit / Arbitration         | `CM/2026/00001` |
| `CONSTITUTIONAL` |     `WP`      | Writ Petition / Constitutional Bench  | `WP/2026/00001` |
| `OTHER`          |     `MC`      | Miscellaneous Case                    | `MC/2026/00001` |

### 2.2 Concurrency & Transactional Integrity

Case number generation and initial record creation take place inside a single **Prisma interactive database transaction (`prisma.$transaction`)**:

1. **Row-Level Lock**: The system looks up the `CaseSequence` row for the tuple `(prefix, year)`.
2. **Atomic Increment**: In MySQL, updating the `CaseSequence` row inside the transaction acquires an exclusive row-level write lock. Concurrent registration requests queue on this lock, guaranteeing that simultaneous filings receive strictly consecutive, non-colliding numbers.
3. **Dynamic Sequence Initialization**: If no sequence row exists for a prefix/year combination, the transaction scans existing cases for the highest numerical suffix, initializes `lastNumber = maxNumber + 1`, and creates the sequence row.
4. **Immediate Audit Logging**: Within the same transaction, a `CaseStatusHistory` record is written (`fromStatus: null`, `toStatus: 'REGISTERED'`, `reason: 'Case registered'`), ensuring atomic audit trail creation.

---

## 3. Role-Based Visibility Scoping & Information Shielding

Every query to `/api/v1/cases` and `/api/v1/cases/:id` automatically applies `caseVisibilityFilter(req.user)`.

| Role          | Visibility Scope                                                                                 | Technical Filter                                                           |
| :------------ | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **ADMIN**     | Unrestricted access to all judicial dockets                                                      | `{}`                                                                       |
| **REGISTRAR** | Unrestricted access across registry filings                                                      | `{}`                                                                       |
| **JUDGE**     | Scoped exclusively to cases assigned to their judicial bench                                     | `{ judgeId: user.id }`                                                     |
| **ADVOCATE**  | Scoped exclusively to cases where their linked Advocate profile is active counsel on either side | `{ advocates: { some: { advocateId: user.advocateId, isActive: true } } }` |

### 3.1 404 Information Shielding Rule

When a user requests a specific case (`GET /api/v1/cases/:id`):

- If the case does not exist in the database $\rightarrow$ returns **404 Case not found**.
- If the case exists in the database, but is assigned to a different judge or advocate outside the caller's visibility filter $\rightarrow$ returns **404 Case not found**.
- **Security Rationale**: Returning HTTP 403 would confirm the existence of a sealed, confidential, or private docket. Returning HTTP 404 ensures zero metadata leakage.

---

## 4. Case Editability & Immutability Rules

The `PATCH /api/v1/cases/:id` endpoint is restricted to users with `case.edit` permission (`ADMIN` and `REGISTRAR`).

### 4.1 Permitted Editable Fields

- `title`: Case docket caption (required non-empty string).
- `petitioner`: Complainant / Plaintiff name.
- `respondent`: Accused / Defendant name.
- `description`: Case synopsis and brief.
- `priority`: Classification level (`NORMAL` or `URGENT`).
- `judgeId`: Assigned presiding judge (must be an active user with role `JUDGE`, or `null` to unassign).

### 4.2 Strictly Immutable Fields

The following fields **cannot be modified** through `PATCH /cases/:id`:

- `caseNumber`: Permanently assigned sequential court identifier.
- `caseType`: Statutory classification assigned at registration.
- `filingDate`: Fixed historical timestamp of registration.
- `status`: Lifecycle transitions occur exclusively through formal workflow phases (e.g., assigning advocates in Phase 5, scheduling hearings in Phase 6, delivering judgments in Phase 8).

Any payload containing these immutable keys is rejected with **HTTP 400 Bad Request**.

### 4.3 Closed Case Protection

If `status === 'CLOSED'`, the case is legally disposed. Any attempt to update a closed case is rejected with **HTTP 400 Bad Request** (`"Closed cases cannot be edited"`).

### 4.4 Prohibition of Deletion

There is **no DELETE endpoint** in Court CMS. In judicial practice, case filings, proceedings, and orders constitute official public records. Deleting records violates statutory preservation requirements. Erroneously filed cases are disposed of through formal judicial dismissal or closure orders, never by database deletion.

---

## 5. Backlog Pendency Calculation

Indian courts track case backlog based on pendency thresholds:

- The system reads `backlog_threshold_days` from the `system_settings` table (seeded at `90` days).
- For every case, the server computes:
  $$\text{ageDays} = \left\lfloor \frac{\text{now} - \text{filingDate}}{1000 \times 60 \times 60 \times 24} \right\rfloor$$
- A case is marked `isBacklog: true` if and only if:
  $$\text{status} \neq \text{'CLOSED'} \quad \text{AND} \quad \text{ageDays} \ge \text{backlogThresholdDays}$$
- In `GET /api/v1/cases?backlog=true`, only open cases exceeding this threshold are returned.

---

## 6. REST API Endpoints Reference

All endpoints require authentication (session cookie `court_cms_token`) and return standard JSON structures.

### 6.1 `GET /api/v1/cases/meta`

Retrieves dropdown choices for filing and filtering. Requires `case.view`.

- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Case metadata retrieved successfully",
    "data": {
      "caseTypes": [
        "CRIMINAL",
        "CIVIL",
        "FAMILY",
        "PROPERTY",
        "COMMERCIAL",
        "CONSTITUTIONAL",
        "OTHER"
      ],
      "priorities": ["NORMAL", "URGENT"],
      "statuses": [
        "REGISTERED",
        "ADVOCATE_ASSIGNED",
        "HEARING_SCHEDULED",
        "UNDER_TRIAL",
        "JUDGMENT_RESERVED",
        "CLOSED"
      ],
      "judges": [
        { "id": "b529856d-...", "name": "Justice Soumitra Banerjee" },
        { "id": "fe393f43-...", "name": "Justice Meenakshi Swaminathan" }
      ]
    }
  }
  ```

---

### 6.2 `GET /api/v1/cases/stats`

Retrieves live counts for total open cases and overdue cases scoped by user visibility. Requires `case.view`.

- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Case statistics retrieved successfully",
    "data": {
      "totalOpenCases": 12,
      "overdueCases": 5,
      "backlogThresholdDays": 90
    }
  }
  ```

---

### 6.3 `POST /api/v1/cases`

Registers a new court case with an auto-generated case number. Requires `case.create` (`ADMIN` or `REGISTRAR`).

- **Request Body**:
  ```json
  {
    "title": "State of NCT vs. Rajesh Kumar & Ors.",
    "caseType": "CRIMINAL",
    "priority": "URGENT",
    "petitioner": "State through Inspector S.K. Verma",
    "respondent": "Rajesh Kumar, Sunil Kumar",
    "description": "Criminal breach of trust and cheating under Section 420 IPC",
    "filingDate": "2026-09-28T06:00:00.000Z",
    "judgeId": "b529856d-..."
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Case registered successfully",
    "data": {
      "case": {
        "id": "cm7case...",
        "caseNumber": "CC/2026/00113",
        "title": "State of NCT vs. Rajesh Kumar & Ors.",
        "caseType": "CRIMINAL",
        "status": "REGISTERED",
        "priority": "URGENT",
        "petitioner": "State through Inspector S.K. Verma",
        "respondent": "Rajesh Kumar, Sunil Kumar",
        "description": "Criminal breach of trust and cheating under Section 420 IPC",
        "filingDate": "2026-09-28T06:00:00.000Z",
        "judgeId": "b529856d-...",
        "registeredById": "f67cb100-...",
        "createdAt": "2026-09-28T06:50:00.000Z",
        "updatedAt": "2026-09-28T06:50:00.000Z"
      }
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Future filing date, empty required fields, or non-judge assigned.
  - `403 Forbidden`: User lacks `case.create` permission (e.g. Judge or Advocate).

---

### 6.4 `GET /api/v1/cases`

Lists judicial cases with filtering, search, pagination, and sorting. Requires `case.view`.

- **Query Parameters**:
  - `page`: Page index (default: `1`).
  - `pageSize`: Items per page (default: `10`, max: `50`).
  - `q`: Search keyword matching `caseNumber`, `title`, `petitioner`, or `respondent`.
  - `status`: Filter by `CaseStatus`.
  - `caseType`: Filter by `CaseType`.
  - `priority`: Filter by `Priority` (`NORMAL` or `URGENT`).
  - `judgeId`: Filter by presiding judge user ID.
  - `backlog`: Boolean (`true` or `1`) for open cases exceeding threshold days.
  - `from`: Start of filing date range (`YYYY-MM-DD`).
  - `to`: End of filing date range (`YYYY-MM-DD`).
  - `sortBy`: Sort field (`filingDate`, `caseNumber`, `priority`, `status`). Default: `filingDate`.
  - `sortOrder`: Sort direction (`asc` or `desc`). Default: `desc`.

- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Cases retrieved successfully",
    "data": {
      "items": [
        {
          "id": "cm7case...",
          "caseNumber": "CC/2026/00113",
          "title": "State of NCT vs. Rajesh Kumar & Ors.",
          "caseType": "CRIMINAL",
          "status": "REGISTERED",
          "priority": "URGENT",
          "petitioner": "State through Inspector S.K. Verma",
          "respondent": "Rajesh Kumar, Sunil Kumar",
          "filingDate": "2026-09-28T06:00:00.000Z",
          "ageDays": 0,
          "isBacklog": false,
          "judgeName": "Justice Soumitra Banerjee",
          "primaryAdvocateNames": [],
          "nextHearingDate": null
        }
      ],
      "page": 1,
      "pageSize": 10,
      "total": 1,
      "totalPages": 1
    }
  }
  ```

---

### 6.5 `GET /api/v1/cases/:id`

Retrieves full case details along with related advocates, hearings, judgment, and audit trail history. Requires `case.view`.

- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Case retrieved successfully",
    "data": {
      "case": {
        "id": "cm7case...",
        "caseNumber": "CC/2025/00045",
        "title": "State vs. Satish Kumar & Anr.",
        "caseType": "CRIMINAL",
        "status": "UNDER_TRIAL",
        "priority": "URGENT",
        "petitioner": "State through Police Station Karol Bagh",
        "respondent": "Satish Kumar, Manoj Kumar",
        "description": "Armed robbery and conspiracy under Section 392/120B IPC",
        "filingDate": "2025-04-12T00:00:00.000Z",
        "ageDays": 534,
        "isBacklog": true,
        "judge": {
          "id": "b529856d-...",
          "name": "Justice Soumitra Banerjee",
          "email": "judge.banerjee@courtcms.gov.in"
        },
        "registeredBy": {
          "id": "f67cb100-...",
          "name": "Anita Desai (Chief Registrar)",
          "email": "registrar@courtcms.gov.in"
        },
        "advocates": [
          {
            "id": "cm7ca...",
            "side": "PETITIONER",
            "assignedAt": "2025-04-18T10:00:00.000Z",
            "isActive": true,
            "advocate": {
              "id": "cm7adv...",
              "name": "Adv. Zaid Khan",
              "barNumber": "D/2104/2015",
              "specialization": "CRIMINAL"
            }
          }
        ],
        "hearings": [],
        "judgment": null,
        "statusHistory": [
          {
            "id": "cm7hist...",
            "fromStatus": "HEARING_SCHEDULED",
            "toStatus": "UNDER_TRIAL",
            "reason": "Charges framed and trial commenced",
            "createdAt": "2025-06-10T11:00:00.000Z",
            "changedBy": {
              "id": "b529856d-...",
              "name": "Justice Soumitra Banerjee",
              "role": "JUDGE"
            }
          }
        ]
      }
    }
  }
  ```
- **Error Response (404 Not Found)**: Returned if the case does not exist or falls outside the user's role visibility filter.

---

### 6.6 `PATCH /api/v1/cases/:id`

Updates editable metadata on an active case. Requires `case.edit` (`ADMIN` or `REGISTRAR`).

- **Request Body**:
  ```json
  {
    "title": "State vs. Satish Kumar & 2 Ors. (Amended)",
    "priority": "URGENT",
    "description": "Supplementary chargesheet added accused 3"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Case updated successfully",
    "data": {
      "case": {
        "id": "cm7case...",
        "caseNumber": "CC/2025/00045",
        "title": "State vs. Satish Kumar & 2 Ors. (Amended)",
        "priority": "URGENT",
        "updatedAt": "2026-09-28T07:00:00.000Z"
      }
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Attempting to edit closed cases, empty title, or sending immutable fields (`caseNumber`, `caseType`, `filingDate`, `status`).
  - `403 Forbidden`: User lacks `case.edit` permission.
  - `404 Not Found`: Case not found.
