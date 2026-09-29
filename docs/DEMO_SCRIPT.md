# Court Case Management System — Live Demonstration Script

**Target Duration**: 8 to 10 Minutes  
**Audience**: Academic Reviewers, External Evaluators, Judicial Tech Stakeholders  
**Evaluation Target**: End-to-end procedural workflow, automated case lifecycle state transitions, pessimistic conflict defense, RBAC scoping, and real-time dashboard telemetry.

---

## 🎭 Pre-Demo Setup & Verification (Run once before demo)

Open PowerShell in the project directory:

```powershell
# Reset to clean seeded state (takes ~15-25 seconds)
npm run db:reset

# Verify integrity checks pass
npm run db:verify

# Start development servers
npm run dev
```

Open your browser to: **`http://localhost:5173`**  
_(All seeded demo passwords are `Demo@1234`)_

---

## ⏱️ Live Demonstration Timeline Overview

| Time             | Module               | Role / Persona                      | Key Feature Highlight                                               |
| ---------------- | -------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| **0:00 – 1:15**  | Case Filing          | `registrar@courtcms.gov.in`         | Atomic sequential case registration (`REGISTERED`)                  |
| **1:15 – 2:30**  | Counsel Assignment   | `registrar@courtcms.gov.in`         | Assignment $\rightarrow$ `ADVOCATE_ASSIGNED` + Step Reversion demo  |
| **2:30 – 4:00**  | Hearing Scheduling   | `registrar@courtcms.gov.in`         | 409 Room Conflict + Slot booking $\rightarrow$ `HEARING_SCHEDULED`  |
| **4:00 – 5:30**  | Judicial Proceedings | `judge.swaminathan@courtcms.gov.in` | Cause List + Reasoned Adjournment $\rightarrow$ `UNDER_TRIAL`       |
| **5:30 – 7:00**  | Judgment Disposition | `judge.swaminathan@courtcms.gov.in` | Reserve $\rightarrow$ Deliver $\rightarrow$ `CLOSED` + Immutability |
| **7:00 – 8:30**  | Registry Dashboard   | `admin@courtcms.gov.in`             | Real-time Telemetry, Backlog, Stale Rules, Dynamic Thresholds       |
| **8:30 – 9:45**  | RBAC Contrast        | `adv.khan@courtcms.gov.in`          | Scoped Client Visibility, Restricted Portals, Personal Telemetry    |
| **9:45 – 10:00** | Conclusion & Q&A     | Presenter                           | Summary of architectural innovations & compliance                   |

---

## 📋 Step-by-Step Script for the Presenter

### Part 1: Case Filing & Automatic Numbering (0:00 – 1:15)

1. **Navigate**: Go to `http://localhost:5173/login`.
2. **Login**: Click the quick-fill button **"Registrar"** (`registrar@courtcms.gov.in`), or enter credentials and click **"Sign In"**.
3. **Navigate to Cases**: Click **"Cases"** in the sidebar.
   - _Presenter Talk Track_: _"Notice the master court docket. All cases display their real-time state badge, case number, filing date, and age."_
4. **File New Case**: Click the navy button **"File New Case"** (top right).
   - Enter Title: `State of Maharashtra v. Devendra Patil`
   - Select Case Type: `CRIMINAL`
   - Select Priority: `NORMAL`
   - Petitioner: `State of Maharashtra`
   - Respondent: `Devendra Patil`
   - Select Presiding Judge: `Hon. Justice D. Y. Swaminathan`
   - Click **"Register Case"**.
5. **Observe**:
   - The toast notifies success: _"Case registered successfully"_.
   - The case appears at the top of the table with status badge **`REGISTERED`** and auto-generated case number **`CC/2026/00113`**.
   - _Presenter Talk Track_: _"Case numbers are generated consecutively using row-level locking on our sequence table, preventing number collisions even during high-concurrency registry filings."_

---

### Part 2: Advocate Assignment & Step Reversion (1:15 – 2:30)

1. **Open Docket Detail**: Click on the newly registered case row (`CC/2026/00113`).
   - _Presenter Talk Track_: _"We enter the case detail view. Notice the active status banner is REGISTERED, and zero advocates are assigned."_
2. **Assign Counsel**: Click **"Assign Advocate"**.
   - Select Advocate: `Adv. Tariq Khan` (Senior Criminal Defense)
   - Side: `PETITIONER`
   - Click **"Assign Counsel"**.
