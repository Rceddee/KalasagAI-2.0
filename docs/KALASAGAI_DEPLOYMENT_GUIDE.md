# KALASAG-AI Web Deployment Guide

**November 25, 2026 · Capstone release `1395b08`.** Both aliases serve the web applications from the repository’s `main` branch and connect to Supabase project `kalasagai-dev` (`ydyawyqhvdlllqrtuxko`). The operational production database is a separate environment.

## Existing Vercel projects

| App | Vercel project | Root directory | Public entry point |
| --- | --- | --- | --- |
| Resident Web | `kalasagai-resident-web` | `apps/resident-web` | [Resident sign-in](https://kalasagai-resident-web.vercel.app/) |
| Personnel Web | `kalasag-ai-2-0` | `apps/personnel-web` | [Personnel sign-in](https://kalasag-ai-2-0.vercel.app/login) |

Use the existing Next.js projects and the repository workspace lockfile. Both apps use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for development. Personnel Web also uses `SUPABASE_SECRET_KEY` in its server-side reporter endpoint. Keep privileged credentials in the appropriate server environment. Vercel preview protection and application authentication serve different purposes. The public aliases admit visitors to sign-in, and application roles govern staff pages and private data.

## Development Auth

The hosted Site URL is `https://kalasagai-resident-web.vercel.app`. Preserve existing localhost development entries when maintaining the redirect allowlist. The hosted entries used by these apps are:

- `https://kalasagai-resident-web.vercel.app/auth/callback`
- `https://kalasagai-resident-web.vercel.app/reset-password`
- `https://kalasag-ai-2-0.vercel.app/auth/callback`
- `https://kalasag-ai-2-0.vercel.app/auth/callback?type=recovery`

The `manage-personnel` function uses `PERSONNEL_WEB_URL=https://kalasag-ai-2-0.vercel.app` for staff setup links. Migration `20261124150646` lets the profile trigger validate phone-less staff invitations after Auth saves the trusted role. Resident registration still requires a valid phone number. Custom SMTP uses Gmail on port 587. Enter the Google App Password only in the hosted SMTP password field.

## Development release checks

Use the existing deployments for subsequent releases. Check CI for the exact commit, verify Vercel deployment status, open the public sign-in pages, and check that signed-out requests to the Personnel reporter route receive HTTP 401. For account, evidence, report, and classification tests, the [release report](KALASAGAI_WEB_RELEASE_REPORT.md) records which checks used fixtures and which used existing live data. The development AI-assessment privacy migration is recorded as `20261124122754`.

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

The legacy operational Supabase project has a schema and migration history incompatible with this checkout. Its cutover requires separate authorization.

Before a production launch:

1. Reconcile the existing production schema with a data-preserving, in-place compatibility migration. First take a verified backup and rehearse recovery. Keep legacy tables and records until mappings, application behavior, and rollback are validated; the current migration chain is not a production upgrade script.
2. Resolve legacy-data mappings before cutover: multiple personnel roles versus the current single-role model, legacy incident statuses, account status, missing resident contact numbers, and richer AI/audit/job history. Preserve original values and hold ambiguous records for review.
3. Verify production-specific environment assignments, Auth URLs, SMTP, email confirmation, CAPTCHA, SSL enforcement, database network restrictions, RLS, backups/PITR, and function secrets.
4. Deploy new Edge Functions only after the staged schema is validated; retain legacy functions until old clients are retired. Keep Gemini disabled until production inference, cost limits, and alerting are explicitly approved.
5. Confirm data-retention sign-off, production domains, email delivery, and rollback steps before enabling any deployment workflow. The current public aliases target the development backend.

The optional `scripts/verify-full-integration.mjs` test mutates its explicitly selected synthetic incident. It is restricted to the authorized development project and requires explicit opt-in plus dedicated test-account and test-incident environment variables; never run it against production.
