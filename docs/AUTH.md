# Authentication and Role-Based Access Control (RBAC) Documentation

This document describes the security architecture, authentication flow, session management, permissions matrix, and user management API implemented in Phase 3 of the Court Case Management System (Court CMS).

---

## 1. Authentication Flow & Session Architecture

### Overview

Court CMS implements a stateless, cryptographically signed JSON Web Token (JWT) session stored exclusively inside a hardened **HTTP-only cookie**. This architecture prevents Cross-Site Scripting (XSS) credential theft while mitigating timing attacks and brute-force vulnerabilities.

```
┌────────────────┐                     ┌─────────────────────┐                     ┌────────────────┐
│  React Client  │                     │   Express Backend   │                     │  MySQL / DB    │
└───────┬────────┘                     └──────────┬──────────┘                     └───────┬────────┘
        │                                         │                                        │
        │ 1. POST /api/v1/auth/login              │                                        │
        │    { email, password }                  │                                        │
        ├────────────────────────────────────────►│                                        │
        │                                         │ 2. Find user by email (case-insens.)   │
        │                                         ├───────────────────────────────────────►│
        │                                         │◄───────────────────────────────────────┤
        │                                         │ 3. bcrypt.compare (or dummy compare)   │
        │                                         │ 4. Verify isActive = true              │
        │                                         │ 5. Sign JWT (8h expiry)                │
        │ 6. 200 OK + Set-Cookie: token (httpOnly)│                                        │
        │◄────────────────────────────────────────┤                                        │
        │                                         │                                        │
        │ 7. GET /api/v1/cases (Cookie sent)      │                                        │
        ├────────────────────────────────────────►│ 8. Verify JWT signature & expiry      │
        │                                         │ 9. Query DB for active user record     │
        │                                         ├───────────────────────────────────────►│
        │                                         │◄───────────────────────────────────────┤
        │                                         │ 10. Check permission & execute query   │
        │ 11. 200 OK (Case results)               │                                        │
        │◄────────────────────────────────────────┤                                        │
```

### Detailed Steps

1. **Login Request**:
   - The user inputs credentials on the `/login` route.
   - The backend validates the payload against a strict Zod schema (`email` as a valid email string, `password` with min length 6).
   - If invalid, the endpoint responds with HTTP 400 and structured validation errors.

2. **Timing-Safe Credential Verification**:
   - The user record is retrieved using case-insensitive email lookup.
   - **Timing Attack Mitigation**: If the email does not exist in the database, the server runs `bcrypt.compare` against a pre-computed dummy bcrypt hash before returning an error.
   - **Generic Error Message**: For both non-existent users and incorrect passwords, the backend returns the exact same generic error: `"Invalid email or password"`.
   - **Active Status Check**: If credentials match but `isActive: false`, the backend rejects with HTTP 403: `"Account has been deactivated. Please contact the court administrator."`.

3. **Token Issuance**:
   - A signed JWT is generated containing:
     - `userId`: User's primary key (`id`)
     - `role`: User's system role (`ADMIN`, `REGISTRAR`, `JUDGE`, `ADVOCATE`)
   - Token expires in **8 hours** (`JWT_EXPIRES_IN=8h`).

4. **Cookie Storage & Security Flags**:
   - The token is placed inside an HTTP response cookie named `court_cms_token` with the following flags:
     - `httpOnly: true`: Completely inaccessible to JavaScript (`document.cookie`), preventing token theft via XSS.
     - `sameSite: 'lax'`: Protects against Cross-Site Request Forgery (CSRF) in standard browsing navigation.
     - `secure: process.env.NODE_ENV === 'production'`: Transmitted exclusively over TLS/HTTPS in production environments.
     - `maxAge: 8 * 60 * 60 * 1000` (8 hours in milliseconds).
   - **Zero Body Exposure**: The JWT string is **never** sent in the JSON response payload.
   - **Zero Hash Exposure**: `passwordHash` is stripped in Prisma select projections and is never exposed to the client or test responses.

