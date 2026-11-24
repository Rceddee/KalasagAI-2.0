# KALASAG-AI

KALASAG-AI is a resident and personnel incident-reporting and MDRRMO operations platform for Gumaca, Quezon. Its current applications are Personnel Web and Resident Web, built with Next.js and TypeScript. Supabase provides authentication, data, private evidence storage, realtime updates, and trusted server-side functions.

## Current applications

| Application | Location | Purpose |
| --- | --- | --- |
| Resident web | [`apps/resident-web`](./apps/resident-web) | Account registration, resident and personnel incident submission and tracking, and profile management |
| Personnel web | [`apps/personnel-web`](./apps/personnel-web) | Five role-filtered sidebar links: Maps and Reports, Incident Blotters, Analytics & Reports, Activity Logs, and Admin Controls; AI usage, report activity, and surge controls are nested under Admin Controls |
| Shared validation | [`packages/shared-validation`](./packages/shared-validation) | Shared incident, status, and contact validation |
| Supabase | [`supabase`](./supabase) | Database migration, RLS policies, storage rules, Edge Functions, and pgTAP security tests |

## Release documentation

- [Web release report](./docs/KALASAGAI_WEB_RELEASE_REPORT.md) — current web verification results and release blockers.
- [Deployment guide](./docs/KALASAGAI_DEPLOYMENT_GUIDE.md) — staged deployment, privacy checks, and go-live gates.
- [Final deployment blockers](./docs/KALASAGAI_FINAL_DEPLOYMENT_BLOCKERS.md) — project-owner actions required before staging or release.

## Security and operations

- Residents can view their own incidents and profiles. Staff access is role-checked by database policies and RPCs.
- Evidence is stored in the private `incident-evidence` bucket. Clients use short-lived signed URLs; clients cannot directly change incident status or classification records.
- Residents and personnel can submit reports through Resident Web. Each report remains owned by its submitter and requires a valid mobile number, which is snapshotted and only returned to authorized communication officers and administrators.
- On submission, the database queues and automatically dispatches the report for AI classification when Gemini is enabled. Gemini analyzes the description and private evidence photos to suggest a category and Low/Medium/High priority. Personnel review that suggestion and confirm or correct it; they do not initiate normal classification. AI does not assign responders, approve reports, or change operational incident status.
- AI classification requires both the database setting and server-side configuration, including a Gemini API key. Report text and evidence photos are sent to Gemini for classification and may incur charges. The automatic first dispatch does not mean every failed request will be retried: the scheduled retry/recovery job must also be active.
- Never put a Supabase service-role/secret key or Gemini API key in a browser client, and never commit secrets.

## Prerequisites

- Node.js 20.9 or later and npm
- Supabase CLI for database and Edge Function workflows; Docker is required only for the full local Supabase stack

## Web setup

From the repository root:

```powershell
npm install
```

Create a `.env.local` file in each web app using its `.env.example` as a template. Set the public Supabase URL and publishable key; these are client-side values, not service-role secrets. The resident app uses port 3001 and the personnel app uses port 3000.

```powershell
npm run dev --workspace @kalasag/resident-web
npm run dev --workspace @kalasag/personnel-web
```

The resident and personnel applications run on their package-configured local ports. Start each command in a separate terminal.

## Supabase Cloud development

This workspace is configured to use a dedicated Cloud development project through ignored local environment files. Its Cloud project reference and keys are intentionally not committed. `project_id = "kalasagai"` in `supabase/config.toml` is only the local CLI project name, not the Cloud project reference. Do not select or reuse production.

The following setup steps are for a fresh checkout only. Do not create another project if a development project is already configured:

