# Court Case Management System (Court CMS) — Final Project Report

**Project Title**: Modern Judicial Registry & Case Tracking System  
**Submission Milestone**: Final Project Report (Phase 9 Completion)  
**Author**: Engineering Team  
**Evaluation Standard**: Academic Review & Enterprise Judicial Deployment

---

## 1. Executive Summary & Problem Formulation

Indian district and subordinate courts face a systemic crisis of pendency, with over 5.3 crore cases pending nationwide. Detailed judicial process audits reveal that a major portion of this delay is structural rather than purely statutory:

1. **Procedural Disconnection**: Case filing, advocate representation, hearing scheduling, and judgment delivery exist in separate administrative silos or paper registers.
2. **Untracked Bottlenecks**: Substantial pendency accrues during "administrative limbos" — cases filed without advocates assigned for months, or cases with assigned advocates that wait weeks for an initial hearing date without triggering registry alerts.
3. **Unmonitored Adjournment Loops**: Hearings are frequently adjourned for routine reasons without fixing a next date or tracking procedural consequences, turning trials into open-ended delays.
4. **The "Reserved Judgment" Black Hole**: In existing systems like eCourts CIS and NJDG, the period between the conclusion of oral arguments and operative judgment delivery is virtually untracked, hiding months of judicial delay.

**Court CMS** was designed from first principles to solve this structural deficit through a single, shared, transactional legal docket governed by an automated state machine, pessimistic concurrency defense, real-time zero-cache telemetry, and strict role-based access control.

---

## 2. Novelty & Competitive Differentiation

| Architectural Dimension              | eCourts CIS / NJDG                                                                 | Commercial Enterprise Case Management                                            | Court CMS (Our System)                                                                                                                           |
| :----------------------------------- | :--------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Case Status Transitions**          | Manual data entry by court clerks; prone to stale updates and human error.         | Custom configurable business workflows, often requiring dedicated BPM engines.   | **Fully Automated State Machine** (`caseWorkflow.js`); state advances or reverts automatically based on real procedural events.                  |
| **Two-Stage Judgment Tracking**      | Unrecorded; cases stay in "Hearing" until a final order is uploaded after months.  | Basic document upload status; no formal pre-order state tracking.                | **Formal Two-Stage Disposition** (`UNDER_TRIAL` $\rightarrow$ `JUDGMENT_RESERVED` $\rightarrow$ `CLOSED`) with pessimistic lock defense.         |
| **Courtroom Scheduling & Conflicts** | Manual calendar inspection; double-booking discovered on hearing day.              | Optimistic locking or calendar invites without judicial bench validation.        | **Pessimistic Row-Locking Concurrency** (`SELECT ... FOR UPDATE`); double-booking courtrooms or benches is physically impossible (409 Conflict). |
| **Backlog & Stale Case Detection**   | Static quarterly or annual reports published after delays have accrued.            | Batch overnight ETL pipelines with delayed reporting data.                       | **Zero-Cache Real-Time Telemetry** computed live via indexed SQL aggregations; dynamic threshold tuning reflects instantly.                      |
| **Legal Record Immutability**        | Records can be retroactively edited by administrative users without strict checks. | Soft deletes or document versioning without lifecycle-locked schema constraints. | **Permanent Closed-Case Immutability**; closed cases reject edits, hearings, counsel changes, and decree alterations with 400/409.               |
| **Accessibility Compliance**         | Basic HTML portal with limited screen reader and keyboard support.                 | Variable accessibility depending on client widget framework.                     | **100% WCAG AA Compliant UI**; full keyboard traps, Escape dismissal, aria-live counters, 14:1+ contrast ratios.                                 |

---

## 3. Scope Decisions & Evolution: Evidence Module Removal

In **Phase 6B**, a deliberate architectural review evaluated the initial specification for a standalone "Evidence Tracking Module" (chain-of-custody, physical evidence locker tracking, and document upload).

### Rationale for Removal:

1. **Procedural Scope Integrity**: In Indian district court practice, physical evidence custody (malkhana register) is governed by state police manuals and district treasury rules, completely separate from the civil and criminal judicial registry.
2. **Security & Cloud Storage Attack Surface**: Storing sensitive evidentiary media files in a web application repository without dedicated air-gapped cryptographic HSM storage introduces substantial compliance and legal risk.
3. **Focus on Procedural Docket Flow**: By removing the auxiliary evidence locker, development effort was concentrated on core procedural bottlenecks: atomic consecutive case numbering, calendar-aware hearing availability, pessimistic courtroom locking, two-stage judgment disposition, and real-time backlog telemetry.

The schema migrations cleanly dropped the prototype evidence tables in Phase 6B, and the database verification suite confirms zero orphaned tables remain.

---

## 4. System Architecture

Court CMS is structured as a modular, decoupled monorepo:

