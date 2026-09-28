# Court CMS — Hearing Scheduling, Cause Lists & Automation Module Documentation

This document describes the architectural design, database schemas, business rules, API contracts, RBAC permissions, and lifecycle state automation for the **Hearing Scheduling and Daily Cause List Module** (Phase 6).

---

## 1. Domain Model & Database Schema

The database expands from 10 to **11 tables** with the introduction of the immutable `hearing_events` audit table, along with relations on `hearings`, `courtrooms`, `cases`, and `users`.

### 1.1 Schema Definitions (`schema.prisma`)

```prisma
enum HearingStatus {
  SCHEDULED
  COMPLETED
  ADJOURNED
  CANCELLED
}

enum HearingAction {
  SCHEDULED
  RESCHEDULED
  CANCELLED
  COMPLETED
  ADJOURNED
}

model Hearing {
  id            String         @id @default(uuid())
  caseId        String         @map("case_id")
  case          Case           @relation(fields: [caseId], references: [id], onDelete: Restrict)
  courtroomId   String         @map("courtroom_id")
  courtroom     Courtroom      @relation(fields: [courtroomId], references: [id], onDelete: Restrict)
  judgeId       String         @map("judge_id")
  judge         User           @relation("JudgeHearings", fields: [judgeId], references: [id], onDelete: Restrict)
  scheduledAt   DateTime       @map("scheduled_at")
  durationMins  Int            @default(30) @map("duration_mins")
  purpose       String
  status        HearingStatus  @default(SCHEDULED)
  outcomeNotes  String?        @db.Text @map("outcome_notes")
  scheduledById String?        @map("scheduled_by_id")
  scheduledBy   User?          @relation("HearingScheduledBy", fields: [scheduledById], references: [id], onDelete: Restrict)
  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @updatedAt @map("updated_at")

  events        HearingEvent[]

  @@index([scheduledAt])
  @@index([courtroomId, scheduledAt])
  @@index([judgeId, scheduledAt])
  @@map("hearings")
}

model HearingEvent {
  id              String        @id @default(uuid())
  hearingId       String        @map("hearing_id")
  hearing         Hearing       @relation(fields: [hearingId], references: [id], onDelete: Restrict)
  action          HearingAction
  fromScheduledAt DateTime?     @map("from_scheduled_at")
  toScheduledAt   DateTime?     @map("to_scheduled_at")
  fromCourtroomId String?       @map("from_courtroom_id")
  toCourtroomId   String?       @map("to_courtroom_id")
  note            String?       @db.VarChar(500)
  performedById   String        @map("performed_by_id")
  performedBy     User          @relation("HearingEventPerformedBy", fields: [performedById], references: [id], onDelete: Restrict)
  createdAt       DateTime      @default(now()) @map("created_at")

  @@index([hearingId, createdAt])
  @@map("hearing_events")
}
```

### 1.2 System Settings Configuration

Seven operational settings are stored in `system_settings` to govern hearing hours and scheduling boundaries:

| Key                  | Value                 | Description                                         |
| -------------------- | --------------------- | --------------------------------------------------- |
| `court_timezone`     | `Asia/Kolkata`        | Primary legal and operational timezone for hearings |
| `court_start_time`   | `10:00`               | Court commencement time (24h format)                |
| `court_end_time`     | `17:00`               | Court closing time (24h format)                     |
| `lunch_start`        | `13:00`               | Lunch break commencement                            |
| `lunch_end`          | `14:00`               | Lunch break conclusion                              |
| `court_working_days` | `MON,TUE,WED,THU,FRI` | Comma-separated active court days                   |
| `slot_minutes`       | `15`                  | Granular scheduling interval block (minutes)        |

---

## 2. Business Logic & Scheduling Rules

### 2.1 Working Day & Hours Constraints

