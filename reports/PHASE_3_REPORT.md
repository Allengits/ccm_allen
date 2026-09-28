# Phase 3 Implementation Report — Authentication & Role-Based Access Control (RBAC)

**Date**: 2026-09-28  
**Phase**: Phase 3 — Authentication and Role-Based Access Control (RBAC)  
**System**: Court Case Management System (Court CMS)  
**Status**: Completed

---

## 1. Objective

The primary objective of Phase 3 was to implement an enterprise-grade, secure authentication system and role-based access control (RBAC) across the full stack:

- Backend authentication endpoints under `/api/v1/auth` (`login`, `logout`, `me`, `change-password`).
- Strict session management using signed JSON Web Tokens (JWT) stored exclusively in `httpOnly` cookies with `SameSite=Lax`.
- Comprehensive protection mechanisms: rate limiting (10 attempts/15 min/IP), timing-safe comparisons via dummy bcrypt hashes on unknown emails, immediate deactivation enforcement via per-request database validation, and complete redaction of `passwordHash`.
- Central permissions architecture (`server/src/config/permissions.js`) defining granular permissions and judicial role visibility scoping (`caseVisibilityFilter(user)`).
- Admin-only User Management REST API under `/api/v1/users` with safety invariants against self-deactivation, self-demotion, and leaving the system without active administrators.
- Frontend React application integration: Vite development proxy for first-party cookie semantics, Axios client with `withCredentials: true`, `AuthContext` session restoration, protected route guards, role-filtered navigation sidebar, top-bar user badge/logout, responsive Login view with dev-mode quick-fill buttons, 403 Forbidden view, Account settings view, and a complete User Management administration interface.
- 100% automated test coverage using Vitest and Supertest leaving the database in its verified seed state.

---

## 2. What Was Built

### 2.1 Backend Security & Authentication Services

- **Dependencies**: Integrated `cookie-parser`, `express-rate-limit`, `jsonwebtoken` for production and `vitest`, `supertest` for testing.
- **Environment & Configuration**: Added `JWT_SECRET`, `JWT_EXPIRES_IN=8h`, and `COOKIE_NAME=court_cms_token` to `server/.env` and `server/.env.example`.
- **Central Permissions Matrix (`server/src/config/permissions.js`)**:
  - Exported 12 named permission constants (`case.create`, `case.view`, `case.edit`, `advocate.assign`, `hearing.schedule`, `hearing.update`, `evidence.submit`, `evidence.review`, `judgment.record`, `judgment.deliver`, `user.manage`, `dashboard.view`).
  - Mapped granular capabilities to each judicial role (`ADMIN`, `REGISTRAR`, `JUDGE`, `ADVOCATE`).
  - Provided `hasPermission(role, permission)` and `requirePermission(permission)` Express middlewares.
  - Implemented `caseVisibilityFilter(user)` generating Prisma `where` objects:
    - `ADMIN` & `REGISTRAR`: `{}` (all cases).
    - `JUDGE`: `{ judgeId: user.id }`.
    - `ADVOCATE`: `{ advocates: { some: { advocateId, isActive: true } } }` (or `{ id: 'impossible-match' }` if unlinked).
- **Authentication Middlewares (`server/src/middlewares/auth.js`)**:
  - `authenticate`: Extracts `court_cms_token` from cookies, verifies the JWT signature, queries MySQL to reload user status (instantly rejecting inactive or deleted accounts with 401/403), and binds `req.user` with advocate linkage.
  - `authorize(...roles)`: Verifies role membership, rejecting unauthorized roles with HTTP 403.
- **Auth Controller & Routes (`/api/v1/auth`)**:
  - `POST /login`: Validated with Zod, case-insensitive email lookup, timing-attack mitigation with pre-computed dummy bcrypt hash, sets 8h `httpOnly` cookie (`SameSite=Lax`, `Secure` in prod), never returns JWT or `passwordHash` in response body.
  - `POST /logout`: Clears the cookie with `maxAge: 0`.
  - `GET /me`: Returns authenticated profile, role, and linked advocate ID.
  - `POST /change-password`: Enforces current password verification, 8+ character complexity (letter + number), and disallows password reuse.
