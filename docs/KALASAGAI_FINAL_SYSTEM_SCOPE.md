# KalasagAI 2.0 — Final System Scope & Technical Alignment Specification

## Current web features

**Capstone release `1395b08`, documented November 25, 2026.** The following seven modules group the features for a panel walkthrough. Personnel Web has five role-filtered navigation links. Surge monitoring and AI controls are inside **Admin Controls**.

| Module | What a resident, operator, or administrator can do |
| --- | --- |
| Resident reporting and tracking | Register, confirm an email address, sign in, recover access, and edit a profile. Choose an English/Tagalog prompt for flooding, fire, medical emergency, road accident, road obstruction, or another hazard. Enter a description and landmark, use GPS or drag a pin, and attach a photo from the camera, gallery, clipboard, or drag-and-drop. Preview JPG, PNG, or WebP evidence up to 10 MB. Retry an interrupted submission using its original report key. The receipt shows the reference and that category and priority await personnel review. Search or filter **My Reports** and open the evidence, reviewed classification, and status history. |
| Incident mapping and alerts | Select a report from a map or list, inspect clustered markers, and recenter the map. The personnel map includes the Gumaca boundary and map key. While Personnel Web is open, new reports can trigger a banner and sound across dashboard pages. Staff can mute or enable sound, open the report from the alert, and dismiss it. The app suppresses duplicate notifications and checks for missed reports on return. |
| Personnel case management | Search, filter, sort, and page through the incident register. Open a quick view or the full record, inspect coordinates, enlarge private evidence, and copy the reporter contact when authorized. Add a note when advancing an incident from pending to in progress, resolved, or closed. Residents can follow the recorded changes. |
| AI-assisted classification and human review | When enabled, Gemini uses the description and evidence to suggest a category and a low, medium, or high priority. Authorized personnel can inspect the rationale and confirm or correct the category and priority. A staff review records a separate decision. Operational status changes require a personnel action. |
| Analytics and exports | Filter charts by 24 hours, 7 days, 30 days, or all time. Select a chart segment to see matching reports. Review resolution rate and the percentage of reviewed reports where the AI category matched the staff decision. Download PDFs for an individual incident, a filtered register, an analytics summary, or an authorized activity-log view. |
| Staff administration and surge monitoring | Invite staff by email, send password-reset links, and manage roles. Admins can invite responders and communication officers. Super Admins can also invite Admins and Super Admins. Inspect report volume, set the surge reference threshold, toggle surge monitoring, and manage automatic AI classification. |
| Access control and audit history | Residents see their own records. Personnel access depends on the Responder, Communication Officer, Admin, or Super Admin role. Private evidence uses time-limited links. Authorized administrators can search the activity log for report events, status changes, actors, and system changes. |

Both web apps remember the selected light or dark theme. Personnel Web also offers a collapsible sidebar and keyboard dismissal of expanded evidence. For test methods and remaining live checks, see the [web release report](KALASAGAI_WEB_RELEASE_REPORT.md).

## Earlier scope baseline

**Client:** KALASAG, Barangay Poblacion, Municipality of Gumaca, Quezon, Philippines  
**System Title:** KalasagAI 2.0 — AI-Powered Incident Reporting, Classification, and Monitoring System  
**Document Classification:** Capstone Technical Specification & System Scope Baseline  
**Date of Alignment:** 2026-11-23  
**Status:** Approved Final Scope (Emergency Hotlines Removed from Resident Applications)  

> **Historical scope note — 2026-11-24:** This specification records the earlier multi-client baseline. The project owner has since removed the native Resident Android project and its active distribution/build integrations; Resident Web is the current resident client. Android implementation and test references below are historical. The current Personnel Web sidebar has five role-filtered links, with AI Volume & Surge controls nested under Admin Controls; the six-module diagram below is historical.

---

## 1. Executive Summary & Scope Baseline

KalasagAI 2.0 is an automated emergency reporting, artificial intelligence classification, and incident monitoring platform designed specifically for the community of Barangay Poblacion, Gumaca, Quezon. 

Following formal evaluation, the **Emergency Hotlines feature has been permanently and completely removed from all resident-facing client applications** (both Resident Web and Native Resident Android). The platform focuses its resident experience exclusively on:
1. Secure account registration and profile management with verified contact details.
2. Fast, resilient digital incident intake with GPS coordinates and mandatory private evidence photos.
3. Interactive public safety maps showing real-time community hazards.
4. Transparent incident status tracking allowing residents to follow submitted reports from receipt through resolution.

Every submitted incident is automatically processed through the backend by **Google Gemini Multimodal Vision AI (`gemini-3.5-flash-lite`)** to suggest one of six operational categories and an initial priority level. Crucially, **AI suggestions never alter operational status, do not dispatch emergency responders, and remain subject to mandatory human verification** by authorized personnel.

---

## 2. Approved Final System Scope

### A. Approved Resident-Facing Feature Scope (10 Core Capabilities)
1. **Resident Authentication & Profile Management:** Email and password login, secure password reset, profile editing (full name, Philippine contact number).
2. **Resident Dashboard & Home:** Live emergency status summary, immediate access to reporting actions, and high-level hazard alerts.
3. **Emergency Incident Reporting:** Structured digital incident submission with Tagalog/Taglish/English input and preset incident shortcuts.
4. **Geographic Incident Location:** Automated device GPS acquisition or manual pin adjustment constrained to Gumaca coordinates.
5. **Private Photo Evidence Upload:** Secure client-side image attachment with MIME-type restriction and client-side payload validation.
6. **Public Safety Map & Category Filtering:** Interactive OpenStreetMap canvas visualizing active community incidents with category chips (Flooding, Fire, Road Accident, Road Obstruction, Medical Emergency, Other).
7. **My Reports History:** Chronological personal report log with operational status badges.
8. **Incident Details View:** Comprehensive single-incident inspection displaying reference number, timestamp, location, coordinates, and photo evidence.
9. **Operational Status Tracking:** Real-time visibility into the official administrative status. The four values in the `incident_status` enum are: `pending`, `in_progress`, `resolved`, and `closed`. Note: `under_review` and `rejected` are not implemented.
10. **Personnel-Confirmed Classification Information:** Display of confirmed category and priority after human review, while keeping internal staff notes and raw AI prompts completely confidential.

### B. Prohibited / Removed Resident Features
- **NO Emergency Hotlines Screen:** Completely deleted.
- **NO Emergency Phone Directories:** No static contact cards or dialing lists.
- **NO Dedicated "Call" Action Buttons:** No telephony intents in resident clients.
- **NO Unauthenticated Public Incident Intake:** All reports require authenticated resident credentials.

