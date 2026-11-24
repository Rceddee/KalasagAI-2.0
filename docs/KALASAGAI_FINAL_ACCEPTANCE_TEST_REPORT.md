# KALASAGAI 2.0 — FINAL EVIDENCE RECONCILIATION AND ACCEPTANCE TEST REPORT

**Latest web acceptance · November 25, 2026.** See the [current web release report](KALASAGAI_WEB_RELEASE_REPORT.md) for release `1395b08`, including hosted Chrome fixture tests, a read-only live check, CI database results, and outstanding live workflows. The counts below belong to the November 23 audit.


> **Historical snapshot — 2026-11-24:** This report predates removal of the native Resident Android project and its active build/distribution wiring. Android paths and test results describe the earlier implementation; Resident Web is the current resident client.

**Report date:** 2026-11-23  
**Verification session:** Evidence Reconciliation (Tasks 1–10)  
**Development Supabase project:** `ydyawyqhvdlllqrtuxko` (kalasagai-dev)  
**Protected production project:** `fpfvouirptlkvzjsobfz` — not accessed during this report's 2026-11-23 verification

> [!CAUTION]
> This report supersedes all previous acceptance test reports. Prior reports double-counted tests (claiming 20 "AI dispatch database-level" tests separately from the 20 PGlite runtime tests — these are **the same execution**). Prior reports also described the pgTAP test suite as "verified" in senses that implied execution; it was **not executed** due to unavailability of Docker and local Supabase CLI. This report distinguishes all suites accurately.

---

## 1. TEST EVIDENCE RECONCILIATION — EXACT COUNTS, NO DOUBLE COUNTING

### 1.1 Web Application Tests (`npm test`) — 33 tests executed

All 33 tests PASSED. These are the **complete exact test names** as reported by the test runner.

#### `@kalasag/shared-validation` — 10 tests

| # | Test Name | What It Exercises |
|---|---|---|
| 1 | normalizes Philippine mobile numbers and rejects unsupported formats | `normalizePhilippineMobile()` with valid/invalid inputs |
| 2 | validates meaningful incident descriptions and real coordinate ranges | `validateIncidentDescription()`, `validateIncidentLocation()`, `validateIncidentLocationLabel()` |
| 3 | enforces evidence type and size limits | `validateEvidenceFile()` MIME type and byte-size enforcement |
| 4 | allows only forward incident status transitions | `canTransitionIncidentStatus()` forward-only state machine |
| 5 | ordinary resident cannot acquire personnel or Super Admin privileges | `canManagePersonnelRole()` — resident/null actor blocked |
| 6 | personnel cannot escalate their own role | `canManagePersonnelRole()` self-change guard |
| 7 | standard admin cannot promote to admin or super_admin | `canManagePersonnelRole()` privilege ceiling for admins |
| 8 | super admin can manage responder and communication officer roles | `canManagePersonnelRole()` — super_admin allowed |
| 9 | bootstrap eligibility strictly enforces one-time execution and trusted claims | `validateBootstrapEligibility()` — email, app_metadata, super-admin count |
| 10 | preserves mandatory contact number validation for registration | `normalizePhilippineMobile()` for specific known numbers |

**Nature:** All 10 tests execute actual TypeScript functions imported from `packages/shared-validation/src/index.ts`. They are not source inspections.

#### `@kalasag/personnel-web` — 11 tests

| # | Test Name | What It Exercises |
|---|---|---|
| 1 | AI accuracy is unavailable without records containing both categories | `calculateAiAccuracy([])` → `null`; partial records → `null` |
| 2 | AI accuracy uses only fully reviewed suggestions | `calculateAiAccuracy()` with mixed reviewed/unreviewed |
| 3 | category statistics keep road accidents, obstructions and unclassified reports separate | `getAnalyticsCategory()` discriminates road categories |
| 4 | personnel-side local estimates do not claim a responder was dispatched | `classifyWithSmartNLP()` — reasoning text does not contain dispatch words |
| 5 | incident date filters use the displayed Philippine calendar date | `manilaDateKey()` UTC→Asia/Manila calendar date conversion |
| 6 | Module 1 (Maps & Reports): category filter covers all six operational categories | Six `IncidentCategory` literals checked; `validateIncidentLocation()` range |
| 7 | Module 1 (Maps & Reports): status transitions strictly adhere to forward lifecycle | `canTransitionIncidentStatus()` valid/invalid matrix |
| 8 | Module 3 (Analytics): calculates accuracy only from reviewed suggestions | Inline `computeAiAccuracy()` logic with mixed data |
| 9 | Module 4 (AI Volume & Surge): surge threshold comparison and advisory state | Inline `evaluateSurgeMode()` threshold math |
| 10 | Module 5 (Activity Logs): distinguishes user, staff, and system-generated events | Audit log entry shape; `actor_id === null && source === 'automatic_dispatch'` |
| 11 | Module 6 (Admin Controls): role management boundaries between Admin and Super Admin | `canManagePersonnelRole()` — 10 boundary checks for admin and super_admin |

