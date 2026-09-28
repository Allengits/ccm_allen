# Court Case Management System (Court CMS)

A modernized, full-stack judicial registry and case management system designed to streamline case allocation, hearing scheduling, digital evidence preservation, and judgment tracking across Indian judicial courts.

---

## 🏛️ Project Overview

Indian courts face substantial case pendency with over 5.3 crore active cases. A significant portion of this delay stems from fragmented case allocation, manual registry procedures, and siloed tracking.

**Court CMS** provides a unified case docket connecting:

- Case registration & lifecycle tracking
- Advocate assignment & bar council linkage
- Daily cause lists & hearing management
- Tamper-evident digital evidence repository
- Judgment reservation and certified order delivery
- Automated backlog flagging for cases exceeding threshold pendency limits

---

## 🏗️ Architecture & Tech Stack

This project is organized as a monorepo:

```
ccm_allen/
├── client/                 # Frontend React Application (Vite)
│   ├── src/
│   │   ├── api/            # Axios API client instance
│   │   ├── components/     # App shell, navigation, and common UI
│   │   └── pages/          # Route views (Dashboard, Cases, Hearings, etc.)
│   ├── .env.example        # Client environment template
│   └── tailwind.config.js  # Theme colors (Navy #1C2B45, Brass #A6763B)
├── server/                 # Backend Node.js / Express API
│   ├── prisma/             # Prisma schema & database migrations
│   ├── src/
│   │   ├── config/         # Environment variable loader
│   │   ├── db/             # Prisma client instance
│   │   ├── middlewares/    # Central error handler & route guards
│   │   └── routes/         # REST API v1 endpoints
│   └── .env.example        # Server environment template
├── reports/                # Phase milestone reports
├── PROJECT_CONTEXT.md      # Core domain context, roadmap & conventions
└── package.json            # Monorepo scripts (concurrently dev runner)
```

### Core Technologies

- **Frontend**: React 18, Vite 6, Tailwind CSS 3, React Router 6, Axios, Lucide Icons
- **Backend**: Node.js (ES Modules), Express 4, Helmet, CORS, Morgan
- **Database & ORM**: MySQL (running on port `3307`), Prisma ORM 6
- **Tooling**: ESLint 9 (Flat Config), Prettier 3, Concurrently 9

---

## ⚙️ Prerequisites

- **Node.js**: v24.14.0 or higher
- **npm**: v11.9.0 or higher
- **Git**: 2.50+
- **MySQL Database**: Server running on `localhost:3307`
  - Database name: `court_cms`
  - User: `court_user`
  - Password: `CourtCms2026`

---

## 🔐 Environment Configuration

### 1. Server Environment (`server/.env`)

Create `server/.env` based on `server/.env.example`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="mysql://court_user:CourtCms2026@localhost:3307/court_cms"
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=your_super_secret_jwt_key_at_least_32_chars_long
JWT_EXPIRES_IN=8h
COOKIE_NAME=court_cms_token
```

> **Note**: `server/.env` contains credentials and must **never** be committed to version control.

### 2. Client Environment (`client/.env`)

Create `client/.env` based on `client/.env.example`:

```env
# Using the Vite dev proxy for same-origin cookies:
VITE_API_URL=/api/v1
```

---

## 👥 Demo Logins for Development

When running in development mode (`npm run dev`), the `/login` page displays one-click quick-fill buttons for the seeded accounts. All seeded users share the default password `Password123`:

| Role          | Name                   | Email                        | Password      |
| :------------ | :--------------------- | :--------------------------- | :------------ |
| **ADMIN**     | Suresh Ramanathan      | `admin@courtcms.gov.in`      | `Password123` |
| **REGISTRAR** | Anita Desai            | `registrar@courtcms.gov.in`  | `Password123` |
| **JUDGE**     | Justice Dhananjaya Rao | `judge.rao@courtcms.gov.in`  | `Password123` |
| **ADVOCATE**  | Adv. Rajesh Sharma     | `rajesh.sharma@delhibar.org` | `Password123` |

---

## 🚀 Getting Started

### 1. Install Dependencies

Run the installation command from the repository root:

```powershell
npm run install:all
```

Or install individually:

```powershell
npm install
cd server && npm install
cd ../client && npm install
```

### 2. Generate Prisma Client

Inside the `server/` directory:

```powershell
npm run prisma:generate
```

### 3. Run Development Servers

Start both the Express backend (`http://localhost:5000`) and the Vite client (`http://localhost:5173`) concurrently:

```powershell
npm run dev
```

---

## 📡 REST API Specifications

All endpoints are prefixed under `/api/v1` and follow standard JSON response conventions:

- **Success**: `{ success: true, message: string, data: any }`
- **Error**: `{ success: false, message: string, errors: string[] }`

### Phase 1 Endpoints

#### `GET /api/v1/health`

Checks API server availability and live database connectivity via Prisma.

**Sample Response (200 OK):**

```json
{
  "success": true,
  "message": "System is healthy",
  "data": {
    "api": "ok",
    "database": "connected",
    "timestamp": "2026-09-28T05:29:45.613Z"
  }
}
```

---

## 🗄️ Database Management & Operations

Court CMS uses Prisma ORM with MySQL. All database operations can be executed directly from root:

```powershell
# Apply schema migrations
npm run db:migrate

# Seed / re-seed realistic demo data
npm run db:seed

# Reset database from scratch and re-seed
npm run db:reset

# Run automated integrity and business-rule validation
npm run db:verify

# Launch Prisma Studio GUI
npm run db:studio
```

For complete schema details, entity-relationship diagrams, and data dictionary, see [docs/DATABASE.md](docs/DATABASE.md).

---

## 🎨 UI Theme & Design Tokens

Designed with a formal, accessible judicial registry aesthetic:

- **Navy Primary**: `#1C2B45`
- **Brass Accent**: `#A6763B`
- **Background**: `#FFFFFF` / `#F8FAFC`
- **Typography**:
  - Headings: _Source Serif 4_ / _Times New Roman_ (Serif)
  - Body & Data: _Inter_ / system sans-serif

---

## 🧪 Code Quality, Formatting & Testing

### Linting & Formatting

```powershell
# Run ESLint across entire repository
npm run lint

# Format code with Prettier
npm run format

# Verify formatting compliance
npm run format:check
```

### Automated Testing (Vitest & Supertest)

Court CMS includes full backend unit and integration test coverage for authentication, RBAC, password policies, rate limiting, and case visibility scoping:

```powershell
# Run all server tests (from root or server/)
npm test

# Run authentication and RBAC test suite specifically
npm run test:auth
```

---

## 📋 Phase Implementation Roadmap

- [x] **Phase 1: Project Setup, Architecture & App Shell**
- [x] **Phase 2: Database Schema, Migrations & Seed Data**
- [x] **Phase 3: Authentication, RBAC & User Management**
- [ ] **Phase 4: Case Filing & Master Docket Registry**
- [ ] **Phase 5: Advocate Assignment & Bar Directory**
- [ ] **Phase 6: Hearing Scheduling, Bench Allocation & Cause Lists**
- [ ] **Phase 7: Digital Evidence Vault & Chain of Custody**
- [ ] **Phase 8: Judgment Reservation & Orders Repository**
- [ ] **Phase 9: Pendency Flagging Dashboard & Public Portal**
