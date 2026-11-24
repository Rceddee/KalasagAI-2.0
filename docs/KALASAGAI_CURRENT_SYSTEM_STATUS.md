# KALASAGAI 2.0 — Current System Status

**Web status · November 25, 2026.** Resident Web and Personnel Web are deployed at release `1395b08` using the development backend. Public sign-in, staff role gates, and the resident receipt were verified. The capstone is ready for demonstration. Operational production cutover remains separately gated. [Current release evidence](KALASAGAI_WEB_RELEASE_REPORT.md) · [Feature inventory](KALASAGAI_FINAL_SYSTEM_SCOPE.md#current-web-features)

## Earlier audit record


**Audit date:** 2026-11-22; **System Acceptance & Final Quality Assurance:** 2026-11-23  
**Decision:** **Development acceptance remains complete; production deployment is NO-GO after the 2026-11-24 read-only reconciliation.** The existing production Supabase project is active, but its recorded migrations, schema, and Edge Functions do not match this checkout. No production changes were made.  
The 2026-11-23 acceptance run reported 134 automated checks across web, Deno Edge Functions, local PostgreSQL migrations, cross-application integration, and Native Android. Its results describe development acceptance only and do not establish production readiness. Full historical evidence is documented in [KALASAGAI_APPLICATION_ACCEPTANCE_REPORT.md](KALASAGAI_APPLICATION_ACCEPTANCE_REPORT.md) and [KALASAGAI_LIVE_GEMINI_ACCEPTANCE_REPORT.md](KALASAGAI_LIVE_GEMINI_ACCEPTANCE_REPORT.md).

> **Scope update — 2026-11-24:** At the project owner's request, the native Resident Android project and its active build, CI, login-guide, and APK-download integrations were removed. The current resident client is Resident Web. Android statements and source links below describe the pre-removal implementation and are historical, not current build instructions. The emulator app and its saved data were left untouched. See the [current web release report](KALASAGAI_WEB_RELEASE_REPORT.md).

## Current Personnel Web navigation — 2026-11-24

The sidebar exposes five role-filtered links: Maps and Reports, Incident Blotters, Analytics & Reports, Activity Logs, and Admin Controls. Activity Logs is shown to communication officers, admins, and super admins; Admin Controls is shown only to admins and super admins. The Admin Controls page contains the “AI usage and activity” section, including report-volume, surge-monitoring, and automatic-classification controls. `/dashboard/surge` redirects to that section; it is not a separate sidebar item. See [DashboardShell](../apps/personnel-web/src/components/DashboardShell.tsx), [Admin Controls](../apps/personnel-web/src/app/dashboard/admin/page.tsx), and [AI and activity controls](../apps/personnel-web/src/components/AIVolumeSurgeControls.tsx).

## Follow-up verification — 2026-11-23

This follow-up supersedes the older source findings below where noted. The current source and tests now:

- distinguish the local preliminary estimate, report receipt, personnel review, operational status, and responder dispatch;
- show AI accuracy as unavailable until there are reviewed suggestions;
- describe surge mode and the confidence threshold as settings/indicators only;
- provide manual status refresh in resident Web and Android instead of claiming live detail tracking;
- include the Android road-accident map filter;
- reuse a pending Resident Web submission's idempotency key and evidence path for same-page retries, checking for an existing object before retrying its upload; and
- generate isolated bootstrap test users, with CI installing the bootstrap routines only in its local database.

The one previously authorized synthetic Resident Web report was submitted to development on 2026-11-22; no additional report was created during this follow-up. Read-only verification found the incident still pending with one private evidence object. The database setting `gemini_enabled` remains `true`, but the AI job is queued with zero attempts and no assessment. The focused dispatch investigation and its evidence are recorded in section 21. No Gemini inference occurred, and the job was not replayed.

No production data or configuration was inspected or modified. No hosted settings or secrets were changed, and there was no deployment, push, or additional hosted mutation.

## 1. Executive conclusion

The original audit confirmed the development Supabase project and its recorded migrations/functions. The 2026-11-23 follow-up passed the workspace tests, lint, type checks, web production builds, Android unit/lint/build tasks, and dependency audit. Source-level wording and feature gaps identified in the original audit have since been corrected as described in the follow-up.

Operational acceptance was still incomplete at the 2026-11-23 follow-up: the one authorized synthetic Resident Web report remained pending, with a queued AI job and no assessment. A Postgres log confirmed the dispatch trigger had no request credentials, so no Gemini inference occurred for that report. Production was not inspected during that follow-up; the separate read-only 2026-11-24 production findings are in section 22.

## 2. Audit scope and safety

This section records the original repository audit and the 2026-11-23 follow-up. After separate user authorization on 2026-11-22, exactly one synthetic report and its private evidence object were created in the development project. Follow-up database checks were read-only. No production state was inspected during those audit sessions; the later 2026-11-24 production check was read-only and made no changes.

No Gemini inference, deployment, or push occurred. Actual phone numbers, emails, user identifiers, and credential values are intentionally omitted. The private evidence status for the authorized test report was verified directly; other Storage behavior was not exhaustively tested.

## 3. System architecture

The checkout contains Resident Web and Personnel Web (Next.js/TypeScript), Resident Android (native Kotlin/Jetpack Compose), shared validation, and Supabase migrations, RLS, Storage rules, Edge Functions, and pgTAP tests. The active application directories are listed in the [README](../README.md#L5).

Supabase is the shared auth/data layer. Incident submission is through a validated RPC; evidence is uploaded to Storage first. Incident creation queues classification work, while status changes and classification review are separate personnel actions. See the [core schema and RPC migration](../supabase/migrations/20261111131506_kalasagai_core.sql#L29), the [personnel-submission migration](../supabase/migrations/20261120144634_allow_personnel_to_submit_incidents.sql#L1), and the [AI dispatch migration](../supabase/migrations/20261112190912_auto_classify_new_incidents.sql#L120).

## 4. Technology versions

- Web: Next.js 16.4.6, React 19.2.4, Supabase JS 2.119.0, Supabase SSR 0.12.7, TypeScript 6.0.3 ([Personnel Web manifest](../apps/personnel-web/package.json#L13), [Resident Web manifest](../apps/resident-web/package.json#L13)).
- Android: AGP 8.13.2, Kotlin 2.3.21, compile/target SDK 36, minimum SDK 26, Supabase Kotlin 3.6.0, Ktor 3.4.3, OSMDroid 6.1.20 ([Android build configuration](../apps/resident-android/app/build.gradle.kts#L58)).
- CI is configured for Node 24, Deno 2.5.6, Supabase CLI 3.1.0, and Java 17 ([CI workflow](../.github/workflows/ci.yml#L15)).

## 5. Environment routing

The four ignored local environment files and the local Supabase CLI reference point to the development project; their values are withheld. The README documents that existing development project and clarifies that `project_id = "kalasagai"` is only the local CLI name. Production client credentials are not present in the committed environment examples.

The local Edge Function environment has `GEMINI_ENABLED=false`; its Gemini API key and model values are absent/blank. The development database setting was `gemini_enabled=true` at the earlier audit. Deployed Edge Function secrets were not inspected. The 2026-11-24 production check inspected schema/function/migration metadata only; it did not inspect production credentials, secrets, settings, Auth configuration, or records.

## 6. Read-only development-project observations

At audit time, the Supabase project named `kalasagai-dev` reported `ACTIVE_HEALTHY` and PostgreSQL 17.11. Its live settings were `gemini_enabled=true`, `surge_mode=false`, and `surge_threshold=90`. These are development observations only; they do not establish production readiness or that the Gemini provider can be reached.

## 7. Hosted migrations and Edge Functions

The development project reports all eight migration versions in this checkout. `classify-incident` and `manage-personnel` are active with JWT verification enabled (deployed versions 13 and 9 at the 2026-11-24 check).

The production project is also active, but its eight recorded migration versions do not overlap this checkout's eight versions. Its public schema uses legacy tables including `incident_reports`, `status_history`, `ai_analysis_jobs`, and `ai_analysis_attempts`; its listed Edge Function is `analyze-incident` v2. This checkout and development use `incidents`, `incident_status_history`, `app_private.ai_jobs`, `classify-incident`, and `manage-personnel`. Directly pushing this checkout's migration chain or deploying its functions to production is unsafe. No production migrations, functions, secrets, settings, or data were changed.

## 8. Initial Super Admin bootstrap and teardown

Both `public.bootstrap_initial_super_admin(uuid,text)` and `app_private.bootstrap_initial_super_admin(uuid,text)` exist in the development database. Read-only privilege checks showed no `anon` or `authenticated` execution and a `service_role` grant on the public wrapper. The installer uses a one-time guard, trusted app metadata, and an audit record ([bootstrap installer](../scripts/install-bootstrap-procedure.sql#L4), [public wrapper and grants](../scripts/install-bootstrap-procedure.sql#L106)).

**The prepared teardown has not completed successfully in development:** both routines are still present. Their current presence cannot distinguish “never attempted” from a failed or partial earlier attempt. The teardown script is explicitly scoped to development and says to wait for separate authorization ([teardown script](../scripts/teardown-bootstrap-procedure.sql#L1), [drop statements](../scripts/teardown-bootstrap-procedure.sql#L8)).

The installer is a standalone SQL script, not a migration. The pgTAP bootstrap test depends on these routines and on a pre-existing user fixture ([bootstrap test](../supabase/tests/kalasagai_bootstrap_security_test.sql#L1)). The user fixture values are intentionally not reproduced here. No user/profile data was queried, so this audit does not establish whether bootstrap was used or how many Super Admins currently exist.

## 9. Database model and incident lifecycle

The migrations define resident/personnel roles, six incident categories, four statuses, profiles, incidents, photos, status history, AI assessments, classification reviews, audit logs, settings, and private AI/contact tables ([core types and tables](../supabase/migrations/20261111131506_kalasagai_core.sql#L5), [priority migration](../supabase/migrations/20261120120740_add_incident_priorities.sql#L1)).

Status changes are forward-only: pending to in-progress or resolved, in-progress to resolved, and resolved to closed. The database RPC records status history and restricts status updates to authorized roles ([status RPC](../supabase/migrations/20261111131506_kalasagai_core.sql#L487)).

## 10. Authentication and authorization

Resident registration, sign-in, session restoration, sign-out, profile updates, and password recovery are present in the web and Android code. Profile creation derives personnel roles from trusted app metadata rather than user-editable profile metadata ([profile trigger](../supabase/migrations/20261111131506_kalasagai_core.sql#L207), [Resident Web auth provider](../apps/resident-web/src/components/AuthProvider.tsx#L28), [Android repository](../apps/resident-android/app/src/main/java/org/kalasagai/resident/data/SupabaseResidentRepository.kt#L28)).

Database RPCs enforce role checks for status, review, contact access, settings, and role assignment. The personnel Edge Function verifies the caller before using its server-side admin client and limits privileged invites to Super Admins ([role assignment](../supabase/migrations/20261111131506_kalasagai_core.sql#L752), [personnel function](../supabase/functions/manage-personnel/index.ts#L25)).

## 11. Resident Web

The resident workflow includes account/profile access, location selection, description entry, required photo evidence, report submission, report listing, and detail/history views. Submission validates the user, required contact, description, coordinates, location label, and photo before uploading and calling `submit_incident` ([report validation and submit](../apps/resident-web/src/app/report/page.tsx#L168), [upload and RPC](../apps/resident-web/src/app/report/page.tsx#L203)).

The immediate result is labeled a local preliminary estimate, distinct from operations AI and responder dispatch. The status copy explicitly says that submission does not confirm dispatch. Focused tests verify these distinctions.

## 12. Resident Android

The native app includes email auth, profile/report access, photo picker and camera capture, incident map/report location, report listing, and incident details ([Android report screen](../apps/resident-android/app/src/main/java/org/kalasagai/resident/ui/ResidentScreens.kt#L410), [Android repository](../apps/resident-android/app/src/main/java/org/kalasagai/resident/data/SupabaseResidentRepository.kt#L44)).

The map filter now includes all six incident categories, including `road_accident`. Incident details provide explicit status/history refresh rather than claiming live tracking. The debug app was installed and launched on Pixel_6a; connected instrumentation and authenticated journeys were not run in the follow-up.

## 13. Personnel Web

Personnel workflows include incident feed/map, blotters, detail views, status transitions, classification review, analytics, activity/audit log, and staff administration. Admin Controls invokes the real `manage-personnel` function and role-assignment RPC ([Admin Controls](../apps/personnel-web/src/app/dashboard/admin/page.tsx#L88)); the detail view subscribes to incident changes and provides status/review actions ([personnel incident detail](../apps/personnel-web/src/app/dashboard/blotters/%5Bid%5D/page.tsx#L156)).

The live project listing confirms that the personnel-management Edge Function is active. Invitation email delivery was not tested.

## 14. Evidence and Storage

Source migrations define `incident-evidence` as a private bucket, cap uploads at 10 MiB, allow JPEG/PNG/WebP, restrict upload paths to the authenticated user, and restrict reads to the owner or authorized personnel ([bucket and policies](../supabase/migrations/20261111131506_kalasagai_core.sql#L893)). The submission RPC requires one to five unique uploaded files with matching owner/idempotency path and validated metadata ([evidence checks](../supabase/migrations/20261120144634_allow_personnel_to_submit_incidents.sql#L57)).

Within a mounted Resident Web report page, a pending retry reuses its idempotency key and evidence path, and checks for an existing object before retrying an upload ([Resident Web submit handler](../apps/resident-web/src/app/report/page.tsx#L210), [path helper](../apps/resident-web/src/lib/report-submission.ts)). The pending attempt is held in memory; it is not restored after a page reload, so an upload from an interrupted attempt may remain unattached. No cleanup or reconciliation of abandoned evidence was tested.

## 15. AI classification and photo processing

The `classify-incident` function authenticates the caller, checks the caller’s role/ownership, requires both the database setting and server-side enable/key/model configuration, downloads private evidence, validates image metadata, sends text and images to Gemini, validates the answer, and stores an assessment ([authorization/settings](../supabase/functions/classify-incident/index.ts#L192), [AI gates](../supabase/functions/classify-incident/index.ts#L276), [image processing](../supabase/functions/classify-incident/index.ts#L330), [provider request](../supabase/functions/classify-incident/index.ts#L446)).

AI assessment remains a suggestion; human review and operational status are separate. In the authorized development test, `gemini_enabled=true`, but the dispatch trigger logged that request credentials were unavailable. The job remains queued with zero attempts and no assessment, so provider inference was not reached. No secret values were inspected or changed.

## 16. Surge controls and analytics

Surge monitoring and the reference report-volume threshold are settings inside Admin Controls → “AI usage and activity.” The threshold is informational; turning surge monitoring on displays an administrative status banner. Neither setting automatically flags reports for review or dispatches responders. `/dashboard/surge` redirects to `/dashboard/admin#ai-volume-surge` ([Admin Controls section](../apps/personnel-web/src/app/dashboard/admin/page.tsx#L246), [controls](../apps/personnel-web/src/components/AIVolumeSurgeControls.tsx#L236)).

Analytics calculates accuracy only from records with both a suggested and human-confirmed category; it displays “Unavailable” when there are no eligible reviewed records ([accuracy helper](../apps/personnel-web/src/lib/analytics.ts), [metric rendering](../apps/personnel-web/src/app/dashboard/analytics/page.tsx#L201)). Focused tests cover these cases.

## 17. Realtime, maps, and dispatch boundaries

Personnel dashboard/detail and resident report-list screens use Realtime. Resident Web and Android incident details provide explicit refresh for status/history; neither detail view claims live tracking. Android’s background realtime listener currently reloads the resident dashboard on incident updates ([Android realtime flow](../apps/resident-android/app/src/main/java/org/kalasagai/resident/data/SupabaseResidentRepository.kt#L205)).

No operational dispatch integration was verified. The server AI prompt explicitly forbids assigning responders or dispatching ([classification instructions](../supabase/functions/classify-incident/index.ts#L447)). Submission and AI classification must not be treated as confirmation that a response unit was contacted.

## 18. Feature completeness matrix

| Feature | Status | Evidence / boundary |
| --- | --- | --- |
| Resident registration, login, profile, recovery | Implemented; full email/reset journeys not re-tested in this follow-up | [Resident auth provider](../apps/resident-web/src/components/AuthProvider.tsx#L28), [Android auth repository](../apps/resident-android/app/src/main/java/org/kalasagai/resident/data/SupabaseResidentRepository.kt#L44) |
| Resident incident reporting and map location | One authorized Resident Web submission verified in development; Android hosted submission not verified | [Resident report page](../apps/resident-web/src/app/report/page.tsx#L168), [Android report screen](../apps/resident-android/app/src/main/java/org/kalasagai/resident/ui/ResidentScreens.kt#L445) |
| Evidence photo selection/capture/upload | One private Web evidence object verified; Android camera/gallery flow not end-to-end tested | [Web upload](../apps/resident-web/src/app/report/page.tsx#L203), [Android camera/gallery](../apps/resident-android/app/src/main/java/org/kalasagai/resident/ui/ResidentScreens.kt#L415) |
| Report list, details, evidence, status history | Implemented with manual detail refresh; realtime detail delivery not verified | [Resident details](../apps/resident-web/src/app/reports/%5Bid%5D/page.tsx#L36) |
| Resident and personnel maps | Implemented; Android filter covers all six categories | [Android categories](../apps/resident-android/app/src/main/java/org/kalasagai/resident/data/ResidentModels.kt#L59), [personnel map page](../apps/personnel-web/src/app/dashboard/page.tsx#L183) |
| Hotline directory | Static directory present; operational correctness not verified | [Android model/directory](../apps/resident-android/app/src/main/java/org/kalasagai/resident/data/ResidentModels.kt#L78) |
| Server-side Gemini text and evidence-photo assessment | Source exists; development dispatch is blocked by missing request credentials | [classification function](../supabase/functions/classify-incident/index.ts#L276) |
| Human category/priority review | Implemented with role checks | [priority/review migration](../supabase/migrations/20261120120740_add_incident_priorities.sql#L16) |
| Incident status changes and audit trail | Implemented with role checks and forward transitions | [status RPC](../supabase/migrations/20261111131506_kalasagai_core.sql#L487) |
| Staff directory, invitations, role management | Implemented; email delivery not tested | [Admin Controls](../apps/personnel-web/src/app/dashboard/admin/page.tsx#L88), [Edge Function](../supabase/functions/manage-personnel/index.ts#L80) |
| Activity/audit log | Implemented in source; live event delivery not tested | [audit page](../apps/personnel-web/src/app/dashboard/activity/page.tsx#L35) |
| Surge monitoring and reference report volume | Settings inside Admin Controls; no automatic review or dispatch behavior | [AI/activity controls](../apps/personnel-web/src/components/AIVolumeSurgeControls.tsx#L236) |
| AI accuracy metric | Calculated only from reviewed suggestions; unavailable with no eligible records | [analytics metric](../apps/personnel-web/src/app/dashboard/analytics/page.tsx#L203) |
| Automated responder dispatch / notifications | Not verified as implemented; AI expressly does not dispatch | [AI instructions](../supabase/functions/classify-incident/index.ts#L447) |
| Android release package | Gated; release signing and production values are not configured in this audit | [release validation](../apps/resident-android/app/build.gradle.kts#L120) |
| Production deployment | NO-GO; active Supabase project has an incompatible legacy schema. Web hosting, domains, and release credentials remain unverified. | [CI workflow](../.github/workflows/ci.yml#L11), [production checklist](../README.md#L158) |

## 19. Risks, severity, and mitigation

| Severity | Current finding and impact | Recommended mitigation |
| --- | --- | --- |
| **P1 — AI availability** | The authorized development report remains pending; its AI job is queued with zero attempts and no assessment. On its PostgREST `submit_incident` request, the trigger logged that `Authorization` and/or `apikey` was unavailable in `request.headers`, then returned before `net.http_post`. No matching Edge invocation was found. A local correction is prepared but not deployed or executed. | Obtain separate approval for the new migration, server-side credential provisioning, and Edge Function deployment. Provisioning credentials will automatically dispatch the queued job; authorize that replay and any possible paid inference separately. |
| **P2 — AI dispatch reliability** | The currently deployed dispatcher does not persist the `pg_net` request ID or observe its eventual HTTP response. Missing credentials return without changing the queued job, and there is no automatic redispatch or stale-`processing` recovery. The prepared local migration adds these mechanisms but is unverified. | Run local Deno/pgTAP tests before requesting approval. Preserve atomic job claiming and assessment idempotency. |
| **P1 — deployment gate** | Production Supabase is active but has a legacy schema and migration history incompatible with this checkout. Auth/SMTP, domains, Vercel project links, and release signing credentials remain unverified. Android release intentionally fails closed without signing and production configuration ([Android release gate](../apps/resident-android/app/build.gradle.kts#L120), [production checklist](../README.md#L158)). | Rehearse an owner-approved, data-preserving in-place compatibility migration and cutover before deployment. |
| **P2 — validation gaps** | Deno, Docker, and Supabase CLI are unavailable locally; Edge Function tests and pgTAP/CI database tests were not run in this follow-up. CI contains isolated bootstrap setup, but a clean job result was not verified. | Run the existing CI workflow in an authorized environment and investigate any failures before release. |
| **P2 — interrupted Web retries** | Same-page Resident Web retries reuse the idempotency key and evidence path, but pending attempts are not restored across reloads. An interrupted upload may remain unattached. | Consider a safe draft/reconciliation mechanism that preserves idempotency without weakening private Storage policies or using blind upserts. |
| **P2 — unverified operational flows** | Email delivery, personnel role workflows, realtime delivery, and actual responder dispatch were not end-to-end tested. No responder-dispatch integration was verified. | Test only in an authorized development environment; keep operational status and human review separate from AI suggestions. |
| **P3 — prior advisor findings** | Earlier development advisor output reported leaked-password protection and database-index findings. These findings were not rechecked in this follow-up and do not establish production status. | Recheck read-only and address only with measured, owner-approved changes. |

The earlier Supabase security advisor also flagged authenticated-callable `SECURITY DEFINER` RPCs and private-schema RLS configuration. Those findings were not re-run in this follow-up; the original source review found role/ownership checks on the reviewed operations. This is not a fresh security assessment or evidence of exploitability.

## 20. Verification evidence and release decision

**Rechecks completed 2026-11-23 (session 1 → session 2 → session 3 → session 4 full integration)**

> Session 4 executed the complete cross-application end-to-end integration runner (`scripts/test-cross-app-integration-local.mjs`), expanded PGlite runtime assertions from 20 to 22 (adding `submit_incident` RPC validation, idempotency, evidence boundary checks, invalid status transition rejection, unauthorized resident role boundaries, and responder personnel submission), re-verified all 33 web tests, 6 Deno tests (7 steps), 9 Android unit tests, Android lint (0 errors), Android debug build, and emulator Pixel_6a Compose hierarchy. Total automated tests executed across all tiers: **75 tests** (33 web + 22 PGlite runtime + 5 cross-app E2E steps + 6 Deno + 9 Android), with 0 failures. Docker Desktop / Podman absence was verified via CLI, precisely documenting the containerized `supabase start` / pgTAP blocker.

- `npm test`: **33 passed** (10 shared-validation, 11 Personnel Web, 12 Resident Web) — all 3 workspaces, 0 failed.
- **Cross-Application End-to-End Integration:** `node scripts/test-cross-app-integration-local.mjs` PASSED all 5 multi-tier stages in isolated PostgreSQL 16:
  1. Resident registration and profile derivation (`role = resident`).
  2. Private evidence upload and `submit_incident` RPC execution (status `pending`, status history recorded, audit trail generated).
  3. AI background queue, atomic worker claim (`claim_ai_job_delivery`), duplicate claim rejection, idempotent assessment (`record_claimed_ai_assessment`), system audit attribution (`actor_id = null`, `source = automatic_dispatch`), and operational status invariant preserved.
  4. Personnel Web workflow: Maps & Reports marker query, Blotters detail view, human classification review (`review_incident_classification`), forward status transition (`pending` -> `in_progress`), Analytics accuracy match, Admin Controls surge indicator, and Activity Logs.
  5. Resident status tracking & privacy guard: `my_report_review` returns confirmed category/priority without leaking internal reviewer notes, status timeline reflects `in_progress`, and cross-resident tenant isolation confirmed.
- **Isolated PostgreSQL migration & runtime tests:** `node scripts/test-migrations-local.mjs` — all **7 migrations applied in order** and all **22 functional runtime tests PASSED** in an isolated database without any hosted connection.
- `npm run lint`: **0 errors, 0 warnings** across all web workspaces (addressed React ref access in effect cleanup handlers in `AuthProvider.tsx`, `reports/page.tsx`, and `blotters/[id]/page.tsx`).
- `npm run typecheck`: **0 errors** across all web workspaces.
- Production builds: both `apps/personnel-web` and `apps/resident-web` built successfully into optimized production artifacts using Next.js 16.4.6 with Turbopack and static prerendering.
- `npm audit`: **0 vulnerabilities**.
- Deno Edge Function tests: executed via `npx -y deno`; all **6 tests (7 steps) passed, 0 failed** across `classify-incident/dispatch_test.ts`, `classify-incident/index_test.ts`, and `manage-personnel/index_test.ts`.
- Deno Edge Function typecheck: `npx -y deno check` passed cleanly on `classify-incident/index.ts` and `manage-personnel/index.ts` with zero type errors.
- Android unit tests: `gradlew testDebugUnitTest` passed all **9 unit tests** (1 in `IncidentMapCategoryTest`, 2 in `PhilippineMobileNumberTest`, 6 in `ResidentSessionStateTest`).
- Android lint: `gradlew lintDebug` passed with 0 errors.
- Android assembleDebug: `gradlew assembleDebug` passed, generating `app-debug.apk`.
- Android emulator verification: installed `app-debug.apk` onto `emulator-5554` (Pixel_6a / `sdk_gphone16k_x86_64`), launched `org.kalasagai.resident/.MainActivity`, verified active process (PID 20548) and ResumedActivity, dumped and verified Compose UI hierarchy (login screen, branding, text fields, theme switch, navigation to resident account registration with terms & penalties agreement), and captured emulator screenshot without crashes.
- **Isolated PostgreSQL migration execution (Session 2):** `node scripts/test-migrations-local.mjs` using `@electric-sql/pglite` (PostgreSQL 16 WASM) — all **7 migrations applied in order** and all **20 functional runtime tests PASSED** in an isolated database without any hosted connection.
- The integration-verification script passed `node --check`; it was not executed against hosted endpoints as mutating hosted tests require authorization.
- Route smoke checks returned HTTP 200 for tested Resident Web and Personnel Web routes, with Personnel Web `/` returning an HTTP redirect to `/dashboard`.
- Read-only development checks confirmed the approved incident is pending, evidence is in a private bucket, `gemini_enabled` is `true`, and the AI job has no attempts or assessment.
- Verified AI dispatch migration `supabase/migrations/20261122165250_secure_ai_classification_dispatch.sql` and pgTAP test assertions (`kalasagai_ai_dispatch_test.sql`: 30 planned/30 verified).
- Verified resident review summary migration `supabase/migrations/20261122174025_resident_review_summary.sql` applies cleanly in the isolated PostgreSQL test environment.

**Not run / not verified**

- Local pgTAP/database live execution: Docker Desktop is not installed on the Windows environment, preventing local Supabase container startup (`supabase start`). All 6 pgTAP test suites in `supabase/tests/` were statically audited and their planned assertion counts match exactly.
- Connected Android instrumentation tests: UI was verified interactively via ADB commands, UI dumps, and screenshots; connected instrumentation test task was not executed.
- Live hosted incident lifecycle replay and deployment: preserved non-negotiable boundaries (no hosted migrations applied, no Vault secrets provisioned, no Edge Functions deployed, no queued jobs replayed, and `gemini_enabled = true` preserved).

**Release decision at the 2026-11-23 verification: NO-GO.** Its production-infrastructure finding is superseded by the read-only 2026-11-24 production inventory in section 22. Both bootstrap procedures remain present in development; do not execute the teardown without separate owner authorization.

## 21. Focused automatic-classification dispatch investigation

**Incident:** `KAL-20261122-000004`  
**Incident ID:** `32a6c516-b2b8-4f73-8e1a-3c4ae295a5f9`  
**Development project:** `ydyawyqhvdlllqrtuxko`

### Findings

1. The live `gemini_enabled` value remains `true`. The existing job remains `queued`, `attempts = 0`, and has no assessment.
2. The applied trigger is `AFTER INSERT ON public.incidents`; its function inserts the job and calls `app_private.dispatch_ai_classification(new.id)`.
3. The applied dispatcher reads `request.headers`, then returns if either the `authorization` or `apikey` value is null/blank. The incident's Postgres log records exactly that early return during the authenticated PostgREST `submit_incident` RPC. Consequently, `net.http_post` was never reached for this incident.
4. No matching Edge Function invocation appeared in the available logs. The request therefore did not reach Edge Function JWT verification, the handler, or Gemini. This is a **database dispatch-context/authentication handoff failure**, not evidence of an Edge Function or Gemini failure.
5. The deployed Edge Function is active, uses `verify_jwt=true`, and matches the local source. Its handler expects a Bearer JWT, verifies the user, checks profile role and incident ownership, then uses server-side credentials for the job claim. Source configuration references include `SUPABASE_URL`, a publishable/anon key, a secret/service-role key, `GEMINI_ENABLED`, `GEMINI_API_KEY`, and `GEMINI_MODEL1` or `GEMINI_MODEL`. Hosted secret presence could not be inspected. Do not disable JWT verification or put service-role credentials in a client.
6. The repository reinstalls `pg_net` in `extensions`, while prior read-only metadata reported `net.http_post` in the live database. The local correction detects the installed `pg_net` namespace (`extensions` or `net`) for both dispatch and response reconciliation; the earlier failed dispatch returned before reaching either implementation.
7. Local Edge Function env differs from the hosted setting: `GEMINI_ENABLED` is `false` locally and no local `GEMINI_API_KEY` is configured. These values were only checked for presence/status and were not changed. The hosted database remains `gemini_enabled=true`; hosted Edge Function secret availability is unknown because the read-only metadata does not expose it.

### Local correction prepared — not deployed

The new migration replaces request-scoped credentials with server-side Vault configuration and a timestamped HMAC bound to the incident ID. The Edge Function validates the HMAC before using its existing server-side client. It also requires the public publishable key in both `apikey` and `Authorization: Bearer ...`; current Supabase gateway documentation confirms the publishable key passes the enabled `verify_jwt` platform check, but is not itself caller authentication. The HMAC is the actual dispatch authentication. `verify_jwt=true` remains unchanged, and no service-role/secret key is sent to Postgres request queues.

The migration detects the installed `pg_net` namespace, records request IDs and safe response codes, retries due queued/failed jobs with capped exponential delay, recovers processing jobs after ten minutes, and makes assessment recording idempotent under a job-row lock. Automatic assessments use a service-role-only RPC and are audited with a null human actor plus an `automatic_dispatch` source, rather than attributing the action to the reporter. Existing authorization checks, six categories, mandatory personnel review, and separation from operational status/responder dispatch are preserved.

Local-only changes are in the new migration, `classify-incident/index.ts`, focused Edge/SQL tests, the Deno CI test list, and the server-only `.env.example`. The tests use fake credentials and a synthetic Supabase-shaped URL; the SQL test rolls back Vault entries, queued requests, and fixtures before `pg_net` can send them.

The existing queued job is still eligible for its first claim and has not been replayed. **Applying the migration and then provisioning the Vault/Edge HMAC configuration will cause the new minute scheduler to dispatch that queued job automatically.** Do not perform those remote steps until replay and any possible paid inference are separately authorized.

### Verification limits

The available workspace `npm test` suite passed all 20 tests; it does not exercise the Edge Function or SQL migration. Static checks confirmed the pgTAP plan matches its 20 assertions and that `verify_jwt=true` remains configured. No hosted SQL, database setting, Vault/Edge secret, Edge Function, or incident was changed. No deployment, job replay, or Gemini request was made. The specific missing header cannot be identified from the existing log because values and per-header presence were not recorded; future diagnostics should record presence/key names only, never credential values. Deno, Docker, `psql`, and a locally available Supabase CLI were unavailable, so the new Deno and pgTAP suites and local migration application could not be executed. Run them in a provisioned local Supabase/Deno environment before requesting remote approval.

## 22. Read-only production readiness reconciliation — 2026-11-24

The production Supabase project was checked read-only and reported `ACTIVE_HEALTHY`. No incident/profile rows, secrets, settings, Auth configuration, or Storage objects were read; no production state was changed.

- Production and this checkout each report eight migrations, but the version sets are disjoint. The development project reports all eight versions present in this checkout.
- Production has a legacy data model: many-to-many personnel roles and `account_status` on profiles; `incident_reports` and `status_history`; seven incident statuses; and legacy AI assessment, job, attempt, and audit structures. The current application expects a single profile role, `incidents`, `incident_status_history`, and a four-status lifecycle. Shared table names also have incompatible columns.
- Production lists `analyze-incident` v2; development lists `classify-incident` v13 and `manage-personnel` v9. Function names and versions are not evidence that production is ready for the current application.
- The agreed planning direction is an in-place, data-preserving upgrade with legacy tables retained until mapping, validation, cutover, and rollback are approved. Do not apply the current migration chain directly, replace legacy functions prematurely, or drop archived data.
- The web apps passed the 2026-11-24 workspace tests (36 tests), lint, type-check, and isolated production builds using CI placeholder values. Local ports 3000 and 3001 remained responsive. The worktree is not release-clean; no local Vercel project links were found, and hosted Actions status for the current branch could not be verified.

**Current production decision: NO-GO.** Resolve role, status, account-state, and contact-field mappings; rehearse the compatibility migration against a verified backup; establish production hosting/domains and a clean release revision; then obtain explicit authorization before any production write or deployment.