**Nature:** Tests 1–5 import and call real production library functions. Tests 6–11 (modules-verification.test.ts) import shared-validation functions and test inline data models representing module behaviors. They do **not** render React components or connect to Supabase.

#### `@kalasag/resident-web` — 12 tests

| # | Test Name | What It Exercises |
|---|---|---|
| 1 | identifies rejected resident sessions | `isInvalidAuthSessionError()` — 401 and token-not-found error codes |
| 2 | does not treat network or unrelated auth errors as expired sessions | `isInvalidAuthSessionError()` — TypeError, 503, non-auth 400 |
| 3 | local screening estimates never claim responders were dispatched | `classifyWithSmartNLP()` — reasoning does not claim dispatch |
| 4 | submission confirmation distinguishes receipt, review, and dispatch status | `REPORT_SUBMISSION_STATUS_MESSAGE` constant text assertions |
| 5 | evidence object paths remain stable for an idempotency key | `getIncidentEvidenceStoragePath()` deterministic path output |
| 6 | only definite database rejections permit evidence cleanup | `isDefinitiveSubmissionFailure()` — Postgres error codes |
| 7 | Resident Registration: normalizes valid Philippine mobile numbers and rejects invalid | `normalizePhilippineMobile()` with spaces, dashes, +63 prefix |
| 8 | Incident Reporting: validates required fields, description length, and coordinates | `validateIncidentDescription()`, `validateIncidentLocationLabel()`, `validateIncidentLocation()` |
| 9 | Photo Evidence: enforces allowed MIME types and file size boundaries | `validateEvidenceFile()` type/size error codes |
| 10 | Submission Retry: preserves idempotency key across retry attempts | Idempotency key string equality; evidence path contains key |
| 11 | Review Summary: correctly parses confirmed category and priority without exposing staff notes | Typed RPC response shape; `'note' in sampleRpcResponse === false` |
| 12 | Resident UX: messaging explicitly clarifies that report receipt is not dispatch confirmation | `statusLabels.pending` matches `/Pending Personnel Review/`; rejects `/Dispatched/` |

**Nature:** Tests 1–6 import and call real Resident Web library functions. Tests 7–12 (workflows-verification.test.ts) import shared-validation functions and test inline model behaviors. They do **not** render components or connect to Supabase.

---

### 1.2 PGlite Migration and Runtime Tests — 7 migrations + 20 functional assertions

**Script:** `scripts/test-migrations-local.mjs`  
**Engine:** `@electric-sql/pglite` (PostgreSQL 16 WASM) — isolated, in-memory, no network  
**Supabase-specific mocks:** `auth.uid()`, `auth.role()`, `vault.create_secret()`, `vault.decrypted_secrets`, `storage.foldername()`, `storage.filename()`, `extensions.hmac()`, `extensions.http_post()`, `cron.job`, `_http_response` — all implemented as SQL stubs

**7 migrations applied successfully in timestamp order:**

| # | File | Result |
|---|---|---|
| 1 | `20261111131506_kalasagai_core.sql` | SUCCESS |
| 2 | `20261112190912_auto_classify_new_incidents.sql` | SUCCESS |
| 3 | `20261112191920_move_pg_net_to_extensions.sql` | SUCCESS |
| 4 | `20261120120740_add_incident_priorities.sql` | SUCCESS |
| 5 | `20261120144634_allow_personnel_to_submit_incidents.sql` | SUCCESS |
| 6 | `20261122165250_secure_ai_classification_dispatch.sql` | SUCCESS |
| 7 | `20261122174025_resident_review_summary.sql` | SUCCESS |

**20 functional runtime assertions (all PASSED):**

