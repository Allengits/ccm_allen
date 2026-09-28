# Court CMS — Judgment Tracker Module Documentation

This document specifies the architectural design, database schemas, state machine transitions, concurrency control, business rules, API contracts, RBAC permissions, and permanent read-only guarantees for the **Judgment Tracker Module** (Phase 7).

---

## 1. Architectural Overview & Design Goals

The Judgment Tracker module enables the judiciary to conclude trials cleanly and transparently:

1. **Reserve Phase**: When oral arguments and evidence hearings are concluded, a presiding judge or court admin reserves judgment, placing the case in `JUDGMENT_RESERVED` status.
2. **Delivery Phase**: Once the judgment is authored, the presiding judge or admin pronounces the judgment, records the operative summary and outcome, sets the official judgment date, and transitions the case to `CLOSED`.
3. **Permanent Read-Only Guarantees**: A `CLOSED` case is permanently sealed. No further modifications to case metadata, advocate assignments, or hearing schedules are permitted.
4. **Out of Scope (By Design)**: Post-decree amendments, clerical corrections (Section 152 CPC), appeals, review petitions, and execution proceedings are explicitly out of scope for Phase 7. Delivered judgments are immutable.

---

## 2. Database Model & Schema (`schema.prisma`)

Phase 7 activates the existing `judgments` table and introduces new lifecycle states and timestamps.

### 2.1 Prisma Schema Definitions

```prisma
enum CaseStatus {
  REGISTERED
  ADVOCATE_ASSIGNED
  HEARING_SCHEDULED
  UNDER_TRIAL
  JUDGMENT_RESERVED
  CLOSED
}

enum JudgmentStatus {
  RESERVED
  DELIVERED
}

enum JudgmentOutcome {
  ALLOWED
  DISMISSED
  CONVICTED
  ACQUITTED
  SETTLED
  DISPOSED
}

model Case {
  id              String              @id @default(uuid())
  caseNumber      String              @unique @map("case_number")
  title           String
  description     String?             @db.Text
  caseType        CaseType            @map("case_type")
  status          CaseStatus          @default(REGISTERED)
  judgeId         String?             @map("judge_id")
  judge           User?               @relation("JudgeCases", fields: [judgeId], references: [id], onDelete: SetNull)
  filingDate      DateTime            @default(now()) @map("filing_date")
  closedAt        DateTime?           @map("closed_at")
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")

  caseAdvocates   CaseAdvocate[]
  statusHistory   CaseStatusHistory[]
  hearings        Hearing[]
  judgment        Judgment?

  @@index([status])
  @@index([judgeId])
  @@index([caseType])
  @@map("cases")
}

model Judgment {
  id            String          @id @default(uuid())
  caseId        String          @unique @map("case_id")
  case          Case            @relation(fields: [caseId], references: [id], onDelete: Restrict)
  judgeId       String          @map("judge_id")
  judge         User            @relation("JudgeJudgments", fields: [judgeId], references: [id], onDelete: Restrict)
  status        JudgmentStatus  @default(RESERVED)
  outcome       JudgmentOutcome?
  summary       String?         @db.Text
  reserveNote   String?         @db.Text @map("reserve_note")
  reservedAt    DateTime        @default(now()) @map("reserved_at")
  reservedById  String?         @map("reserved_by_id")
  reservedBy    User?           @relation("JudgmentReservedBy", fields: [reservedById], references: [id], onDelete: Restrict)
  judgmentDate  DateTime?       @map("judgment_date")
  deliveredAt   DateTime?       @map("delivered_at")
  deliveredById String?         @map("delivered_by_id")
  deliveredBy   User?           @relation("JudgmentDeliveredBy", fields: [deliveredById], references: [id], onDelete: Restrict)
  createdAt     DateTime        @default(now()) @map("created_at")
  updatedAt     DateTime        @updatedAt @map("updated_at")

  @@index([status])
  @@index([outcome])
  @@index([judgmentDate])
  @@index([reservedAt])
  @@index([judgeId])
  @@map("judgments")
}
```

---

## 3. Concurrency Control & State Machine

### 3.1 Pessimistic Row Locking (`SELECT ... FOR UPDATE`)

Both reservation (`POST /cases/:id/judgment/reserve`) and delivery (`POST /cases/:id/judgment/deliver`) are wrapped in a single atomic Prisma transaction (`prisma.$transaction(async (tx) => { ... })`).
Before checking status or writing data, the controller acquires an exclusive lock:

```sql
SELECT id FROM cases WHERE id = $caseId FOR UPDATE;
SELECT id FROM judgments WHERE case_id = $caseId FOR UPDATE;
```

This guarantees:

- Concurrent requests cannot reserve judgment on the same case twice.
- Concurrent delivery attempts result in exactly 1 successful delivery and 409 Conflict responses for all other attempts.
- No race condition can bypass the scheduled hearing check or completed hearing check.

### 3.2 State Transitions (`caseWorkflow.js`)