### C. Personnel Web — Six Official Operational Modules
Personnel Web preserves exactly six official modules with zero removals, renames, or functional mergers:
1. **Module 1: Maps and Reports** (`/dashboard`) — Full GIS map of Gumaca with interactive incident pins, category/status filters, and lifecycle transitions.
2. **Module 2: Incident Blotters** (`/dashboard/blotters`, `/dashboard/blotters/[id]`) — Official blotter records, detailed inspection of AI classification suggestions, multimodal rationales, reporter contact numbers, and human verification forms.
3. **Module 3: Analytics & Reports** (`/dashboard/analytics`) — Incident volume metrics, historical trends, AI accuracy metrics, and export capabilities.
4. **Module 4: AI Volume & Surge** (`/dashboard/surge`) — System volume monitoring, capacity advisory indicators based on configurable surge threshold (`surge_threshold`) and administrative surge mode toggle (`surge_mode`). Surge settings are administrative controls and visual advisory indicators; there are no automated intake cutoffs or autonomous throttling triggers in the database.
5. **Module 5: Activity Logs** (`/dashboard/activity`) — Audit trail viewer displaying events stored in `public.audit_logs`, recording system and personnel actions. (The synthetic classification test records 3 events: `incident.submitted`, `incident.ai_assessed`, and `incident.classification_reviewed`; a full lifecycle through resolution adds `incident.status_changed` for 4 primary events). Note: `audit_logs` is a standard PostgreSQL table with RLS, not a cryptographically signed ledger.
6. **Module 6: Admin Controls** (`/dashboard/admin`) — Role-based access control directory, personnel invitations, and administrative privilege management.

---

## 3. Client Navigation Specifications

```
+--------------------------------------------------------------------------------------------------+
|                                  CLIENT NAVIGATION STRUCTURE                                     |
+-----------------------------------+----------------------------------+---------------------------+
| Resident Web (Mobile PWA)         | Resident Android (Compose App)   | Personnel Web (Dashboard) |
+-----------------------------------+----------------------------------+---------------------------+
| 1. Report       (/report)         | 1. Home        (Dashboard)       | 1. Maps & Reports         |
| 2. Map          (/dashboard)      | 2. Map         (Hazard View)     | 2. Blotters Directory     |
| 3. My Reports   (/reports)        | 3. My reports  (History View)    | 3. Analytics & Reports    |
| 4. Profile      (/profile)        | 4. Profile     (Account View)    | 4. AI Volume & Surge      |
|                                   | FAB: Report Incident Action      | 5. Activity Logs          |
|                                   |                                  | 6. Admin Controls         |
+-----------------------------------+----------------------------------+---------------------------+
```

---

## 4. Automatic Gemini AI Classification Architecture

The AI subsystem operates asynchronously and server-side:

```
[Resident Submits Report]
          │
          ▼
[submit_incident RPC] ──────► [Atomic DB INSERT in public.incidents]
                                        │
                                        ▼ (AFTER INSERT Trigger)
                              [app_private.record_incident_creation]
                                        │
                                        ▼
                              [Enqueued in app_private.ai_jobs]
                                        │
                                        ▼
                              [pg_net Asynchronous Dispatch]
                                        │ (Signed with Supabase JWT & Vault HMAC-SHA256)
                                        ▼
                              [classify-incident Edge Function v13]
                                        │
                                        ├─► [Validate Gateway JWT (verify_jwt=true)]
                                        ├─► [Validate HMAC-SHA256 Signature]
                                        ├─► [Atomic Job Claim (FOR UPDATE SKIP LOCKED)]
                                        ├─► [Download Private Evidence from Storage]
                                        ├─► [Multimodal Vision Call to Gemini 3.5 Flash Lite]
                                        │
                                        ▼
                              [Structured Suggestion Returned]
                                - Category: fire | flooding | road_accident |
                                            road_obstruction | medical_emergency | other
                                - Priority: low | medium | high
                                - Rationale: Multi-sentence vision rationale
                                        │
                                        ▼
                              [Persist to public.ai_assessments]
                                        │
                                        ▼
                              [Audit Trail Logged in public.audit_logs]
                                (actor_id = null -> Automated System Action)
```

### Critical Operational Invariants
- **Operational Status Isolation:** An AI assessment has **zero permission** to change an incident's operational status (`pending`). It remains strictly `pending` until human personnel act.
- **No Responder Dispatch:** AI suggestions do **not** dispatch responders or alert field units.
- **Mandatory Personnel Review:** AI outputs are advisory suggestions. Personnel review and confirm or correct both category and priority before closing or escalating.
- **Fail-Safe Operation:** If Gemini is unreachable or exhausts retries, the incident remains pending in the personnel queue for manual classification without data loss.

---

## 5. Technical System Diagrams (Capstone Evaluation Ready)

### Diagram 1: System Architecture Diagram

```mermaid
graph TD
    subgraph Client_Layer ["Client Presentation Layer"]
        RW["Resident Web<br/>(Next.js 16 / TypeScript PWA)"]
        RA["Resident Android<br/>(Kotlin / Jetpack Compose / OSMDroid)"]
        PW["Personnel Web<br/>(Next.js 16 Command Center)"]
    end

    subgraph Gateway_Layer ["API Gateway & Edge Runtime Layer"]
        KGW["Supabase API Gateway<br/>(PostgREST / Supabase Auth)"]
        EF["Supabase Edge Functions (Deno Runtime)<br/>- Function: classify-incident v13<br/>- Secret: GEMINI_API_KEY (Deno env)"]
    end

    subgraph Persistence_Layer ["Data & Storage Layer (Managed Supabase PostgreSQL)"]
        subgraph Public_Schema ["public schema (Application Data)"]
            DB_PUB[("Application Tables<br/>- incidents<br/>- profiles<br/>- ai_assessments<br/>- classification_reviews<br/>- incident_status_history<br/>- audit_logs<br/>- system_settings")]
        end
        subgraph Private_Schema ["app_private schema (Internal / Queue)"]
            DB_PRIV[("Internal Tables & Dispatch<br/>- ai_jobs<br/>- incident_contact_snapshots")]
        end
        ST[("Supabase Storage<br/>'incident-evidence' Bucket (Private)")]
        VAULT[("Supabase Vault (Encrypted Secrets)<br/>- kalasagai_ai_dispatch_project_url<br/>- kalasagai_ai_dispatch_anon_jwt<br/>- kalasagai_ai_dispatch_hmac_key")]
    end

    subgraph AI_Layer ["AI Inference Layer"]
        GEMINI["Google Gemini Multimodal API<br/>(gemini-3.5-flash-lite)"]
    end

    %% Client Interactions
    RW -->|1. HTTPS / JWT Submit Incident| KGW
    RA -->|1. HTTPS / JWT Submit Incident| KGW
    PW -->|8. HTTPS / JWT Review & Status Update| KGW

    KGW -->|Store Incident & Audit| DB_PUB
    KGW -->|Store Photo Evidence| ST

    %% Trigger & Dispatch
    DB_PUB -->|2. AFTER INSERT Trigger: incident_created_records| DB_PRIV
    VAULT -.->|Decrypt Dispatch Credentials| DB_PRIV
    DB_PRIV -->|3. Signed HMAC-SHA256 HTTP Dispatch: pg_net| EF

    %% Worker Execution
    EF -->|4. Atomic Job Claim: claim_ai_job_delivery| DB_PRIV
    EF -->|5. Fetch Evidence Photo via Signed URL| ST
    EF -->|6. Multimodal Vision Inference: Text + Image| GEMINI
    GEMINI -->|Return Category & Priority Suggestions| EF
    EF -->|7. Persist Assessment: record_ai_assessment_automated| DB_PUB

    %% Personnel Monitoring & Verification
    KGW -->|Query Blotters & Status| DB_PUB
```

---

### Diagram 2: System Use Case Diagram