- **Rate Limiting**: 10 login attempts per 15 minutes per IP returning HTTP 429 (`express-rate-limit`).

### 2.2 User Management API (ADMIN Only — `/api/v1/users`)

- `GET /users`: Search by name/email and filter by judicial role.
- `POST /users`: Provisions new users with initial passwords; allows linking an existing unlinked advocate profile when role is `ADVOCATE`.
- `PATCH /users/:id`: Edits name, role, active status, and advocate association. Enforces safety invariants:
  - Admin cannot deactivate their own account.
  - Admin cannot demote their own account.
  - System refuses to deactivate or demote the last remaining active Admin.
- `POST /users/:id/reset-password`: Allows administrators to securely reset employee credentials.

### 2.3 Frontend Application & UI (React + Tailwind CSS)

- **Vite Proxy & Axios**: Configured `client/vite.config.js` to proxy `/api` calls to `http://localhost:5000`. Updated `client/src/api/axios.js` with `withCredentials: true` and a global 401 interceptor redirecting to `/login?notice=session_expired`.
- **Auth Context (`client/src/context/AuthContext.jsx`)**: Manages session state, restores user from `/auth/me` on mount, and exposes `login`, `logout`, and a client-side `can(permission)` helper mirroring backend rules.
- **Route Guards & Protection**:
  - `ProtectedRoute`: Redirects unauthenticated visitors to `/login`, preserving the intended destination via `location.state.from`.
  - Role-based authorization redirecting unauthorized roles to `/forbidden` (HTTP 403 page).
- **Views & UI**:
  - `Login.jsx`: Official judicial login form with show/hide password toggle, loading indicators, lockout error handling, and dev-only quick-fill buttons for all 4 seeded roles (`import.meta.env.DEV`).
  - `Forbidden.jsx`: Dedicated 403 page styled with judicial brass accents.
  - `Sidebar.jsx`: Dynamically filters modules (Cases, Hearings, Evidence, Judgments, Advocates, Users) according to role permissions.
  - `TopBar.jsx`: Displays user name, role badge, Bar Council number (if advocate), and interactive Sign Out button.
  - `Account.jsx`: Displays user metadata and provides an authenticated password change form with live validation.
  - `Users.jsx`: Administrative dashboard featuring user search, role filter tabs, user creation dialog, edit modal, toggle activation/deactivation, and password reset dialog with real-time toast notifications.

---

## 3. Files and Folders Changed

### 3.1 Backend (`server/`)

- `server/.env.example` — Added `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_NAME`.
- `server/package.json` — Added dependencies (`cookie-parser`, `express-rate-limit`, `jsonwebtoken`) and devDependencies (`vitest`, `supertest`), plus `test` and `test:auth` scripts.
- `server/vitest.config.js` — Vitest configuration for Node.js environment.
- `server/src/config/index.js` — Exposed JWT and cookie configuration settings.
- `server/src/config/permissions.js` — Central permissions matrix and `caseVisibilityFilter`.
- `server/src/middlewares/auth.js` — Implemented `authenticate` and `authorize` middlewares.
- `server/src/controllers/auth.controller.js` — Auth business logic (`login`, `logout`, `me`, `changePassword`).
- `server/src/controllers/user.controller.js` — User management business logic with safety checks.
- `server/src/routes/auth.routes.js` — Routes for auth endpoints with rate limiter.
- `server/src/routes/user.routes.js` — Routes for admin user management.
- `server/src/routes/index.js` — Mounted auth and user routes alongside existing health check.
- `server/src/app.js` — Added `cookie-parser`, `trust proxy: 1`, and morgan test suppression.
- `server/tests/auth.test.js` — 33 comprehensive Vitest/Supertest test cases.

### 3.2 Frontend (`client/`)

