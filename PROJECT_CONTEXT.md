# Court Case Management System

## Problem

Indian courts have over 5.3 crore pending cases. Much of the delay comes from manual, disconnected case allocation and tracking.

## Solution

One shared case record that links case registration, advocate assignment, hearing scheduling, digital evidence, and judgment tracking. Case status updates automatically as each step is completed. A dashboard flags cases pending beyond a set number of days.

## Roles

Admin, Registrar (court clerk), Judge, Advocate.

## Case status lifecycle

Registered -> Advocate Assigned -> Hearing Scheduled -> Under Trial -> Judgment Reserved -> Closed

## Tech stack

- Frontend: React (Vite) + Tailwind CSS + react-router + axios
- Backend: Node.js + Express (ES modules)
- Database: MySQL with Prisma ORM
- Auth: JWT
- Validation: zod

## Conventions

- Monorepo: /client and /server
- REST API under /api/v1
- JSON response format: { success, message, data } and { success:false, message, errors }
- Config in .env, provide .env.example, never commit secrets
- Small, readable code with comments where logic is non-obvious
- One git commit per phase

## UI theme

Navy #1C2B45, brass #A6763B, white background. Serif headings (Source Serif 4 or Times New Roman), clean sans-serif body. Professional, registry-like, accessible.

## Report format (end of every phase)

Create reports/PHASE_<n>_REPORT.md with these sections:

1. Objective 2. What was built 3. Files and folders changed 4. How to run and verify (exact commands) 5. Test evidence (commands run and results) 6. Decisions and assumptions 7. Issues and limitations 8. Deviations from the prompt 9. Ready-for-next-phase checklist
   Also give me a short summary in chat.

## Data Model (Phase 2)

12 core entities implemented in Prisma MySQL:

- User (ADMIN, REGISTRAR, JUDGE, ADVOCATE)
- Advocate (Bar Council ID, specialization, optional User link)
- Courtroom (court complex halls, location, availability)
- Case (caseNumber, CaseType, Priority, CaseStatus, petitioner, respondent, judge, registeredBy)
- CaseAdvocate (join table linking cases and counsel on PETITIONER/RESPONDENT side)
- Hearing (case, courtroom, judge, scheduledAt, duration, HearingStatus, outcomeNotes)
- Evidence (case, EvidenceType, submitter, EvidenceStatus, digital file attributes, SHA-256 hash)
- EvidenceCustodyLog (CustodyAction audit entries cascading with evidence)
- Judgment (caseId [1:1], authoring judge, JudgmentStatus, JudgmentOutcome, summary, reserved/delivered dates)
- CaseStatusHistory (immutable audit log tracking transitions across the 6-state lifecycle)
- CaseSequence (prefix, year, lastNumber for consecutive case number generation)
- SystemSetting (key/value, e.g. backlog_threshold_days = 90)
  Detailed ER diagram and data dictionary documented in docs/DATABASE.md.

## Auth and Access Control (Phase 3)

- **Session Architecture**: Stateless signed JWT stored in an `httpOnly` cookie (`court_cms_token`, SameSite=Lax, Secure in production, 8h expiration). Never returned in response bodies or stored in localStorage.
- **Immediate Invalidation**: `authenticate` middleware re-reads user from MySQL on every request to instantly enforce deactivations and role modifications.
- **Timing Leak Defense**: Unified generic error message (`Invalid email or password`) with dummy bcrypt comparison for unknown emails to eliminate response-timing side channels.
- **Brute-Force Protection**: Express rate limiting on `/login` (10 attempts per 15 min per IP, returning HTTP 429).
- **Central Permissions Matrix (`server/src/config/permissions.js`)**:
  - `ADMIN`: Full authority (`*`), including user management, registration, hearings, judgments, and registry audit.
  - `REGISTRAR`: Case docket registration, advocate assignment, hearing scheduling, digital evidence logging, and dashboard viewing. Cannot record/deliver judgments or manage users.
  - `JUDGE`: View assigned cases, record hearing outcomes, admit/reject digital evidence, and draft/deliver judgments. Cannot register cases, assign counsel, or manage users.
  - `ADVOCATE`: View assigned client cases and submit evidence for those cases. Read-only otherwise.
- **Case Visibility Scoping (`caseVisibilityFilter(user)`)**:
  - `ADMIN` & `REGISTRAR`: Unrestricted access to all cases (`{}`).
  - `JUDGE`: Scoped to cases allocated to their judicial bench (`{ judgeId: user.id }`).
  - `ADVOCATE`: Scoped to cases where user's linked advocate is active counsel (`{ advocates: { some: { advocateId, isActive: true } } }`).
