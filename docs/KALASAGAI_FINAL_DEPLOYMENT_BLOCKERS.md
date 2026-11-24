# KALASAG-AI Final Web Deployment Blockers

**Checked:** 2026-11-24
**Decision:** Keep Vercel deployments protected; do not make a public release yet.

## Status

| Item | Status | Evidence |
| --- | --- | --- |
| Resident Web | **BLOCKED** | The requested separate project `kalasagai-resident-web` is not configured. |
| Personnel Web | **STAGED (PROTECTED; INCOMPLETE)** | Existing project `kalasag-ai-2-0` deploys `apps/personnel-web`; backend target and server-only key are not verified. |
| Resident Android | **REMOVED** | Native source/build project, Android-specific web download UI, CI job, and local deep-link configuration were removed at the owner's request. No APK is distributed. |
| Backend privacy migration | **APPLIED TO DEV** | Explicitly authorized and applied to `ydyawyqhvdlllqrtuxko` as version `20261124122754`; hosted negative-access checks passed. |
| Existing Vercel project | **PROTECTED** | `https://kalasag-ai-2-0.vercel.app/` and two deployment URLs return HTTP 302 to Vercel SSO for anonymous requests. |
| Production | **BLOCKED** | Legacy schema is incompatible with this checkout; no production changes are authorized or performed. |

## Owner actions required

1. **Configure Resident Web:** Create `kalasagai-resident-web` with root `apps/resident-web`, development Supabase values, and **All Deployments** protection.
2. **Finalize Personnel Web:** The existing project is already connected to `apps/personnel-web`; verify its public values point to development, add `SUPABASE_SECRET_KEY` server-side directly in Vercel, and decide whether to rename it to `kalasagai-personnel-web` or preserve its current project/domain.
3. **Verify Auth redirects:** After app-specific domains exist, inspect the development Auth allow-list and configure exact callback/reset URLs. Test redirects only with an authorized account.
4. **Review security advisories:** Check the remaining SECURITY DEFINER function notices and enable leaked-password protection before any public launch.
5. **Keep production gated:** Commission a separate in-place, data-preserving production compatibility plan with verified backup/restore and separate approval. Never push this repository's current migration chain directly to the legacy production schema.

## Exact local validation

- `npm test`, typecheck, lint, both production builds, Edge Function tests/checks, and Supabase `test db`: passed in GitHub Actions run 5.
- Local migration and cross-app integration scripts: passed.
- Development privacy migration: applied; hosted negative-access checks passed.
- Vercel: current Personnel deployment is protected; Resident project and app-specific Auth redirects remain unconfigured.
- Production readiness: blocked.

See the [web release report](./KALASAGAI_WEB_RELEASE_REPORT.md) and [deployment guide](./KALASAGAI_DEPLOYMENT_GUIDE.md) for evidence and procedures.