| # | Assertion / [PASS] Label | What It Proves |
|---|---|---|
| 1 | Resident user seeded, profile trigger fired | `AFTER INSERT ON auth.users` trigger creates `profiles` row |
| 2 | Profile created automatically: Test Resident (resident) | Profile role derived from `raw_app_meta_data`, not user metadata |
| 3 | Vault secrets created | `vault.create_secret()` mock works; Vault API compatible |
| 4 | Incident created with automatic incident_creation trigger | `submit_incident`-equivalent INSERT fires trigger chain |
| 5 | Status history record: pending - "Report submitted" | `incident_status_history` row auto-created on INSERT |
| 6 | Audit log recorded: incident.submitted with details: `{"reference":"KAL-TEST-000001"}` | `audit_logs` row written by trigger with correct action+details |
| 7 | AI Job state: status=queued, attempts=0, dispatch_attempts=0, request_id=null | `ai_jobs` row queued; initial dispatch state correct |
| 8 | claim_ai_job_delivery result: true | `claim_ai_job_delivery()` RPC atomically claims an unclaimed job |
| 9 | Duplicate claim rejected: true | Second claim on same job returns false |
| 10 | AI assessment recorded: category=fire, priority=high | `record_claimed_ai_assessment()` creates `ai_assessments` row |
| 11 | AI Job status updated to: complete | Job status transitions to complete after assessment |
| 12 | Idempotent assessment returns original: category=fire | Second call with different category returns original `fire` |
| 13 | Classification review confirmed: category=fire, priority=high | `review_incident_classification()` creates `classification_reviews` row |
| 14 | my_report_review returns confirmed category to resident: fire, priority=high | `my_report_review()` RPC (migration 7) returns reviewed data to resident |
| 15 | Status transitioned to: in_progress | `update_incident_status()` RPC enforces forward transition |
| 16 | Stale processing job recovered count: 1, new status: failed (processing_timeout) | `recover_stale_ai_jobs()` resets jobs stuck in `processing` >10 min |
| 17 | Exhausted job capped after 5 attempts: status=failed, error=dispatch_exhausted | `process_ai_job_dispatches()` stops at 5 dispatch_attempts |
| 18 | Reconciled HTTP response: HTTP 401 → error_code=http_401 | `process_ai_job_dispatches()` reads `_http_response` and sets error codes |
| 19 | Automated AI assessment audit attribution: actor_id=null, source=automatic_dispatch | AI audit row has null actor and automatic_dispatch source |
| 20 | Incident operational status remains untouched by AI: status=pending | AI classification never modifies `incidents.status` |

> [!IMPORTANT]
> These 20 assertions are **not the same** as the pgTAP 30-assertion `kalasagai_ai_dispatch_test.sql`. They are a separate Node.js-driven execution using PGlite. The pgTAP suite was **not executed** (see §1.3).

---

### 1.3 pgTAP Test Suites — NOT EXECUTED (statically audited only)

**Reason:** Docker Desktop is unavailable on this Windows environment. `supabase start` requires Docker to launch a local PostgreSQL container with the `pgtap` extension. Without it, the SQL cannot run.

**Suites in `supabase/tests/`:**

| File | Plan | Status |
|---|---|---|
| `kalasagai_ai_dispatch_test.sql` | `SELECT plan(30)` → 30 assertions | ❌ NOT executed — requires Docker+Supabase CLI |
| `kalasagai_bootstrap_security_test.sql` | Not checked | ❌ NOT executed |
| `kalasagai_personnel_reporting_test.sql` | Not checked | ❌ NOT executed |
| `kalasagai_report_lifecycle_test.sql` | Not checked | ❌ NOT executed |
| `kalasagai_security_test.sql` | Not checked | ❌ NOT executed |
| `kalasagai_storage_security_test.sql` | Not checked | ❌ NOT executed |

**What static audit of `kalasagai_ai_dispatch_test.sql` confirmed (not execution):** The file contains 30 `SELECT ok(...)` / `SELECT is(...)` assertions in a `BEGIN...ROLLBACK` transaction. The assertions cover: private function access control, Vault secret inaccessibility, dispatch request creation, anon JWT in gateway, HMAC signature verification, timeout error codes, stale job recovery, duplicate claim prevention, idempotent assessment, audit attribution, operational status preservation, mandatory personnel review, delivery claim/fail lifecycle, and publishable key rejection. The SQL was read and verified to be syntactically coherent; it was **not executed**.

---

### 1.4 Deno Edge Function Tests — 6 Deno.test cases, 7 test steps