```mermaid
flowchart LR
    subgraph Actors ["System Actors"]
        Resident["Resident<br/>(Community Reporter)"]
        Personnel["Authorized Personnel<br/>(Responder / Comm Officer / Admin)"]
        Admin["Super Admin<br/>(Privileged Administrator)"]
        SystemAI["External Gemini AI Service<br/>(Supporting System)"]
    end

    subgraph SystemBoundary ["KalasagAI 2.0 System Boundary"]
        subgraph Resident_Cases ["Resident Capabilities"]
            UC1(["Register & Manage Profile"])
            UC2(["Submit Incident with Photo Evidence"])
            UC3(["View Public Safety Map"])
            UC4(["Track Incident Status in My Reports"])
            UC5(["View Confirmed Review Category"])
        end

        subgraph Automated_Cases ["Automated System Behavior"]
            UC6(["Automatically Classify Incident<br/>(Vision AI Inference)"])
        end

        subgraph Personnel_Cases ["Personnel Monitoring & Verification"]
            UC7(["Monitor Live Map & Incident Feed"])
            UC8(["Review & Confirm AI Classification"])
            UC9(["Update Operational Status (Forward Transitions)"])
            UC10(["View Analytics & Surge Status"])
            UC11(["Inspect Activity Audit Logs"])
        end

        subgraph Admin_Cases ["Administrative Controls"]
            UC12(["Manage Staff Accounts & Privileged Roles"])
            UC13(["Configure System & Surge Settings"])
        end
    end

    %% Resident Associations
    Resident --- UC1
    Resident --- UC2
    Resident --- UC3
    Resident --- UC4
    Resident --- UC5

    %% Automated AI Trigger
    UC2 -.->|&laquo;triggers&raquo;| UC6
    SystemAI --- UC6

    %% Personnel Associations
    Personnel --- UC7
    Personnel --- UC8
    Personnel --- UC9
    Personnel --- UC10
    Personnel --- UC11

    %% Super Admin Associations
    Admin --- UC7
    Admin --- UC8
    Admin --- UC9
    Admin --- UC10
    Admin --- UC11
    Admin --- UC12
    Admin --- UC13
```

> *Academic Notation Note:* Standard UML 2.5 specifies actors as stick figures and associations as solid undirected lines. Because Mermaid's `flowchart` does not provide native UML actor symbols or generalization arrows (`--|>`), this diagram uses clean boundary subgraphs and undirected association links (`---`). The automated classification use case (`UC6`) is a backend system event triggered by incident submission (`UC2`) and supported by the external Gemini AI service. There is no separate `dispatcher` actor; dispatch is an operational status update performed by authorized personnel.

---

### Diagram 3: Data Flow Diagram — Level 0 (Context Diagram)

```mermaid
graph TD
    Resident["Resident<br/>(Community Reporter)"]
    Personnel["Authorized Personnel<br/>(MDRRMO / LGU Staff)"]
    GeminiAI["Google Gemini AI Service<br/>(External Multimodal Provider)"]
    
    System["0.0<br/>KALASAGAI 2.0 INCIDENT REPORTING, AUTOMATED CLASSIFICATION & MONITORING SYSTEM"]

    %% Resident Flows
    Resident -->|"Registration Info, Incident Report Form, Evidence Photos"| System
    System -->|"Tracking Reference (KAL-YYYYMMDD-XXXXXX), Status Updates, Confirmed Category"| Resident

    %% Personnel Flows
    Personnel -->|"Classification Confirmations, Operational Status Updates, Account Actions, System Settings"| System
    System -->|"Incident Blotters, AI Advisory Suggestions, GIS Map, Analytics, Audit Trail"| Personnel

    %% External AI Flows
    System -->|"Multimodal Payload (Binary Evidence Image & Descriptive Text Prompt)"| GeminiAI
    GeminiAI -->|"Structured Classification (Category, Priority, Technical Rationale)"| System
```

> *Academic Notation Note:* In formal DFD Level 0 (Context Diagram) rules, exactly one central system process (`0.0`) represents the entire system boundary. It is represented as a rectangular process box, not a database cylinder. No internal data stores or decision symbols appear in a context diagram. All incoming and outgoing data flows are balanced with the Level 1 DFD.

---

### Diagram 4: Data Flow Diagram — Level 1

```mermaid
graph TD
    R["Resident<br/>(Community Reporter)"]
    P["Authorized Personnel<br/>(MDRRMO / LGU Staff)"]
    G["Google Gemini AI Service<br/>(External System)"]

    subgraph Processes ["Core Functional Processes"]
        P1["1.0 User Authentication & Profile Management"]
        P2["2.0 Incident Intake & Evidence Processing"]
        P3["3.0 Automated AI Dispatch & Classification"]
        P4["4.0 Blotter Verification & Classification Review"]
        P5["5.0 Operational Status Management"]
        P6["6.0 GIS Incident Monitoring & Analytics"]
    end

    subgraph DataStores ["Data Stores"]
        D1[("D1: User Profiles (public.profiles)")]
        D2[("D2: Incidents (public.incidents)")]
        D3[("D3: Private Evidence Storage (incident-evidence)")]
        D4[("D4: AI Dispatch Jobs (app_private.ai_jobs)")]
        D5[("D5: AI Assessments (public.ai_assessments)")]
        D6[("D6: Classification Reviews (public.classification_reviews)")]
        D7[("D7: Status History (public.incident_status_history)")]
        D8[("D8: Audit Logs (public.audit_logs)")]
    end

    %% Process 1.0 Flows
    R -->|"Credentials & Profile Updates"| P1
    P1 -->|"Store User Profile"| D1
    D1 -->|"Read Profile / Validate Role"| P1
    P1 -->|"Authentication Session / Profile View"| R

    %% Process 2.0 Flows - All evidence passes through P2 before reaching D3
    R -->|"Incident Report Narrative, Coordinates & Photo Evidence"| P2
    P2 -->|"Insert Validated Incident Record"| D2
    P2 -->|"Upload Validated Photo Evidence"| D3
    P2 -->|"Record Initial Status (pending)"| D7
    P2 -->|"Log Submission Event"| D8
    P2 -->|"Return Tracking Reference"| R

    %% Process 3.0 Flows - Automated AI Dispatch
    D2 -->|"Incident Creation Event (AFTER INSERT Trigger)"| P3
    P3 -->|"Enqueue AI Job & Record Worker Claim"| D4
    D3 -->|"Fetch Evidence Photo Payload"| P3
    P3 -->|"Send Multimodal Request (Text + Image)"| G
    G -->|"Return Structured Category & Priority Suggestions"| P3
    P3 -->|"Persist Advisory Assessment"| D5
    P3 -->|"Log AI Assessment Event (actor_id = null)"| D8

    %% Process 4.0 Flows - Personnel Blotter Review
    P -->|"Submit Confirmed Category & Priority"| P4
    D2 -->|"Read Blotter Incident Data"| P4
    D5 -->|"Read Advisory AI Suggestion & Model Rationale"| P4
    P4 -->|"Store Confirmed Review"| D6
    P4 -->|"Log Review Event"| D8

    %% Process 5.0 Flows - Status Management
    P -->|"Advance Incident Status (pending -> in_progress -> resolved -> closed)"| P5
    P5 -->|"Update Incident Operational Status"| D2
    P5 -->|"Append Status History Note"| D7
    P5 -->|"Log Status Change Event"| D8

    %% Process 6.0 Flows - Monitoring & Resident Tracking
    D2 -->|"Query Incidents & Coordinates"| P6
    D5 -->|"Query AI Accuracy Metrics"| P6
    D8 -->|"Query System Audit Trail"| P6
    P6 -->|"Render Command Map, Metrics & Audit Logs"| P
    D2 -->|"Query Own Submitted Incidents"| P6
    D6 -->|"Query Confirmed Category & Priority"| P6
    D7 -->|"Query Status History Timeline"| P6
    P6 -->|"Display Incident Status & Public Safety Map"| R
```