- **User Management Safety Rules**:
  - Admins cannot deactivate or demote their own account.
  - The system must never be left without at least one active ADMIN.
  - Unique emails strictly enforced; passwords must meet complexity rules (>= 8 chars with letter and number).
    Detailed API contract and security decisions documented in docs/AUTH.md.

## Case Management (Phase 4)

- **Automated Sequential Numbering**: Case numbers formatted as `PREFIX/YEAR/00001` (5-digit padded sequence) generated within an exclusive row lock transaction on `case_sequences`. Prefix mapped by case type (`CRIMINAL=CC`, `CIVIL=CV`, `FAMILY=FM`, `PROPERTY=PR`, `COMMERCIAL=CM`, `CONSTITUTIONAL=WP`, `OTHER=MC`).
- **Atomic Registration**: Registering a case atomically writes the master `Case` record and initial `CaseStatusHistory` (`REGISTERED`, reason "Case registered") inside one transaction.
- **Strict Role Visibility & 404 Shielding**:
  - `ADMIN` & `REGISTRAR`: Full docket visibility across the court registry.
  - `JUDGE`: Scoped strictly to cases assigned to their bench.
  - `ADVOCATE`: Scoped strictly to cases where they are active counsel.
  - Out-of-scope case lookups return HTTP 404 to shield sensitive docket existence.
- **Editability & Legal Immutability**:
  - Allowed edits (`case.edit` for Admin/Registrar): title, petitioner, respondent, description, priority, judgeId.
  - Immutable fields: `caseNumber`, `caseType`, `filingDate`, and `status`.
  - Closed cases (`status === 'CLOSED'`) cannot be modified.
  - No deletion endpoint exists; court records are permanent legal artifacts.
- **Backlog Tracking**: Dynamic `ageDays` and `isBacklog` calculation based on `backlog_threshold_days` setting (>= 90 days pendency for open cases).
  Detailed endpoint specifications documented in docs/CASES.md.

## Advocate Management & Case Assignment (Phase 5)

- **Advocate Directory (`/api/v1/advocates`)**:
  - Filter by `specialization` and `hasLogin`, search across `name`, `barNumber`, `email`, with pagination up to 50 items.
  - Active and total case count aggregation without N+1 queries.
  - Strict Bar Council number format validation (`/^[A-Z0-9/-]{5,20}$/`) and duplicate collision rejection; bar numbers are permanent legal identifiers and immutable once created.
  - Basic Indian mobile and landline telephone format verification.
  - Advocate profile lookups role-scoped: `ADVOCATE` role is restricted to viewing exclusively their own advocate profile (`404` for out-of-scope IDs).
  - No advocate deletion endpoint exists (preserves historical legal integrity).
- **Case Advocate Audit & Schema**:
  - `CaseAdvocate` records include `assignedById`, `unassignedAt`, `unassignedById`, and `unassignReason`.
- **Assignment Business Rules & Conflict Defense**:
  - Executed inside a single atomic database transaction with `advocate.assign` permission.
  - Cannot assign to `CLOSED` cases.
  - Advocates with linked user accounts must have active logins (`isActive: true`).
  - Strict conflict-of-interest check: an advocate cannot simultaneously represent both petitioner and respondent on the same case.
  - Maximum of 2 active advocates allowed per side per case.
  - Re-assignment of a previously unassigned advocate reactivates the existing join record (retaining unassign reason in historical timeline).
  - Removing the last active advocate is permitted only when status is `ADVOCATE_ASSIGNED`; cases further along (`HEARING_SCHEDULED`, `UNDER_TRIAL`, `JUDGMENT_RESERVED`) require assigning a replacement first.
- **Workflow State Automation (`caseWorkflow.js`)**:
  - Assigning the first active advocate to a `REGISTERED` case automatically transitions status to `ADVOCATE_ASSIGNED` with audit entry.
  - Unassigning the last active advocate from an `ADVOCATE_ASSIGNED` case automatically reverts status back to `REGISTERED` with reason recorded.
  - Assignments on cases in subsequent lifecycle statuses do not alter status.
- **Workload Soft Warning**:
  - Evaluates configurable `advocate_workload_warning_threshold` (seeded default: 15 active open cases). Emits an informational warning without blocking assignment.
- **Audit Timeline Integration**:
  - Case History timeline merges `CaseStatusHistory` records and `CaseAdvocate` assignment/unassignment events sorted chronologically without requiring auxiliary audit tables.
    Detailed endpoint specifications and workflow contracts documented in docs/ADVOCATES.md.