5. **Session Hydration (`GET /api/v1/auth/me`)**:
   - On initial React application mount, `AuthContext` calls `GET /api/v1/auth/me`.
   - If a valid session cookie exists, the user's active session is restored.
   - If missing or expired, the user remains unauthenticated (`user = null`).

6. **Logout (`POST /api/v1/auth/logout`)**:
   - Clears the `court_cms_token` cookie immediately by sending an expired cookie header (`maxAge: 0`).

---

## 2. Role-Based Access Control (RBAC) Matrix

Court CMS defines 13 granular, named permissions managed centrally in [server/src/config/permissions.js](file:///c:/Users/allen/OneDrive/Desktop/ccm_allen/server/src/config/permissions.js).

### Permissions Definition

| Permission Identifier | Description                                                             |
| :-------------------- | :---------------------------------------------------------------------- |
| `case.create`         | Register new judicial dockets and assign initial case numbers           |
| `case.view`           | View court cases (subject to role visibility filters)                   |
| `case.edit`           | Modify case details, priority status, or petitioner/respondent metadata |
| `advocate.view`       | View and search the advocate directory, bar roll numbers, and caseloads |
| `advocate.manage`     | Register new advocates, modify contact details and specializations      |
| `advocate.assign`     | Assign, reassign, or unassign legal counsel on court dockets            |
| `hearing.view`        | View daily cause lists, hearing calendar, and scheduled proceedings     |
| `hearing.schedule`    | Allocate hearing schedules, dates, and courtroom venues                 |
| `hearing.update`      | Record hearing bench outcomes, proceedings, and daily cause notes       |
| `judgment.view`       | View judgment registry, reserved matters, and delivered decrees         |
| `judgment.record`     | Draft, record, and transition judgments to RESERVED state               |
| `judgment.deliver`    | Authorize and formally deliver certified case judgments                 |
| `user.manage`         | Create, modify, deactivate users and reset credentials (Admin only)     |
| `dashboard.view`      | Access executive summary metrics and pendency monitors                  |

### Role Permissions Matrix

| Permission         |  ADMIN   | REGISTRAR |     JUDGE      |  ADVOCATE   |
| :----------------- | :------: | :-------: | :------------: | :---------: |
| `case.create`      |    ✅    |    ✅     |       ❌       |     ❌      |
| `case.view`        | ✅ (All) | ✅ (All)  | ✅ (Assigned)  | ✅ (Client) |
| `case.edit`        |    ✅    |    ✅     |       ❌       |     ❌      |
| `advocate.view`    |    ✅    |    ✅     |       ✅       | ❌ (Self)*  |
| `advocate.manage`  |    ✅    |    ✅     |       ❌       |     ❌      |
| `advocate.assign`  |    ✅    |    ✅     |       ❌       |     ❌      |
| `hearing.view`     | ✅ (All) | ✅ (All)  | ✅ (Presiding) | ✅ (Client) |
| `hearing.schedule` |    ✅    |    ✅     |       ❌       |     ❌      |
| `hearing.update`   |    ✅    |    ❌     |       ✅       |     ❌      |
| `judgment.view`    | ✅ (All) | ✅ (All)  | ✅ (Assigned)  | ✅ (Client) |
| `judgment.record`  |    ✅    |    ❌     |       ✅       |     ❌      |
| `judgment.deliver` |    ✅    |    ❌     |       ✅       |     ❌      |
| `user.manage`      |    ✅    |    ❌     |       ❌       |     ❌      |
| `dashboard.view`   |    ✅    |    ✅     |       ✅       |     ❌      |

_\* Note: The ADVOCATE role has scoped access to view their own profile and representations via `GET /advocates/:id`._

---

## 3. Case Visibility Scoping: `caseVisibilityFilter(user)`

In addition to static route and action permissions, case data queries are dynamically scoped by the judicial role to enforce strict organizational separation of concerns:

```javascript
import { caseVisibilityFilter } from '../config/permissions.js';

// Reusable across all case-related endpoints
const where = {
  ...caseVisibilityFilter(req.user),
  // Additional query filters (e.g. status, search, year)
};
const cases = await prisma.case.findMany({ where });
```

### Scoping Rules

1. **ADMIN**: Unrestricted visibility. Returns `{}` (all cases in the registry).
2. **REGISTRAR**: Unrestricted administrative registry visibility. Returns `{}` (all cases).
3. **JUDGE**: Scoped exclusively to cases allocated to their judicial bench. Returns:
   ```json
   { "judgeId": "<user.id>" }
   ```
4. **ADVOCATE**: Scoped exclusively to active representations for which their linked Advocate profile is assigned as counsel on either the petitioner or respondent side. Returns:
   ```json
   {
     "advocates": {
       "some": {
         "advocateId": "<user.advocateId>",
         "isActive": true
       }
     }
   }
   ```
   _Note: If an Advocate user has no linked advocate profile record, an impossible filter `{ "id": "impossible-match" }` is returned, preventing accidental leakage of public records._
5. **Unauthorized / Anonymous**: Returns `{ "id": "impossible-match" }`.

---

## 4. API Endpoints Reference

All endpoints return uniform response payloads:

- **Success (2xx)**: `{ "success": true, "message": "...", "data": ... }`
- **Client/Server Error (4xx, 5xx)**: `{ "success": false, "message": "...", "errors": [...] }`

### Authentication Endpoints (`/api/v1/auth`)

#### 1. `POST /api/v1/auth/login`

Authenticates a judicial user, rate-limits brute force attempts, and sets the secure `httpOnly` cookie.

- **Rate Limit**: 10 requests per 15 minutes per IP address. Exceeding triggers HTTP 429.
- **Request Body**:
  ```json
  {
    "email": "admin@courtcms.gov.in",
    "password": "Password123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "cm7abc123000...",
        "name": "Suresh Ramanathan",
        "email": "admin@courtcms.gov.in",
        "role": "ADMIN",
        "advocateId": null
      }
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation failure (invalid email format or missing fields).
  - `401 Unauthorized`: `"Invalid email or password"` (timing-safe).
  - `403 Forbidden`: `"Account has been deactivated. Please contact the court administrator."`.
  - `429 Too Many Requests`: `"Too many login attempts from this IP. Please try again after 15 minutes."`.

#### 2. `POST /api/v1/auth/logout`

Terminates the current session and clears the HTTP-only cookie.

- **Headers**: Requires active cookie.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged out successfully",
    "data": null
  }
  ```

#### 3. `GET /api/v1/auth/me`

Fetches the current authenticated user's profile and active advocate linkage.

- **Headers**: Requires active cookie.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Authenticated user retrieved",
    "data": {
      "user": {
        "id": "cm7abc123000...",
        "name": "Justice Dhananjaya Rao",
        "email": "judge.rao@courtcms.gov.in",
        "role": "JUDGE",
        "advocateId": null
      }
    }
  }
  ```
- **Error Response (401 Unauthorized)**:
  ```json
  {
    "success": false,
    "message": "Authentication required. No session token provided.",
    "errors": []
  }
  ```

#### 4. `POST /api/v1/auth/change-password`

Allows an authenticated user to update their credentials.

- **Headers**: Requires active cookie.
- **Policy Requirements**:
  - Minimum 8 characters.
  - At least one alphabetic character (`[a-zA-Z]`).
  - At least one numeric digit (`[0-9]`).
  - Reusing the current password is expressly forbidden.
- **Request Body**:
  ```json
  {
    "currentPassword": "Password123",
    "newPassword": "NewSecurePass2026"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Password changed successfully",
    "data": null
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid current password, failure to meet complexity rules, or reusing old password.

---

### User Management Endpoints (`/api/v1/users` — ADMIN Only)

Protected by `authenticate` and `authorize('ADMIN')`. Non-admin callers receive HTTP 403 Forbidden.

#### 1. `GET /api/v1/users`

Lists court personnel with optional filtering and search.

- **Query Parameters**:
  - `search` (optional): Case-insensitive match on user name or email.
  - `role` (optional): Filter by `ADMIN`, `REGISTRAR`, `JUDGE`, or `ADVOCATE`.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Users retrieved successfully",
    "data": {
      "users": [
        {
          "id": "cm7abc...",
          "name": "Adv. Rajesh Sharma",
          "email": "rajesh.sharma@delhibar.org",
          "role": "ADVOCATE",
          "isActive": true,
          "createdAt": "2026-09-28T05:28:45.000Z",
          "updatedAt": "2026-09-28T05:28:45.000Z",
          "advocate": {
            "id": "cm7adv...",
            "barNumber": "D/1420/2012",
            "specialization": "CRIMINAL"
          }
        }
      ]
    }
  }
  ```

#### 2. `POST /api/v1/users`

Provisions a new system user account.

- **Request Body**:
  ```json
  {
    "name": "Priya Swaminathan",
    "email": "priya.s@courtcms.gov.in",
    "role": "REGISTRAR",
    "password": "RegistryPass2026",
    "advocateId": null
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User created successfully",
    "data": {
      "user": {
        "id": "cm7new...",
        "name": "Priya Swaminathan",
        "email": "priya.s@courtcms.gov.in",
        "role": "REGISTRAR",
        "isActive": true,
        "createdAt": "2026-09-28T06:00:00.000Z"
      }
    }
  }
  ```
- **Error Responses**:
  - `409 Conflict`: `"A user with this email address already exists"`.
  - `400 Bad Request`: Validation failure or attempting to link an advocate that is already associated with another user.

#### 3. `PATCH /api/v1/users/:id`

Updates user details, active status, role, and advocate profile links.

- **Safety Invariants**:
  - An Admin **cannot deactivate their own account**.
  - An Admin **cannot demote their own account** from ADMIN.
  - The system **must never be left with zero active ADMIN accounts**. Attempting to deactivate or demote the last remaining active Admin returns HTTP 400.
- **Request Body**:
  ```json
  {
    "name": "Priya Swaminathan Iyer",
    "isActive": false
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "User updated successfully",
    "data": {
      "user": {
        "id": "cm7new...",
        "name": "Priya Swaminathan Iyer",
        "email": "priya.s@courtcms.gov.in",
        "role": "REGISTRAR",
        "isActive": false
      }
    }
  }
  ```

#### 4. `POST /api/v1/users/:id/reset-password`

Administrative override to reset a user's password.

- **Request Body**:
  ```json
  {
    "newPassword": "ResetPassword2026"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Password reset successfully",
    "data": null
  }
  ```

---

## 5. Security & Architectural Decisions

1. **HttpOnly Cookie vs. Authorization Header**:
   - Web application clients are vulnerable to cross-site scripting (XSS) if tokens are stored in `localStorage` or `sessionStorage`. By delegating token storage to an `httpOnly` cookie with `SameSite=Lax`, JavaScript code cannot read or exfiltrate credentials.
   - Vite development proxy maps `/api` requests to `http://localhost:5000`, providing true first-party cookie semantics during local development.

2. **Per-Request Database Validation**:
   - While JWTs are cryptographically stateless, the `authenticate` middleware re-reads the user's active status from MySQL on every incoming request.
   - **Benefit**: If an administrator deactivates an employee or an advocate's bar license is suspended, access is revoked **immediately on their very next API request**, without needing to wait up to 8 hours for the JWT to expire.

3. **Rate Limiting Protection**:
   - `express-rate-limit` is mounted on `/api/v1/auth/login` to prevent credential stuffing and brute-force dictionary attacks.
   - Threshold: Maximum 10 failed or successful requests per 15-minute window per IP.
   - Standard 429 response provides actionable feedback.

4. **Timing Attack Resistance**:
   - In standard auth systems, querying non-existent emails returns significantly faster than running 10 rounds of bcrypt on existing passwords.
   - Court CMS mitigates this by generating a pre-computed dummy bcrypt hash and executing `bcrypt.compare` even when the email lookup returns null, equalizing response times.

5. **Prisma Password Stripping**:
   - Password hashes are excluded from standard user select queries and response payloads across all controllers, eliminating the danger of hash leakage in client network logs or analytics tools.
