# Court Case Management System - Database Documentation

This document describes the schema architecture, relationships, lifecycle state transitions, data dictionary, and seed demo records for the **Court Case Management System (Court CMS)**.

---

## 1. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    User ||--o| Advocate : "has advocate profile"
    User ||--o{ Case : "presides as judge"
    User ||--o{ Case : "registers as clerk"
    User ||--o{ Hearing : "presides hearing"
    User ||--o{ Evidence : "submits evidence"
    User ||--o{ EvidenceCustodyLog : "performs custody action"
    User ||--o{ Judgment : "delivers judgment"
    User ||--o{ CaseStatusHistory : "authorizes status change"
    User ||--o{ CaseAdvocate : "assigns advocate"
    User ||--o{ CaseAdvocate : "unassigns advocate"

    Advocate ||--o{ CaseAdvocate : "assigned to"
    Case ||--o{ CaseAdvocate : "has legal representation"

    Courtroom ||--o{ Hearing : "hosts"
    Case ||--o{ Hearing : "scheduled hearing"

    Case ||--o{ Evidence : "exhibits / records"
    Evidence ||--o{ EvidenceCustodyLog : "custody audit log"

    Case ||--o| Judgment : "has final decree"
    Case ||--o{ CaseStatusHistory : "lifecycle audit history"

    User {
        string id PK
        string name
        string email UK
        string passwordHash
        Role role
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Advocate {
        string id PK
        string userId FK,UK
        string name
        string barNumber UK
        string specialization
        string email
        string phone
        datetime createdAt
        datetime updatedAt
    }

    Courtroom {
        string id PK
        string name UK
        string location
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Case {
        string id PK
        string caseNumber UK
        string title
        CaseType caseType
        CaseStatus status
        Priority priority
        string petitioner
        string respondent
        text description
        datetime filingDate
        string judgeId FK
        string registeredById FK
        datetime closedAt
        datetime createdAt
        datetime updatedAt
    }

    CaseAdvocate {
        string id PK
        string caseId FK
        string advocateId FK
        AdvocateSide side
        datetime assignedAt
        string assignedById FK
        boolean isActive
        datetime unassignedAt
        string unassignedById FK
        string unassignReason
        datetime createdAt
        datetime updatedAt
    }

    Hearing {
        string id PK
        string caseId FK
        string courtroomId FK
        string judgeId FK
        datetime scheduledAt
        int durationMins
        string purpose
        HearingStatus status
        text outcomeNotes
        datetime createdAt
        datetime updatedAt
    }

    Evidence {
        string id PK
        string caseId FK
        string title
        EvidenceType evidenceType
        text description
        string submittedBy
        string submittedById FK
        EvidenceStatus status
        datetime submittedAt
        string fileName
        string filePath
        string mimeType
        int fileSize
        string fileHash
        datetime createdAt
        datetime updatedAt
    }

    EvidenceCustodyLog {
        string id PK
        string evidenceId FK
        CustodyAction action
        string performedById FK
        text note
        datetime createdAt
    }

    Judgment {
        string id PK
        string caseId FK,UK
        string judgeId FK
        JudgmentStatus status
        JudgmentOutcome outcome
        text summary
        datetime reservedOn
        datetime deliveredOn
        datetime createdAt
        datetime updatedAt
    }

    CaseStatusHistory {
        string id PK
        string caseId FK
        CaseStatus fromStatus
        CaseStatus toStatus
        string reason
        string changedById FK
        datetime createdAt
    }

    CaseSequence {
        string id PK
        string prefix
        int year
        int lastNumber
        datetime createdAt
        datetime updatedAt
    }

    SystemSetting {
        string key PK
        string value
        string description
        datetime createdAt
        datetime updatedAt
    }
```

---

## 2. Data Dictionary

### Table: `users`

Represents court administrative personnel, judges, registrars, and practicing legal counsel with portal logins.

| Column          | Type         | Constraints      | Description                               |
| :-------------- | :----------- | :--------------- | :---------------------------------------- |
| `id`            | VARCHAR(191) | PK, UUID         | Unique user identifier                    |
| `name`          | VARCHAR(191) | NOT NULL         | Full name of the user                     |
| `email`         | VARCHAR(191) | UNIQUE, NOT NULL | Login and notification email              |
| `password_hash` | VARCHAR(191) | NOT NULL         | Salted bcrypt password hash               |
| `role`          | ENUM         | NOT NULL         | `ADMIN`, `REGISTRAR`, `JUDGE`, `ADVOCATE` |
| `is_active`     | BOOLEAN      | DEFAULT TRUE     | Account active/disabled status            |
| `created_at`    | DATETIME(3)  | DEFAULT NOW()    | Record creation timestamp                 |
| `updated_at`    | DATETIME(3)  | UPDATED AT       | Last modification timestamp               |

---

### Table: `advocates`

Master directory of legal practitioners registered with the Bar Council.

| Column           | Type         | Constraints                    | Description                                          |
| :--------------- | :----------- | :----------------------------- | :--------------------------------------------------- |
| `id`             | VARCHAR(191) | PK, UUID                       | Unique advocate identifier                           |
| `user_id`        | VARCHAR(191) | UNIQUE, FK(users.id), NULLABLE | Linked login account (if registered on portal)       |
| `name`           | VARCHAR(191) | NOT NULL                       | Advocate full legal name                             |
| `bar_number`     | VARCHAR(191) | UNIQUE, NOT NULL               | Bar Council enrollment number (e.g., `TN/2011/0456`) |
| `specialization` | VARCHAR(191) | NOT NULL                       | Legal domain specialty (e.g., Criminal, Corporate)   |
| `email`          | VARCHAR(191) | NOT NULL                       | Contact email address                                |
| `phone`          | VARCHAR(191) | NOT NULL                       | Contact mobile telephone number                      |
| `created_at`     | DATETIME(3)  | DEFAULT NOW()                  | Registration timestamp                               |
| `updated_at`     | DATETIME(3)  | UPDATED AT                     | Last modification timestamp                          |

---

### Table: `courtrooms`

Physical or virtual court chambers and hearing halls within the judicial complex.

| Column       | Type         | Constraints      | Description                                            |
| :----------- | :----------- | :--------------- | :----------------------------------------------------- |
| `id`         | VARCHAR(191) | PK, UUID         | Unique courtroom identifier                            |
| `name`       | VARCHAR(191) | UNIQUE, NOT NULL | Hall name (e.g., `Court Hall 1 (Chief Justice Bench)`) |
| `location`   | VARCHAR(191) | NOT NULL         | Physical location or virtual bench URL                 |
| `is_active`  | BOOLEAN      | DEFAULT TRUE     | Operational availability flag                          |
| `created_at` | DATETIME(3)  | DEFAULT NOW()    | Record creation timestamp                              |
| `updated_at` | DATETIME(3)  | UPDATED AT       | Last modification timestamp                            |

---

### Table: `cases`

Master judicial docket tracking cases across their entire lifecycle.

| Column             | Type         | Constraints                    | Description                                                                        |
| :----------------- | :----------- | :----------------------------- | :--------------------------------------------------------------------------------- |
| `id`               | VARCHAR(191) | PK, UUID                       | Unique case identifier                                                             |
| `case_number`      | VARCHAR(191) | UNIQUE, NOT NULL               | Official court docket number (e.g., `CC/2026/00187`)                               |
| `title`            | VARCHAR(191) | NOT NULL                       | Cause title (e.g., `Petitioner vs. Respondent`)                                    |
| `case_type`        | ENUM         | NOT NULL                       | `CRIMINAL`, `CIVIL`, `FAMILY`, `PROPERTY`, `COMMERCIAL`, `CONSTITUTIONAL`, `OTHER` |
| `status`           | ENUM         | NOT NULL, DEFAULT `REGISTERED` | Lifecycle status (see section 3)                                                   |
| `priority`         | ENUM         | NOT NULL, DEFAULT `NORMAL`     | `NORMAL`, `URGENT`                                                                 |
| `petitioner`       | VARCHAR(191) | NOT NULL                       | Plaintiff / Complainant name                                                       |
| `respondent`       | VARCHAR(191) | NOT NULL                       | Defendant / Accused name                                                           |
| `description`      | TEXT         | NULLABLE                       | Brief narrative of cause of action / charges                                       |
| `filing_date`      | DATETIME(3)  | NOT NULL                       | Formal filing date at Registry                                                     |
| `judge_id`         | VARCHAR(191) | FK(users.id), NULLABLE         | Assigned presiding judge                                                           |
| `registered_by_id` | VARCHAR(191) | FK(users.id), NOT NULL         | Registrar / Clerk entering docket                                                  |
| `closed_at`        | DATETIME(3)  | NULLABLE                       | Timestamp when delivered judgment closed case                                      |
| `created_at`       | DATETIME(3)  | DEFAULT NOW()                  | System creation timestamp                                                          |
| `updated_at`       | DATETIME(3)  | UPDATED AT                     | Last system modification timestamp                                                 |

_Indexes_: `status`, `filing_date`, `case_type`.

---

### Table: `case_advocates`

Associates practicing advocates with a case under a specific side of representation. Tracks full lifecycle audit trail including who assigned the counsel, when representation ended, who authorized unassignment, and the recorded legal/administrative justification.

| Column             | Type         | Constraints                | Description                                        |
| :----------------- | :----------- | :------------------------- | :------------------------------------------------- |
| `id`               | VARCHAR(191) | PK, UUID                   | Unique assignment identifier                       |
| `case_id`          | VARCHAR(191) | FK(cases.id), NOT NULL     | Associated case                                    |
| `advocate_id`      | VARCHAR(191) | FK(advocates.id), NOT NULL | Assigned counsel                                   |
| `side`             | ENUM         | NOT NULL                   | Representation side: `PETITIONER`, `RESPONDENT`    |
| `assigned_at`      | DATETIME(3)  | DEFAULT NOW()              | Vakalatnama filing / assignment date               |
| `assigned_by_id`   | VARCHAR(191) | FK(users.id), NULLABLE     | Staff user (Admin/Registrar) performing assignment |
| `is_active`        | BOOLEAN      | DEFAULT TRUE               | Active representation indicator                    |
| `unassigned_at`    | DATETIME(3)  | NULLABLE                   | Timestamp when representation ceased               |
| `unassigned_by_id` | VARCHAR(191) | FK(users.id), NULLABLE     | Staff user (Admin/Registrar) authorizing removal   |
| `unassign_reason`  | VARCHAR(500) | NULLABLE                   | Mandatory recorded justification for unassignment  |
| `created_at`       | DATETIME(3)  | DEFAULT NOW()              | Record creation timestamp                          |
| `updated_at`       | DATETIME(3)  | UPDATED AT                 | Last modification timestamp                        |

_Constraints_: Unique composite constraint on `(case_id, advocate_id)`.

---

### Table: `hearings`

Scheduled court proceedings sessions for cases on the daily cause list.

| Column          | Type         | Constraints                   | Description                                           |
| :-------------- | :----------- | :---------------------------- | :---------------------------------------------------- |
| `id`            | VARCHAR(191) | PK, UUID                      | Unique hearing identifier                             |
| `case_id`       | VARCHAR(191) | FK(cases.id), NOT NULL        | Target case                                           |
| `courtroom_id`  | VARCHAR(191) | FK(courtrooms.id), NOT NULL   | Allocated courtroom                                   |
| `judge_id`      | VARCHAR(191) | FK(users.id), NOT NULL        | Presiding judge                                       |
| `scheduled_at`  | DATETIME(3)  | NOT NULL                      | Session start timestamp                               |
| `duration_mins` | INT          | DEFAULT 30                    | Allocated duration in minutes                         |
| `purpose`       | VARCHAR(191) | NOT NULL                      | Purpose of listing (e.g., Arguments, Framing Charges) |
| `status`        | ENUM         | NOT NULL, DEFAULT `SCHEDULED` | `SCHEDULED`, `COMPLETED`, `ADJOURNED`, `CANCELLED`    |
| `outcome_notes` | TEXT         | NULLABLE                      | Daily court order summary / bench remarks             |
| `created_at`    | DATETIME(3)  | DEFAULT NOW()                 | Creation timestamp                                    |
| `updated_at`    | DATETIME(3)  | UPDATED AT                    | Modification timestamp                                |

_Indexes_: `scheduled_at`, `(courtroom_id, scheduled_at)`, `(judge_id, scheduled_at)`.

---

### Table: `evidence`

Preserves physical, documentary, or digital records produced in trial.

| Column            | Type         | Constraints                   | Description                                                                           |
| :---------------- | :----------- | :---------------------------- | :------------------------------------------------------------------------------------ |
| `id`              | VARCHAR(191) | PK, UUID                      | Unique exhibit identifier                                                             |
| `case_id`         | VARCHAR(191) | FK(cases.id), NOT NULL        | Associated case                                                                       |
| `title`           | VARCHAR(191) | NOT NULL                      | Exhibit title                                                                         |
| `evidence_type`   | ENUM         | NOT NULL                      | `DOCUMENT`, `PHOTOGRAPH`, `VIDEO`, `AUDIO`, `PHYSICAL`, `DIGITAL_RECORD`, `TESTIMONY` |
| `description`     | TEXT         | NULLABLE                      | Evidentiary narrative or source details                                               |
| `submitted_by`    | VARCHAR(191) | NOT NULL                      | Name of producing party or officer                                                    |
| `submitted_by_id` | VARCHAR(191) | FK(users.id), NULLABLE        | User ID if submitted via portal                                                       |
| `status`          | ENUM         | NOT NULL, DEFAULT `SUBMITTED` | `SUBMITTED`, `ADMITTED`, `REJECTED`                                                   |
| `submitted_at`    | DATETIME(3)  | DEFAULT NOW()                 | Production timestamp                                                                  |
| `file_name`       | VARCHAR(191) | NULLABLE                      | Physical or digital file name                                                         |
| `file_path`       | VARCHAR(191) | NULLABLE                      | Storage path in secure vault                                                          |
| `mime_type`       | VARCHAR(191) | NULLABLE                      | MIME content type                                                                     |
| `file_size`       | INT          | NULLABLE                      | File size in bytes                                                                    |
| `file_hash`       | VARCHAR(191) | NULLABLE                      | Cryptographic SHA-256 hash                                                            |
| `created_at`      | DATETIME(3)  | DEFAULT NOW()                 | Record creation timestamp                                                             |
| `updated_at`      | DATETIME(3)  | UPDATED AT                    | Last modification timestamp                                                           |

_Indexes_: `case_id`.

---

### Table: `evidence_custody_logs`

Cryptographic and physical chain of custody log for evidentiary integrity.

| Column            | Type         | Constraints              | Description                                                              |
| :---------------- | :----------- | :----------------------- | :----------------------------------------------------------------------- |
| `id`              | VARCHAR(191) | PK, UUID                 | Unique audit log ID                                                      |
| `evidence_id`     | VARCHAR(191) | FK(evidence.id), CASCADE | Referenced evidence item                                                 |
| `action`          | ENUM         | NOT NULL                 | `SUBMITTED`, `VIEWED`, `TRANSFERRED`, `ADMITTED`, `REJECTED`, `RETURNED` |
| `performed_by_id` | VARCHAR(191) | FK(users.id), NOT NULL   | Officer/Judge performing custody action                                  |
| `note`            | TEXT         | NULLABLE                 | Action justification or chamber notes                                    |
| `created_at`      | DATETIME(3)  | DEFAULT NOW()            | Timestamp of custody event                                               |

---

### Table: `judgments`

Final orders, reserved judgments, and decrees delivered by presiding judges.

| Column         | Type         | Constraints                      | Description                                                             |
| :------------- | :----------- | :------------------------------- | :---------------------------------------------------------------------- |
| `id`           | VARCHAR(191) | PK, UUID                         | Unique judgment ID                                                      |
| `case_id`      | VARCHAR(191) | UNIQUE, FK(cases.id)             | One-to-one link to case docket                                          |
| `judge_id`     | VARCHAR(191) | FK(users.id), NOT NULL           | Authoring judge                                                         |
| `status`       | ENUM         | NOT NULL                         | `RESERVED`, `DELIVERED`                                                 |
| `outcome`      | ENUM         | NULLABLE (mandatory on delivery) | `ALLOWED`, `DISMISSED`, `CONVICTED`, `ACQUITTED`, `SETTLED`, `DISPOSED` |
| `summary`      | TEXT         | NOT NULL                         | Operative findings and judicial reasoning                               |
| `reserved_on`  | DATETIME(3)  | NULLABLE                         | Date judgment was formally reserved                                     |
| `delivered_on` | DATETIME(3)  | NULLABLE                         | Date delivered in open court                                            |
| `created_at`   | DATETIME(3)  | DEFAULT NOW()                    | Record creation timestamp                                               |
| `updated_at`   | DATETIME(3)  | UPDATED AT                       | Modification timestamp                                                  |

---

### Table: `case_status_history`

Append-only immutable audit trail capturing every case status transition.

| Column          | Type         | Constraints            | Description                                  |
| :-------------- | :----------- | :--------------------- | :------------------------------------------- |
| `id`            | VARCHAR(191) | PK, UUID               | Unique log entry identifier                  |
| `case_id`       | VARCHAR(191) | FK(cases.id), NOT NULL | Associated case                              |
| `from_status`   | ENUM         | NULLABLE               | Previous status (`null` upon initial filing) |
| `to_status`     | ENUM         | NOT NULL               | New status reached                           |
| `reason`        | VARCHAR(191) | NOT NULL               | Audit justification for transition           |
| `changed_by_id` | VARCHAR(191) | FK(users.id), NULLABLE | User who authorized transition               |
| `created_at`    | DATETIME(3)  | DEFAULT NOW()          | Transition timestamp                         |

_Indexes_: `case_id`.

---

### Table: `case_sequences`

Thread-safe counter table supporting automated generation of consecutive case docket numbers.

| Column        | Type         | Constraints   | Description                         |
| :------------ | :----------- | :------------ | :---------------------------------- |
| `id`          | VARCHAR(191) | PK, UUID      | Sequence record ID                  |
| `prefix`      | VARCHAR(191) | NOT NULL      | Docket prefix (e.g., `CC`)          |
| `year`        | INT          | NOT NULL      | Filing calendar year (e.g., `2026`) |
| `last_number` | INT          | DEFAULT 0     | Last sequential integer generated   |
| `created_at`  | DATETIME(3)  | DEFAULT NOW() | Sequence creation date              |
| `updated_at`  | DATETIME(3)  | UPDATED AT    | Last generation timestamp           |

_Constraints_: Unique composite index on `(prefix, year)`.

---

### Table: `system_settings`

Global key-value configuration repository for court-wide thresholds and operational flags (e.g., `backlog_threshold_days`, `court_jurisdiction`, `advocate_workload_warning_threshold`).

| Column        | Type         | Constraints   | Description                                                                                |
| :------------ | :----------- | :------------ | :----------------------------------------------------------------------------------------- |
| `key`         | VARCHAR(191) | PK            | Unique setting key (e.g., `backlog_threshold_days`, `advocate_workload_warning_threshold`) |
| `value`       | VARCHAR(191) | NOT NULL      | Configuration value (e.g., `90`)                                                           |
| `description` | VARCHAR(191) | NULLABLE      | Setting explanation                                                                        |
| `created_at`  | DATETIME(3)  | DEFAULT NOW() | Setting creation timestamp                                                                 |
| `updated_at`  | DATETIME(3)  | UPDATED AT    | Last change timestamp                                                                      |

---

## 3. Case Status Lifecycle & Implied Records

The court case management system implements a strict, sequential state machine:

```
[ REGISTERED ] ──> [ ADVOCATE_ASSIGNED ] ──> [ HEARING_SCHEDULED ]
                                                       │
[ CLOSED ] <── [ JUDGMENT_RESERVED ] <── [ UNDER_TRIAL ]
```

### State Consistency Constraints

| Lifecycle Status        | Implied & Mandatory Records                                                                                                      | Disallowed Records                            |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| **`REGISTERED`**        | Case record filed; registrar recorded.                                                                                           | Must have **0** advocates and **0** hearings. |
| **`ADVOCATE_ASSIGNED`** | At least **1 active `CaseAdvocate`** assigned to petitioner/respondent.                                                          | Must have **0** scheduled hearings.           |
| **`HEARING_SCHEDULED`** | Active advocates assigned + at least **1 future `SCHEDULED` hearing** on cause list.                                             | Cannot have delivered judgments.              |
| **`UNDER_TRIAL`**       | Advocates assigned + at least **1 past `COMPLETED` hearing** + at least **1 future hearing** + at least **1 `Evidence` record**. | Cannot have closed date.                      |
| **`JUDGMENT_RESERVED`** | Active `Judgment` record with `status: RESERVED` and `reservedOn` populated.                                                     | Cannot have future scheduled hearings.        |
| **`CLOSED`**            | Active `Judgment` record with `status: DELIVERED`, `outcome` populated, and `Case.closedAt` set.                                 | Case is final; further hearings locked.       |

---

## 4. Seeded Demo Accounts

All demo accounts are configured with the demo password: **`Demo@1234`**.

> ⚠️ **Notice**: These credentials are strictly for local testing and demo validation. They must not be deployed to public or production environments.

| Role          | Name                           | Email                               | Password    | Details                              |
| :------------ | :----------------------------- | :---------------------------------- | :---------- | :----------------------------------- |
| **ADMIN**     | Rajesh Varma                   | `admin@courtcms.gov.in`             | `Demo@1234` | Full system administrator            |
| **REGISTRAR** | Sunita Sharma                  | `registrar@courtcms.gov.in`         | `Demo@1234` | Chief Clerk (Filing & Allocation)    |
| **JUDGE**     | Hon. Justice D. Y. Swaminathan | `judge.swaminathan@courtcms.gov.in` | `Demo@1234` | Presiding Judge (Bench A)            |
| **JUDGE**     | Hon. Justice Ruma Banerjee     | `judge.banerjee@courtcms.gov.in`    | `Demo@1234` | Presiding Judge (Bench B)            |
| **ADVOCATE**  | Harish Mehta                   | `adv.mehta@courtcms.gov.in`         | `Demo@1234` | Bar No: `D/1998/0142` (Criminal Law) |
| **ADVOCATE**  | Priya Iyer                     | `adv.iyer@courtcms.gov.in`          | `Demo@1234` | Bar No: `TN/2007/0891` (Commercial)  |
| **ADVOCATE**  | Zafar Khan                     | `adv.khan@courtcms.gov.in`          | `Demo@1234` | Bar No: `MAH/2012/1045` (Property)   |

_Additional Unlinked Advocates (External Counsel)_:

- Anand Grover (`anand.grover@bar.org.in`, Bar No: `DL/2002/0543`)
- Meenakshi Sundaram (`m.sundaram@bar.org.in`, Bar No: `KA/2015/0732`)
- Vikram Deshmukh (`v.deshmukh@bar.org.in`, Bar No: `WB/2010/0219`)

---

## 5. Database Operational Commands

All database management scripts can be invoked from the root repository or from `server/`:

```powershell
# 1. Apply latest migrations
npm run db:migrate

# 2. Populate / Re-seed realistic demo data
npm run db:seed

# 3. Clean reset database and automatically re-seed
npm run db:reset

# 4. Open Prisma Studio visual browser interface
npm run db:studio

# 5. Execute automated integrity & business rule verification
npm run db:verify
```
