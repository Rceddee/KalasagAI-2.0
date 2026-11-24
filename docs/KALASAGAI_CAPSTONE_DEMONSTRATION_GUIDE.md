# KALASAGAI 2.0 — CAPSTONE DEMONSTRATION & DEFENSE GUIDE

## Current web walkthrough

Use the capstone web release `1395b08` and separate resident and authorized personnel sessions. Prepare the existing test report `KAL-20261124-000011` for a read-only demonstration.

1. In Resident Web, open **My Reports** and select the reference. Show the evidence and timestamped history. A new submission receipt displays its reference and says that category and priority await personnel review.
2. In Personnel Web, search **Incident Reports** for the same reference. At the acceptance check it was pending with a low AI suggestion. Open the full record and point out the separate personnel review and status controls. Displaying either control leaves the report untouched.
3. Show **Reports & Trends** and open the list behind a chart segment. Use **Admin Controls** to show where authorized staff manage invitations and surge monitoring.
4. For a live alert, verify sound on the presentation laptop beforehand. Use an approved test account and separate authorization for any new report, email, status change, or Gemini call. The existing record can be presented without those actions.

[Complete feature inventory](KALASAGAI_FINAL_SYSTEM_SCOPE.md#current-web-features) · [Verification results and open live checks](KALASAGAI_WEB_RELEASE_REPORT.md)

## Earlier demonstration notes


> **Scope update — 2026-11-24:** The native Resident Android project and its build/distribution integrations were removed; use Resident Web for the current resident demonstration. The current Personnel Web sidebar has five role-filtered links, with AI Volume & Surge controls nested under Admin Controls. Older Android walkthroughs and six-module numbering below are historical.

**AI-Powered Incident Reporting, Classification, and Monitoring System**  
*Barangay Poblacion, Gumaca, Quezon, Philippines*  
*Document Version: 1.1.0 (Audited Defense Edition) — Date: November 2026*

---

## 1. Project Introduction

**KalasagAI 2.0** is an incident reporting, automated advisory classification, and operational monitoring system developed for the local administration and community of **Barangay Poblacion, Gumaca, Quezon**. The project name draws from the Filipino word *Kalasag* ("shield"), emphasizing civic protection, disaster preparedness, and community resilience.

The system provides a structured digital reporting conduit through Resident Web and a personnel operations dashboard. Incidents submitted by registered residents—including geographic coordinates and photographic evidence—are ingested into a Supabase backend running PostgreSQL. An asynchronous database trigger automatically dispatches incident details to a Supabase Edge Function (`classify-incident`), which interfaces with Google Gemini Multimodal AI (`gemini-3.5-flash-lite`). The AI classifies the report into standardized categories, suggests an urgency priority, and provides an advisory rationale to authorized barangay personnel. Crucially, the system operates under strict Human-in-the-Loop (HITL) governance: AI outputs are purely advisory and cannot alter administrative operational statuses or dispatch emergency personnel.

---

## 2. Problem Addressed

Barangay-level incident reporting in Philippine municipalities frequently faces operational inefficiencies:

1. **Unstructured Communication Channels:** Residents often report hazards, emergencies, or road blockages through unverified social media posts, direct personal calls, or word-of-mouth. These lack structured categorization, geographic coordinates, and immutable timestamps.
2. **Manual and Delayed Triage:** Duty officers must manually read varied descriptions, interpret localized terminology, inspect attached photos, and assess severity while handling in-person barangay transactions.
3. **Lack of Integrated Spatial Tracking:** Without a consolidated spatial blotter, desk personnel cannot easily determine if multiple callers are reporting the same incident (e.g., fallen tree branches blocking a specific roadway).
4. **Resident Uncertainty:** Citizens submitting reports often receive no formal confirmation regarding whether their report was recorded or reviewed.
5. **Data Privacy Concerns:** Physical paper blotters and informal group chats can expose citizen contact numbers and internal personnel notes to unauthorized individuals.

---

## 3. System Objectives

### General Objective
To develop and evaluate a web-based incident reporting, automated AI advisory classification, and operational monitoring system for Barangay Poblacion, Gumaca, Quezon.

### Specific Objectives
1. **Resident Reporting:** Provide Resident Web for residents to pinpoint incident locations on OpenStreetMap, attach photographic evidence, and submit structured reports from desktop or mobile browsers.
2. **Automated Multimodal AI Triage:** Integrate Google Gemini 3.5 Flash Lite through secure Supabase Edge Functions to generate advisory incident categories (`fire`, `flooding`, `medical_emergency`, `road_accident`, `road_obstruction`, `other`) and priority rankings.
3. **Human-in-the-Loop (HITL) Governance:** Ensure artificial intelligence suggestions remain strictly advisory. The AI cannot modify administrative operational status or dispatch responders; all operational decisions require authorized personnel review.
4. **Dedicated Personnel Operations Console:** Provide a Next.js 16 dashboard with five role-filtered sidebar links: Maps and Reports, Incident Blotters, Analytics & Reports, Activity Logs, and Admin Controls. AI usage, report activity, and surge controls are sections within Admin Controls.
5. **Data Privacy and Access Control:** Implement PostgreSQL Row-Level Security (RLS), column-level restrictions, and private storage policies to ensure resident contact numbers and internal personnel notes remain protected.

---

## 4. System Users & Access Roles

KalasagAI 2.0 defines five discrete roles managed in `public.profiles`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ROLE HIERARCHY & PRIVILEGES                           │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ Role                 │ System Access & Capabilities                         │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ resident             │ Submit incident reports with photo & GPS; view own   │
│                      │ report status & confirmed category; manage profile.  │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ responder            │ Field personnel; view blotters & spatial maps;       │
│                      │ submit field incident reports.                       │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ communication_officer│ Review AI classification suggestions; confirm or     │
│                      │ override category/priority; update operational status│
├──────────────────────┼──────────────────────────────────────────────────────┤
│ admin                │ Manage barangay settings; view analytics & surge     │
│                      │ indicators; manage responder & officer roles.        │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ super_admin          │ Highest system authority; manage all administrative  │
│                      │ roles; view audit logs; configure system settings.   │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

> **Role Boundaries:** Role escalation is protected by database triggers. Standard admins cannot promote users to `admin` or `super_admin`. Responders cannot update operational status (`update_incident_status` requires `communication_officer`, `admin`, or `super_admin`). Residents cannot access any personnel or administrative interfaces.

---

## 5. Technology Architecture

The architecture consists of decoupled client applications, a managed Supabase backend, and external AI services:

```
[ Resident Web (Next.js / TypeScript) ]
                  │ HTTPS / TLS 1.3
                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│                 MANAGED SUPABASE BACKEND (PostgreSQL)                 │
│                                                                       │
│  • Auth Engine (Email/Password, Session Tokens)                       │
│  • Private Storage Bucket: incident-evidence (public = false)         │
│  • Public Schema: incidents, incident_photos, incident_status_history,│
│                   ai_assessments, classification_reviews, audit_logs, │
│                   system_settings, profiles                           │
│  • Private Schema: incident_contact_snapshots, ai_jobs                │
│  • PostgreSQL Vault: kalasagai_ai_dispatch_* secrets                  │
│  • Asynchronous Dispatch: app_private.dispatch_ai_classification      │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │ HTTPS / Signed HMAC-SHA256
                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│              SUPABASE EDGE FUNCTION (classify-incident)               │
│                                                                       │
│  • Cryptographic HMAC-SHA256 Signature Verification                   │
│  • Atomic Job Claim: public.claim_ai_job_delivery                     │
│  • Private Photo Download via Service Role Client                     │
│  • Multimodal REST Request to Google Gemini 3.5 Flash Lite            │
│  • Persist Assessment: public.record_claimed_ai_assessment            │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │ TLS 1.3 REST API
                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│                  GOOGLE GEMINI MULTIMODAL AI SERVICE                  │
│                       (gemini-3.5-flash-lite)                         │
└───────────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ HTTPS / TLS 1.3 (Authenticated)
┌──────────────────────────────────┴────────────────────────────────────┐
│         PERSONNEL WEB DASHBOARD (Next.js 16 / TypeScript)             │
│   Maps and Reports          Activity Logs (role-restricted)           │
│   Incident Blotters         Admin Controls (role-restricted)           │
│   Analytics & Reports       AI usage and surge controls are nested     │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 6. Resident Web Demonstration Sequence

*Target URL:* `http://localhost:3001`  
*Demo Account:* Test Resident (`kalasag.synthetic.e2e.mwowrg2xirsz39@example.com`)

1. **Portal Access & Scope Integrity:**
   - Open browser to `http://localhost:3001`.
   - Point out the responsive mobile-first UI layout (tested across 360px–430px viewports).
   - Verify header branding: **KALASAG AI | Gumaca Incident Reporter**.
   - Note the **complete absence of emergency hotlines**, keeping the application focused purely on incident reporting and status tracking.
2. **Resident Authentication:**
   - Demonstrate standard email/password authentication.
   - Point out registration validation enforcing Philippine mobile number formatting (`+639XXXXXXXXX` or `09XXXXXXXXX`).
   - *Technical Note:* Mobile number formatting is validated via regular expression; physical SMS OTP verification is not implemented.
3. **Hazard Map Inspection:**
   - View the Resident Map showing OpenStreetMap tiles centered on Gumaca town center (`13.9218° N, 122.1008° E`).
   - Explain that public map markers display broad hazard locations without exposing reporter names or private details.
4. **Incident Submission Form (UI Inspection — Do NOT submit new records):**
   - Click **Report an Incident**.
   - Show the coordinate selector: clicking the map automatically populates latitude and longitude fields.
   - Show the photo evidence upload zone with file-type restrictions (JPEG, PNG, WebP) and 10MB file-size ceiling.
   - Point out the mandatory non-dispatch advisory notice:  
     *"Submitting a report logs your incident for barangay verification. This does NOT guarantee instant dispatch. In extreme life-threatening emergencies, seek immediate on-ground assistance."*
   - Close the modal without submitting to preserve development database integrity.
5. **My Reports History & Status Tracking:**
   - Navigate to **My Reports**.
   - Locate existing benchmark test incident **`KAL-20261123-000005`**.
   - Open the incident detail view.
   - Observe the initial status history: `Report submitted (pending)`.
   - Observe the photo preview, loaded securely from the private `incident-evidence` bucket via a signed URL.
6. **Privacy Enforcement Demonstration:**
   - Show the confirmed category (`fire`) and confirmed priority (`low`).
   - **Critical Defense Point:** Point out that internal personnel review notes and raw Gemini rationale are **not** visible to the resident. The PostgREST RPC `public.my_report_review` returns only `confirmed_category` and `confirmed_priority`, preventing leakage of internal staff notes.
7. **Sign Out:**
   - Navigate to Profile and click **Sign Out** to clear the session token.

---

## 7. (Archived) Resident Android Demonstration Sequence

> **Retired:** This walkthrough describes the former native app and is retained only as historical acceptance documentation. It cannot be run from the current repository.

*Target Device:* Android Emulator (`Pixel_6a`, API 36) or physical Android device.  
*Package Name:* `org.kalasagai.resident` (Kotlin / Jetpack Compose / OSMDroid).  
*Build Command:* `.\gradlew installDebug`

1. **App Launch & Branding:**
   - Open the **Kalasag Resident** app.
   - Note the Material 3 design system and dark/light theme support.
2. **Home Screen Verification:**
   - Inspect the Home dashboard.
   - Verify that **no emergency hotline buttons, dialer shortcuts, or hotline cards exist** in the interface.
   - Point out the primary "Report Incident" Floating Action Button (FAB).
3. **OSMDroid Map View:**
   - Switch to the Map tab.
   - Demonstrate panning and zooming using the native OSMDroid tile engine centered on Gumaca.
   - *Technical Note:* OSMDroid caches rendered raster tiles locally. Full offline vector map bundles are not implemented.
4. **Report Form Walkthrough (UI Inspection Only):**
   - Tap the **Report Incident** FAB.
   - Show the incident form: camera/gallery photo picker, GPS coordinate fields, and description text field.
   - Point out the citizen advisory message clarifying that report submission does not constitute verified responder dispatch.
   - Cancel the form without submitting.
5. **My Reports Blotter:**
   - Navigate to the **My Reports** tab.
   - Inspect the card for benchmark incident **`KAL-20261123-000005`**.
   - Tap to view the native detail screen displaying the reference number, submission timestamp, and current status (`pending`).
6. **Session Management:**
   - Show Profile settings and demonstrate local session logout.

---

## 8. Personnel Web Demonstration Sequence

The sidebar has five links. The AI usage and report activity controls are a section within Admin Controls, not a separate sidebar module.

*Target URL:* `http://localhost:3000`  
*Demo Account:* Authorized Super Admin (use an approved staff account)

### Module 1: Maps and Reports
- **Visuals:** Full-screen Leaflet / OpenStreetMap view showing incident pins across Gumaca.
- **Filters:** Demonstrate category filtering covering all six implemented categories:
  - `fire`, `flooding`, `medical_emergency`, `road_accident`, `road_obstruction`, `other`.
- **Status Filters:** Filter by operational status: `pending`, `in_progress`, `resolved`, `closed`.
- **Pin Inspection:** Click the pin for `KAL-20261123-000005` to view summary metadata and link to blotter details.

### Module 2: Incident Blotters
- **Blotter Table:** View incident records sorted chronologically. Locate `KAL-20261123-000005`.
- **Blotter Details Inspection:**
  - **Evidence Preview:** Displays the 827-byte synthetic test image (abstract visual pattern) uploaded during acceptance testing.
  - **AI Assessment Card:**
    - Model: `gemini-3.5-flash-lite`
    - Suggested Category: `fire`
    - Suggested Priority: `low`
    - Stored AI Rationale:  
      *"The description explicitly states this is a simulation test with no real emergency. The evidence photo consists of abstract color blocks that do not depict a real-world fire or active hazard, supporting a low priority classification despite the fire category."*
  - **Human Verification Section:**
    - Show the confirmed review record: `confirmed_category: fire`, `confirmed_priority: low`.
    - Internal Staff Note: *"Verified during automated acceptance testing. Synthetic simulation test confirmed."*
  - **Operational Status Controls:**
    - Explain available forward status transitions in `update_incident_status`:
      - `pending` → `in_progress` or `pending` → `resolved`
      - `in_progress` → `resolved`
      - `resolved` → `closed`
    - Clarify that setting status to `in_progress` is an administrative action; it does not trigger automated external responder dispatch.

### Module 3: Analytics & Reports
- **Incident Metrics:** Visual breakdown of incident frequency by category and reporting timelines.
- **AI Accuracy Calculation:**
  - Explain the mathematical formula:  
    $$\text{Accuracy} = \frac{\text{Reviewed Incidents where } \text{suggested\_category} == \text{confirmed\_category}}{\text{Total Human-Reviewed Incidents}}$$
  - Unreviewed incidents are strictly excluded from the calculation.

### Admin Controls: AI and report activity
- Open `/dashboard/admin#ai-volume-surge` or choose “AI usage and activity” within Admin Controls.
- **Report volume:** Show the 14-day report trend.
- **Surge monitoring:** Explain that the toggle records a manual monitoring status and displays a banner when on.
- **Reference report volume:** Explain that the stored value is informational and does not automatically flag reports.
- Neither the threshold nor monitoring status initiates review, response protocols, or dispatch.

### Activity Logs
- **Audit Table:** Chronological log of system and user events from `public.audit_logs`.
- **Inspection of Benchmark Incident `KAL-20261123-000005`:**
  1. `incident.submitted` (Actor: Resident UUID `b45e1435-...`)
  2. `incident.ai_assessed` (Actor: `null` / System Service, Source: `automatic_dispatch`)
  3. `incident.classification_reviewed` (Actor: Super Admin UUID `880c487d-...`)
- *Schema Note:* `public.audit_logs` records `id`, `actor_id`, `action`, `incident_id`, `details` (JSONB), and `created_at`. It does not store client IP addresses or user agents.

### Admin Controls: staff and role management
- **User Role Management:** Interface for viewing registered personnel accounts.
- **Role Assignment Restrictions:** Standard administrators can assign `responder` or `communication_officer` roles, while `admin` and `super_admin` promotions require higher privileges.
- **System Settings:** Status indicator confirming `gemini_enabled = true`.

---

## 9. Automatic Gemini Classification Explanation

Walk the panel through the technical dispatch pipeline:

```
[Resident Submits Report via public.submit_incident]
           │
           ▼
[AFTER INSERT Trigger: incident_created_records]
           │
           ├─▶ Enqueues job in app_private.ai_jobs (status: 'queued')
           │
           └─▶ Calls app_private.dispatch_ai_classification(incident_id)
                     │
                     ▼ (Reads Vault Secrets & Signs HMAC-SHA256)
               [net.http_post via pg_net to classify-incident Edge Function]
                     │
                     ▼
               [Edge Function: classify-incident]
                 1. Validates JWT & HMAC signature headers
                 2. Claims job atomically via public.claim_ai_job_delivery
                 3. Downloads photo from incident-evidence bucket
                 4. Calls Gemini REST API (gemini-3.5-flash-lite)
                 5. Persists assessment via public.record_claimed_ai_assessment
                     │
                     ▼
               [Stored in public.ai_assessments]
                 • suggested_category: 'fire'
                 • suggested_priority: 'low'
                 • Operational status REMAINS 'pending'
                 • Audit log: incident.ai_assessed
```

### Key Technical Aspects:
1. **Asynchronous Execution:** The resident client receives an immediate response upon submission; AI triage occurs in the background via `pg_net`.
2. **Cryptographic Dispatch:** The database trigger retrieves the HMAC secret from `vault.decrypted_secrets`, generates a SHA-256 HMAC signature with a timestamp, and passes it in request headers. The Edge Function rejects unsigned or expired requests.
3. **Atomic Worker Claim:** `claim_ai_job_delivery` uses row-level locking to assign a unique `worker_token`, preventing duplicate AI invocations if network retries occur.
4. **Status Isolation:** Storing an AI assessment in `public.ai_assessments` does not modify `public.incidents.status`. The status remains `pending` until human personnel act.

---

## 10. Human Verification Explanation (HITL Architecture)

KalasagAI 2.0 implements strict Human-in-the-Loop decision governance:

1. **Advisory Classification:** AI recommendations provide decision support; they do not dictate operational outcomes.
2. **Review Action:**
   - An authorized officer (`communication_officer`, `admin`, or `super_admin`) reviews the incident report, attached photo, and AI suggestion in Module 2.
   - The officer can confirm the AI suggestion or override the category and priority based on human judgment.
   - Submitting the review invokes `public.review_incident_classification`, persisting the record into `public.classification_reviews`.
3. **Traceability:** The system records whether the classification was confirmed or overridden, enabling transparent calculation of AI performance in Module 3.

---

## 11. Database & Security Architecture

Backend security relies on layered PostgreSQL controls:

1. **Schema Separation:**
   - `public`: Accessible via PostgREST API subject to RLS (`incidents`, `incident_photos`, `incident_status_history`, `ai_assessments`, `classification_reviews`, `audit_logs`, `profiles`, `system_settings`).
   - `app_private`: Inaccessible via PostgREST API. Houses internal tables (`ai_jobs`, `incident_contact_snapshots`) and internal dispatch logic.
2. **Row-Level Security (RLS):**
   - Residents can only SELECT their own submitted incidents (`resident_id = auth.uid()`).
   - Ordinary residents cannot read `classification_reviews` directly. Instead, they access `public.my_report_review()`, which exposes only `confirmed_category` and `confirmed_priority` without personnel notes.
3. **Storage Security:**
   - The storage bucket `incident-evidence` is private (`public = false`). Direct anonymous HTTP downloads are rejected with HTTP 403.
   - Authenticated users access photos through signed URLs or authenticated storage policies.
4. **Vault Secret Protection:**
   - Gateway tokens, project URLs, and HMAC keys are stored encrypted in Supabase Vault and decrypted in memory only during dispatch execution.

---

## 12. Operational Status Lifecycle

Incidents transition through a forward-only lifecycle:

```
[ pending ] ──────────▶ [ in_progress ] ──────────▶ [ resolved ] ──────────▶ [ closed ]
     │                                                     ▲
     └─────────────────────────────────────────────────────┘
                     (Direct Resolution)
```

- **`pending`:** Initial state upon submission. Awaiting personnel review.
- **`in_progress`:** Incident acknowledged by personnel; active barangay operational handling underway.
- **`resolved`:** Incident or hazard mitigated on-site.
- **`closed`:** Administrative review completed and blotter archived.

*Allowed Transitions in `public.update_incident_status`:*
- `pending` → `in_progress` or `pending` → `resolved`
- `in_progress` → `resolved`
- `resolved` → `closed`

*Important Operational Note:* Moving an incident to `in_progress` is an administrative status update within the blotter system. It does not integrate with emergency dispatch networks or dispatch physical vehicles.

---

## 13. Analytics & Surge Feature Boundaries

During capstone defense, present feature scopes with technical precision:

1. **Surge Monitoring Purpose:** Admin Controls shows the report-volume trend, a reference-volume setting, and a manual surge-monitoring status. The status banner appears when monitoring is switched on; it is not triggered by crossing the reference value.
2. **Scope Boundaries:** Surge monitoring and the reference value do **not** flag reports, change review requirements, trigger sirens or SMS broadcasts, or dispatch emergency vehicles. All response decisions remain under human command.

---

## 14. Panel Defense Questions & Technically Grounded Answers

Prepare for these 10 defense questions using honest, implementation-accurate explanations:

1. **"Why did you use Google Gemini 3.5 Flash Lite instead of hosting an open-source model locally?"**  
   *Answer:* "Gemini 3.5 Flash Lite was selected because it provides multimodal vision analysis via a hosted REST API without requiring dedicated GPU server hardware in the barangay hall. It processes text and image inputs efficiently within our cloud architecture while keeping operational overhead low."

2. **"What happens if a resident attempts to submit a report without an internet connection?"**  
   *Answer:* "The current implementation requires active network connectivity to submit reports to the Supabase backend. If offline, the application displays a network error message. While the map component caches previously viewed tiles locally, an automated offline submission queue is not implemented in the current version."

3. **"Why were Emergency Hotlines removed from the resident applications?"**  
   *Answer:* "Hotlines were removed following scope refinement to eliminate user confusion. Displaying emergency numbers in an incident reporting app led users to believe that clicking a hotline would automatically dispatch responders. Removing hotlines clarifies that KalasagAI is a structured reporting and blotter system, not an emergency telephone dispatch service."

4. **"How does the system prevent spam or fraudulent incident submissions?"**  
   *Answer:* "The system enforces several application- and database-level checks: mandatory account authentication, Philippine mobile number formatting validation, coordinate bounds checking within Quezon province, required photographic evidence (1–5 photos), and database idempotency keys to prevent duplicate submissions. However, automated phone ownership verification via SMS OTP is not yet integrated."

5. **"Can the AI classification accidentally trigger an emergency responder dispatch?"**  
   *Answer:* "No. The AI system is strictly advisory and completely decoupled from operational dispatch. The Edge Function writes suggestions solely to `public.ai_assessments`. The incident's operational status remains `pending`, and no external dispatch occurs without manual review and action by authorized personnel."

6. **"How is resident privacy protected when submitting sensitive reports?"**  
   *Answer:* "Resident contact numbers are separated from the main incident table and stored in `app_private.incident_contact_snapshots`, which is shielded from public API access. Public map markers display only general hazard categories without reporter identities. In addition, internal staff review notes are excluded from resident queries via `public.my_report_review`."

7. **"Why did you build both a Next.js web app and a native Android app for residents?"**  
   *Answer:* "The Next.js Resident Web application ensures broad accessibility from any mobile or desktop browser without requiring installation. The native Android application (Kotlin/Jetpack Compose) was developed to provide tighter device integration, such as native camera capture and responsive map rendering via OSMDroid for mobile users."

8. **"How does your system calculate AI classification accuracy?"**  
   *Answer:* "In Module 3, accuracy is computed as the percentage of human-reviewed incidents where the AI suggested category matches the officer-confirmed category. Incidents that have not undergone human review are excluded from the denominator to avoid speculative scoring."

9. **"How was the live Gemini integration verified during testing?"**  
   *Answer:* "A controlled development test was conducted using synthetic incident `KAL-20261123-000005`. The test payload included a simulation narrative and an 827-byte synthetic test image containing abstract color patterns. Gemini accurately identified the report as a simulation test, noted the abstract image, and generated a `fire / low` assessment that was persisted in approximately 5.38 seconds without altering the operational status."

10. **"Is the system ready for live municipal deployment?"**  
    *Answer:* "The system is technically prepared for a controlled capstone demonstration. However, live municipal deployment would require official administrative authorization from local government authorities, contracting an SMS gateway provider for OTP verification, establishing formal operational protocols, and conducting personnel training."

---

## 15. Known System Limitations

Honest identification of scope boundaries:

1. **Authentication:** Uses email/password authentication. While contact numbers are normalized to Philippine mobile formats, physical SMS OTP verification is not integrated.
2. **Offline Support:** The Android app caches visited map tiles via OSMDroid, but offline incident submission queuing is not implemented; active network access is required to submit reports.
3. **Dispatch Integration:** The system manages blotters and internal operational statuses. It does not integrate with Computer-Aided Dispatch (CAD) systems or vehicle tracking telematics.
4. **AI Evidence Scope:** The live Gemini verification demonstrated one successful end-to-end synthetic test in development; statistical accuracy across diverse real-world emergency conditions has not been evaluated.

---

## 16. Deployment Restrictions & Safety Guardrails

- **Protected Production Environment:** The production Supabase project (`fpfvouirptlkvzjsobfz`) is strictly gated. No testing, synthetic submissions, or schema modifications are permitted against production.
- **Development Project:** All demonstrations, evaluations, and test executions must use the development project (`ydyawyqhvdlllqrtuxko`).
- **AI Calling Guardrails:** Additional live Gemini API calls are restricted to prevent quota exhaustion. The demonstration relies on existing verified benchmark data (`KAL-20261123-000005`).

---

## 17. Pre-Demonstration Checklist

- [ ] Node.js development server running for Personnel Web on port 3000 (`http://localhost:3000`).
- [ ] Node.js development server running for Resident Web on port 3001 (`http://localhost:3001`).
- [ ] Android Emulator (`Pixel_6a`) booted and connected via ADB.
- [ ] Active internet connection available for development Supabase communication.
- [ ] Benchmark incident `KAL-20261123-000005` verified in development database.
- [ ] Personnel Web logged in with Super Admin credentials.
- [ ] Resident Web logged in with test resident credentials.
- [ ] Confirm no new incident submissions are created during the presentation.