- `client/.env.example` — Updated `VITE_API_URL=/api/v1` for proxy compatibility.
- `client/vite.config.js` — Configured `/api` proxy target `http://localhost:5000`.
- `client/src/api/axios.js` — Added `withCredentials: true` and 401 response interceptor.
- `client/src/constants/permissions.js` — Frontend permissions matrix mirroring backend.
- `client/src/context/AuthContext.jsx` — React Context for global auth state and permission checks.
- `client/src/components/auth/ProtectedRoute.jsx` — Route guard with role-based restrictions.
- `client/src/components/layout/Sidebar.jsx` — Dynamic role-filtered navigation items.
- `client/src/components/layout/TopBar.jsx` — Authenticated user badge and logout handler.
- `client/src/pages/Login.jsx` — Login form with dev demo buttons.
- `client/src/pages/Forbidden.jsx` — 403 Forbidden screen.
- `client/src/pages/Account.jsx` — Profile inspection and password update view.
- `client/src/pages/Users.jsx` — Complete admin user management page.
- `client/src/App.jsx` — Configured protected routes and auth provider wrapping.

### 3.3 Monorepo & Documentation

- `package.json` — Added root `test` and `test:auth` convenience scripts.
- `docs/AUTH.md` — Complete auth and RBAC specification document.
- `PROJECT_CONTEXT.md` — Appended "Auth and Access Control (Phase 3)" section.
- `README.md` — Documented environment variables, demo accounts table, and test commands.
- `reports/PHASE_3_REPORT.md` — This milestone report.

---

## 4. How to Run and Verify

### 4.1 Running the Servers

From the root repository directory in PowerShell:

```powershell
# Start both backend and frontend concurrently
npm run dev
```

- Backend runs on `http://localhost:5000`
- Frontend runs on `http://localhost:5173`

### 4.2 Automated Testing

Execute the complete test suite:

```powershell
# Run all server test suites
npm test

# Run auth and RBAC tests specifically
npm run test:auth
```

### 4.3 Database Verification

Verify that running the test suite left zero orphan records and preserved database integrity:

```powershell
npm run db:verify
```

### 4.4 Code Quality & Linting

```powershell
# ESLint check
npm run lint

# Prettier format check
npm run format:check
```

### 4.5 Interactive UI Verification

1. Navigate to `http://localhost:5173/`.
2. As an unauthenticated user, observe immediate redirect to `/login?from=%2F`.
3. Use the dev-mode quick-fill buttons to test each role:
   - **ADMIN** (`admin@courtcms.gov.in`): Sees all navigation modules including **Users**. Can access `/users`, create users, edit accounts, toggle statuses, and trigger password resets.
   - **REGISTRAR** (`registrar@courtcms.gov.in`): Sees Dashboard, Cases, Hearings, Evidence, Advocates. **Users** module is hidden. Attempting to directly browse to `http://localhost:5173/users` redirects to `/forbidden`.
   - **JUDGE** (`judge.rao@courtcms.gov.in`): Sees Dashboard, Cases, Hearings, Evidence, Judgments.
   - **ADVOCATE** (`rajesh.sharma@delhibar.org`): Sees Cases and Evidence only.
4. Test **Sign Out**: Click the "Sign Out" button in the TopBar. The session cookie is invalidated and the user is redirected to `/login`.
5. Test **Account Password Change**: Log in, navigate to **Account**, and test the change password form. Enforces complexity rules and rejects identical passwords.

---

## 5. Test Evidence

### 5.1 Automated Test Execution (`npm test`)