3. **Observe State Transition**:
   - The status badge immediately updates from `REGISTERED` to **`ADVOCATE_ASSIGNED`**.
   - Adv. Tariq Khan appears under Petitioner Counsel.
4. **Demonstrate Step Reversion**:
   - Click **"Unassign"** next to Adv. Tariq Khan.
   - Enter Reason: `Client revoked representation; fresh vakalatnama awaited`.
   - Click **"Confirm Unassignment"**.
   - _Presenter Talk Track_: _"Because zero active counsel remain on the case, our workflow state engine automatically reverts the case status back to REGISTERED. Look at the audit history tab — every step, unassignment reason, and actor is recorded permanently."_
5. **Re-progress Case**:
   - Click **"Assign Advocate"** and reassign `Adv. Tariq Khan` (`PETITIONER`).
   - Click **"Assign Advocate"** again and assign `Adv. Priya Mehta` (`RESPONDENT`).
   - Status is now cleanly back to **`ADVOCATE_ASSIGNED`** with two opposing counsel.

---

### Part 3: Hearing Scheduling & Room Conflict Defense (2:30 – 4:00)

1. **Navigate to Hearings**: Click **"Hearings"** in the sidebar.
2. **Click "Schedule Hearing"** button:
   - Select Case: Select your case `CC/2026/00113` (or type `Devendra Patil`).
   - Select Courtroom: `Courtroom 1 (Main Hall)`
   - Set Date: Today's date
   - Set Time: `10:30` (10:30 AM)
   - Purpose: `Preliminary Arguments`
   - Click **"Schedule Hearing"**.
3. **Observe Conflict Defense (409 Conflict)**:
   - _Presenter Talk Track_: _"Look at this error banner: 'Courtroom Courtroom 1 is already booked from 10:30 AM to 11:00 AM on today's cause list'. The system enforces pessimistic current-read locks on courtrooms and benches, making courtroom double-booking physically impossible."_
4. **Select Available Slot**:
   - Change Time to: `14:00` (2:00 PM, clean clock boundary after the mandatory 13:00-14:00 lunch recess).
   - Click **"Schedule Hearing"**.
5. **Observe State Advance**:
   - The hearing is booked successfully.
   - Return to **Cases** or open `CC/2026/00113`: Status has automatically advanced to **`HEARING_SCHEDULED`**.

---

### Part 4: Judicial Proceedings & Reasoned Adjournment (4:00 – 5:30)

1. **Switch Role to Presiding Judge**:
   - Click **"Sign Out"** in the top bar.
   - Click quick-fill button **"Judge 1"** (`judge.swaminathan@courtcms.gov.in`), click **"Sign In"**.
2. **Inspect Cause List**:
   - Navigate to **"Hearings"** $\rightarrow$ Click the **"Cause List"** tab.
   - Select today's date.
   - _Presenter Talk Track_: _"Judge Swaminathan sees the daily judicial cause list for Courtroom 1, chronologically ordered and serial numbered (Items 1..N), formatted exactly as required in district court complexes."_
3. **Conduct Hearing & Adjourn**:
   - Switch back to the **"Hearings List"** tab.
   - Locate the scheduled hearing for Case 5 (`CC/2026/00105`) or Case 8.
   - Click **"Adjourn"**.
   - Enter Reason: `Prosecution witness summoned but unserved; fresh summons issued`.
   - Toggle **"Schedule Next Hearing Date"**:
     - Date: Next Monday (e.g. 5-7 days ahead)
     - Time: `11:00 AM`
     - Courtroom: `Courtroom 1`
   - Click **"Confirm Adjournment"**.
4. **Observe Trial Progression**:
   - The original hearing marks `ADJOURNED`.
   - The next hearing is booked as `SCHEDULED`.
   - The underlying case status advances to **`UNDER_TRIAL`**.

---

### Part 5: Two-Stage Judgment Disposition & Immutability (5:30 – 7:00)

1. **Open Judgments Tab**:
   - Navigate to **"Cases"** $\rightarrow$ Click on Case 10 (`CC/2026/00110`, which has completed hearings and is in `UNDER_TRIAL`).
   - Click on the **"Judgment & Disposition"** tab.
2. **Stage 1: Reserve Judgment**:
   - Click **"Reserve Judgment"**.
   - Note: Notice the live character counter.
   - Enter Reserve Note: `Final oral arguments heard from both counsel. Pleadings closed. Judgment reserved for orders.`
   - Click **"Confirm Reservation"**.
   - _Presenter Talk Track_: _"Notice the status has advanced to JUDGMENT_RESERVED. In eCourts and NJDG, this critical gap between hearing conclusion and decree delivery is untracked, hiding months of delays. In Court CMS, this is a formal tracked milestone."_
