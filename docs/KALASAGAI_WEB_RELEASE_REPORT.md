# KALASAG-AI Web Release Report

**Current release:** November 25, 2026 · `1395b08` · **Ready for the capstone demonstration.**

Resident Web and Personnel Web are deployed to public Vercel production aliases backed by the development Supabase project. The sign-in pages are public, preview deployments retain Vercel protection, and the apps enforce account and role checks for private records. The legacy operational database requires a separate migration and release decision. [Resident Web](https://kalasagai-resident-web.vercel.app/) · [Personnel Web](https://kalasag-ai-2-0.vercel.app/login)

| Verification | Evidence |
| --- | --- |
| Release automation | Both Vercel deployments completed. The web, Edge Function, and database CI jobs passed, including lint, type checks, both web builds, and pgTAP. [GitHub Actions run 45431456858](https://github.com/Rceddee/KalasagAI-2.0/actions/runs/45431456858) |
| Isolated tests | 43 web and shared-validation tests passed (10 shared, 17 Personnel, 16 Resident). Nine Edge Function tests passed, including seven nested steps. All ten migrations and the cross-app incident lifecycle passed in isolated PostgreSQL. |
| Hosted UI with simulated services | Chrome exercised registration, recovery, sessions, report submission, retry after a simulated connection failure, the receipt, and resident tracking. Personnel checks covered all four roles, alerts and audio playback, map and register search, pagination, human review, status changes, PDF downloads, analytics drill-down, invitations, role changes, and surge settings. Fixture requests replaced operational writes, emails, and model calls. |
| Read-only live checks | Both public sign-in pages returned HTTP 200. The Personnel reporter-contact endpoint returned 401 to a signed-out request. Existing test report `KAL-20261124-000011` had an evidence record, a timeline entry, a low AI suggestion, and pending status at the time of inspection. |
| Staff invitations | The development migration is recorded as `20261124150646`. The Personnel callback origin and Gmail SMTP settings were verified. The operator saw the invitation success message and the new staff entry in the live directory. |
| Corrections verified on the deployed apps | The resident receipt now displays the reference and pending personnel review. Escape closes an expanded Personnel evidence photo while keeping its report open. The selected Personnel theme survives reload. |

**Remaining live checks:** delivery of a fresh invitation to the recipient’s inbox, first-time password setup and sign-in by that recipient, a fresh Gemini response, and audible alerts on the presentation device. Use an existing test report for a walkthrough that only reads records. See the [feature inventory](KALASAGAI_FINAL_SYSTEM_SCOPE.md#current-web-features) and [deployment gates](KALASAGAI_FINAL_DEPLOYMENT_BLOCKERS.md).

## Archived staging assessment of November 24, 2026

The following records the earlier staging attempt, including the privacy migration and initial protection checks. The deployment table and actions below describe that date.

**Assessment date:** 2026-11-24
**Decision:** **NO-GO for public release**

### Deployment status at the time

| Component | Status | Verified state |
| --- | --- | --- |
| Resident Web | **BLOCKED** | Not yet deployed as the requested `kalasagai-resident-web` project. The Vercel new-project route opened to a blank page; no project was created. |
| Personnel Web | **STAGED (PROTECTED; INCOMPLETE)** | Existing Vercel project `kalasag-ai-2-0` serves the Personnel app from `apps/personnel-web`; the project name, backend target, and required server-only key still need verification. |
| Resident Android | **REMOVED** | The native project, Android-specific download UI, and release wiring were removed from the repository at the owner's request. No APK is offered. |
| Backend privacy migration | **APPLIED TO DEV** | Applied to `ydyawyqhvdlllqrtuxko` and recorded as migration `20261124122754`; production was untouched. |
| Existing Vercel project | **PROTECTED** | Vercel Authentication protects all deployment domains. Anonymous HEAD requests to the production alias and two deployment URLs returned HTTP 302. |
| Production readiness | **BLOCKED** | Production remains on a legacy schema incompatible with this repository. No production changes were made. |

### Work completed

- Removed the native Resident Android project and its Android-only build, CI, redirect, and APK distribution configuration.
- Removed the Android download card and mobile-app installation guide from the web login pages. Resident Web remains available as the resident client.
- Applied the assessment privacy migration to the explicitly authorized development project; production was not changed.
- Kept deployment guidance limited to the two web applications and their shared Supabase backend.
- Enabled Vercel Authentication for all deployments in the existing `kalasag-ai-2-0` project. Its production alias is `https://kalasag-ai-2-0.vercel.app/`; anonymous requests to it and two deployment-specific URLs returned HTTP 302.
- Verified GitHub Actions run 6 on `31b7ce0463f1f2b9f12c1bd5d808cbe46d28069f`: web, Edge Functions, and database jobs passed.

### Verification results

| Check | Result |
| --- | --- |
| Web unit tests | **Passed** — 36 tests |
| Web TypeScript and ESLint | **Passed** |
| Personnel Web production build | **Passed** |
| Resident Web production build | **Passed** |
| Local PostgreSQL/PGlite migrations and functional checks | **Passed** — all 9 migrations and privacy/runtime assertions |
| GitHub Actions CI | **Passed** — run 6 completed web tests, audit, lint, typecheck, both Next.js production builds, Edge Function tests/checks, and Supabase `test db`. |
| Vercel staging | **PARTIAL** — protected Personnel Web deployment exists at `https://kalasag-ai-2-0.vercel.app/`; Vercel Authentication is confirmed for **All Deployments**. The separate Resident project is not configured; the Vercel new-project page rendered blank. Existing project environment values were not verified, and `SUPABASE_SECRET_KEY` was not present in the visible variable list. |
| Hosted Auth redirect behavior | **Not verified** — no app-specific staging domains have been assigned and the hosted Auth allow-list was not inspected |
| Production deployment | **Not performed** — the existing production schema is incompatible with this checkout |

### Hosted backend check

Development project `kalasagai-dev` (`ydyawyqhvdlllqrtuxko`) is active and healthy. After explicit owner authorization, the privacy migration was applied and is recorded as `20261124122754`. RLS is enabled on `public.ai_assessments`; the resident-facing policy is staff-only, both safe RPCs exist and are executable by `authenticated`, and an unaffiliated authenticated test identity saw zero direct assessment rows. Local functional tests cover owner-safe resident summaries and authorized staff access.

No production migration, function, secret, credential, or setting was changed. The production project remains incompatible with this checkout and was not accessed for writes.
Vercel project `kalasag-ai-2-0` is connected to the repository path `apps/personnel-web` and has a Ready production deployment. Vercel Authentication is set to **All Deployments**. Anonymous HEAD requests to `https://kalasag-ai-2-0.vercel.app/`, `https://kalasag-ai-2-0-8ofhp0rip-rceddees-projects.vercel.app/`, and `https://kalasag-ai-2-0-2ft19yjhb-rceddees-projects.vercel.app/` returned HTTP 302 to Vercel SSO. Keep this protection enabled. The separate Resident project is not configured; the existing Personnel project still needs its exact backend target and server-only key verified.
The signed-in Vercel dashboard's `vercel.com/new?teamSlug=rceddees-projects` route rendered a blank page, including after one reload. No new project or deployment was created. Use a functioning Vercel project-creation flow before proceeding; do not make the existing project public.
The cleanup removed the Android deep link from local `supabase/config.toml`; no hosted Auth redirect allow-list or ignored local environment file was changed.

The development project's read-only Security Advisor also reported callable `SECURITY DEFINER` RPC notices and disabled leaked-password protection, plus informational private-schema RLS notices. These need project-owner review before a public launch; this work did not change them.

### Security finding

Residents could read rationale and model metadata for their own reports through direct assessment-table access. The migration and web query changes now restrict this to staff and preserve a safe resident projection. It is **fixed on development and verified with local tests plus hosted negative-access checks**. Authorized staff access is verified in local regression tests; a live staff session was not used.

| # | Severity | Source | Finding | Current disposition |
|---|----------|--------|---------|---------------------|
| 1 | 🟡 MEDIUM | [Core migration](../supabase/migrations/20261111131506_kalasagai_core.sql) | Residents could read private AI rationale and model metadata for their own reports. | Fixed on development by the [privacy migration](../supabase/migrations/20261124122754_restrict_ai_assessment_rationale.sql); production remains untouched. |

### Required before release

1. Configure the separate `kalasagai-resident-web` project with root `apps/resident-web`. The current dashboard project-creation route is blank; use a functioning authorized dashboard or CLI path. Decide whether to rename or replace the existing Personnel project while preserving its protected domain.
2. Verify that Vercel public variables point only to development. The Personnel project also needs `SUPABASE_SECRET_KEY` set directly in Vercel as a server-only variable; never paste it into chat or expose it to browser code.
3. Configure and verify app-specific Auth callback/reset URLs. Keep Vercel Authentication enabled until these checks pass.
4. Review the remaining Security Advisor warnings and enable leaked-password protection before any public launch.
5. Reconcile production through a separately approved, data-preserving compatibility plan. Never push this migration chain directly to the legacy production database.

See the [final deployment blockers](./KALASAGAI_FINAL_DEPLOYMENT_BLOCKERS.md) and [deployment guide](./KALASAGAI_DEPLOYMENT_GUIDE.md) for owner actions and procedures.

Historical acceptance and demonstration documents may describe the former Android implementation; those records predate its removal and are not current build or deployment instructions.