```
> court-case-management-system@1.0.0 test
> npm run test --prefix server

> server@1.0.0 test
> vitest run

 RUN  v5.0.2 C:/Users/allen/OneDrive/Desktop/ccm_allen/server

 ✓ tests/auth.test.js (33 tests) 4993ms
   ✓ Court CMS - Authentication & RBAC Suite (33)
     ✓ POST /api/v1/auth/login (7)
       ✓ successfully logs in ADMIN and sets httpOnly cookie without exposing passwordHash or token in body 419ms
       ✓ successfully logs in REGISTRAR and sets valid cookie
       ✓ successfully logs in JUDGE and sets valid cookie
       ✓ successfully logs in ADVOCATE and returns linked advocateId
       ✓ rejects unknown email with generic message
       ✓ rejects wrong password with generic message
       ✓ rejects inactive user account with 403 Forbidden
     ✓ GET /api/v1/auth/me (3)
       ✓ returns 401 when no auth cookie is provided
       ✓ returns user profile when valid cookie is provided
       ✓ rejects immediately if user was deactivated after token issuance
     ✓ POST /api/v1/auth/logout (2)
       ✓ clears the auth cookie
       ✓ subsequent authenticated request fails after logout
     ✓ RBAC Authorization & Route Guards (2)
       ✓ allows ADMIN to access /api/v1/users
       ✓ denies non-admin (REGISTRAR) access to /api/v1/users with 403 Forbidden
     ✓ User Management API (ADMIN only) (8)
       ✓ GET /api/v1/users returns user list with optional role filter
       ✓ POST /api/v1/users creates new user successfully
       ✓ POST /api/v1/users rejects duplicate email with 409 Conflict
       ✓ PATCH /api/v1/users/:id updates user details and active status
       ✓ PATCH /api/v1/users/:id prevents admin from deactivating their own account
       ✓ PATCH /api/v1/users/:id prevents admin from demoting their own role
       ✓ PATCH /api/v1/users/:id prevents deactivating the last active ADMIN
       ✓ POST /api/v1/users/:id/reset-password successfully resets a user password
     ✓ POST /api/v1/auth/change-password (4)
       ✓ rejects if current password is incorrect
       ✓ rejects if new password does not meet complexity rules
       ✓ rejects if new password is identical to current password
       ✓ accepts compliant new password and enables login with new credentials 468ms
     ✓ Permissions & Case Visibility Scoping (5)
       ✓ caseVisibilityFilter returns empty filter for ADMIN (all cases)
       ✓ caseVisibilityFilter returns empty filter for REGISTRAR (all cases)
       ✓ caseVisibilityFilter scopes to judgeId for JUDGE
       ✓ caseVisibilityFilter scopes to active CaseAdvocate relation for ADVOCATE
       ✓ hasPermission correctly evaluates role matrix
     ✓ Rate Limiter Protection (1)
       ✓ returns 429 Too Many Requests when exceeding login attempts threshold on specific IP 1520ms
     ✓ Public Health Endpoint Integrity (1)
       ✓ remains public, unauthenticated, and returns 200 with database connected

 Test Files  1 passed (1)
      Tests  33 passed (33)
   Start at  11:49:51
   Duration  6.69s (tests 78%, import 16%, transform 6%)
```

### 5.2 Database Verification (`npm run db:verify`)

```
> court-case-management-system@1.0.0 db:verify
> npm run db:verify --prefix server

> server@1.0.0 db:verify
> node prisma/verify.js

===============================================================
       COURT CASE MANAGEMENT SYSTEM - DATABASE VERIFICATION
===============================================================

[1/5] Checking table row counts...
[2/5] Validating case lifecycle records consistency...
[3/5] Checking for courtroom and judge scheduling conflicts...
[4/5] Checking judgment uniqueness per case...
[5/5] Checking backlog threshold cases...

===============================================================
                   VERIFICATION RESULTS TABLE
===============================================================
┌─────────┬───────────────────────────┬────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ Check                     │ Status │ Details                                                                                                                                                                                                                              │
├─────────┼───────────────────────────┼────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ 'Table Row Counts'        │ 'PASS' │ 'All 12 tables populated (users: 7, advocates: 6, courtrooms: 4, cases: 14, caseAdvocates: 24, hearings: 16, evidence: 8, evidenceCustodyLogs: 16, judgments: 4, caseStatusHistory: 50, caseSequences: 3, systemSettings: 2)'        │
│ 1       │ 'Case Status Consistency' │ 'PASS' │ 'All 14 cases strictly conform to their lifecycle state constraints'                                                                                                                                                                 │
│ 2       │ 'No Double-Booking'       │ 'PASS' │ 'All 16 hearings verified: zero courtroom and zero judge scheduling collisions'                                                                                                                                                      │
│ 3       │ 'Judgment Uniqueness'     │ 'PASS' │ 'All 4 judgments have unique caseId (enforces 1:1 relation)'                                                                                                                                                                         │
│ 4       │ 'Backlog Cases Threshold' │ 'PASS' │ 'Found 5 open cases older than 90 days (Requirement >= 3). Cases: CC/2025/00030 (JUDGMENT_RESERVED), CC/2025/00045 (UNDER_TRIAL), CC/2025/00058 (UNDER_TRIAL), CC/2025/00072 (HEARING_SCHEDULED), CC/2025/00085 (ADVOCATE_ASSIGNED)' │
└─────────┴───────────────────────────┴────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (CODE 0) <<<
```