3. **Stage 2: Deliver Operative Judgment**:
   - Now open Case 11 (`CC/2026/00111`, which is already in `JUDGMENT_RESERVED`).
   - Click on the **"Judgment & Disposition"** tab.
   - Click **"Deliver Judgment"**.
   - Select Outcome: `CONVICTED`
   - Enter Summary ($\ge 20$ characters): `Accused found guilty under Section 420 IPC and sentenced to 2 years simple imprisonment with fine of Rs. 25,000.`
   - Date: Today's date
   - Click **"Deliver Judgment"**.
4. **Observe Permanent Case Closure**:
   - Status advances to **`CLOSED`**.
   - A bold gold/navy banner appears: **"Case Closed — Permanent Read-Only Record"**.
   - _Presenter Talk Track_: _"The docket is now legally sealed. Editing case metadata, adding advocates, scheduling hearings, or modifying judgments on this case are rejected across all endpoints with HTTP 400 Bad Request."_

---

### Part 6: Automation Engine & Registry Dashboard (7:00 – 8:30)

1. **Switch Role to Admin**:
   - Sign out, click **"Admin"** (`admin@courtcms.gov.in`), click **"Sign In"**.
2. **Review Real-Time Caseload Telemetry**:
   - Look at the top status distribution stamps: Registered (1), Advocate Assigned (3), Hearing Scheduled (2), Under Trial (4), Judgment Reserved (1), Closed (3).
   - _Presenter Talk Track_: _"Every number on this dashboard is computed live from the database via zero-cache transactional aggregations. There is zero caching lag."_
3. **Inspect Backlog & Stale Cases Worklists**:
   - Scroll to **"Overdue Case Backlog Monitor"**: shows 5 cases older than 90 days pendency with exact age in days.
   - Scroll to **"Stale Case Detection Engine"**:
     - **Rule 1 (`NO_ADVOCATE`)**: Flags Case `CC/2026/00101` (stuck in `REGISTERED` > 14 days without counsel).
     - **Rule 2 (`NO_HEARING`)**: Flags Case `CC/2025/00085` (stuck in `ADVOCATE_ASSIGNED` > 21 days without a hearing).
4. **Demonstrate Dynamic Threshold Tuning**:
   - Click the gear icon **"Configure Thresholds"** in the top right.
   - Change **"Backlog Threshold (Days)"** from `90` to `60`.
   - Click **"Save Settings"**.
   - _Presenter Talk Track_: _"Look at the backlog counter: it immediately updates from 5 cases to 8 cases without a page reload or server restart! The threshold change was written atomically to system_settings along with an administrative audit log."_

---

### Part 7: RBAC Security Contrast — Advocate View (8:30 – 9:45)

1. **Switch Role to Advocate**:
   - Sign out, click **"Advocate (T. Khan)"** (`adv.khan@courtcms.gov.in`), click **"Sign In"**.
2. **Observe Scoped Interface**:
   - _Presenter Talk Track_: _"Notice the dramatic visual and functional contrast. The Advocate role has no access to User Management, cannot edit cases, cannot schedule hearings, and cannot configure thresholds."_
3. **Inspect Scoped Caseload**:
   - The Dashboard shows **"Personal Caseload Telemetry"** — Adv. Khan sees only the 6 cases where he is active counsel.
   - Click **"Cases"**: The registry lists strictly his 6 assigned client cases; the other 8 cases in the court complex are invisible (and any direct URL access returns HTTP 404).
   - Click **"Hearings"**: The cause list filters strictly to proceedings involving his clients.

---

### Part 8: Conclusion & Review Wrap-Up (9:45 – 10:00)

- _Presenter Talk Track_: _"To summarize, Court CMS resolves the core bottleneck of Indian court pendency by establishing:_
  1. _A single unified case docket with state-machine-automated transitions;_
  2. _Pessimistic concurrency preventing courtroom and bench collisions;_
  3. _Zero-cache registry telemetry identifying backlogged and stagnant cases in real time;_
  4. _Strict multi-tiered RBAC protecting judicial integrity and client confidentiality;_
  5. _100% WCAG AA accessible UI with comprehensive automated test coverage across timezones._
     _Thank you, and I invite your questions."_
