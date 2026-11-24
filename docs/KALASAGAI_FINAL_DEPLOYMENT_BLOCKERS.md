# KALASAG-AI Final Web Deployment Blockers

**Checked:** 2026-11-24
**Decision:** Keep Vercel deployments protected; do not make a public release yet.

## Status

| Item | Status | Evidence |
| --- | --- | --- |
| Resident Web | **BLOCKED** | The requested separate project `kalasagai-resident-web` is not configured. |
| Personnel Web | **BLOCKED** | The requested separate project `kalasagai-personnel-web` is not configured. |
| Resident Android | **REMOVED** | Native source/build project, Android-specific web download UI, CI job, and local deep-link configuration were removed at the owner's request. No APK is distributed. |
| Backend privacy migration | **APPLIED TO DEV** | Explicitly authorized and applied to `ydyawyqhvdlllqrtuxko` as version `20261124122754`; hosted negative-access checks passed. |
| Existing Vercel project | **PROTECTED** | Existing project `kalasag-ai-2-0` has production deployments; all deployment domains now require Vercel Authentication. |
| Production | **BLOCKED** | Legacy schema is incompatible with this checkout; no production changes are authorized or performed. |

## Owner actions required

1. **Pass database CI:** The latest workflow run still needs to pass the entire database and pgTAP jobs. The migration and pgTAP fixture fixes are on `main`; inspect the latest run before proceeding.
2. **Configure the two Vercel apps:** Existing Vercel access is available in the browser. Create/configure `kalasagai-resident-web` with root `apps/resident-web` and `kalasagai-personnel-web` with root `apps/personnel-web`. Keep **All Deployments** protection enabled until the target backend and runtime behavior are verified. The current `kalasag-ai-2-0` project is not a substitute for these two app projects.
3. **Set environment variables safely:** Use the development Supabase URL and publishable key in each client environment. Personnel Web also requires `SUPABASE_SECRET_KEY` server-side; add it directly in Vercel without exposing it through `NEXT_PUBLIC_*` or chat.
4. **Verify Auth redirects:** After the app domains exist, inspect the development Auth allow-list and configure exact callback/reset URLs. Test redirects only with an authorized account.
5. **Review security advisories:** Check the remaining SECURITY DEFINER function notices and enable leaked-password protection before any public launch.
6. **Keep production gated:** Commission a separate in-place, data-preserving production compatibility plan with verified backup/restore and separate approval. Never push this repository's current migration chain directly to the legacy production schema.

## Exact local validation

- `npm test`, `npm run typecheck`, `npm run lint`, and both production builds: passed.
- `node scripts/test-migrations-local.mjs`: all 9 local migrations and functional runtime assertions passed.
- Development privacy migration: applied and basic hosted access checks passed. Full pgTAP CI is not yet passing.
- Vercel: current monorepo deployment is protected; separate app projects and Auth redirects remain unconfigured.
- Production readiness: blocked.

See the [web release report](./KALASAGAI_WEB_RELEASE_REPORT.md) and [deployment guide](./KALASAGAI_DEPLOYMENT_GUIDE.md) for evidence and procedures.
