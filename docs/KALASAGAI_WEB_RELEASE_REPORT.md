# KALASAG-AI Web Release Report

**Assessment date:** 2026-11-24
**Decision:** **NO-GO for public release**

## Current deployment status

| Component | Status | Verified state |
| --- | --- | --- |
| Resident Web | **LOCAL** | Local tests and production build pass; no staged or public URL is available. |
| Personnel Web | **LOCAL** | Local tests and production build pass; no staged or public URL is available. |
| Resident Android | **REMOVED** | The native project, Android-specific download UI, and release wiring were removed from the repository at the owner's request. No APK is offered. |
| Backend privacy migration | **LOCAL ONLY** | All 9 local migrations and functional runtime checks pass. The authorized development project does not have the new privacy migration. |
| Production readiness | **BLOCKED** | Production remains on a legacy schema incompatible with this repository. No production changes were made. |

## Work completed

- Removed the native Resident Android project and its Android-only build, CI, redirect, and APK distribution configuration.
- Removed the Android download card and mobile-app installation guide from the web login pages. Resident Web remains available as the resident client.
- Preserved the resident-safe assessment RPCs, staff-authorized assessment access, and the local privacy migration. No hosted migration was applied.
- Kept deployment guidance limited to the two web applications and their shared Supabase backend.

## Verification results

| Check | Result |
| --- | --- |
| Web unit tests | **Passed** — 36 tests |
| Web TypeScript and ESLint | **Passed** |
| Personnel Web production build | **Passed** |
| Resident Web production build | **Passed** |
| Local PostgreSQL/PGlite migrations and functional checks | **Passed** — all 9 migrations and privacy/runtime assertions |
| Dedicated Supabase pgTAP run | **Not run** — Docker and the Supabase CLI are unavailable; the 14-assertion pgTAP file remains unexecuted |
| Vercel staging | **Not deployed** — Vercel CLI/authentication and local project links are absent |
| Hosted Auth redirect behavior | **Not verified** — no staging domain is assigned and the hosted Auth allow-list was not inspected |
| Production deployment | **Not performed** — the existing production schema is incompatible with this checkout |

## Hosted backend check

The read-only Supabase project check confirmed that development project `kalasagai-dev` (`ydyawyqhvdlllqrtuxko`) is active and healthy. Its migration history ends at `20261124061010_restrict_activity_log_access`; `20261124094212_restrict_ai_assessment_rationale` is absent. The confirmed resident rationale/model exposure therefore remains unresolved on that hosted backend. Do not deploy a publicly accessible reporting application to it until the privacy migration is explicitly authorized, applied, and verified.

No hosted migration, function, secret, credential, or setting was changed. The production project remains incompatible with this checkout and was not accessed for writes.
The cleanup removed the Android deep link from local `supabase/config.toml`; no hosted Auth redirect allow-list or ignored local environment file was changed.

The development project's read-only Security Advisor also reported callable `SECURITY DEFINER` RPC notices and disabled leaked-password protection, plus informational private-schema RLS notices. These need project-owner review before a public launch; this work did not change them.

## Security finding

Residents could read rationale and model metadata for their own reports through direct assessment-table access. The local migration and web query changes restrict this to staff and preserve a safe resident projection. This is **fixed and tested locally only**; it remains unresolved on the hosted development project until separately authorized and verified there.

| # | Severity | Source | Finding | Current disposition |
|---|----------|--------|---------|---------------------|
| 1 | 🟡 MEDIUM | [Core migration](../supabase/migrations/20261111131506_kalasagai_core.sql) | Residents could read private AI rationale and model metadata for their own reports. | Fixed by the [local privacy migration](../supabase/migrations/20261124094212_restrict_ai_assessment_rationale.sql); not yet fixed on the hosted development project. |

## Required before release

1. Obtain explicit authorization to apply the privacy migration to the named development/staging project. Run the pgTAP suite and verify resident denial, safe RPC results, and staff access.
2. Do not deploy previews that are publicly accessible until the target backend privacy fix is applied and verified.
3. Connect the two named Vercel projects, obtain actual staged domains, configure public client values and Auth redirects, then validate protected previews.
4. Reconcile production through a separately approved, data-preserving compatibility plan. Never push this migration chain directly to the legacy production database.

See the [final deployment blockers](./KALASAGAI_FINAL_DEPLOYMENT_BLOCKERS.md) and [deployment guide](./KALASAGAI_DEPLOYMENT_GUIDE.md) for owner actions and procedures.

Historical acceptance and demonstration documents may describe the former Android implementation; those records predate its removal and are not current build or deployment instructions.