> *Academic Notation Note:* Strict DFD Level 1 rules require all data moving into a data store to pass through a numbered application process. Evidence photos submitted by residents pass through Process `2.0` before reaching Store `D3`; no external entity communicates directly with a data store. No data store communicates directly with another data store. Process `3.0` (Automated AI Dispatch) is functionally distinct from Process `5.0` (Personnel Operational Status Management).

---

### Diagram 5: Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    PROFILES ||--o{ INCIDENTS : submits
    PROFILES ||--o{ CLASSIFICATION_REVIEWS : reviews
    PROFILES ||--o{ INCIDENT_STATUS_HISTORY : records
    PROFILES ||--o{ AUDIT_LOGS : performs

    INCIDENTS ||--|{ INCIDENT_PHOTOS : contains
    INCIDENTS ||--|| INCIDENT_CONTACT_SNAPSHOTS : snapshots
    INCIDENTS ||--|| AI_JOBS : triggers
    INCIDENTS ||--o{ AI_ASSESSMENTS : receives
    INCIDENTS ||--o{ CLASSIFICATION_REVIEWS : verified_by
    INCIDENTS ||--|{ INCIDENT_STATUS_HISTORY : tracks
    INCIDENTS ||--o{ AUDIT_LOGS : logs

    AI_ASSESSMENTS ||--o{ CLASSIFICATION_REVIEWS : references

    PROFILES {
        uuid id PK "references auth.users"
        string email
        string full_name
        string contact_number "nullable for non-residents; format check"
        string role "resident | responder | communication_officer | admin | super_admin"
        timestamp created_at
        timestamp updated_at
    }

    INCIDENTS {
        uuid id PK
        string reference UK "format KAL-YYYYMMDD-XXXXXX"
        uuid resident_id FK "references auth.users"
        uuid idempotency_key
        text description "10-2000 chars"
        string location_label "2-250 chars"
        double latitude "-90 to 90"
        double longitude "-180 to 180"
        string status "pending | in_progress | resolved | closed"
        timestamp created_at
        timestamp updated_at
    }

    INCIDENT_CONTACT_SNAPSHOTS {
        uuid incident_id PK, FK "references incidents, on delete cascade"
        string contact_snapshot "format +639XXXXXXXXX"
        timestamp captured_at
    }

    INCIDENT_PHOTOS {
        uuid id PK
        uuid incident_id FK "references incidents"
        string storage_path UK "unique path in incident-evidence"
        string content_type "image/jpeg | image/png | image/webp"
        bigint file_size_bytes "1 to 10485760 bytes"
        timestamp created_at
    }

    AI_JOBS {
        bigint id PK "generated always as identity"
        uuid incident_id FK, UK "unique 1:1 reference to incidents"
        string status "queued | processing | complete | failed"
        int attempts "max 3 worker attempts"
        uuid worker_token "nullable worker claim identifier"
        string dispatch_timestamp "nullable dispatch timestamp"
        int dispatch_attempts "max 5 dispatch retries"
        timestamp next_dispatch_at
        bigint last_dispatch_request_id "nullable pg_net request id"
        bigint last_reconciled_request_id "nullable pg_net response id"
        int last_dispatch_http_status "nullable HTTP response code"
        string last_dispatch_error_code "nullable dispatch error"
        timestamp processing_started_at "nullable claim timestamp"
        string processing_error_code "nullable processing error"
        timestamp created_at
        timestamp updated_at
    }

    AI_ASSESSMENTS {
        uuid id PK
        uuid incident_id FK "references incidents"
        string suggested_category "fire | flooding | road_accident | road_obstruction | medical_emergency | other"
        string suggested_priority "low | medium | high"
        text rationale "1-1200 chars"
        string model "1-120 chars (gemini-3.5-flash-lite)"
        timestamp created_at
    }

    CLASSIFICATION_REVIEWS {
        uuid id PK
        uuid incident_id FK "references incidents"
        uuid assessment_id FK "nullable references ai_assessments"
        uuid reviewer_id FK "references auth.users"
        string confirmed_category "incident_category enum"
        string confirmed_priority "incident_priority enum"
        text note "nullable, max 1000 chars"
        timestamp created_at
    }

    INCIDENT_STATUS_HISTORY {
        bigint id PK "generated always as identity"
        uuid incident_id FK "references incidents"
        string from_status "nullable on report submission"
        string to_status "incident_status enum"
        uuid actor_id FK "nullable references auth.users"
        text note "nullable, max 1000 chars"
        timestamp created_at
    }

    AUDIT_LOGS {
        bigint id PK "generated always as identity"
        uuid actor_id FK "nullable references auth.users (null = system/AI)"
        string action "max 80 chars"
        uuid incident_id FK "nullable references incidents"
        jsonb details "jsonb event metadata"
        timestamp created_at
    }
```

> *Academic Notation Note:* In relational schema modeling, 1:1 relationships exist only where explicitly enforced by unique constraints or primary key references. `INCIDENTS` to `INCIDENT_CONTACT_SNAPSHOTS` is strict 1:1 (`incident_id` is both PK and FK). `INCIDENTS` to `AI_JOBS` is strict 1:1 (`incident_id` has a UNIQUE constraint). Relationships between `INCIDENTS` and `AI_ASSESSMENTS` or `CLASSIFICATION_REVIEWS` are 1:N in schema definition (an incident may have subsequent assessments upon re-dispatch or multiple personnel review iterations over time), though normal operation yields one active assessment.

---

### Diagram 6: Database Schema Diagram (Physical Design)

```mermaid
classDiagram
    class public_profiles {
        +UUID id [PK, FK auth.users]
        +TEXT full_name [1-120 chars]
        +TEXT email
        +TEXT contact_number [CHECK +639XXXXXXXXX]
        +personnel_role role [resident|responder|comm_officer|admin|super_admin]
        +TIMESTAMPTZ created_at
        +TIMESTAMPTZ updated_at
    }

    class public_incidents {
        +UUID id [PK, DEFAULT gen_random_uuid()]
        +TEXT reference [UNIQUE, KAL-YYYYMMDD-XXXXXX]
        +UUID resident_id [FK auth.users]
        +UUID idempotency_key
        +TEXT description [10-2000 chars]
        +TEXT location_label [2-250 chars]
        +DOUBLE_PRECISION latitude [-90 to 90]
        +DOUBLE_PRECISION longitude [-180 to 180]
        +incident_status status [pending|in_progress|resolved|closed]
        +TIMESTAMPTZ created_at
        +TIMESTAMPTZ updated_at
    }

    class app_private_incident_contact_snapshots {
        +UUID incident_id [PK, FK public_incidents.id]
        +TEXT contact_snapshot [CHECK +639XXXXXXXXX]
        +TIMESTAMPTZ captured_at
    }

    class public_incident_photos {
        +UUID id [PK, DEFAULT gen_random_uuid()]
        +UUID incident_id [FK public_incidents.id]
        +TEXT storage_path [UNIQUE]
        +TEXT content_type [CHECK jpeg|png|webp]
        +BIGINT file_size_bytes [CHECK 1 to 10MB]
        +TIMESTAMPTZ created_at
    }

    class app_private_ai_jobs {
        +BIGINT id [PK, GENERATED ALWAYS]
        +UUID incident_id [FK public_incidents.id, UNIQUE]
        +TEXT status [CHECK queued|processing|complete|failed]
        +INT attempts [CHECK >= 0]
        +UUID worker_token
        +TEXT dispatch_timestamp
        +INT dispatch_attempts [DEFAULT 0]
        +TIMESTAMPTZ next_dispatch_at
        +BIGINT last_dispatch_request_id
        +BIGINT last_reconciled_request_id
        +INT last_dispatch_http_status
        +TEXT last_dispatch_error_code
        +TIMESTAMPTZ processing_started_at
        +TEXT processing_error_code
        +TIMESTAMPTZ created_at
        +TIMESTAMPTZ updated_at
    }

    class public_ai_assessments {
        +UUID id [PK, DEFAULT gen_random_uuid()]
        +UUID incident_id [FK public_incidents.id]
        +incident_category suggested_category
        +incident_priority suggested_priority
        +TEXT rationale [1-1200 chars]
        +TEXT model [1-120 chars]
        +TIMESTAMPTZ created_at
    }

    class public_classification_reviews {
        +UUID id [PK, DEFAULT gen_random_uuid()]
        +UUID incident_id [FK public_incidents.id]
        +UUID assessment_id [FK public_ai_assessments.id, nullable]
        +incident_category confirmed_category
        +incident_priority confirmed_priority
        +UUID reviewer_id [FK auth.users]
        +TEXT note [max 1000 chars, nullable]
        +TIMESTAMPTZ created_at
    }

    class public_incident_status_history {
        +BIGINT id [PK, GENERATED ALWAYS]
        +UUID incident_id [FK public_incidents.id]
        +incident_status from_status [nullable]
        +incident_status to_status
        +UUID actor_id [FK auth.users, nullable]
        +TEXT note [max 1000 chars, nullable]
        +TIMESTAMPTZ created_at
    }

    class public_audit_logs {
        +BIGINT id [PK, GENERATED ALWAYS]
        +UUID actor_id [FK auth.users, nullable]
        +TEXT action [1-80 chars]
        +UUID incident_id [FK public_incidents.id, nullable]
        +JSONB details [empty jsonb default]
        +TIMESTAMPTZ created_at
    }

    class public_system_settings {
        +TEXT key [PK, CHECK surge_threshold|surge_mode|gemini_enabled]
        +JSONB value
        +UUID updated_by [FK auth.users, nullable]
        +TIMESTAMPTZ updated_at
    }

    public_profiles "1" --> "*" public_incidents : resident_id
    public_incidents "1" --> "1" app_private_incident_contact_snapshots : incident_id (PK-FK)
    public_incidents "1" --> "1..5" public_incident_photos : incident_id
    public_incidents "1" --> "1" app_private_ai_jobs : incident_id (UNIQUE)
    public_incidents "1" --> "*" public_ai_assessments : incident_id
    public_incidents "1" --> "*" public_classification_reviews : incident_id
    public_incidents "1" --> "*" public_incident_status_history : incident_id
    public_incidents "1" --> "*" public_audit_logs : incident_id
    public_ai_assessments "1" --> "*" public_classification_reviews : assessment_id
```

---

### Diagram 7: Overall System Flowchart

```mermaid
flowchart TD
    Start([User Initiates Action]) --> CheckAuth{Is User Authenticated?}
    CheckAuth -- No --> AuthScreen[Display Sign-In / Register Screen]
    AuthScreen --> LoginSubmit[Submit Credentials to Supabase Auth]
    LoginSubmit --> LoginResult{Auth Success?}
    LoginResult -- No --> LoginError[Display Authentication Error Alert] --> AuthScreen
    LoginResult -- Yes --> RouteRole{Check User Role in public.profiles}

    %% Role Routing
    RouteRole -- resident --> ResDashboard[Open Resident Web / Android Portal]
    RouteRole -- responder / comm_officer / admin / super_admin --> StaffDashboard[Open Personnel Web Command Center]

    %% Resident Reporting Workflow
    ResDashboard --> ResidentChoice{Resident Action}
    ResidentChoice -- Browse Map --> ResMap[Inspect Public Safety Hazards Map]
    ResidentChoice -- View History --> ResHistory[Query My Reports & Tracking Timeline]
    ResidentChoice -- Report Incident --> FillReport[Fill Incident Report: Description & Location]

    FillReport --> AttachPhoto[Attach Private Evidence Photo: JPEG/PNG/WebP]
    AttachPhoto --> ClientVal{Client Validation:<br/>Valid Length, Coords & Photo?}
    ClientVal -- No --> ValidationErr[Display Form Validation Error Alert] --> FillReport
    ClientVal -- Yes --> UploadEvidence[Upload Photo to Private Storage Bucket: incident-evidence]

    UploadEvidence --> CallRPC[Execute submit_incident RPC]
    CallRPC --> RPCValidate{Database Validation:<br/>Auth, E.164 Contact, Storage Path?}
    RPCValidate -- No --> RPCError[Display Submission Rejection Message] --> FillReport
    RPCValidate -- Yes --> DBInsert[(Insert public.incidents: status = 'pending')]

    DBInsert --> TriggerFire[Trigger: incident_created_records Fires]
    TriggerFire --> SnapshotContact[(Insert app_private.incident_contact_snapshots)]
    TriggerFire --> InitialStatus[(Insert public.incident_status_history: pending)]
    TriggerFire --> InitialAudit[(Insert public.audit_logs: incident.submitted)]
    TriggerFire --> EnqueueAI[(Insert app_private.ai_jobs: status = 'queued')]
    EnqueueAI --> ReturnRef[Generate Reference: KAL-YYYYMMDD-XXXXXX]
    ReturnRef --> ResConfirmation[Display Submission Confirmation to Resident]

    %% Asynchronous Automated AI Workflow
    EnqueueAI --> CheckAIEnabled{system_settings:<br/>gemini_enabled == true?}
    CheckAIEnabled -- False --> AIOff[Leave Job in Queue: Next Dispatch Deferred]
    CheckAIEnabled -- True --> DispatchHTTP[app_private.dispatch_ai_classification:<br/>Signed pg_net POST to Edge Function]

    DispatchHTTP --> EdgeProcess[classify-incident v13 Executes]
    EdgeProcess --> WorkerClaim{claim_ai_job_delivery:<br/>Claim Successful?}
    WorkerClaim -- No (Already Claimed) --> ExitDuplicate([Exit Worker: Prevent Duplicate Call])
    WorkerClaim -- Yes --> FetchImage[Fetch Evidence Photo via Short-Lived Signed URL]
    FetchImage --> GeminiCall[Invoke Google Gemini 3.5 Flash Lite Vision API]

    GeminiCall --> GeminiResult{Inference Success?}
    GeminiResult -- No / Timeout --> AIFail[fail_ai_job: Mark status = 'failed'<br/>Check Retry Eligibility: attempts < 3]
    AIFail --> ManualQueue[Incident Remains Pending for Manual Personnel Triage]
    GeminiResult -- Yes --> ValidateOutput{JSON Output Valid:<br/>Category in Enum & Priority in Enum?}
    ValidateOutput -- Invalid --> AIFail
    ValidateOutput -- Valid --> SaveAssessment[(record_ai_assessment_automated:<br/>Save to public.ai_assessments)]
    SaveAssessment --> CompleteJob[(Update app_private.ai_jobs: status = 'complete')]
    CompleteJob --> AIAudit[(Insert public.audit_logs: incident.ai_assessed<br/>actor_id = null)]
    AIAudit --> StatusInvariant[Operational Status Remains Strictly 'pending']

    %% Personnel Monitoring & Verification Workflow
    StaffDashboard --> StaffAction{Personnel Action}
    StaffAction -- Module 1: Map --> LiveMap[Inspect Real-Time Municipal GIS Command Map]
    StaffAction -- Module 2: Blotters --> OpenBlotter[Open Incident Blotter Detail Page]
    StaffAction -- Module 3: Analytics --> ViewAnalytics[Inspect Incident KPIs & AI Accuracy Charts]
    StaffAction -- Module 4: Surge --> ViewSurge[Inspect System Load & Administrative Surge Flags]
    StaffAction -- Module 5: Activity Logs --> ViewLogs[Inspect Immutable Audit Log Ledger]
    StaffAction -- Module 6: Admin Controls --> AdminRoles[Manage Personnel Roles & Access Boundaries]

    OpenBlotter --> InspectReport[Examine Narrative, High-Res Photo & Advisory AI Suggestion]
    InspectReport --> ReviewAction[Authorized Personnel Review:<br/>Confirm or Correct Category & Priority]
    ReviewAction --> SubmitReview[Execute review_incident_classification RPC]
    SubmitReview --> SaveReview[(Insert public.classification_reviews)]
    SaveReview --> ReviewAudit[(Insert public.audit_logs: incident.classification_reviewed)]

    ReviewAudit --> DecideStatus{Advance Operational Status?}
    DecideStatus -- No (Keep Pending) --> StaffDashboard
    DecideStatus -- Yes: Forward Transition --> SelectStatus{Target Status?}
    SelectStatus -- in_progress --> MarkInProgress[update_incident_status RPC: status = 'in_progress']
    SelectStatus -- resolved (Direct) --> MarkResolved[update_incident_status RPC: status = 'resolved']

    MarkInProgress --> StatusAudit1[(Update public.incidents, Append incident_status_history,<br/>Log incident.status_changed)]
    MarkInProgress --> FieldMitigation[Field Responders Coordinate Mitigation via Radio]
    FieldMitigation --> MarkResolved2[update_incident_status RPC: status = 'resolved']
    MarkResolved2 --> StatusAudit2[(Update public.incidents, Append incident_status_history)]

    MarkResolved --> StatusAudit3[(Update public.incidents, Append incident_status_history)]
    StatusAudit2 --> FinalClose[update_incident_status RPC: status = 'closed']
    StatusAudit3 --> FinalClose
    FinalClose --> ClosedRecord[(Incident Lifecycle Concluded: status = 'closed')]

    %% Resident Tracking Loop
    StatusInvariant --> ResHistory
    StatusAudit1 --> ResHistory
    StatusAudit2 --> ResHistory
    ClosedRecord --> ResHistory
    ResHistory --> End([Resident Views Updated Status Timeline])
```

---

### Diagram 8: AI Classification Process Flowchart

```mermaid
flowchart TD
    StartAI([Incident Inserted in public.incidents]) --> Trigger[AFTER INSERT Trigger: incident_created_records]
    Trigger --> CheckEnabled{Check system_settings:<br/>gemini_enabled == true?}
    
    CheckEnabled -- False --> DeferJob[Update app_private.ai_jobs:<br/>next_dispatch_at = now + 5 min<br/>last_dispatch_error_code = 'classification_disabled']
    DeferJob --> ManualQueue([Hold Incident in Queue: Manual Classification Required])

    CheckEnabled -- True --> Enqueue[Insert row into app_private.ai_jobs:<br/>status = 'queued', attempts = 0, dispatch_attempts = 0]
    
    %% Immediate Direct Database Dispatch
    Enqueue --> DirectDispatch[Execute app_private.dispatch_ai_classification: Immediate Dispatch]
    DirectDispatch --> ReadVault[Retrieve Secrets from Supabase Vault:<br/>- kalasagai_ai_dispatch_project_url<br/>- kalasagai_ai_dispatch_anon_jwt<br/>- kalasagai_ai_dispatch_hmac_key]
    
    ReadVault --> ConfigCheck{Vault Secrets Configured<br/>& Key Length >= 32 Bytes?}
    ConfigCheck -- No --> MissingConfig[Update ai_jobs: error = 'missing_dispatch_configuration'<br/>next_dispatch_at = now + 5 min]
    MissingConfig --> ManualQueue

    ConfigCheck -- Yes --> GenHMAC[Compute HMAC-SHA256 Token:<br/>message = timestamp . incident_id<br/>signature = hex encode HMAC-SHA256]
    GenHMAC --> PGNetPost[Dispatch Asynchronous HTTP POST via pg_net:<br/>Target = /functions/v1/classify-incident<br/>Headers = apikey, Authorization Bearer, x-kalasag-dispatch-*]

    %% Edge Function Execution
    PGNetPost --> EdgeGateway[Supabase API Gateway Receives Request]
    EdgeGateway --> GatewayJWT{verify_jwt Gateway Enforcement:<br/>Valid Supabase Token?}
    GatewayJWT -- No --> RejectGateway[HTTP 401 Unauthorized / Request Terminated]

    GatewayJWT -- Yes --> FunctionEntry[classify-incident v13 Entry Point]
    FunctionEntry --> VerifyHMAC{Verify Dispatch HMAC:<br/>Valid Timestamp & Signature?}
    VerifyHMAC -- Invalid / Expired --> FailHMAC[HTTP 401 Unauthorized / Fail Closed]

    VerifyHMAC -- Valid --> AtomicClaim[Invoke public.claim_ai_job_delivery RPC:<br/>Atomically lock row & check worker token]
    AtomicClaim --> ClaimSuccess{Claim Succeeded?<br/>Row status in queued/failed & attempts < 3}
    ClaimSuccess -- No (Already Processing/Max Attempts) --> ExitClaim([Exit: Prevent Duplicate Inference])

    ClaimSuccess -- Yes --> InProcessing[Job status set to 'processing', attempts = attempts + 1<br/>worker_token assigned, dispatch_timestamp consumed]
    InProcessing --> DownloadImage[Fetch Evidence Photo from Storage:<br/>incident-evidence bucket via service_role]
    DownloadImage --> ConstructPayload[Assemble Multimodal Payload:<br/>- System prompt with incident schema<br/>- Incident narrative description & location label<br/>- Inline image data bytes: JPEG/PNG/WebP]

    ConstructPayload --> CallGemini[Invoke Google Gemini 3.5 Flash Lite API:<br/>Header x-goog-api-key = Deno.env GEMINI_API_KEY]
    
    CallGemini --> ProviderResponse{Gemini HTTP 200 Success?}
    ProviderResponse -- No / Rate Limit (429/503) --> RetryEval{Retry Count < 3?}
    RetryEval -- Yes --> BackoffWait[Exponential Backoff Delay] --> CallGemini
    RetryEval -- No --> RecordFailure[Invoke public.fail_ai_job RPC:<br/>status = 'failed', processing_error_code = 'classification_failed']
    RecordFailure --> CheckSchedule[Stale Job Recovery via pg_cron:<br/>Default inactive in dev; periodic retry if enabled]
    CheckSchedule --> ManualQueue

    ProviderResponse -- Yes --> ParseJSON[Parse Structured JSON Response]
    ParseJSON --> ValidateSchema{Validation Check:<br/>Category in 6 Enums & Priority in 3 Enums?}
    ValidateSchema -- Parse Failure --> RecordFailure

    ValidateSchema -- Valid Assessment --> PersistRPC[Invoke public.record_ai_assessment_automated RPC]
    PersistRPC --> LockWorker[app_private.lock_ai_worker: Verify worker token]
    LockWorker --> InsertAssessment[(Insert row into public.ai_assessments:<br/>suggested_category, suggested_priority, rationale, model)]
    InsertAssessment --> CompleteJob[(Update app_private.ai_jobs: status = 'complete')]
    CompleteJob --> InsertAudit[(Insert row into public.audit_logs:<br/>action = 'incident.ai_assessed', actor_id = null)]
    InsertAudit --> FinishAI([AI Classification Completed Successfully:<br/>Incident operational status remains strictly 'pending'])
```

---

### Diagram 9: Incident Monitoring Swimlane Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Resident as Resident (Citizen)
    participant ResApp as Resident App (Web / Android)
    participant Backend as Supabase Backend (DB, Storage, Vault)
    participant EdgeAI as Edge Function & Gemini 3.5 Flash Lite
    actor Staff as Authorized Personnel (MDRRMO)

    Note over Resident,Staff: 1. INCIDENT INTAKE & STORAGE PHASE
    Resident->>ResApp: Fill description, select GPS location, attach photo
    ResApp->>ResApp: Validate description length, coordinate bounds, photo MIME/size
    ResApp->>Backend: Upload photo binary to 'incident-evidence' bucket
    Backend-->>ResApp: Return object storage path
    ResApp->>Backend: Execute submit_incident RPC (idempotency_key, payload, photo_paths)
    Backend->>Backend: Verify E.164 phone, validate constraints, insert public.incidents (status = 'pending')
    Backend->>Backend: Snapshot phone to incident_contact_snapshots, insert initial status history
    Backend->>Backend: Enqueue AI job in app_private.ai_jobs (status = 'queued')
    Backend-->>ResApp: Return created incident & reference (KAL-YYYYMMDD-XXXXXX)
    ResApp-->>Resident: Display submission confirmation & tracking reference

    Note over Backend,EdgeAI: 2. AUTOMATIC ASYNCHRONOUS AI CLASSIFICATION PHASE
    Backend->>Backend: AFTER INSERT trigger fires app_private.dispatch_ai_classification
    Backend->>Backend: Fetch Vault secrets, compute HMAC-SHA256 signature
    Backend->>EdgeAI: pg_net asynchronous HTTP POST to /functions/v1/classify-incident
    EdgeAI->>EdgeAI: Verify Gateway JWT & dispatch HMAC-SHA256 signature
    EdgeAI->>Backend: Call claim_ai_job_delivery RPC (atomic worker lock)
    Backend-->>EdgeAI: Claim confirmed (status = 'processing')
    EdgeAI->>Backend: Fetch evidence photo from private storage
    Backend-->>EdgeAI: Return image binary data
    EdgeAI->>EdgeAI: Multimodal vision inference via Gemini 3.5 Flash Lite
    EdgeAI->>Backend: Call record_ai_assessment_automated RPC
    Backend->>Backend: Insert public.ai_assessments (category, priority, rationale, model)
    Backend->>Backend: Update ai_jobs (status = 'complete'), log audit record (actor_id = null)
    Note over Backend: CRITICAL INVARIANT: Operational status remains strictly 'pending'

    Note over Staff,Resident: 3. HUMAN VERIFICATION & OPERATIONAL BLOTTER TRIAGE
    Staff->>Backend: Open Incident Blotter Detail in Personnel Web
    Backend-->>Staff: Return narrative, photo, reporter contact, AI suggested category & priority, model rationale
    Staff->>Staff: Review evidence and confirm or adjust category and priority
    Staff->>Backend: Execute review_incident_classification RPC (confirmed_category, confirmed_priority, note)
    Backend->>Backend: Insert public.classification_reviews, log incident.classification_reviewed in audit_logs

    Note over Staff,Resident: 4. OPERATIONAL STATUS TRANSITION & RESIDENT TRACKING
    Staff->>Backend: Execute update_incident_status RPC (target status = 'in_progress', dispatch notes)
    Backend->>Backend: Verify permitted transition, update incidents.status = 'in_progress'
    Backend->>Backend: Append public.incident_status_history, log incident.status_changed in audit_logs
    Note over Staff: Field responders dispatched via municipal radio (not automated by software)
    Resident->>ResApp: Open 'My Reports' / Incident Details tracking view
    ResApp->>Backend: Query incident status & execute my_report_review RPC
    Backend-->>ResApp: Return status 'in_progress', confirmed category & priority (staff notes & AI rationale hidden)
    ResApp-->>Resident: Display current status timeline & verified classification

    Note over Staff,Resident: 5. RESOLUTION & ARCHIVAL PHASE
    Staff->>Backend: Execute update_incident_status RPC (target status = 'resolved', scene cleared note)
    Backend->>Backend: Update incidents.status = 'resolved', append status history & audit log
    Resident->>ResApp: Refresh incident tracking view
    ResApp-->>Resident: Display status 'RESOLVED'
    Staff->>Backend: Execute update_incident_status RPC (target status = 'closed')
    Backend->>Backend: Update incidents.status = 'closed', lifecycle finalized
```

---

### Diagram 10: Input–Process–Output (IPO) Conceptual Framework

```mermaid
graph LR
    subgraph INPUT ["1. SYSTEM INPUTS"]
        I1["Resident User Inputs:<br/>- Account Credentials & E.164 Contact<br/>- Incident Narrative (10-2000 chars)<br/>- GPS Coordinates & Landmark Label<br/>- Evidence Photos (1-5 images: JPEG/PNG/WebP)"]
        I2["Personnel & Administrative Inputs:<br/>- Staff Authentication & Role Claims<br/>- Classification Review (Confirmed Category & Priority)<br/>- Operational Status Updates & Dispatch Notes<br/>- System Configuration (Surge Threshold, Surge Mode)"]
        I3["System Security & Environmental Credentials:<br/>- Supabase Vault Dispatch Secrets (HMAC Key, Project URL, Anon JWT)<br/>- Edge Function Environment Secret (GEMINI_API_KEY)"]
    end

    subgraph PROCESS ["2. COMPUTATIONAL PROCESSES"]
        P1["Data Ingestion & Sanitization:<br/>- Philippine Mobile E.164 Normalization<br/>- Geographic Coordinate Bounds Validation<br/>- Photo Payload MIME Type & 10MB Size Verification"]
        P2["Transactional Storage & Isolation:<br/>- Atomic Database Insertion via submit_incident RPC<br/>- Contact Snapshotting to app_private<br/>- Private Evidence Storage Bucket Ingestion"]
        P3["Automated Asynchronous AI Classification:<br/>- Database AFTER INSERT Trigger (incident_created_records)<br/>- HMAC-SHA256 Signed HTTP Dispatch via pg_net<br/>- Atomic Worker Claim & Concurrency Locking<br/>- Multimodal Vision Analysis (Google Gemini 3.5 Flash Lite)<br/>- Structured Schema Extraction & Error-Fallback Triage"]
        P4["Human-in-the-Loop Operational Management:<br/>- Mandatory Personnel Classification Review<br/>- Forward-Only Lifecycle Status State Machine<br/>- Immutable System Audit Logging (public.audit_logs)<br/>- Tenant Privacy Enforcement via Row-Level Security & RPC Filters"]
    end

    subgraph OUTPUT ["3. OPERATIONAL OUTPUTS"]
        O1["Resident Outputs:<br/>- Sequential Municipal Tracking Number (KAL-YYYYMMDD-XXXXXX)<br/>- Short-Lived Signed URLs for Photo Evidence<br/>- Real-Time Lifecycle Status Timeline<br/>- Personnel-Confirmed Category & Priority (Internal Notes Redacted)"]
        O2["Personnel Operations Center Outputs:<br/>- Interactive Real-Time Municipal GIS Command Map<br/>- Official Incident Blotter Ledger with Evidence Photos<br/>- Advisory AI Category & Priority with Vision Rationale<br/>- High-Volume Surge Advisory Indicators<br/>- Aggregated Category & Triage Accuracy Analytics<br/>- Chronological Comprehensive Audit Trail"]
    end

    INPUT --> PROCESS
    PROCESS --> OUTPUT
```

> *Academic Notation Note:* In formal software engineering and systems analysis, the Input-Process-Output (IPO) framework articulates the transformation of raw information through computational procedures into concrete software deliverables. This framework strictly documents software capabilities verified by automated test suites and live development records. It does not assert unverified real-world empirical claims such as reduced municipal response times or emergency medical efficacy.

---

## 6. Implemented vs. Unverified Features Matrix

| Feature Domain | Feature Name | Implementation Status | Verification Status | Evaluation Scope & Limitations |
|---|---|---|---|---|
| **Resident App** | Account Registration & Profile | Implemented | **Partially Verified** | Mobile formatting regex and profile triggers pass; physical SMS OTP verification not integrated. |
| **Resident App** | Digital Incident Intake Form | Implemented | **Verified (Local & Dev)** | Form validation and `submit_incident` RPC pass unit and Playwright tests; FAB navigation verified on Android. |
| **Resident App** | GPS & Coordinate Picker | Implemented | **Verified (Local & Dev)** | Coordinate bounding tests pass; map picker functional on Leaflet (Web) and OSMDroid (Android); hardware GPS field accuracy dependent on device. |
| **Resident App** | Photo Evidence Upload | Implemented | **Verified (Dev Storage)** | Upload to private `incident-evidence` bucket, MIME validation, and signed URL generation verified. |
| **Resident App** | Public Safety Hazards Map | Implemented | **Verified (Local & Dev)** | Verified via Leaflet on Web and OSMDroid on Android; category and pin rendering confirmed. |
| **Resident App** | My Reports Tracking View | Implemented | **Verified (Local & Dev)** | Validated via Playwright scenarios (`RW-05`, `RW-06`) and Android Compose LazyColumn; status updates display via page refresh/query. |
| **Resident App** | Resident Privacy Guards | Implemented | **Verified (Local & Dev)** | Internal notes, AI model name, and raw rationales proven filtered out by `my_report_review` RPC. |
| **Resident App** | Emergency Hotlines Screen | **REMOVED** | **CONFIRMED REMOVED** | 0 references across Web and Android source code; exactly 4 bottom tabs verified on Pixel_6a emulator. |
| **AI Subsystem** | Automatic Gemini Dispatch | Implemented | **Verified (Single Live Dev Test)** | Validated on dev via synthetic incident `KAL-20261123-000005` (5.38s); does not assert generalized statistical accuracy across diverse conditions. |
| **AI Subsystem** | Multimodal Vision Analysis | Implemented | **Verified (Single Live Dev Test)** | Successfully analyzed image and text in synthetic test; mock provider tests pass in Deno. |
| **AI Subsystem** | Status Isolation Guarantee | Implemented | **Verified (DB & Dev)** | Proven in PGlite and live dev: AI classification cannot alter operational status from `pending`. |
| **Personnel Web** | Module 1: Maps & Reports | Implemented | **Verified (Local & Dev)** | Validated via Playwright (`PW-02`) and unit tests; category and status filtering functional. |
| **Personnel Web** | Module 2: Incident Blotters | Implemented | **Verified (Local & Dev)** | Validated via Playwright (`PW-03`–`PW-07`); human review confirmation and status progression verified. |
| **Personnel Web** | Module 3: Analytics & Reports | Implemented | **Verified (Local UI & Dev)** | Validated via Playwright (`PW-08`) with Chart.js; metrics computed strictly from reviewed blotters. |
| **Personnel Web** | Module 4: AI Volume & Surge | Implemented | **Verified (Local UI & Dev)** | Validated via Playwright (`PW-09`); displays administrative surge settings and visual advisory indicators. |
| **Personnel Web** | Module 5: Activity Logs | Implemented | **Verified (Local & Dev)** | Validated via Playwright (`PW-10`) viewing `public.audit_logs` (3 events logged for synthetic test; 4 possible across full lifecycle). |
| **Personnel Web** | Module 6: Admin Controls | Implemented | **Verified (Local & Dev)** | Validated via Playwright (`PW-11`); role boundaries and Super Admin privilege protections verified. |
| **Production** | Production Deployment | Deferred | **GATED / NO-GO** | Read-only check on 2026-11-24 confirmed an active project with a legacy schema and migration history incompatible with the current development baseline. No production changes made; a rehearsed data-preserving compatibility migration is required. |

---

## 7. Capstone Chapter 3 Technical Alignment Guide

For students, faculty advisers, and capstone panel members reviewing Chapter 3 (System Design & Methodology):

1. **Methodology Formulation:**
   - KalasagAI 2.0 strictly follows the **Waterfall Methodology** across distinct sequential phases: Requirements Analysis → System Design → Implementation → System Testing → Acceptance & Evaluation.
2. **Requirements Reconciliation:**
   - In the Requirements Analysis section, update the Functional Requirements specification to document that the initial prototype hotline concept was superseded by the approved digital incident reporting and tracking architecture.
   - Clarify that direct telephony hotlines are outside system software boundaries, and direct citizen reporting is facilitated through authenticated digital intake with GPS coordinates and photo evidence.
3. **Data Security & Privacy:**
   - Explicitly cite the PostgreSQL Row Level Security (RLS) policies and the server-side RPC encapsulation (`submit_incident`, `my_report_review`) that enforce Republic Act No. 10173 (Data Privacy Act of 2012).
   - Document that reporter contact numbers are stored securely in backend tables and only exposed to authorized personnel with communication officer or administrator privileges.
4. **AI Ethics & Human-in-the-Loop Design:**
   - Document the critical architectural decision to mandate human-in-the-loop verification. The system explicitly separates AI predictive suggestions from administrative responder dispatch, ensuring community safety is governed by trained personnel rather than autonomous algorithm execution.
