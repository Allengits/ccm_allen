# Court Case Management System (Court CMS)

A modernized, enterprise-grade, full-stack Judicial Registry and Case Management System designed to streamline case allocation, hearing scheduling, trial proceedings, and judgment tracking across Indian courts.

---

## 🏛️ Project Overview

Indian courts face substantial case pendency with over 5.3 crore active cases. A significant portion of this backlog stems from fragmented case allocation, manual registry procedures, unmonitored adjournment cycles, and siloed tracking across disparate systems.

**Court CMS** provides a unified case docket connecting:

- **Case Registration & Auto-Numbering**: Standardized sequence generation (`PREFIX/YEAR/00001`) with strict legal immutability.
- **Advocate Management & Case Assignment**: Bar Council credential validation, conflict-of-interest defense, and automated counsel linkage.
- **Hearing Scheduling & Cause Lists**: IST timezone calendar standards, pessimistic courtroom lock management, dynamic slot availability, and automated daily cause lists.
- **Trial & Judgment Tracker**: Hearing outcome recording, reasoned adjournment handling, two-stage disposition (Reserve $\rightarrow$ Deliver), and permanent closed-case read-only protection.
- **Automation Engine & Registry Dashboard**: Zero-cache real-time caseload telemetry, 90-day overdue backlog worklists, dual-rule stale case detection, personnel capacity monitoring, and administrative threshold tuning.

---

## 🏗️ Architecture & Tech Stack

This project is organized as a monorepo:

```
ccm_allen/
├── client/                 # Frontend React Application (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── api/            # Axios API client & payload unwrap utility
│   │   ├── components/     # Accessible UI modals, layout & dashboard widgets
│   │   ├── hooks/          # A11y focus-trap & modal keyboard handlers
│   │   ├── pages/          # Route views (Dashboard, Cases, Hearings, Judgments, etc.)
│   │   └── context/        # Authentication & session state context
│   └── .env.example        # Client environment template
├── server/                 # Backend Node.js / Express REST API
│   ├── prisma/             # Prisma schema, migrations, seed script & verify suite
│   ├── prisma.config.js    # Modern Prisma 6 configuration (ES module)
│   ├── src/
│   │   ├── config/         # Permissions matrix & case visibility filters
│   │   ├── controllers/    # API endpoint controllers across all 4 modules
│   │   ├── middlewares/    # Session authentication & RBAC guards
│   │   ├── services/       # caseWorkflow state automation engine
│   │   └── utils/          # courtTime (IST standard) & dashboard settings
│   ├── tests/              # 7 test suites (228 automated tests)
│   └── .env.example        # Server environment template
├── docs/                   # Architectural & module specifications
│   └── DEMO_SCRIPT.md      # Live evaluation & demonstration walkthrough
├── reports/                # Phase milestone reports & final project report
├── PROJECT_CONTEXT.md      # Authoritative single current-state specification
└── package.json            # Monorepo scripts & dev runner
```

### Core Technologies

- **Frontend**: React 19, Vite 6, Tailwind CSS 3.4, React Router 7, Axios, Lucide Icons, WCAG AA accessible components
- **Backend**: Node.js 22 LTS (ES Modules), Express 4.21, Luxon 3.7 (IST Court Timezone standard), Zod 3.24
- **Database**: MongoDB (Port `27017`, db `court_cms`), native MongoDB client adapter maintaining Prisma model interface
- **Testing**: Vitest 3.0.7, Supertest 7.0.0, 7 automated suites (228 tests passing under UTC and `Asia/Kolkata`)
- **Quality Gates**: ESLint 9 (Flat Config, 0/0 clean), Prettier 3 (formatted), Vite Production Build

---

## ⚙️ Prerequisites

- **Node.js**: v20.x or v22.x LTS (tested on Node v24.14.0)
- **npm**: v10.x or v11.x
- **Git**: 2.40+
- **MongoDB Database**: Running on `localhost:27017` (database `court_cms`)

---

## 🔐 Environment Configuration

### 1. Server Environment (`server/.env`)

