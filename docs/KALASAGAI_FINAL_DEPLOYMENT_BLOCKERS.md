# KALASAG-AI Final Web Deployment Blockers

**Checked:** 2026-11-24
**Decision:** Do not publish a public staging or production app yet.

## Status

| Item | Status | Evidence |
| --- | --- | --- |
| Resident Web | **LOCAL** | Local production build passes; no Vercel link or staging URL. |
| Personnel Web | **LOCAL** | Local production build passes; no Vercel link or staging URL. |
| Resident Android | **REMOVED** | Native source/build project, Android-specific web download UI, CI job, and local deep-link configuration were removed at the owner's request. No APK is distributed. |
| Backend privacy migration | **LOCAL ONLY** | Development migration history does not include `20261124094212_restrict_ai_assessment_rationale`. |
| Production | **BLOCKED** | Legacy schema is incompatible with this checkout; no production changes are authorized or performed. |

## Owner actions required

1. **Authorize the backend migration:** Confirm in writing the exact development/staging project `ydyawyqhvdlllqrtuxko` and authorize applying `20261124094212_restrict_ai_assessment_rationale.sql` there. No hosted migration has been applied. Do not authorize or use production project `fpfvouirptlkvzjsobfz` for this change.
2. **Verify the backend:** Provide a Docker/Supabase CLI environment to run the 14 pgTAP assertions, or an approved equivalent. Verify resident direct-table denial, safe owner-only RPC results, and staff rationale access before any public access.
3. **Connect Vercel:** Sign in to the authorized Vercel team, then create or reuse exactly `kalasagai-resident-web` with root `apps/resident-web` and `kalasagai-personnel-web` with root `apps/personnel-web`. No CLI login or project link is available locally, so the existence of these projects in the Vercel account could not be verified. Record actual deployment URLs after authorized setup.
4. **Approve staged Auth settings:** Once actual domains exist, authorize exact resident and personnel callback/reset URLs in the development/staging Supabase Auth allow-list. The current hosted allow-list and real email redirects have not been verified.
5. **Keep production gated:** Commission a separate in-place, data-preserving production compatibility plan with verified backup/restore and separate approval. Never push this repository's current migration chain directly to the legacy production schema.

## Exact local validation

- `npm test`, `npm run typecheck`, `npm run lint`, and both production builds: passed.
- `node scripts/test-migrations-local.mjs`: all 9 local migrations and functional runtime assertions passed.
- Hosted development migration, pgTAP, Vercel staging, Auth redirects, and production readiness: not verified or not available.

See the [web release report](./KALASAGAI_WEB_RELEASE_REPORT.md) and [deployment guide](./KALASAGAI_DEPLOYMENT_GUIDE.md) for evidence and procedures.