| Source Status       | Allowed Target Statuses                  | Guard Conditions                                                               |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `UNDER_TRIAL`       | `JUDGMENT_RESERVED`, `HEARING_SCHEDULED` | Reservation requires $\ge 1$ `COMPLETED` hearing and $0$ `SCHEDULED` hearings. |
| `JUDGMENT_RESERVED` | `CLOSED`                                 | Delivery requires valid `outcome` enum and summary text ($\ge 20$ characters). |
| `CLOSED`            | _(None — Terminal State)_                | Permanently immutable. Any mutation attempt returns 400 Bad Request.           |

---

## 4. Business & Validation Rules

### 4.1 Reservation Rules

1. **Case Status**: The case must currently be in `UNDER_TRIAL`. Non-UNDER_TRIAL cases are rejected with `409 Conflict`, explicitly citing current and required statuses.
2. **Prior Hearings Completed**: The case must have at least one hearing with `COMPLETED` status.
3. **No Pending Scheduled Hearings**: The case must have zero hearings with `SCHEDULED` status. If scheduled hearings exist, the endpoint rejects with `400 Bad Request` naming the exact count of pending hearings.
4. **Duplicate Prevention**: If a `Judgment` record already exists for the case, the request is rejected with `409 Conflict`.
5. **Note Length**: Optional `note` field must be at least 5 characters if provided.
6. **Presiding Judge Boundary**: A `JUDGE` can only reserve judgment on cases assigned to them. `ADMIN` can reserve on any case.

### 4.2 Delivery Rules

1. **Case Status**: Case must be in `JUDGMENT_RESERVED`. If already delivered or CLOSED, returns `409 Conflict`.
2. **Outcome**: Must be one of `ALLOWED`, `DISMISSED`, `CONVICTED`, `ACQUITTED`, `SETTLED`, `DISPOSED`.
3. **Summary**: Required string, minimum 20 characters, maximum 10,000 characters.
4. **Judgment Date**:
   - Default: Today's date in Indian Standard Time (`Asia/Kolkata`).
   - May be backdated to the reservation date, but **cannot be in the future** (IST calendar date).
   - Cannot be earlier than the reservation date in IST.
5. **Case Closure**: Automatically updates `cases.status` to `CLOSED` and stamps `cases.closed_at` to the exact UTC timestamp.
6. **Audit Trail**: Appends a `CaseStatusHistory` event documenting the judgment delivery with outcome, judge name, and date.

### 4.3 Permanent Read-Only Rules for CLOSED Cases

Any of the following operations on a `CLOSED` case are blocked with `400 Bad Request`:

- `PATCH /api/v1/cases/:id` (updating title, description, caseType, or judge reassignment)
- `POST /api/v1/cases/:id/advocates` (assigning a new advocate)
- `POST /api/v1/cases/:id/advocates/:advocateId/unassign` (unassigning an advocate)
- `POST /api/v1/hearings` (scheduling a new hearing)
- `PATCH /api/v1/hearings/:id/reschedule` (rescheduling existing hearing)
- `POST /api/v1/hearings/:id/cancel` (cancelling a hearing)
- `POST /api/v1/hearings/:id/complete` (completing a hearing)
- `POST /api/v1/hearings/:id/adjourn` (adjourning a hearing)
- `POST /api/v1/cases/:id/judgment/reserve` (re-reserving)
- `POST /api/v1/cases/:id/judgment/deliver` (re-delivering)

---

## 5. RBAC & Permissions Matrix

| Endpoint                                 | Method | Required Permission | Allowed Roles                     | Visibility / Scope                                                                     |
| ---------------------------------------- | ------ | ------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| `/api/v1/judgments/meta`                 | GET    | `judgment.view`     | ADMIN, REGISTRAR, JUDGE, ADVOCATE | All active judges and outcome enums                                                    |
| `/api/v1/judgments`                      | GET    | `judgment.view`     | ADMIN, REGISTRAR, JUDGE, ADVOCATE | Admin/Registrar see all; Judge sees assigned court cases; Advocate sees assigned cases |
| `/api/v1/cases/:caseId/judgment`         | GET    | `judgment.view`     | ADMIN, REGISTRAR, JUDGE, ADVOCATE | Must pass case visibility filter                                                       |
| `/api/v1/cases/:caseId/judgment/reserve` | POST   | `judgment.record`   | ADMIN, JUDGE                      | Judge must be assigned judge                                                           |
| `/api/v1/cases/:caseId/judgment/deliver` | POST   | `judgment.deliver`  | ADMIN, JUDGE                      | Judge must be assigned judge                                                           |

---

## 6. API Reference & Contract

### 6.1 `GET /api/v1/judgments/meta`

Returns outcome choices, states, and active judges.

