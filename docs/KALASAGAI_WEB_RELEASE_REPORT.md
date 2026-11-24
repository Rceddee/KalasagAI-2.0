# KALASAG-AI Web Release Report

**Assessment date:** 2026-11-24
**Decision:** **NO-GO for public release**

## Current deployment status

| Component | Status | Verified state |
| --- | --- | --- |
| Resident Web | **BLOCKED** | Not yet deployed as the requested `kalasagai-resident-web` project with its own root and verified environment. |
| Personnel Web | **STAGED (PROTECTED; INCOMPLETE)** | Existing Vercel project `kalasag-ai-2-0` serves the Personnel app from `apps/personnel-web`; the project name, backend target, and required server-only key still need verification. |
| Resident Android | **REMOVED** | The native project, Android-specific download UI, and release wiring were removed from the repository at the owner's request. No APK is offered. |
| Backend privacy migration | **APPLIED TO DEV** | Applied to `ydyawyqhvdlllqrtuxko` and recorded as migration `20261124122754`; production was untouched. |
| Existing Vercel project | **PROTECTED** | Vercel Authentication protects all deployment domains. Anonymous HEAD requests to the production alias and two deployment URLs returned HTTP 302. |
| Production readiness | **BLOCKED** | Production remains on a legacy schema incompatible with this repository. No production changes were made. |

## Work completed

- Removed the native Resident Android project and its Android-only build, CI, redirect, and APK distribution configuration.
- Removed the Android download card and mobile-app installation guide from the web login pages. Resident Web remains available as the resident client.
- Applied the assessment privacy migration to the explicitly authorized development project; production was not changed.
- Kept deployment guidance limited to the two web applications and their shared Supabase backend.
- Enabled Vercel Authentication for all deployments in the existing `kalasag-ai-2-0` project. Its production alias is `https://kalasag-ai-2-0.vercel.app/`; anonymous requests to it and two deployment-specific URLs returned HTTP 302.
- Verified GitHub Actions run 5 on `15351ae857888a4bf8383e3aa30247d9b3140731`: web, Edge Functions, and database jobs passed.

## Verification results

| Check | Result |
| --- | --- |
| Web unit tests | **Passed** — 36 tests |
| Web TypeScript and ESLint | **Passed** |
| Personnel Web production build | **Passed** |
| Resident Web production build | **Passed** |
| Local PostgreSQL/PGlite migrations and functional checks | **Passed** — all 9 migrations and privacy/runtime assertions |
| GitHub Actions CI | **Passed** — run 5 completed web tests, audit, lint, typecheck, both Next.js production builds, Edge Function tests/checks, and Supabase `test db`. |
| Vercel staging | **PARTIAL** — protected Personnel Web deployment exists at `https://kalasag-ai-2-0.vercel.app/`; the separate Resident project is not configured. Existing project environment values were not verified, and `SUPABASE_SECRET_KEY` was not present in the visible variable list. |
| Hosted Auth redirect behavior | **Not verified** — no app-specific staging domains have been assigned and the hosted Auth allow-list was not inspected |
| Production deployment | **Not performed** — the existing production schema is incompatible with this checkout |

## Hosted backend check

Development project `kalasagai-dev` (`ydyawyqhvdlllqrtuxko`) is active and healthy. After explicit owner authorization, the privacy migration was applied and is recorded as `20261124122754`. RLS is enabled on `public.ai_assessments`; the resident-facing policy is staff-only, both safe RPCs exist and are executable by `authenticated`, and an unaffiliated authenticated test identity saw zero direct assessment rows. Local functional tests cover owner-safe resident summaries and authorized staff access.

No production migration, function, secret, credential, or setting was changed. The production project remains incompatible with this checkout and was not accessed for writes.
Vercel project `kalasag-ai-2-0` is connected to the repository path `apps/personnel-web` and has a Ready production deployment. Vercel Authentication is set to **All Deployments**. Anonymous HEAD requests to `https://kalasag-ai-2-0.vercel.app/`, `https://kalasag-ai-2-0-8ofhp0rip-rceddees-projects.vercel.app/`, and `https://kalasag-ai-2-0-2ft19yjhb-rceddees-projects.vercel.app/` returned HTTP 302 to Vercel SSO. Keep this protection enabled. The separate Resident project is not configured; the existing Personnel project still needs its exact backend target and server-only key verified.
The cleanup removed the Android deep link from local `supabase/config.toml`; no hosted Auth redirect allow-list or ignored local environment file was changed.

The development project's read-only Security Advisor also reported callable `SECURITY DEFINER` RPC notices and disabled leaked-password protection, plus informational private-schema RLS notices. These need project-owner review before a public launch; this work did not change them.

## Security finding

Residents could read rationale and model metadata for their own reports through direct assessment-table access. The migration and web query changes now restrict this to staff and preserve a safe resident projection. It is **fixed on development and verified with local tests plus hosted negative-access checks**. Authorized staff access is verified in local regression tests; a live staff session was not used.

| # | Severity | Source | Finding | Current disposition |
|---|----------|--------|---------|---------------------|
| 1 | 🟡 MEDIUM | [Core migration](../supabase/migrations/20261111131506_kalasagai_core.sql) | Residents could read private AI rationale and model metadata for their own reports. | Fixed on development by the [privacy migration](../supabase/migrations/20261124122754_restrict_ai_assessment_rationale.sql); production remains untouched. |

## Required before release

1. Configure the separate `kalasagai-resident-web` project with root `apps/resident-web`; decide whether to rename or replace the existing Personnel project while preserving its protected domain.
2. Verify that Vercel public variables point only to development. The Personnel project also needs `SUPABASE_SECRET_KEY` set directly in Vercel as a server-only variable; never paste it into chat or expose it to browser code.
3. Configure and verify app-specific Auth callback/reset URLs. Keep Vercel Authentication enabled until these checks pass.
4. Review the remaining Security Advisor warnings and enable leaked-password protection before any public launch.
5. Reconcile production through a separately approved, data-preserving compatibility plan. Never push this migration chain directly to the legacy production database.

See the [final deployment blockers](./KALASAGAI_FINAL_DEPLOYMENT_BLOCKERS.md) and [deployment guide](./KALASAGAI_DEPLOYMENT_GUIDE.md) for owner actions and procedures.

Historical acceptance and demonstration documents may describe the former Android implementation; those records predate its removal and are not current build or deployment instructions.