**Command:** `npx -y deno test --allow-env --allow-net supabase\functions\`  
**Result:** `ok | 6 passed (7 steps) | 0 failed`

| File | Deno.test name | Steps | What It Exercises |
|---|---|---|---|
| `classify-incident/dispatch_test.ts` | authenticated AI dispatch uses mocks and preserves job authorization | 7 (sub-steps) | HMAC dispatch authentication, missing secret → 503, wrong/expired sig → 401, duplicate claim → 409, unauthorized role → 403, claim+provider network failures → 503/502 |
| `classify-incident/index_test.ts` | classification stores only a server-side suggestion for authorized personnel | — | Full classify-incident handler: roles, Decisions API, generateContent fallback, legacy GEMINI_MODEL fallback, GEMINI_ENABLED=false, provider retries, oversized/missing evidence |
| `manage-personnel/index_test.ts` | inviting personnel assigns the profile role before sending the invitation | — | Invite success, role assigned before email sent |
| `manage-personnel/index_test.ts` | failed personnel role assignment rolls back the uninvited account | — | Role assignment failure → account deletion, no invitation email |
| `manage-personnel/index_test.ts` | duplicate personnel email returns a specific conflict | — | 422 from Auth API → 409 response, no role assignment |
| `manage-personnel/index_test.ts` | unexpected account creation errors return a service failure | — | 500 from Auth API → 503 response |

**Nature:** All tests use `globalThis.fetch` mock — no live Supabase, Gemini, or Auth calls. All environment variables are test-only values. No live inference occurred.

---

### 1.5 Android Unit Tests — 9 tests

**Command:** `.\gradlew testDebugUnitTest` — BUILD SUCCESSFUL  

| Test Class | @Test count | Test Names (by annotation scan) |
|---|---|---|
| `IncidentMapCategoryTest` | 1 | Road accident category included in map filter |
| `PhilippineMobileNumberTest` | 2 | Valid 09xx format accepted; non-09x/short/long rejected |
| `ResidentSessionStateTest` | 6 | Session state isolation, transitions, and background processing behavior |

**Nature:** Pure Kotlin unit tests run on JVM — no emulator, no network, no Supabase connection required.

---

### 1.6 Previously Double-Counted Tests — CORRECTED

Previous reports listed both "20 AI dispatch database-level tests" and "20 PGlite functional runtime tests" as if they were separate suites totaling 40. **They are the same 20 assertions** run in one `node scripts/test-migrations-local.mjs` execution.

Previous reports also listed "79 total tests" (33 + 20 migration + 20 AI dispatch + 6 Deno). The correct total without double counting is:

| Suite | Count |
|---|---|
| npm test (web) | 33 |
| PGlite migration + functional runtime | 20 (not separate from "AI dispatch DB tests") |
| Deno Edge Function tests | 6 |
| Android unit tests | 9 |
| **TOTAL (no duplicates)** | **68** |

The pgTAP 30-assertion suite was not executed and must not be counted.

---

## 2. SECURE AI DISPATCH AUTHENTICATION — RECONCILED DESIGN

### 2.1 Conflicting Claims in Previous Reports — Resolved

Previous reports used inconsistent terminology. This section states the implemented design exactly as it exists in the current source.

### 2.2 The Implemented Authentication Design

**Database → Edge Function (dispatch leg):**

1. After incident INSERT, `app_private.dispatch_ai_classification(incident_id)` runs (as a trigger).
2. It reads three Vault secrets: `kalasagai_ai_dispatch_project_url`, `kalasagai_ai_dispatch_anon_jwt`, `kalasagai_ai_dispatch_hmac_key`.
3. If any secret is missing, the job is left `queued` with `last_dispatch_error_code = 'missing_dispatch_configuration'` — no HTTP request is made.
4. The anon JWT value in the Vault secret **must be a true JWT** (starting with `eyJ`). If it is a publishable key (starting with `sb_`), the request is rejected locally without making an HTTP call. See pgTAP assertion #30 and migration source.
5. It calls `extensions.hmac(timestamp || '.' || incident_id, hmac_key, 'sha256')` to produce a 32-byte HMAC-SHA256.
6. It calls `extensions.http_post(url, body, {}, {apikey: anon_jwt, Authorization: 'Bearer ' + anon_jwt, x-kalasag-dispatch-timestamp: ts, x-kalasag-dispatch-signature: hex(hmac)}, timeout)`.
7. The `pg_net` request ID is stored in `ai_jobs.last_dispatch_request_id`.

**Edge Function → Supabase gateway (inbound leg):**

8. The gateway enforces `verify_jwt=true` on `classify-incident`. The request's `Authorization: Bearer <anon_jwt>` must be a valid Supabase-issued JWT. The anon JWT (not a publishable key) satisfies this.
9. The Edge Function handler (`handleRequest` in `classify-incident/index.ts`) extracts `x-kalasag-dispatch-timestamp` and `x-kalasag-dispatch-signature` headers.
10. It reads `AI_DISPATCH_HMAC_KEY` from its server-side environment (Supabase Edge secret).
11. It validates: (a) HMAC_KEY must be present (else 503), (b) `Authorization` header must be present (else 401), (c) timestamp must be within ±300 seconds (else 401), (d) HMAC-SHA256(timestamp + '.' + incidentId, key) must match the provided signature (else 401).
12. Only after HMAC validation does the function use its `SUPABASE_SECRET_KEY` to claim the job, fetch evidence, call Gemini, and record the assessment.

**Key distinction:** The anon JWT satisfies the platform `verify_jwt=true` gate. The HMAC is the actual dispatch authentication — proving the request came from this database's trigger, bound to this specific incident at this timestamp.

### 2.3 "Publishable Key" References in Prior Reports — Clarified

A prior report stated the publishable key (`sb_publishable_...`) "passes the enabled verify_jwt platform check." This was **incorrect and has been corrected**. The pgTAP test at line 388–394 explicitly verifies that a publishable key causes `last_dispatch_request_id IS NULL AND last_dispatch_error_code='missing_dispatch_configuration'`, meaning the database-side code rejects it **before** making an HTTP request. Only a proper JWT (starting with `eyJ`) is sent. The anon JWT from the Vault secret is what goes in both `apikey` and `Authorization`.

### 2.4 Development Dispatch Failure (Known Blocker)

The development project `ydyawyqhvdlllqrtuxko` has the **pre-HMAC migration** applied (5 migrations as of last read-only check). The new migrations (`20261122165250`, `20261122174025`) are **not** applied to the hosted dev project. The existing queued job (`KAL-20261122-000004`) was created before the HMAC migration. Applying the new migration and provisioning Vault secrets will auto-dispatch this job. This requires separate owner authorization.

---

## 3. PERSONNEL WEB MODULE VERIFICATION

### 3.1 Module Coverage

All six official modules are present and verified at the source level. Tests exercise real library functions used by each module.

| Module | Source File | Tests Covering | Nature of Test |
|---|---|---|---|
| Maps & Reports | `dashboard/page.tsx` | Tests 6–7 (modules-verification) | Category enum, status transitions via shared-validation |
| Incident Blotters | `dashboard/blotters/[id]/page.tsx` | Test 7 (status transitions) | Status machine validation |
| Analytics & Reports | `lib/analytics.ts` | Tests 1–3 (analytics.test.ts) + Test 8 (modules-verification) | Real `calculateAiAccuracy()` and `getAnalyticsCategory()` |
| AI Volume & Surge | `dashboard/surge/page.tsx` | Test 9 (modules-verification) | Surge threshold math |
| Activity Logs | `dashboard/activity/page.tsx` | Test 10 (modules-verification) | Audit log shape, null-actor detection |
| Admin Controls | `dashboard/admin/page.tsx` | Test 11 (modules-verification) | `canManagePersonnelRole()` 10 boundary cases |

### 3.2 What Module Tests Do and Do Not Cover

**Covered:** Library function behavior (accuracy calculation, status transitions, role management, surge math, dispatch wording safety), all 6 incident categories, forward-only status state machine, audit log attribution shape, role privilege boundaries.

**Not covered by automated tests:** React component rendering, Supabase API calls, Realtime subscription lifecycle, blotter PDF binary output, signed URL generation, or live data display — these require a running Supabase project and browser environment.

---

## 4. RESIDENT WEB WORKFLOW VERIFICATION

### 4.1 Workflow Coverage

| Workflow | Covered By | Nature |
|---|---|---|
| Session management (valid/expired/network errors) | Tests 1–2 (auth-session.test.ts) | Real `isInvalidAuthSessionError()` |
| Local incident classification wording safety | Tests 3–4 (classifier-safety.test.ts) | Real `classifyWithSmartNLP()` + `REPORT_SUBMISSION_STATUS_MESSAGE` |
| Evidence storage path idempotency | Test 5 (report-submission.test.ts) | Real `getIncidentEvidenceStoragePath()` |
| Submission failure classification | Test 6 (report-submission.test.ts) | Real `isDefinitiveSubmissionFailure()` |
| Mobile number normalization | Tests 7, 10 (shared-validation) | Real `normalizePhilippineMobile()` |
| Field validation | Test 8 (workflows-verification) | Real `validateIncidentDescription()`, etc. |
| Evidence file validation | Test 9 (workflows-verification) | Real `validateEvidenceFile()` |
| Retry idempotency key preservation | Test 10 (workflows-verification) | Key equality, path string pattern |
| Review summary shape | Test 11 (workflows-verification) | Typed shape, no `note` field leak |
| UX messaging accuracy | Test 12 (workflows-verification) | Status label text assertions |

### 4.2 What Is Not Covered

Actual form submission to Supabase, evidence file upload to Storage, authenticated session lifecycle, real-time status updates, iOS browser layout rendering — none of these are covered by local tests.

---

## 5. NATIVE ANDROID VERIFICATION

### 5.1 Unit Tests (9/9 PASSED)

| Class | Test | Behavior Verified |
|---|---|---|
| `IncidentMapCategoryTest` | 1 | `road_accident` category included in map filter — not filtered out |
| `PhilippineMobileNumberTest` | 2 | `0917...` → `+63917...`; `0818...` / too short / too long → null |
| `ResidentSessionStateTest` | 6 | Session isolation between users; state transition correctness; background photo processing isolation |

### 5.2 Build and Emulator Verification

| Step | Evidence | Result |
|---|---|---|
| `.\gradlew lintDebug` | BUILD SUCCESSFUL (19s) | ✅ 0 lint errors |
| `.\gradlew assembleDebug` | BUILD SUCCESSFUL, `app-debug.apk` produced | ✅ |
| `adb devices` | `emulator-5554 device` (Pixel_6a online) | ✅ |
| APK install | `adb install -r app-debug.apk` → Success | ✅ (prior session) |
| App launch | `adb shell am start -n org.kalasagai.resident/.MainActivity` | ✅ (prior session) |
| Emulator screenshots | Sign In screen, Registration screen, form filled, checkbox checked | ✅ (prior session) |

### 5.3 What Is Not Verified for Android

- End-to-end authenticated incident submission to Supabase
- Camera/gallery photo picker (requires physical interaction or instrumentation test)
- Connected instrumentation test run (`gradlew connectedAndroidTest`)
- Map tile display and marker behavior in live OpenStreetMap
- Supabase Realtime subscription on the device

---

## 6. DATABASE TESTING — WHAT WAS AND WAS NOT VERIFIED

### 6.1 Verified in PGlite (Isolated Execution)

| Feature | Verified |
|---|---|
| All 7 migration files apply without error | ✅ |
| Profile auto-creation trigger | ✅ |
| AI job enqueue on incident creation | ✅ |
| Status history creation | ✅ |
| Audit log on submission | ✅ |
| Atomic job claim (`claim_ai_job_delivery`) | ✅ |
| Duplicate claim rejection | ✅ |
| Idempotent assessment recording | ✅ |
| Classification review (`review_incident_classification`) | ✅ |
| Resident review summary (`my_report_review`) — migration 7 | ✅ |
| Status transition (`update_incident_status`, pending → in_progress) | ✅ |
| Stale processing job recovery (`recover_stale_ai_jobs`) | ✅ |
| Dispatch exhaustion cap (5 attempts) | ✅ |
| HTTP response reconciliation (401 → error_code) | ✅ |
| AI audit with null actor + automatic_dispatch | ✅ |
| AI does not alter operational status | ✅ |

### 6.2 NOT Verified (pgTAP not executed)

| Feature | Why Not Verified |
|---|---|
| `app_private` function access control (anon/authenticated cannot execute) | pgTAP not run — Docker unavailable |
| Vault secret inaccessibility by API roles | pgTAP not run |
| HMAC signature correctness in pg_net request | pgTAP not run |
| Anon JWT in gateway headers | pgTAP not run |
| Publishable key → rejected locally | pgTAP not run |
| `claim_ai_job` service-role-only execution | pgTAP not run |
| Obsolete worker token rejection | pgTAP not run |
| RLS policies on incidents, profiles, photos, ai_assessments | pgTAP not run |
| Storage security policies | pgTAP not run |
| Bootstrap security (single-use, app_metadata check) | pgTAP not run |
| Hosted schema compatibility with new migrations | Migrations not applied to hosted dev |

### 6.3 PGlite Limitations

- `storage.foldername()` and `storage.filename()` are mocked; RLS policies that call these in Storage context are not fully executed
- `extensions.hmac()` is mocked as `sha256(key || data)` — not the actual pgcrypto HMAC; dispatch signature values in PGlite tests are not cryptographically equivalent to hosted
- `extensions.http_post()` is mocked to return a fixed ID; no real HTTP request is made
- `cron.job` is a mock table; `pg_cron` scheduling is not tested
- `vault.decrypted_secrets` is a plain view in PGlite; Vault encryption is not exercised

---

## 7. CROSS-APPLICATION LIFECYCLE — WHAT ACTUALLY EXECUTES VS. WHAT IS MOCKED

### 7.1 Steps That Actually Executed (PGlite)

```
Resident submits incident (direct INSERT into incidents table)
  ✅ Profile auto-create trigger fires
  ✅ Incident status_history created (pending, "Report submitted")
  ✅ Audit log written (incident.submitted)
  ✅ ai_jobs row created (queued)
  ✅ Vault secrets read in dispatch function (mocked HMAC computed)
  ✅ http_post called (mocked — returns fixed request ID)
  ✅ claim_ai_job_delivery atomically claims job
  ✅ record_claimed_ai_assessment creates ai_assessments row (fire/high)
  ✅ ai_jobs status → complete
  ✅ Idempotency: second assessment call returns original (fire)
  ✅ review_incident_classification creates classification_reviews row
  ✅ my_report_review returns confirmed data to resident JWT session
  ✅ update_incident_status advances to in_progress
  ✅ recover_stale_ai_jobs resets processing-timeout jobs
  ✅ process_ai_job_dispatches enforces 5-attempt cap
  ✅ HTTP response reconciliation (401 → http_401 error code)
  ✅ Audit: AI assessment attributed to system (null actor)
  ✅ AI: operational status not modified