- **Timezone**: All court calculations, dates, and times are normalized to `Asia/Kolkata` using `luxon`.
- **Working Days**: Hearings can only be scheduled on designated court working days (Monday to Friday). Weekends (Saturday and Sunday) are strictly rejected.
- **Working Hours**: Hearings must commence on or after `10:00` IST and conclude on or before `17:00` IST.
- **Lunch Break**: Slots cannot intersect the lunch window `[13:00, 14:00)` IST. For example, a 30-minute hearing starting at `12:45` would end at `13:15`, overlapping lunch, and is rejected.
- **Boundary Alignment**: Every slot must begin on a 15-minute boundary (`minute % 15 === 0` and `second === 0`).
- **Future Date Rule**: Hearings can only be booked for future dates/times (`scheduledAt > now` in IST).

### 2.2 Preconditions for Scheduling

1. **Case Status**: Closed cases (`status === 'CLOSED'`) cannot have hearings scheduled.
2. **Legal Representation**: A case must possess at least one active advocate (`isActive === true`) before a hearing can be scheduled.
3. **Presiding Judge**: The case must have an assigned presiding judge. If a `judgeId` is specified in the scheduling payload, it must match the case's assigned judge.

### 2.3 Concurrency Control & Conflict Prevention

Scheduling transactions run within an interactive database transaction with **pessimistic row locking** to eliminate race conditions and double bookings:

1. `SELECT id FROM courtrooms WHERE id = ? FOR UPDATE;`
2. `SELECT id FROM users WHERE id = ? FOR UPDATE;`
3. A locking current-read query evaluates overlapping `SCHEDULED` hearings:
   ```sql
   SELECT id, scheduled_at, duration_mins FROM hearings
   WHERE courtroom_id = ? AND status = 'SCHEDULED'
     AND scheduled_at >= ? AND scheduled_at <= ?
   FOR UPDATE;
   ```
4. If an overlap is detected on the courtroom, judge, or case, the transaction rejects with **409 Conflict**.
5. **Advocate Workload Warnings**: If an active advocate on the case has a conflicting scheduled hearing in another matter during the requested slot, a soft warning is returned in the API response without blocking scheduling.

---

## 3. Case Lifecycle Automation

The hearing module automatically orchestrates case state transitions via `caseWorkflow.js`:

```
 [REGISTERED]
      │ (Advocate Assigned)
      ▼
 [ADVOCATE_ASSIGNED] ───────────────┐
      │ (Hearing Scheduled)         │ (Last hearing cancelled or
      ▼                             │  adjourned without next date)
 [HEARING_SCHEDULED] ◄──────────────┘
      │ (First hearing completed)
      ▼
 [UNDER_TRIAL]
      │
      ▼
 [JUDGMENT_RESERVED] ──► [CLOSED]
```

- **Scheduling First Hearing**: Transitions case from `ADVOCATE_ASSIGNED` to `HEARING_SCHEDULED`.
- **Completing First Hearing**: Transitions case from `HEARING_SCHEDULED` to `UNDER_TRIAL`. Once under trial, subsequent completed hearings do not alter status.
- **Cancellation**: If the cancelled hearing was the only scheduled hearing for a `HEARING_SCHEDULED` case, the case reverts to `ADVOCATE_ASSIGNED`.
- **Adjournment**:
  - If a `nextHearing` slot is provided, it is atomically scheduled and the case remains in `HEARING_SCHEDULED` (or `UNDER_TRIAL`).
  - If adjourned without a next date and no other scheduled hearings exist, the case reverts to `ADVOCATE_ASSIGNED`.
- **Cross-Module Rule**: `PATCH /api/v1/cases/:id` rejects attempts to reassign the presiding judge if active `SCHEDULED` hearings exist for that case.

---

## 4. RBAC Permissions Matrix

The system includes **13 distinct permissions** with granular hearing access:

| Permission Key     | Description                                                     | ADMIN | REGISTRAR |     JUDGE     | ADVOCATE |
| ------------------ | --------------------------------------------------------------- | :---: | :-------: | :-----------: | :------: |
| `hearing.view`     | View cause lists, hearing registry, and hearing details         |   ✓   |     ✓     |       ✓       |    ✓     |
| `hearing.schedule` | Schedule new hearings and reschedule/cancel existing            |   ✓   |     ✓     |       —       |    —     |
| `hearing.update`   | Conclude/complete hearings and record daily orders/adjournments |   ✓   |     —     | ✓ (Own bench) |    —     |