```json
{
  "success": true,
  "message": "Judgment metadata retrieved successfully",
  "data": {
    "outcomes": ["ALLOWED", "DISMISSED", "CONVICTED", "ACQUITTED", "SETTLED", "DISPOSED"],
    "states": ["RESERVED", "DELIVERED"],
    "judges": [
      {
        "id": "uuid-1",
        "name": "Hon. Justice D. Swaminathan",
        "email": "judge.swaminathan@courtcms.gov.in"
      }
    ]
  }
}
```

### 6.2 `GET /api/v1/judgments`

Paginated search and filter registry.

- Query Parameters: `page` (default 1), `pageSize` (default 10), `q` (case number or title search), `state` (`RESERVED` | `DELIVERED`), `outcome` (`ALLOWED`, etc.), `judgeId`, `startDate`, `endDate`, `dateField` (`judgmentDate` | `reservedAt`), `sortBy` (`reservedAt` | `judgmentDate` | `createdAt`), `sortOrder` (`asc` | `desc`).

```json
{
  "success": true,
  "message": "Judgments retrieved successfully",
  "data": {
    "items": [
      {
        "id": "uuid-j1",
        "case": {
          "id": "uuid-c1",
          "caseNumber": "CC/2025/00015",
          "title": "State of Maharashtra vs. Ramesh Gupta & Ors.",
          "status": "CLOSED"
        },
        "judgeName": "Hon. Justice D. Swaminathan",
        "state": "DELIVERED",
        "outcome": "CONVICTED",
        "reservedAt": "2025-06-15T09:30:00.000Z",
        "judgmentDate": "2025-06-25T00:00:00.000Z",
        "deliveredAt": "2025-06-25T11:00:00.000Z",
        "summary": "Accused A-1 found guilty under Section 420 IPC...",
        "summaryPreview": "Accused A-1 found guilty under Section 420 IPC...",
        "reserveNote": "Arguments concluded; written notes submitted.",
        "createdAt": "2025-06-15T09:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 4,
      "totalPages": 1
    }
  }
}
```

### 6.3 `POST /api/v1/cases/:caseId/judgment/reserve`

```json
// Request Body
{
  "note": "Final arguments concluded by both sides; matter reserved for pronouncement."
}

// Response (201 Created)
{
  "success": true,
  "message": "Judgment reserved successfully",
  "data": {
    "case": {
      "id": "uuid-c10",
      "caseNumber": "CC/2026/00110",
      "status": "JUDGMENT_RESERVED"
    },
    "judgment": {
      "id": "uuid-jnew",
      "caseId": "uuid-c10",
      "status": "RESERVED",
      "outcome": null,
      "reserveNote": "Final arguments concluded by both sides; matter reserved for pronouncement.",
      "reservedAt": "2026-09-28T14:30:00.000Z",
      "reservedById": "uuid-user-judge"
    }
  }
}
```

### 6.4 `POST /api/v1/cases/:caseId/judgment/deliver`

```json
// Request Body
{
  "outcome": "ALLOWED",
  "summary": "Civil suit decreed in favour of petitioner with costs. Decree sheet to follow.",
  "judgmentDate": "2026-09-28"
}

// Response (200 OK)
{
  "success": true,
  "message": "Judgment delivered successfully; case marked as CLOSED",
  "data": {
    "case": {
      "id": "uuid-c11",
      "caseNumber": "CC/2025/00030",
      "status": "CLOSED",
      "closedAt": "2026-09-28T14:45:00.000Z"
    },
    "judgment": {
      "id": "uuid-j11",
      "caseId": "uuid-c11",
      "status": "DELIVERED",
      "outcome": "ALLOWED",
      "summary": "Civil suit decreed in favour of petitioner with costs. Decree sheet to follow.",
      "judgmentDate": "2026-09-28T00:00:00.000Z",
      "deliveredAt": "2026-09-28T14:45:00.000Z",
      "deliveredById": "uuid-user-judge"
    }
  }
}
```

---

## 7. Frontend User Experience

1. **Judgments Registry (`/judgments`)**:
   - Tabular view listing Case Number, Case Title, Presiding Judge, State (`RESERVED` amber pill, `DELIVERED` emerald pill), Outcome badge, Judgment / Reserved Date, and 160-character summary preview.
   - Filters: Search keyword (`q`), State filter, Outcome dropdown, Judge selector, Date range filters.
   - Quick action link to navigate directly to the case detail page.
2. **Case Detail (`/cases/:id?tab=judgment`)**:
   - Dynamic 3-state Judgment Tab:
     - **Eligible / Under Trial**: Shows "Reserve Judgment" button (or explains why disabled, e.g. scheduled hearings pending).
     - **Reserved**: Shows banner with reservation date, reserved by judge, reservation note, and "Deliver Judgment" button.
     - **Delivered**: Displays comprehensive official decree card with Outcome badge, Delivery Date, Presiding Judge, Full Operative Summary, and Closed Case badge.
   - Live character counters for `reserveNote` (`0/5 min characters`) and `summary` (`0/20 min characters`).
   - Closed case banner permanently visible across all tabs with locked actions.