1. Open **New project**, choose the intended organization, name the project `kalasagai-dev`, choose a nearby region, and set a unique strong database password. Store that password in your approved password manager.
2. Wait until the project reports healthy. Copy the **Project URL** from **Project Settings → API** and the **Publishable key** from **Project Settings → API Keys**. Do not put a secret/service-role key in either web app.
3. In **Authentication → URL Configuration**, set the development Site URL and allow the resident callback/reset URLs (`http://localhost:3001/auth/callback` and `http://localhost:3001/reset-password`). Add the development web origins only when their URLs are known. Set the password minimum to eight characters.
4. Copy the web `.env.example` files to each app's ignored `.env.local` and fill in only the development URL and publishable key.
5. Copy `supabase/functions/.env.example` to the ignored `supabase/functions/.env.local`. Set the development URL, publishable key, server-side secret key, and the resident web redirect base. Keep `GEMINI_ENABLED=false` for fresh/local setups unless live inference is separately authorized for that environment.
6. Verify the project reference and environment are development-only before requesting authorization for a migration. No hosted project creation, linking, migration, test account creation, Edge Function deployment, or secret change is performed by these instructions.

The existing `kalasagai-dev` Cloud project was separately authorized for live Gemini classification on 2026-11-24. That approval does not enable a fresh local setup or production. Production was not changed. A read-only release preflight on 2026-11-24 confirmed that a separate production Supabase project exists, but its schema and Edge Functions do not match this checkout; production deployment remains gated. Incident operational status (for example, **Pending**) is separate from AI classification and personnel review.

After the development project is confirmed and the migration is separately authorized, the CLI workflow is `npx --yes supabase@3.1.0 link --project-ref <DEV_PROJECT_REF>`, review with `npx --yes supabase@3.1.0 db push --remote --dry-run`, then apply with `npx --yes supabase@3.1.0 db push --remote` only after explicit approval for that project. Cloud pgTAP execution and Edge Function deployment also require their own approved operations.

## Local Supabase

From the repository root, start the local Supabase stack and apply migrations (requires Docker):

```powershell
supabase start
supabase db reset
```

The local API is enabled and no seed file is configured.

The bootstrap pgTAP suite creates a generated resident fixture and requires the bootstrap routines from `scripts/install-bootstrap-procedure.sql`. The CI database job installs those routines only into its isolated local Supabase container. To run that suite locally, install them into the local container after `supabase start` and before `supabase test db`:

```powershell
docker cp .\scripts\install-bootstrap-procedure.sql supabase_db_kalasagai:/tmp/bootstrap-procedure.sql
docker exec supabase_db_kalasagai psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/bootstrap-procedure.sql
```

These commands target the local container named by `project_id` in `supabase/config.toml`. Do not run the bootstrap installer against a hosted project.

Run the database security tests and serve the functions locally with:

```powershell
supabase test db
supabase functions serve --env-file .\supabase\functions\.env.local
```

Create the ignored `supabase/functions/.env.local` file for local function settings. It needs the local `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `PERSONNEL_WEB_URL` (normally `http://localhost:3000`). Keep `GEMINI_ENABLED=false` and omit the Gemini API key unless a Super Admin explicitly enables AI; function secrets must never be copied into a web environment file.

Set `GEMINI_MODEL1` to `gemini-3.5-flash-lite` for GenerateContent JSON classification or `gemini-decision-1` for the Decisions API's typed category/priority answers. `GEMINI_MODEL` remains a supported legacy alias. Configure one model per deployment; for hosted projects, set it in that project's Edge Function secrets. Decision 1 stores its category and priority confidence summary as the assessment rationale; both model results remain suggestions for personnel review.

The local Auth allow-list includes the resident web callback/reset URLs and Personnel Web's `http://localhost:3000/auth/callback`. Local Auth enforces passwords of at least eight characters; configure the matching Personnel Web callback in the hosted Supabase Auth redirect allow-list before sending hosted recovery links. Add the equivalent production redirect URLs before launch.

Personnel Web's Admin Controls lets admins invite responders and communication officers; only a Super Admin can invite Admins or Super Admins. Invitations use the role-checked `manage-personnel` Edge Function, which provisions accounts with the Admin `createUser` API so trusted `app_metadata` is present when the profile trigger runs. Supabase's `inviteUserByEmail` `data` option maps to user-controlled `user_metadata`, which this trigger deliberately does not trust for roles. The reset email is a recovery flow; the Personnel Web callback handles it at `/auth/callback` and routes to its password setup page. The development-only bootstrap helper is `scripts/bootstrap-development-super-admin.mjs`; it pins requests to the development project and never prints or stores the secret key. Do not run it until the separate hosted account-creation approval is granted.

