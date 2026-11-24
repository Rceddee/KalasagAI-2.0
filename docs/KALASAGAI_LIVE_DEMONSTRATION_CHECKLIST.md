# KALASAGAI 2.0 — LIVE DEMONSTRATION CHECKLIST

**Current web demo · November 25, 2026.** Use the [read-only walkthrough](KALASAGAI_CAPSTONE_DEMONSTRATION_GUIDE.md#current-web-walkthrough) and [release checks](KALASAGAI_WEB_RELEASE_REPORT.md) for commit `1395b08`. The following checklist records the earlier rehearsal.

**Capstone Defense & Client Demonstration — Step-by-Step Runbook**  
*Barangay Poblacion, Gumaca, Quezon, Philippines*  
*Document Version: 1.0.0 — 2026-11-23*

> **Scope update — 2026-11-24:** The native Resident Android project and its build/distribution integrations were removed. This runbook covers web clients only. The Personnel Web sidebar has five links; AI Volume & Surge is a section within Admin Controls, not a separate link.

---

## PREREQUISITES

Before the demonstration begins, complete all items below. Do not start presenting until every item is checked.

### Environment
- [ ] Laptop connected to stable network (Wi-Fi with Supabase access)
- [ ] Node.js v18+ installed and on PATH
- [ ] All project dependencies installed (`npm install` in workspace root)

### Application Startup
- [ ] **Personnel Web** started and responding:
  ```powershell
  cd c:\Users\cedri\Desktop\KALASAG AI 2.0\apps\personnel-web
  npm run dev
  ```
  Confirm: `http://localhost:3000` returns HTTP 200
- [ ] **Resident Web** started and responding:
  ```powershell
  cd c:\Users\cedri\Desktop\KALASAG AI 2.0\apps\resident-web
  npm run dev
  ```
  Confirm: `http://localhost:3001` returns HTTP 200

### Accounts Ready
- [ ] Resident Web browser tab open and **logged in** as test resident (`kalasag.synthetic.e2e.mwowrg2xirsz39@example.com`)
- [ ] Personnel Web browser tab open and **logged in** as Super Admin (use an approved staff account)
- [ ] **No other resident accounts logged in** concurrently (avoid session conflicts)

### Safety Pre-checks
- [ ] Confirm benchmark incident `KAL-20261123-000005` exists (visible in Resident Web "My Reports" and Personnel Web Blotters)
- [ ] Confirm incident status is `pending` — **do not change it**
- [ ] Confirm `gemini_enabled = true` is reflected in Module 6 (read-only view only)
- [ ] Protected production project `fpfvouirptlkvzjsobfz` is NOT accessible from any browser tab

---

## DEMONSTRATION SEQUENCE

### STEP 1 — Resident Web: Login Screen (RW-01)
**URL:** `http://localhost:3001`
- Show the login page with KALASAG AI branding and "Gumaca Incident Reporter" subtitle
- Point out the Philippine mobile number format validation field in the registration flow (do not register a new account)
- Expected screen: Login form with shield icon and branding

**Expected result:** `PASS`

---

### STEP 2 — Resident Web: Safety Map (RW-03)
**URL:** `http://localhost:3001/dashboard`
- Navigate to the **Map** tab from the bottom navigation
- Show the OpenStreetMap tile rendering centered on Gumaca town center
- Point out category filter buttons: `fire`, `flooding`, `medical_emergency`, `road_accident`, `road_obstruction`, `other`
- Select the incident marker for `KAL-20261123-000005` if visible
- **Explain:** Map shows only hazard locations, not reporter names or contact details
- **Verify:** No Emergency Hotline buttons or telephone shortcuts appear anywhere

**Expected result:** `PASS`

---

### STEP 3 — Resident Web: Report Form UI (RW-04)
**URL:** `http://localhost:3001/report`
- Navigate to the **Report** tab (or use direct URL)
- Show the quick category selector (6 tiles: `fire`, `flooding`, `medical_emergency`, `road_accident`, `road_obstruction`, `other`)
- Demonstrate the interactive location picker (tap the embedded map to populate coordinates)
- Show photo upload zone — point out JPEG/PNG/WebP restriction and 10MB size cap
- Point out the **non-dispatch disclaimer** notice displayed clearly
- **DO NOT click Submit**

**Expected result:** `PASS`

---

### STEP 4 — Resident Web: My Reports (RW-05)
**URL:** `http://localhost:3001/reports`
- Navigate to the **My Reports** tab
- Show the report card for **`KAL-20261123-000005`**
- Identify: reference number, submission date (`2026-11-23`), status badge (`RECEIVED`)
- **Explain:** Residents can track their report status at any time without calling the barangay

**Expected result:** `PASS`

---

### STEP 5 — Resident Web: Incident Detail & Privacy (RW-06, RW-07, RW-08)
**URL:** `http://localhost:3001/reports/3a18373b-a159-407a-8b80-7e448143a74f`
- Tap the report card or navigate directly to the incident detail page
- Show displayed information:
  - Reference: `KAL-20261123-000005`
  - Description (simulation narrative)
  - Location: `Market Area, Barangay Poblacion, Gumaca, Quezon (Simulation Test)`
  - Status: `RECEIVED` (operational `pending`)
  - Submission timestamp: `2026-11-23 09:48 UTC`
  - Photo evidence (renders as 827-byte abstract pattern PNG)
  - Confirmed classification: Category **`fire`**, Priority **`low`**
- **Privacy demonstration:** Show what is NOT visible:
  - Gemini AI rationale (omitted)
  - Internal staff review note ("Verified during automated acceptance testing...")
  - Reviewer identity (Officer UUID omitted)
- **Explain:** `public.my_report_review()` RPC returns ONLY category and priority to residents

**Expected result:** `PASS`

---

### STEP 6 — Native Android: Home Screen (AND-01, AND-04)
- Switch to the Android Emulator display
- Launch `org.kalasagai.resident` (Kalasag Resident app)
- Show the native Material 3 home screen
- Point out: **Report Incident FAB visible, no emergency hotlines**
- Show Dark/Light mode toggle in profile

**Expected result:** `PASS`

---

### STEP 7 — Native Android: OSMDroid Map (AND-05)
- Tap the **Map** tab in the bottom navigation
- Demonstrate OSMDroid tile rendering with Gumaca terrain
- Show pan/zoom gestures
- Show incident markers and category filter chips
- **Explain:** OSMDroid caches viewed tiles locally; internet required for initial load

**Expected result:** `PASS`

---

### STEP 8 — Native Android: Report Form (AND-06)
- Tap the floating action button **"Report Incident"**
- Show the native Kotlin/Compose report form:
  - Description text field with character counter
  - GPS coordinate display
  - Camera/gallery attachment picker
  - Required evidence indicator
- **DO NOT tap Submit or upload any files**
- Press Back to dismiss

**Expected result:** `PASS`

---

### STEP 9 — Native Android: My Reports (AND-07, AND-08)
- Tap the **My Reports** tab
- Show the fetched incident list from the development Supabase backend
- Locate card for **`KAL-20261123-000005`**
- Tap it to open the incident detail screen
- Confirm status badge shows `PENDING`
- Show confirmed category: **fire**, priority: **low**
- **Explain:** Android uses the same `public.my_report_review()` RPC — same privacy rules apply

**Expected result:** `PASS`

---

### STEP 10 — Personnel Web: Module 1 (Maps and Reports) (PW-02)
**URL:** `http://localhost:3000/dashboard`
- Show the authenticated personnel dashboard
- Demonstrate the interactive map with incident pins
- Apply category filter — toggle each of 6 categories
- Apply status filter — select `pending`
- Locate the pin for `KAL-20261123-000005`
- Click pin to show the brief summary popup
- **Explain:** Only authenticated personnel can see this view — residents do not have access

**Expected result:** `PASS`

---

### STEP 11 — Personnel Web: Module 2 (Incident Blotters) (PW-03–07)
**URL:** `http://localhost:3000/dashboard/blotters/3a18373b-a159-407a-8b80-7e448143a74f`
- Navigate to Blotters and open `KAL-20261123-000005`
- Show the **AI Assessment Card:**
  - Suggested Category: **fire**
  - Suggested Priority: **low**
  - Model: **gemini-3.5-flash-lite**
  - Rationale: *"The description explicitly states this is a simulation test with no real emergency. The evidence photo consists of abstract color blocks that do not depict a real-world fire or active hazard..."*
- Show the **Human Verification Section**
- Show the existing confirmed review record (confirmed by Super Admin)
- Show **status advancement controls** — explain that setting `in_progress` is an administrative action only
- **DO NOT click any action buttons that modify hosted data**
- Show the reporter contact number (visible to authorized personnel role only)
- **Explain the HITL architecture:**
  > "The AI generated a suggestion. A human officer reviewed it, confirmed it, and that is the official record. The AI cannot change the operational status or dispatch anyone."

**Expected result:** `PASS`

---

### STEP 12 — Personnel Web: Module 3 (Analytics & Reports) (PW-08)
**URL:** `http://localhost:3000/dashboard/analytics`
- Show incident category breakdown charts
- Explain the AI accuracy metric:
  > "Accuracy is calculated only from incidents that have been reviewed by a human officer. Unreviewed incidents are excluded."
- **DO NOT invent or project accuracy numbers** — show actual computed value from available data

**Expected result:** `PASS`

---

### STEP 13 — Personnel Web: Admin Controls — AI and report activity (PW-09)
**URL:** `http://localhost:3000/dashboard/admin#ai-volume-surge`
- Open the “AI usage and activity” section in Admin Controls
- Show the 14-day report-volume chart, manual surge-monitoring status, and reference report-volume setting
- **Explain:**
  > "The chart shows report volume. The threshold is for reference only; turning on surge monitoring records an administrative status and displays a banner. Neither automatically flags reports or dispatches responders."
- **DO NOT modify any surge threshold settings**

**Expected result:** `PASS`

---

### STEP 14 — Personnel Web: Activity Logs (PW-10)
**URL:** `http://localhost:3000/dashboard/activity`
- Show the audit log table from `public.audit_logs`
- Locate and highlight the 3 events for `KAL-20261123-000005`:
  1. `incident.submitted` — Actor: resident UUID (`b45e1435-...`)
  2. `incident.ai_assessed` — Actor: `null` (System Service / Edge Function)
  3. `incident.classification_reviewed` — Actor: Super Admin UUID (`880c487d-...`)
- **Explain:**
  > "Every action in the system is recorded with who did it, when, and what changed. The AI job attribution shows actor_id as null — this proves it was automated by the system, not performed by a human."

**Expected result:** `PASS`

---

### STEP 15 — Personnel Web: Admin Controls — staff and roles (PW-11)
**URL:** `http://localhost:3000/dashboard/admin`
- Show the personnel roster management interface
- Show role restriction indicators (disable/grey-out for unauthorized role actions)
- Confirm `gemini_enabled = true` toggle status
- **Explain the role hierarchy:** Residents cannot see this interface. Standard admins cannot promote super_admins. Super Admins manage the system.
- **DO NOT invite personnel, change roles, or modify settings**

**Expected result:** `PASS`

---

### STEP 16 — Explain AI-to-Human Pipeline
Narrate the full automated triage lifecycle using the benchmark evidence:

```
Submission (09:48:25 UTC)
  → Trigger fires: incident_created_records (immediate)
  → Job queued in app_private.ai_jobs
  → app_private.dispatch_ai_classification() reads Vault secrets
  → Signed HMAC-SHA256 request dispatched via pg_net
  → classify-incident Edge Function validates signature
  → Atomic claim via public.claim_ai_job_delivery()
  → Downloads 827-byte abstract PNG from incident-evidence bucket
  → Google Gemini 3.5 Flash Lite analyzes text + image
  → Assessment stored in public.ai_assessments (09:48:30 UTC)
  → Operational status UNCHANGED: still "pending"

Total pipeline: ~5.38 seconds
Human officer then reviews and confirms the suggestion.
```

**Key defense point:** "The AI makes a recommendation. The human officer makes the decision. That separation is enforced by the database architecture itself."

---

## ACTIONS THAT MUST NEVER BE EXECUTED DURING DEMONSTRATION

> ⛔ **DO NOT** perform any of the following during a live demonstration or test:

| Forbidden Action | Reason |
|---|---|
| Submit a new incident report | Creates new hosted data, may trigger unwanted Gemini call |
| Click "Advance Status" / "Mark In Progress" / "Resolve" / "Close" | Modifies hosted incident operational status |
| Trigger AI replay for any existing job | Consumes Gemini quota; prohibited by system policy |
| Toggle `gemini_enabled` | Could disable live pipeline |
| Invite or delete personnel accounts | Modifies hosted user data |
| Access `fpfvouirptlkvzjsobfz` (production) | Strictly prohibited |
| Generate a new magic link / reset any password | Administrative action requiring owner approval |
| Upload files to `incident-evidence` bucket | Modifies hosted storage |
| Enable `pg_cron` jobs | Activates automated database tasks |
| Click "Override" on AI classification | Writes a new classification review record |

---

## FALLBACK PROCEDURES

| Problem | Safe Fallback |
|---|---|
| Network drops during demo | Show pre-captured screenshots in `docs/demo-evidence/` |
| Resident Web auth session expired | Re-login using existing credentials; session takes ~5 seconds |
| Android emulator slow or frozen | Use ADB screenshot of last stable state |
| Supabase returns transient error | Refresh the page; wait 10 seconds |
| Blotter detail takes too long to load | Direct URL: `http://localhost:3000/dashboard/blotters/3a18373b-a159-407a-8b80-7e448143a74f` |
| Panelist asks to demonstrate live Gemini | Refer to `docs/KALASAGAI_LIVE_GEMINI_ACCEPTANCE_REPORT.md` as evidence; do not trigger a new call |