- **Judge Scoping**: A `JUDGE` can only complete, adjourn, or reschedule hearings where `hearing.judgeId === user.id`.
- **Advocate Scoping**: An `ADVOCATE` can view cause lists and hearing details strictly for cases where they hold an active assignment.

---

## 5. API Reference

All routes are mounted under `/api/v1/hearings` and require session cookie authentication.

### `GET /api/v1/hearings/meta`

Returns active courtrooms, available judges, hearing statuses, and court settings.

- **Permission**: `hearing.view`

### `GET /api/v1/hearings/availability`

Query parameters: `date` (YYYY-MM-DD), `courtroomId`, `judgeId`, `durationMins` (default 30).

- Generates 15-minute slot intervals between 10:00 and 17:00 IST.
- Automatically excludes lunch break (13:00 - 14:00) and booked hearings.
- Returns `isWorkingDay: false` on weekends and court holidays.

### `GET /api/v1/hearings/cause-list`

Query parameters: `date` (YYYY-MM-DD, defaults to today in IST).

- Returns hearings for the specified date grouped by courtroom.
- Ordered by `scheduledAt ASC` with sequential 1-based serial numbers.
- Filtered by caller's case visibility.

### `GET /api/v1/hearings`

Query parameters: `page`, `pageSize`, `q`, `status`, `courtroomId`, `judgeId`, `date`, `sortBy`, `sortOrder`.

- Paginated hearing list with computed `endsAt` and `durationMinutes`.

### `GET /api/v1/hearings/:id`

Retrieves hearing details, courtroom, judge, case summary, and audit events ordered newest first.

### `POST /api/v1/hearings`

Schedules a new hearing.

- **Permission**: `hearing.schedule`
- **Request Body**:
  ```json
  {
    "caseId": "uuid",
    "courtroomId": "uuid",
    "scheduledAt": "2026-10-05T05:30:00.000Z",
    "durationMins": 30,
    "purpose": "Framing of Charges",
    "notes": "Parties directed to bring original documents"
  }
  ```

### `PATCH /api/v1/hearings/:id`

Reschedules an existing scheduled hearing.

- **Permission**: `hearing.schedule` or `hearing.update` (Presiding Judge)
- **Request Body**:
  ```json
  {
    "scheduledAt": "2026-10-08T06:00:00.000Z",
    "courtroomId": "uuid",
    "durationMins": 30,
    "reason": "Presiding judge engaged in urgent Constitution Bench hearing"
  }
  ```

### `POST /api/v1/hearings/:id/cancel`

Cancels a scheduled hearing.

- **Permission**: `hearing.schedule` or `hearing.update` (Presiding Judge)
- **Request Body**:
  ```json
  {
    "reason": "Litigating parties reached mutual settlement out of court"
  }
  ```

### `POST /api/v1/hearings/:id/complete`

Concludes a hearing session and records daily order notes.

- **Permission**: `hearing.update` (ADMIN or Presiding Judge)
- **Request Body**:
  ```json
  {
    "outcomeNotes": "Petitioner cross-examined PW-1. Respondent counsel completed arguments. Matter posted for final decree."
  }
  ```

### `POST /api/v1/hearings/:id/adjourn`

Adjourns a hearing session with optional atomic next date booking.

- **Permission**: `hearing.update` (ADMIN or Presiding Judge)
- **Request Body**:
  ```json
  {
    "reason": "Counsel for petitioner requested adjournment to produce documentary evidence",
    "nextHearing": {
      "scheduledAt": "2026-10-15T05:30:00.000Z",
      "courtroomId": "uuid",
      "durationMins": 30,
      "purpose": "Filing of Rejoinder"
    }
  }
  ```