For local development only, create a resident account in the web app, then promote that account to the initial Super Admin using the local Supabase SQL editor as the database owner:

```sql
begin;
select set_config('kalasag.allow_role_change', 'on', true);
update public.profiles
set role = 'super_admin'
where email = 'your-local-account@example.test' and role = 'resident';
insert into public.audit_logs (actor_id, action, details)
values (
  null,
  'personnel.bootstrap_super_admin',
  jsonb_build_object(
    'target_email', 'your-local-account@example.test',
    'actor_source', 'local_database_owner_sql_editor'
  )
);
commit;
```

Use a unique local account and verify the SQL editor reports one updated profile. SQL Editor does not authenticate an application actor, so this audit entry deliberately leaves `actor_id` null instead of falsely attributing the operation to the promoted account. This is a local bootstrap step, not a client-side role-management path or a hosted bootstrap procedure.

## Validation

Run the workspace checks from the repository root:

```powershell
npm test
npm run lint
npm run typecheck
npm run build --workspace @kalasag/personnel-web
npm run build --workspace @kalasag/resident-web
```

Run `supabase test db` against the local Supabase stack for database permission and data-isolation tests. No hosted database changes or deployments are part of local development.

## Production builds and deployment

The GitHub Actions workflow runs npm tests, lint, type checks, a full npm audit, isolated production builds for both web apps, Edge Function tests and checks, and local pgTAP tests. It does not deploy or use production credentials.

To build the web apps locally without sharing the `.next` output used by running development servers, set `NEXT_BUILD_DIST_DIR=build` for the build command. Normal Vercel builds use Next.js's default `.next` directory.

### Current production gate — checked 2026-11-24: NO-GO

The production Supabase project exists and is active, but its eight recorded migrations do not overlap this checkout's earlier migration history; this checkout now has nine local migrations, including an unapplied AI assessment privacy migration. Its legacy schema (`incident_reports`, `status_history`, and related tables) and its `analyze-incident` function do not match the current development schema and functions (`classify-incident` and `manage-personnel`). The development project matches this checkout. Do not run the current migration chain with `supabase db push`, deploy the current functions directly, or create a replacement production project. No production writes or deployments were performed during this check.

Before a production launch:

1. Reconcile the existing production schema with a data-preserving, in-place compatibility migration. First take a verified backup and rehearse recovery. Keep legacy tables and records until mappings, application behavior, and rollback are validated; the current migration chain is not a production upgrade script.
2. Resolve legacy-data mappings before cutover: multiple personnel roles versus the current single-role model, legacy incident statuses, account status, missing resident contact numbers, and richer AI/audit/job history. Preserve original values and hold ambiguous records for review.
3. Configure separate Vercel projects for Resident Web and Personnel Web, with root directories `apps/resident-web` and `apps/personnel-web`. No local Vercel project links or production domains are configured in this checkout. Set only the production URL and publishable key in each app's environment; never put a secret/service-role key in a `NEXT_PUBLIC_*` variable.
4. Configure and verify production Auth URLs, SMTP, email confirmation, CAPTCHA, SSL enforcement, database network restrictions, RLS, backups/PITR, and function secrets. Deploy new Edge Functions only after the staged schema is validated; retain `analyze-incident` until legacy clients are retired. Keep Gemini disabled until production inference, cost limits, and alerting are explicitly approved.
5. Confirm data-retention sign-off, production domains, email delivery, and rollback steps before enabling any deployment workflow. The repository has no production Vercel link, configured production client environment, or automatic deployment credentials.

The optional `scripts/verify-full-integration.mjs` test mutates its explicitly selected synthetic incident. It is restricted to the authorized development project and requires explicit opt-in plus dedicated test-account and test-incident environment variables; never run it against production.
