# KALASAG-AI Web Deployment Guide

This guide covers the gated path from the current local checkout to authorized web staging. It does not authorize hosted changes. As of 2026-11-24, both web applications are local only and the public-release decision is **NO-GO**.

The native Resident Android project and its APK distribution path have been removed from the repository. Resident Web is the resident-facing client. The Android emulator installation and its app data were not altered.

## Verified state and safety gates

- Resident Web and Personnel Web use the authorized development URL in their ignored local environment files. Local production builds pass.
- The development Supabase project `ydyawyqhvdlllqrtuxko` (`kalasagai-dev`) is active and healthy, but its recorded migrations stop at `20261124061010`. The local AI assessment privacy migration `20261124094212_restrict_ai_assessment_rationale` is not applied there.
- No migration, function, secret, credential, or hosted application was changed.
- The Android redirect was removed from the local Supabase config only. Hosted Auth allow-lists and ignored local environment files were not changed.
- Vercel CLI, Vercel authentication, and `.vercel` project links are unavailable in this checkout. No staging URL can be confirmed.
- Production Supabase is a legacy project incompatible with the current schema. **Never push the current migration chain directly to production.**

## 1. Authorize and verify the backend first

Do not deploy a publicly accessible incident-reporting application to a backend where the confirmed assessment exposure remains unresolved.

1. The project owner must explicitly authorize the privacy migration for the exact development/staging project reference. No hosted development migration is applied by this guide.
2. Review and apply `supabase/migrations/20261124094212_restrict_ai_assessment_rationale.sql` only to the explicitly authorized development/staging project. Do not target production.
3. Run `supabase test db` in an available local Supabase stack and execute the 14 assertions in `supabase/tests/kalasagai_ai_assessment_privacy_test.sql`. Docker and the Supabase CLI were unavailable during this assessment, so that pgTAP run remains outstanding.
4. Verify that direct resident table reads expose no assessment rows, `my_ai_assessments` returns only latest safe fields for owned reports, and authorized staff can read the latest rationale through the staff-gated RPC.
5. Confirm the deployed schema and migration history on the intended project before considering a protected preview. A successful PGlite run is not proof of a hosted migration.
6. Review the development project's existing Supabase Security Advisor notices before public use: callable `SECURITY DEFINER` RPCs, disabled leaked-password protection, and informational private-schema RLS notices.
7. Configure and verify the exact staged Auth site URL, resident email-confirmation and password-reset redirects, personnel recovery callback, email delivery, and CAPTCHA. Do not guess or add placeholder URLs to a hosted allow-list.

The production project requires a separate data-preserving compatibility plan, verified backup, restore rehearsal, and explicit production authorization. Preserve its legacy tables and records. Do not change production credentials, RLS, functions, AI jobs, cron settings, or `gemini_enabled` under this task.

## 2. Connect the two Vercel monorepo projects

Vercel CLI and account authentication were unavailable, so no remote projects or URLs could be inspected or created. Use the authorized project owner's Vercel account:

1. Import the repository once for each application and create/reuse projects named `kalasagai-resident-web` and `kalasagai-personnel-web`.
2. Set **Root Directory** to `apps/resident-web` for Resident Web and `apps/personnel-web` for Personnel Web. Keep the framework as Next.js. The root npm workspace lockfile and shared package must remain available to each build.
3. Use the repository root workspace installation and the corresponding workspace build command if Vercel's defaults do not correctly detect the monorepo:

   ```powershell
   npm install
   npm run build --workspace @kalasag/resident-web
   npm run build --workspace @kalasag/personnel-web
   ```

4. Add only client-safe project values to the matching project environment: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never add a secret/service-role key to either web project.
5. Do not deploy a public preview until the target database privacy migration has been authorized, applied, and verified. If Vercel deployment protection is used, confirm it actually prevents public access before treating a preview as private.
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
