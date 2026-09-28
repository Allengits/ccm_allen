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
