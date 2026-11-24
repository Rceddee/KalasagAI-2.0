# KALASAG-AI Web Deployment Guide

This guide covers the gated path from the current checkout to authorized web staging. As of 2026-11-24, the development privacy migration has been applied, but the public-release decision remains **NO-GO** until CI, app-specific Vercel configuration, and runtime verification are complete.

The native Resident Android project and its APK distribution path have been removed from the repository. Resident Web is the resident-facing client. The Android emulator installation and its app data were not altered.

## Verified state and safety gates

- Resident Web and Personnel Web use the authorized development URL in their ignored local environment files. Local production builds pass.
- The development Supabase project `ydyawyqhvdlllqrtuxko` (`kalasagai-dev`) is active and healthy. The AI assessment privacy migration is applied and recorded as `20261124122754`.
- No production migration, function, secret, or credential was changed.
- The Android redirect was removed from the local Supabase config only. Hosted Auth allow-lists and ignored local environment files were not changed.
- Existing Vercel project `kalasag-ai-2-0` is connected to `apps/personnel-web`. Its production alias `https://kalasag-ai-2-0.vercel.app/` and two deployment-specific URLs return HTTP 302 to Vercel SSO for anonymous requests.
- The requested Resident project is not configured. The existing Personnel project has the two public Supabase variable names, but their values were not verified and `SUPABASE_SECRET_KEY` was not visible. Vercel CLI and local project links remain unavailable.
- GitHub Actions run 5 passed web, Edge Function, and database jobs, including both Next.js builds and the full pgTAP suite.
- Production Supabase is a legacy project incompatible with the current schema. **Never push the current migration chain directly to production.**

## 1. Authorize and verify the backend first

Do not deploy a publicly accessible incident-reporting application to a backend where the confirmed assessment exposure remains unresolved.

1. The privacy migration has been applied to development as version `20261124122754`; do not apply it to production.
2. The latest GitHub Actions run passed `supabase test db`, all web checks/builds, and Edge Function tests/checks. Keep this as the CI gate for subsequent code changes.
3. Verify that direct resident table reads expose no assessment rows, `my_ai_assessments` returns only latest safe fields for owned reports, and authorized staff can read the latest rationale through the staff-gated RPC. The hosted negative-access checks passed; local functional tests cover owner-safe and staff access.
4. Review the development project's Supabase Security Advisor notices before public use: callable `SECURITY DEFINER` RPCs, disabled leaked-password protection, and informational private-schema RLS notices.
5. Configure and verify the exact staged Auth site URL, resident email-confirmation and password-reset redirects, personnel recovery callback, email delivery, and CAPTCHA. Do not guess or add placeholder URLs to a hosted allow-list.

The production project requires a separate data-preserving compatibility plan, verified backup, restore rehearsal, and explicit production authorization. Preserve its legacy tables and records. Do not change production credentials, RLS, functions, AI jobs, cron settings, or `gemini_enabled` under this task.

## 2. Connect the two Vercel monorepo projects

The Vercel dashboard is accessible, but the only existing project found is `kalasag-ai-2-0`, connected to `apps/personnel-web`. It is protected by Vercel Authentication for all domains. Keep it protected while configuring the requested projects:

1. Create/reuse `kalasagai-resident-web` for Resident Web. For Personnel Web, verify whether to rename the existing `kalasag-ai-2-0` project to `kalasagai-personnel-web` or create a separate project while preserving the existing protected domain.
2. Set **Root Directory** to `apps/resident-web` for Resident Web and `apps/personnel-web` for Personnel Web. Keep the framework as Next.js. The root npm workspace lockfile and shared package must remain available to each build.
3. Use the repository root workspace installation and the corresponding workspace build command if Vercel's defaults do not correctly detect the monorepo:

   ```powershell
   npm install
   npm run build --workspace @kalasag/resident-web
   npm run build --workspace @kalasag/personnel-web
   ```

4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the development project. Personnel Web additionally needs `SUPABASE_SECRET_KEY` as a server-only environment variable for its privileged API route; never prefix it with `NEXT_PUBLIC_` or expose it to browser code.
5. Keep Vercel Authentication set to **All Deployments** until both projects target the verified development backend and the application behavior is checked. Confirm anonymous requests are denied before treating any deployment as private.
6. After Vercel assigns actual preview domains, add exact Auth URLs for Resident Web `/auth/callback` and `/reset-password`, and Personnel Web `/auth/callback`, `/auth/callback?type=recovery`, and `/reset-password`. Test real redirects only with an authorized test account.
7. Record the URLs Vercel actually returns. Do not invent or publish guessed URLs.

Official Vercel references: [monorepos](https://vercel.com/docs/monorepos), [project settings](https://vercel.com/docs/project-configuration/general-settings), and [CLI project linking](https://vercel.com/docs/cli/link).

After the projects exist and the authorized Vercel team is signed in, linking can also be done with the documented CLI:

```powershell
npx vercel@latest login
npx vercel@latest link --yes --project kalasagai-resident-web --scope <authorized-team> --cwd apps/resident-web
npx vercel@latest link --yes --project kalasagai-personnel-web --scope <authorized-team> --cwd apps/personnel-web
```

Do not run these commands until the team/project access is authorized. The CLI must report the linked project names; review the resulting `.vercel` files and keep their IDs out of committed environment files.

## 3. Validate the web applications

Run from the repository root:

```powershell
npm test
npm run typecheck
npm run lint
$env:NEXT_BUILD_DIST_DIR = "build"
npm run build
```

The isolated custom build directory avoids overwriting `.next` used by running development servers. Normal Vercel builds use Next.js's default `.next`.

## 4. Production gate

The existing production Supabase project is active but has a legacy schema and migration history incompatible with this checkout. No production writes or deployments were performed.

Before a production launch:

1. Reconcile the existing production schema with a data-preserving, in-place compatibility migration. First take a verified backup and rehearse recovery. Keep legacy tables and records until mappings, application behavior, and rollback are validated; the current migration chain is not a production upgrade script.
2. Resolve legacy-data mappings before cutover: multiple personnel roles versus the current single-role model, legacy incident statuses, account status, missing resident contact numbers, and richer AI/audit/job history. Preserve original values and hold ambiguous records for review.
3. Configure and verify separate Vercel projects, production Auth URLs, SMTP, email confirmation, CAPTCHA, SSL enforcement, database network restrictions, RLS, backups/PITR, and function secrets.
4. Deploy new Edge Functions only after the staged schema is validated; retain legacy functions until old clients are retired. Keep Gemini disabled until production inference, cost limits, and alerting are explicitly approved.
5. Confirm data-retention sign-off, production domains, email delivery, and rollback steps before enabling any deployment workflow. The repository has no production Vercel link, configured production client environment, or automatic deployment credentials.

The optional `scripts/verify-full-integration.mjs` test mutates its explicitly selected synthetic incident. It is restricted to the authorized development project and requires explicit opt-in plus dedicated test-account and test-incident environment variables; never run it against production.