Create `server/.env` based on `server/.env.example`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="mongodb://localhost:27017/court_cms"
MONGODB_URI="mongodb://localhost:27017/court_cms"
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=your_super_secret_jwt_key_at_least_32_chars_long_2026
JWT_EXPIRES_IN=8h
COOKIE_NAME=court_cms_token
```

> **Note**: `server/.env` contains credentials and must **never** be committed to version control.

### 2. Client Environment (`client/.env`)

Create `client/.env` based on `client/.env.example`:

```env
# Using Vite dev proxy for same-origin session cookies:
VITE_API_URL=/api/v1
```

---

## 👥 Demo Accounts for Reviewers

All accounts share the standard evaluation password: `Demo@1234`

| Role          | Name                     | Official Email                      | Key Demonstration Purpose                                        |
| :------------ | :----------------------- | :---------------------------------- | :--------------------------------------------------------------- |
| **ADMIN**     | Rajesh Varma             | `admin@courtcms.gov.in`             | User onboarding, threshold settings, court-wide audit oversight  |
| **REGISTRAR** | Sunita Sharma            | `registrar@courtcms.gov.in`         | Docket registration, counsel assignment, hearing scheduling      |
| **JUDGE**     | Hon. Justice Swaminathan | `judge.swaminathan@courtcms.gov.in` | Courtroom 1 bench, conducting hearings, delivering judgments     |
| **JUDGE**     | Hon. Justice Banerjee    | `judge.banerjee@courtcms.gov.in`    | Courtroom 2 bench, civil suits, hearing adjournment & completion |
| **ADVOCATE**  | Adv. Tariq Khan          | `adv.khan@courtcms.gov.in`          | Senior Criminal Counsel, client-only scoped docket view          |
| **ADVOCATE**  | Adv. Priya Mehta         | `adv.mehta@courtcms.gov.in`         | Commercial & Civil Litigator, client-only scoped view            |
| **ADVOCATE**  | Adv. K. S. Iyer          | `adv.iyer@courtcms.gov.in`          | Appellate & Constitutional Counsel, cause list review            |

---

## 🚀 Getting Started (Step-by-Step)

### 1. Install Monorepo Dependencies

Run from the root directory:

```powershell
npm run install:all
```

### 2. Initialize Database & Seed Demo Data

Run the database reset script (applies migrations, executes clean seed, and establishes baseline):

```powershell
npm run db:reset
```

Verify that the database passes all 6 integrity checks:

```powershell
npm run db:verify
```

### 3. Start Development Servers

Start both Express backend (`http://localhost:5000`) and Vite frontend (`http://localhost:5173`):

```powershell
npm run dev
```

Open `http://localhost:5173` in your browser. The `/login` page offers quick-login buttons for all demo roles.

---

## 🗄️ Database Operations

All database commands run via root scripts without deprecation warnings:

```powershell
# Reset database from empty and seed initial dataset
npm run db:reset

# Re-run seeder on existing database
npm run db:seed

# Verify table counts, constraints, conflicts, and business rules (6 checks)
npm run db:verify

# Launch Prisma Studio GUI database browser
npm run db:studio

# Apply any pending schema migrations
npm run db:migrate
```

---

## 🧪 Testing & Quality Gates

### Automated Test Suites (Vitest + Supertest)

Court CMS features **228 automated tests** across 7 dedicated suites:

```powershell
# Run all 7 test suites (228 tests)
npm test

# Run tests under both UTC and Asia/Kolkata timezones to prove calendar parity
npm run test:tz

# Run specific functional test suites:
npm run test:auth        # Authentication, sessions, rate limits & RBAC (38 tests)
npm run test:cases       # Case filing, auto-numbering & role scoping (28 tests)
npm run test:advocates   # Bar directory, assignment rules & conflicts (30 tests)
npm run test:hearings    # Scheduling, cause lists, IST rules & audit (42 tests)
npm run test:judgments   # Reservation, delivery & closed immutability (48 tests)
npx vitest run tests/dashboard.test.js --dir server  # Dashboard telemetry & thresholds (27 tests)
npx vitest run tests/e2e.test.js --dir server        # Continuous lifecycle E2E flow (15 tests)
```

### Linting, Formatting & Production Build

```powershell
# Run ESLint (0 errors, 0 warnings enforced)
npm run lint

# Check code formatting with Prettier
npm run format:check

# Auto-format all files
npm run format

# Verify production frontend bundle builds cleanly
npm run build --prefix client
```

---

## 📖 Detailed Documentation

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — Authoritative system specifications, ER diagram, status transition table, permissions matrix, and API route directory.
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — 8-to-10 minute live walkthrough demo script for presenters.
- [reports/FINAL_PROJECT_REPORT.md](reports/FINAL_PROJECT_REPORT.md) — Comprehensive academic project report covering problem, novelty, architecture, scope decisions, testing, and future work.
- [docs/DATABASE.md](docs/DATABASE.md) — Database schema, relational models & data dictionary.
- [docs/AUTH.md](docs/AUTH.md) — Authentication, sessions, rate limiting & RBAC permission matrix.
- [docs/CASES.md](docs/CASES.md) — Case registration, auto-number generation & docket querying.
- [docs/ADVOCATES.md](docs/ADVOCATES.md) — Advocate directory, representation rules & workflow automation.
- [docs/HEARINGS.md](docs/HEARINGS.md) — Hearing scheduling, cause lists, slot availability & audit events.
- [docs/JUDGMENTS.md](docs/JUDGMENTS.md) — Judgment reservation, delivery, concurrency control & permanent read-only rules.
- [docs/DASHBOARD.md](docs/DASHBOARD.md) — Automation engine, threshold settings, backlog & stale-case detection.

---

## 📋 Project Roadmap Summary

- [x] **Phase 1: Project Setup, Architecture & App Shell**
- [x] **Phase 2: Database Schema, Migrations & Seed Data**
- [x] **Phase 3: Authentication, RBAC & User Management**
- [x] **Phase 4: Case Filing & Master Docket Registry**
- [x] **Phase 5: Advocate Assignment & Bar Directory**
- [x] **Phase 6: Hearing Scheduling, Cause Lists & Case-Status Automation**
- [x] **Phase 7: Judgment Tracker, State Machine & Permissions**
- [x] **Phase 8: Automation Engine and Registry Dashboard**
- [x] **Phase 9: Final E2E Testing, Accessibility Pass, Prisma Migration, Documentation & Demo Readiness**
