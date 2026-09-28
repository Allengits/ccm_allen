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