```

### 7.2 Steps That Were Mocked

- `extensions.hmac()` — computed locally with `sha256(key||data)`, not pgcrypto
- `extensions.http_post()` — returned a fixed ID, no real network request
- RLS policies — PGlite does not enforce Postgres RLS in the same way as a hosted instance

### 7.3 Steps That Were NOT Tested

- Resident Web form → Supabase RPC → response (not tested against hosted or local Supabase)
- Personnel Web Realtime subscription → new incident appears in dashboard
- Android app → Supabase → incident created
- Invitation email delivery
- Signed URL generation for private evidence
- End-to-end AI classification against live Gemini API

---

## 8. DOCUMENTATION CORRECTIONS MADE

The following inaccuracies in `docs/KALASAGAI_CURRENT_SYSTEM_STATUS.md` and the prior `docs/KALASAGAI_FINAL_ACCEPTANCE_TEST_REPORT.md` are corrected by this report:

| Previous Claim | Correction |
|---|---|
| "20/20 database-level tests PASSED" (separate from PGlite 20) | These are the **same 20 PGlite assertions** — not a separate suite |
| "79 total tests" (33+20+20+6) | Correct total without double-counting: **68** (33+20+6+9) |
| "pgTAP test assertions statically verified (30/30)" | pgTAP was **not executed** — only read and confirmed syntactically coherent |
| "publishable key passes the enabled verify_jwt platform check" | Incorrect — publishable key (`sb_...`) is **rejected by the database dispatcher** before making any HTTP call; only a JWT (`eyJ...`) is sent |
| "Deno is unavailable" (prior session note) | Deno is available via `npx -y deno`; this was resolved in the second session |
| "Database migrations were not locally executed" | Now corrected — PGlite executes them (with extension mocks) |
| "100% complete" | No claim of 100% is made — unverified items documented in §6.2, §7.3 |

> [!NOTE]
> `docs/KALASAGAI_CURRENT_SYSTEM_STATUS.md` test count was updated in the previous session (21→33). This report supersedes the previous `FINAL_ACCEPTANCE_TEST_REPORT.md` without deleting it; the previous file is preserved as historical evidence.

---

## 9. FINAL VALIDATION RESULTS

All applicable local test commands run in this session:

| Command | Result | Detail |
|---|---|---|
| `npm test` | ✅ 33/33 PASSED | 10 shared-validation + 11 personnel-web + 12 resident-web |
| `npm run lint` | ✅ 0 errors, 0 warnings | All web workspaces |
| `npm run typecheck` | ✅ 0 errors | All web workspaces |
| `npm run build` | ✅ SUCCESSFUL | Personnel: 14/14 static routes; Resident: 15/15 static routes |
| `npm audit` | ✅ 0 vulnerabilities | — |
| `npx -y deno test` | ✅ 6 passed (7 steps), 0 failed | 3 test files |
| `npx -y deno check` | ✅ 0 errors | `classify-incident/index.ts`, `manage-personnel/index.ts` |
| `node scripts/test-migrations-local.mjs` | ✅ 7 migrations + 20 assertions PASSED | PGlite isolated PostgreSQL 16 |
| `.\gradlew testDebugUnitTest` | ✅ BUILD SUCCESSFUL, 9/9 @Test methods | 3 test classes |
| `.\gradlew lintDebug assembleDebug` | ✅ BUILD SUCCESSFUL | `app-debug.apk` produced |
| `adb devices` | ✅ `emulator-5554 device` | Pixel_6a online |
| `supabase start` / pgTAP | ❌ BLOCKED | Docker Desktop not installed |

---

## 10. OUTSTANDING AUTHORIZATION BOUNDARIES

| Blocker | Priority | Required Before |
|---|---|---|
| Apply migrations `20261122165250` + `20261122174025` to `ydyawyqhvdlllqrtuxko` | **P1** | AI dispatch works in development |
| Provision `kalasagai_ai_dispatch_project_url`, `kalasagai_ai_dispatch_anon_jwt`, `kalasagai_ai_dispatch_hmac_key` in hosted Vault | **P1** | AI dispatch works in development |
| Redeploy `classify-incident` with HMAC support | **P1** | AI dispatch works in development |
| Authorize replay of queued job `KAL-20261122-000004` and any paid Gemini inference | **P1** | First real AI classification in dev |
| Production infrastructure (Supabase project, Auth/SMTP, domain, CDN) | **P1** | Public launch |
| Android release signing configuration | **P1** | Store publication |
| Bootstrap teardown (`teardown-bootstrap-procedure.sql`) | **P2** | Development cleanup |
| Install Docker Desktop and run pgTAP suites | **P2** | Full database security verification |
| Connected Android instrumentation tests | **P2** | Full end-to-end Android verification |
| Email delivery test (invitation + password reset) | **P2** | Personnel onboarding verification |
| End-to-end Resident Web submission against local/isolated Supabase | **P2** | Full web E2E verification |

---

## 11. REMAINING DEFECTS

No new defects were found in this session. The following are known and documented:

| Issue | Severity | Status |
|---|---|---|
| Dispatch trigger requires `request.headers` credentials in pre-HMAC migration — fails silently for the queued job | P1 | Corrected in local migration 6; not yet deployed to hosted dev |
| PGlite HMAC mock (`sha256(key||data)`) is not identical to pgcrypto `hmac()` | P2 | Known — only affects local testing accuracy of HMAC value, not dispatch logic flow |
| Resident Web pending submission not restored after page reload (evidence may remain unattached) | P2 | Known — no fix applied in this session |
| README "no cloud development project is linked" is stale | P3 | Documented; fix deferred to production readiness prep |

---

## 12. EVIDENCE-BASED RELEASE DECISION

### Local Development: COMPLETE ✅

All locally executable tests pass. No defects found in source that have not been documented. All official modules present and logically verified. Android builds, installs, and launches on emulator. Production web builds generate all static routes. Deno Edge Function tests pass. PGlite migration tests confirm schema applies cleanly with all runtime behaviors correct.

### Development Environment: INCOMPLETE ⚠️

The two new migrations have not been applied to the hosted `ydyawyqhvdlllqrtuxko` development project. AI dispatch remains broken in that environment. Vault secrets are not provisioned. The existing queued job has zero attempts and no assessment.

### Production: NO-GO ⛔

**Correction from read-only reconciliation on 2026-11-24:** A production Supabase project exists and is active. Its eight migration versions do not overlap the eight migrations in this checkout, and its legacy schema and `analyze-incident` function do not match the development application. No production deployment or database/configuration change was made. Production web hosting/domains, release signing, full pgTAP security verification, email delivery, end-to-end submission, Realtime, and Android authenticated submission remain unverified. The project is still NO-GO until a data-preserving compatibility migration is rehearsed and release gates are approved.

---

**KalasagAI 2.0 — AI-assisted emergency incident reporting for Poblacion, Gumaca, Quezon**  
*Report generated: 2026-11-23*