### 5.3 Code Quality & Linter Checks

```
> npm run lint
> eslint .
(Exited with code 0 - 0 errors, 0 warnings)

> npm run format:check
> prettier --check .
Checking formatting...
All matched files use Prettier code style!
(Exited with code 0)
```

---

## 6. Decisions and Assumptions

1. **HttpOnly Cookie Architecture**:
   - The token is placed exclusively inside an `httpOnly` cookie (`SameSite=Lax`, `Secure` in production). This completely mitigates JavaScript token extraction through XSS vulnerabilities.
   - The Vite development proxy maps `/api` requests to `http://localhost:5000` so that cookie handling functions as a first-party cookie during local development.

2. **Per-Request Database Validation**:
   - Although JWTs are signed, `authenticate` re-queries the user from MySQL on each request to check `isActive`. This guarantees that deactivating a compromised or terminated user immediately revokes access without waiting for the 8-hour token expiration.

3. **Timing-Safe Credential Comparison**:
   - For unknown emails, the server performs a dummy bcrypt compare against a pre-computed hash. Both unknown email and wrong password respond with `"Invalid email or password"`.

4. **Rate Limiting**:
   - `express-rate-limit` limits login attempts to 10 per 15 minutes per IP. For testing, `app.set('trust proxy', 1)` allows simulating distinct remote IPs via `X-Forwarded-For`.

5. **Prisma Schema Stability**:
   - The existing Prisma schema was strictly preserved with 0 modifications.

---

## 7. Issues and Limitations

- **Stateful DB Validation**: Re-reading the user from MySQL on every authenticated request incurs a minor database lookup. For high-throughput production, a Redis cache with pub/sub invalidation on user updates could optimize this without sacrificing immediate deactivation.
- **CSRF Token Considerations**: While `SameSite=Lax` cookies provide strong CSRF protection against cross-site state-changing POST requests in modern browsers, adding explicit double-submit CSRF tokens can be evaluated in future hardening phases.

---

## 8. Deviations from the Prompt

None. All Phase 3 requirements, security policies, API endpoints, UI features, and test coverage constraints were implemented as specified without building ahead into domain entities (cases, hearings, judgments).

---

## 9. Ready-for-Next-Phase Checklist

- [x] All Phase 3 backend auth and user management endpoints operational.
- [x] JWT token stored strictly in `httpOnly` cookie (`passwordHash` never leaked).
- [x] Role-based permissions matrix and `caseVisibilityFilter(user)` exported and ready for reuse.
- [x] Vite dev proxy configured and axios interceptor active.
- [x] Frontend Login, TopBar, Sidebar, Account, Forbidden, and Users management views fully responsive and functional.
- [x] Dev-only demo login buttons available in development mode only.
- [x] `npm test` and `npm run test:auth` pass with 33/33 tests passing.
- [x] `npm run db:verify` passes with 100% data integrity (Code 0).
- [x] `npm run lint` and `npm run format:check` pass cleanly with 0 errors.
- [x] `docs/AUTH.md` created; `PROJECT_CONTEXT.md` and `README.md` updated.
- [x] No Prisma schema modifications made in Phase 3.