```
┌─────────────────────────────────────────────────────────────┐
│                 Client Layer (React 19 + Vite 6)            │
│  - App Shell & TopBar (Live Clock & Session Context)        │
│  - Accessible Modal Dialogs (Focus Traps & A11y Hooks)       │
│  - Dynamic Role Portals: Admin, Registrar, Judge, Advocate  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON REST API
┌──────────────────────────────▼──────────────────────────────┐
│                API Layer (Node.js 22 + Express 4)           │
│  - Stateless httpOnly JWT Authentication & Session Rotation  │
│  - Express Rate Limiting (Brute-force protection on /login) │
│  - Role-Based Permissions Middleware (`requirePermission`)  │
│  - Case Visibility Scoping Filters (`caseVisibilityFilter`) │
│  - Zod Request Validation & Luxon IST Date Handling         │
└──────────────────────────────┬──────────────────────────────┘
                               │ Prisma ORM 6 (prisma.config.js)
┌──────────────────────────────▼──────────────────────────────┐
│           Data Layer (MySQL 26.7.0 on Port 3307)            │
│  - 11 Normalized Tables with Foreign Key Constraints        │
│  - Row-Level Locking (`SELECT ... FOR UPDATE`)              │
│  - Atomic Multi-Write Transactions                          │
│  - Immutable Audit Tables (`HearingEvent`, `StatusHistory`) │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Core Modules & The Automation Engine

### Module 1: Authentication & RBAC Administration

- **Session Architecture**: Stateless signed JWT stored in an `httpOnly` cookie (`court_cms_token`, SameSite=Lax, Secure in production).
- **Immediate Revocation**: The `authenticate` middleware re-queries MySQL on every request to instantly enforce deactivations or role changes.
- **Timing Defense**: Unified generic error messages with dummy bcrypt comparisons to eliminate timing side channels.
- **Granular Permissions Matrix**: 14 distinct functional permissions mapped across 4 roles (`ADMIN`, `REGISTRAR`, `JUDGE`, `ADVOCATE`).

### Module 2: Case Filing & Master Docket Registry

- **Automated Sequential Numbering**: Generates standardized docket numbers (`PREFIX/YEAR/00001`) inside an exclusive row lock on `case_sequences`. Prefix mapped by case type (`CRIMINAL=CC`, `CIVIL=CV`, `FAMILY=FM`, etc.).
- **Atomic Registration**: Atomically writes master `Case` record and initial `CaseStatusHistory` (`REGISTERED`) inside a single database transaction.
- **Scope Shielding**: Judges see only assigned bench dockets; Advocates see only cases where they are retained counsel; out-of-scope queries return HTTP 404.

### Module 3: Advocate Management & Representation

- **Bar Council Directory**: Enforces unique Bar Council numbers (`/^[A-Z0-9/-]{5,20}$/`) and validates contact information.
- **Representation Safeguards**: Max 2 active counsel per side; strict conflict-of-interest defense prevents simultaneous representation of petitioner and respondent.
- **Step Reversion Automation**: Unassigning the last counsel on an `ADVOCATE_ASSIGNED` case automatically reverts status to `REGISTERED`.

### Module 4: Hearing Scheduling, Cause Lists & Proceedings

- **IST Standard Calendar**: Enforces 10:00 to 17:00 IST working hours, excludes weekends, protects 13:00 to 14:00 lunch recess, and requires 15-minute slot alignment.
- **Pessimistic Concurrency**: Row-level locking on courtrooms and judicial benches prevents concurrent double-bookings (deterministic 409 Conflict).
- **Reasoned Adjournments**: Presiding judges can adjourn proceedings with mandatory legal justification and optionally schedule the next hearing in one atomic write.
- **Date Boundary Enforcement**: Future-dated hearings cannot be prematurely completed before their scheduled date in IST.

### Module 5: Two-Stage Judgment Disposition Tracker

- **Stage 1 (Reservation)**: Moves eligible `UNDER_TRIAL` cases (with $\ge 1$ completed hearing and 0 pending hearings) to `JUDGMENT_RESERVED`.
- **Stage 2 (Delivery)**: Delivers final decree with outcome (`ALLOWED`, `DISMISSED`, `CONVICTED`, `ACQUITTED`, `SETTLED`, `DISPOSED`), summary text ($\ge 20$ chars), and IST calendar date.
- **Closed-Case Immutability**: Transition to `CLOSED` permanently seals the docket against all future mutations.

### The Automation Engine & Registry Dashboard

- **Zero-Cache Telemetry**: Live aggregation queries (`groupBy` and count) compute status distributions across all 6 states instantly.
- **Overdue Backlog Monitor**: Identifies open cases pending beyond the configurable threshold (default 90 days).
- **Dual-Rule Stale Case Engine**:
  - _Rule 1 (`NO_ADVOCATE`)_: `REGISTERED` cases exceeding 14 days without counsel assigned.
  - _Rule 2 (`NO_HEARING`)_: `ADVOCATE_ASSIGNED` cases exceeding 21 days without an initial hearing scheduled.
- **Dynamic Threshold Tuning**: Administrators can adjust thresholds via `PATCH /dashboard/settings`; changes take effect immediately and create permanent administrative audit logs.

---

## 6. Complete Testing & Verification Summary

| Suite Name               | File                             |  Test Count   | Key Scenarios Covered                                                                       |
| ------------------------ | -------------------------------- | :-----------: | ------------------------------------------------------------------------------------------- |
| **Auth & RBAC**          | `server/tests/auth.test.js`      |      38       | Login, session cookies, rate limiting, timing defense, password change, user administration |
| **Case Management**      | `server/tests/cases.test.js`     |      28       | Auto-numbering concurrency, registration transactions, role scoping, backlog calculation    |
| **Advocate Management**  | `server/tests/advocates.test.js` |      30       | Bar directory, conflict-of-interest checks, 2-per-side limits, unassignment step reversion  |
| **Hearing Scheduling**   | `server/tests/hearings.test.js`  |      42       | IST slot rules, 409 room conflict locks, cause list generation, IST date boundary checks    |
| **Judgment Tracker**     | `server/tests/judgments.test.js` |      48       | Reservation eligibility, delivery decree, double-delivery defense, closed-case immutability |
| **Dashboard Automation** | `server/tests/dashboard.test.js` |      27       | Summary telemetry, backlog worklist, stale detection rules 1 & 2, dynamic threshold tuning  |
| **End-to-End Lifecycle** | `server/tests/e2e.test.js`       |      15       | Continuous Criminal & Civil flows through real API, RBAC checks per stage, immutability     |
| **Total Test Count**     | **7 Suites**                     | **228 Tests** | **100% Passing under both UTC and Asia/Kolkata timezones**                                  |

### Database Integrity Verification (`npm run db:verify`)

The automated verification script executes 6 comprehensive checks against MySQL 26.7.0:

1. **Table Row Counts**: Validates all 11 tables (`users: 7`, `advocates: 6`, `courtrooms: 4`, `cases: 14`, `caseAdvocates: 26`, `hearings: 16`, `hearingEvents: 25`, `judgments: 4`, `caseStatusHistory: 50`, `caseSequences: 2`, `systemSettings: 14`).
2. **Case Status Consistency**: Confirms all 14 cases strictly satisfy their lifecycle invariants.
3. **Hearing & Audit Integrity**: Verifies zero courtroom, judge, or case scheduling collisions across all scheduled hearings.
4. **Judgment Uniqueness**: Confirms 1:1 case-to-judgment mapping and closed-case integrity.
5. **Backlog Cases Threshold**: Confirms 5 open cases exceed the 90-day pendency threshold.
6. **Stale Cases Rules**: Verifies exact matching for Rule 1 (1 case) and Rule 2 (1 case).

---

## 7. Known Limitations

1. **Single Court Complex Jurisdiction**: Operating hours, cause lists, and courtroom availability are modeled for a single court complex under Indian Standard Time (`Asia/Kolkata`).
2. **Permanent Judgment Finality**: Delivered judgments permanently close cases without an in-app clerical correction or review petition workflow.
3. **Local Intranet Auth Model**: User onboarding and password reset use administrative direct allocation rather than external SMTP email verification links, suitable for closed judicial complex intranets.
4. **Live Analytical Querying**: Telemetry metrics are computed directly against MySQL via transactional aggregate queries; for multi-million case enterprise deployments, read replicas or Redis caching layers would be beneficial.
5. **No Bulk Docket Ingestion**: Case filing is optimized for rigorous atomic sequential validation; bulk legacy CSV docket ingestion is left for future administrative tooling.

---

## 8. Future Work

1. **Standalone Digital Evidence Repository**: Developing an isolated, cryptographically signed digital evidence vault with hash-chain custody tracking, distinct from the core docket registry.
2. **Judicial Decree Amendment & Review Petitions**: Implementing a formal judicial review workflow permitting presiding judges to issue signed addenda or rectifications to delivered decrees with strict versioning.
3. **Multi-Registry & High Court Bench Hierarchy**: Expanding courtroom and bench allocation to support multiple judicial complexes, appellate benches, and state-wide judicial hierarchies.
4. **Automated Cause List PDF Export**: Adding digital-signature-backed PDF generation for daily cause lists suitable for public display boards outside courtrooms.

---

## 9. Conclusion

Court CMS successfully demonstrates that Indian court pendency can be substantially mitigated through modern software architecture. By replacing disconnected manual logs with an automated state machine, enforcing physical courtroom availability through pessimistic locking, providing instant zero-cache registry visibility into aging dockets, and ensuring complete accessibility, the system establishes a robust, extensible foundation for next-generation digital court administration.
