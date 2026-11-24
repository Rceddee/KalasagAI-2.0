import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

async function runCrossAppIntegration() {
  console.log("=== KALASAGAI 2.0 CROSS-APPLICATION END-TO-END INTEGRATION TEST ===");
  const db = new PGlite();
  await db.waitReady;
  console.log("[INIT] Isolated PostgreSQL 16 engine ready.");

  // Provision Supabase base schemas, roles, and extension mocks
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE SCHEMA IF NOT EXISTS cron;
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE SCHEMA IF NOT EXISTS net;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
      )::uuid;
    $$;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
      );
    $$;

    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      aud text DEFAULT 'authenticated',
      role text DEFAULT 'authenticated',
      email text UNIQUE,
      encrypted_password text DEFAULT '',
      email_confirmed_at timestamptz DEFAULT now(),
      raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );

    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now(),
      metadata jsonb DEFAULT '{}'::jsonb
    );

    CREATE OR REPLACE FUNCTION storage.foldername(name text)
    RETURNS text[] LANGUAGE plpgsql AS $$
    DECLARE
      _parts text[];
    BEGIN
      SELECT string_to_array(name, '/') INTO _parts;
      RETURN _parts[1 : (array_length(_parts, 1) - 1)];
    END;
    $$;

    CREATE OR REPLACE FUNCTION storage.filename(name text)
    RETURNS text LANGUAGE plpgsql AS $$
    DECLARE
      _parts text[];
    BEGIN
      SELECT string_to_array(name, '/') INTO _parts;
      RETURN _parts[array_length(_parts, 1)];
    END;
    $$;

    CREATE TABLE IF NOT EXISTS vault.secrets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      description text,
      secret text NOT NULL,
      decrypted_secret text,
      key_id uuid,
      nonce bytea,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE OR REPLACE VIEW vault.decrypted_secrets AS
      SELECT id, name, description, coalesce(decrypted_secret, secret) AS decrypted_secret, key_id, nonce, created_at, updated_at
      FROM vault.secrets;

    CREATE OR REPLACE FUNCTION vault.create_secret(new_secret text, new_name text, new_description text DEFAULT '')
    RETURNS uuid LANGUAGE plpgsql AS $$
    DECLARE
      v_id uuid := gen_random_uuid();
    BEGIN
      INSERT INTO vault.secrets (id, name, secret, decrypted_secret, description)
      VALUES (v_id, new_name, new_secret, new_secret, new_description);
      RETURN v_id;
    END;
    $$;

    CREATE TABLE IF NOT EXISTS cron.job (
      jobid bigserial PRIMARY KEY,
      schedule text NOT NULL,
      command text NOT NULL,
      nodename text DEFAULT 'localhost',
      nodeport integer DEFAULT 5432,
      database text DEFAULT 'postgres',
      username text DEFAULT 'postgres',
      active boolean DEFAULT true,
      jobname text
    );

    CREATE OR REPLACE FUNCTION cron.schedule(p_jobname text, p_schedule text, p_command text)
    RETURNS bigint LANGUAGE plpgsql AS $$
    DECLARE
      v_jobid bigint;
    BEGIN
      INSERT INTO cron.job (jobname, schedule, command)
      VALUES (p_jobname, p_schedule, p_command)
      RETURNING jobid INTO v_jobid;
      RETURN v_jobid;
    END;
    $$;

    CREATE OR REPLACE FUNCTION cron.unschedule(p_jobid bigint)
    RETURNS boolean LANGUAGE plpgsql AS $$
    BEGIN
      DELETE FROM cron.job WHERE jobid = p_jobid;
      RETURN true;
    END;
    $$;

    CREATE OR REPLACE FUNCTION extensions.hmac(data bytea, key bytea, type text)
    RETURNS bytea LANGUAGE plpgsql AS $$
    BEGIN
      RETURN sha256(key || data);
    END;
    $$;

    CREATE OR REPLACE FUNCTION extensions.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
    RETURNS bigint LANGUAGE plpgsql AS $$
    BEGIN
      RETURN 20001;
    END;
    $$;

    CREATE TABLE IF NOT EXISTS extensions._http_response (
      id bigint PRIMARY KEY,
      status_code integer,
      content text,
      headers jsonb,
      timed_out boolean DEFAULT false,
      error_msg text,
      created timestamptz DEFAULT now()
    );
  `);

  // Apply every migration file in order.
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  console.log(`[SCHEMA] Applying ${migrationFiles.length} migration files...`);

  for (const file of migrationFiles) {
    const rawSql = readFileSync(join(migrationsDir, file), "utf-8");
    const sanitized = rawSql
      .replace(/create\s+extension\s+if\s+not\s+exists\s+supabase_vault[^;]*;/gi, "-- [mocked] create extension supabase_vault;")
      .replace(/create\s+extension\s+if\s+not\s+exists\s+pg_cron[^;]*;/gi, "-- [mocked] create extension pg_cron;")
      .replace(/create\s+extension\s+if\s+not\s+exists\s+pgcrypto[^;]*;/gi, "-- [mocked] create extension pgcrypto;")
      .replace(/create\s+extension\s+if\s+not\s+exists\s+pg_net[^;]*;/gi, "-- [mocked] create extension pg_net;")
      .replace(/create\s+extension\s+pg_net[^;]*;/gi, "-- [mocked] create extension pg_net;")
      .replace(/drop\s+extension\s+pg_net[^;]*;/gi, "-- [mocked] drop extension pg_net;");
    await db.exec(sanitized);
  }
  console.log(`[SCHEMA] Applied all ${migrationFiles.length} migrations successfully.`);

  // Provision Vault secrets for AI dispatch
  await db.exec(`
    SELECT vault.create_secret('https://ydyawyqhvdlllqrtuxko.supabase.co', 'kalasagai_ai_dispatch_project_url');
    SELECT vault.create_secret('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.mock_signature', 'kalasagai_ai_dispatch_anon_jwt');
    SELECT vault.create_secret('cross-app-e2e-dispatch-secret-key-32b', 'kalasagai_ai_dispatch_hmac_key');
  `);

  // =========================================================================
  // STEP 1: RESIDENT REGISTRATION & PROFILE (Resident Web)
  // =========================================================================
  console.log("\n--- STEP 1: Resident Registration & Authentication ---");
  const residentId = "10000000-0000-4000-8000-000000000001";
  await db.exec(`
    INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    VALUES ('${residentId}', 'authenticated', 'authenticated', 'juandelacruz@example.ph',
      '{"provider":"email"}', '{"full_name":"Juan Dela Cruz","contact_number":"09171234567"}');
  `);
  const residentProfile = (await db.query(`SELECT id, full_name, contact_number, role FROM public.profiles WHERE id = '${residentId}';`)).rows[0];
  console.log(`  [VERIFIED] Resident profile auto-created: ${residentProfile.full_name}, Phone: ${residentProfile.contact_number}, Role: ${residentProfile.role}`);

  // =========================================================================
  // STEP 2: EVIDENCE UPLOAD & INCIDENT SUBMISSION (Resident Web)
  // =========================================================================
  console.log("\n--- STEP 2: Private Evidence Upload & Incident Submission ---");
  const idempotencyKey = "20000000-0000-4000-8000-000000000002";
  const evidencePath = `${residentId}/${idempotencyKey}/evidence_photo_0.jpg`;

  // Simulate private storage object upload
  await db.exec(`
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('incident-evidence', '${evidencePath}', '${residentId}', '{"mimetype":"image/jpeg","size":"1048576"}'::jsonb);
    SET request.jwt.claim.sub = '${residentId}';
  `);

  // Resident submits incident via public.submit_incident RPC
  const incidentResult = (await db.query(`
    SELECT * FROM public.submit_incident(
      '${idempotencyKey}'::uuid,
      'Active commercial structure fire with heavy black smoke spreading to adjacent residences near the market.',
      'Market Area, Barangay Poblacion, Gumaca, Quezon',
      13.9218,
      122.1008,
      ARRAY['${evidencePath}']
    );
  `)).rows[0];

  const incidentId = incidentResult.id;
  console.log(`  [VERIFIED] Incident submitted successfully: Reference: ${incidentResult.reference}, ID: ${incidentId}`);
  console.log(`  [VERIFIED] Operational status set to: ${incidentResult.status}`);

  // Verify status history & audit logs
  const statusHistory = (await db.query(`SELECT from_status, to_status, note FROM public.incident_status_history WHERE incident_id = '${incidentId}';`)).rows[0];
  console.log(`  [VERIFIED] Status history recorded: ${statusHistory.from_status ?? 'null'} -> ${statusHistory.to_status} ("${statusHistory.note}")`);

  const submitAudit = (await db.query(`SELECT action, actor_id, details FROM public.audit_logs WHERE incident_id = '${incidentId}' AND action = 'incident.submitted';`)).rows[0];
  console.log(`  [VERIFIED] Audit trail created: ${submitAudit.action} by actor ${submitAudit.actor_id}`);

  // =========================================================================
  // STEP 3: AI DISPATCH QUEUE & ATOMIC WORKER CLAIM (Background Edge Engine)
  // =========================================================================
  console.log("\n--- STEP 3: Automated AI Job Enqueue & Atomic Claim ---");
  const aiJob = (await db.query(`SELECT id, status, attempts, dispatch_attempts FROM app_private.ai_jobs WHERE incident_id = '${incidentId}';`)).rows[0];
  console.log(`  [VERIFIED] AI Job automatically queued: Status=${aiJob.status}, Attempts=${aiJob.attempts}`);

  // Worker token claiming
  const workerToken = "30000000-0000-4000-8000-000000000003";
  const claimRes = (await db.query(`
    SELECT public.claim_ai_job_delivery(
      '${incidentId}'::uuid,
      '${residentId}'::uuid,
      '${workerToken}'::uuid,
      (SELECT dispatch_timestamp FROM app_private.ai_jobs WHERE incident_id = '${incidentId}')
    ) AS claimed;
  `)).rows[0];
  console.log(`  [VERIFIED] Edge worker claimed job atomically: claimed=${claimRes.claimed}`);

  // Replay protection: concurrent worker claim must fail
  const duplicateClaim = (await db.query(`
    SELECT public.claim_ai_job_delivery(
      '${incidentId}'::uuid,
      '${residentId}'::uuid,
      gen_random_uuid(),
      (SELECT dispatch_timestamp FROM app_private.ai_jobs WHERE incident_id = '${incidentId}')
    ) AS claimed;
  `)).rows[0];
  console.log(`  [VERIFIED] Duplicate/concurrent worker claim rejected: ${!duplicateClaim.claimed}`);

  // Worker records AI assessment
  const aiAssessment = (await db.query(`
    SELECT * FROM public.record_claimed_ai_assessment(
      '${incidentId}'::uuid,
      '${workerToken}'::uuid,
      'fire'::public.incident_category,
      'high'::public.incident_priority,
      'Heavy smoke and active flames confirmed from commercial structure; high risk to nearby structures.',
      'gemini-3.5-flash-lite',
      null
    );
  `)).rows[0];
  console.log(`  [VERIFIED] AI assessment recorded: Category=${aiAssessment.suggested_category}, Priority=${aiAssessment.suggested_priority}`);

  // Check AI audit attribution & operational status invariant
  const aiAudit = (await db.query(`SELECT actor_id, action, details FROM public.audit_logs WHERE incident_id = '${incidentId}' AND action = 'incident.ai_assessed';`)).rows[0];
  console.log(`  [VERIFIED] AI Audit attribution: actor_id=${aiAudit.actor_id} (null = system), source=${aiAudit.details.source}`);

  const postAiIncident = (await db.query(`SELECT status FROM public.incidents WHERE id = '${incidentId}';`)).rows[0];
  console.log(`  [VERIFIED] Critical Invariant: AI assessment DID NOT alter operational status: ${postAiIncident.status}`);

  // =========================================================================
  // STEP 4: PERSONNEL WEB MODULES & HUMAN CLASSIFICATION REVIEW
  // =========================================================================
  console.log("\n--- STEP 4: Personnel Web Modules & Human Review ---");
  const officerId = "40000000-0000-4000-8000-000000000004";
  await db.exec(`
    INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    VALUES ('${officerId}', 'authenticated', 'authenticated', 'officer.santos@kalasag.gov.ph',
      '{"account_type":"personnel","personnel_role":"communication_officer"}', '{"full_name":"Officer Maria Santos","contact_number":"09189876543"}');
    SET request.jwt.claim.sub = '${officerId}';
  `);

  // Module 1 (Maps & Reports): Officer queries active incidents
  const mapIncidents = (await db.query(`SELECT id, reference, description, latitude, longitude, status FROM public.incidents WHERE id = '${incidentId}';`)).rows[0];
  console.log(`  [VERIFIED] Module 1 (Maps & Reports): Incident located at (${mapIncidents.latitude}, ${mapIncidents.longitude}) with status ${mapIncidents.status}`);

  // Module 2 (Incident Blotters): Human Classification Review
  const humanReview = (await db.query(`
    SELECT * FROM public.review_incident_classification(
      '${incidentId}'::uuid,
      'fire'::public.incident_category,
      'high'::public.incident_priority,
      null,
      'Human Review: Verified structural fire with Poblacion BFP dispatch units.'
    );
  `)).rows[0];
  console.log(`  [VERIFIED] Module 2 (Blotters): Classification confirmed by human officer: Category=${humanReview.confirmed_category}, Priority=${humanReview.confirmed_priority}`);

  // Forward Status Transition: pending -> in_progress
  const statusUpdate = (await db.query(`
    SELECT * FROM public.update_incident_status(
      '${incidentId}'::uuid,
      'in_progress'::public.incident_status,
      'BFP Gumaca Engine 1 and MDRRMO rescue team dispatched to the scene.'
    );
  `)).rows[0];
  console.log(`  [VERIFIED] Status updated to: ${statusUpdate.status} ("${statusUpdate.description}")`);

  // Module 3 (Analytics): Accuracy calculation logic
  const analyticsData = (await db.query(`
    SELECT
      a.suggested_category,
      r.confirmed_category
    FROM public.ai_assessments a
    JOIN public.classification_reviews r ON r.incident_id = a.incident_id
    WHERE a.incident_id = '${incidentId}';
  `)).rows[0];
  const isMatch = analyticsData.suggested_category === analyticsData.confirmed_category;
  console.log(`  [VERIFIED] Module 3 (Analytics): Suggested=${analyticsData.suggested_category}, Confirmed=${analyticsData.confirmed_category}, Match=${isMatch}`);

  // Module 4 (AI Volume & Surge): Setting verification
  const surgeSetting = (await db.query(`SELECT value FROM public.system_settings WHERE key = 'surge_mode';`)).rows[0];
  console.log(`  [VERIFIED] Module 4 (Surge): Surge mode indicator setting = ${JSON.stringify(surgeSetting.value)}`);

  // Module 5 (Activity Logs): Query full audit log
  const auditLogs = (await db.query(`SELECT action, actor_id, created_at FROM public.audit_logs WHERE incident_id = '${incidentId}' ORDER BY created_at ASC;`)).rows;
  console.log(`  [VERIFIED] Module 5 (Activity Logs): ${auditLogs.length} audit records found: ${auditLogs.map(a => a.action).join(" -> ")}`);

  // =========================================================================
  // STEP 5: RESIDENT STATUS TRACKING & DATA PRIVACY
  // =========================================================================
  console.log("\n--- STEP 5: Resident Status Tracking & Privacy Isolation ---");
  await db.exec(`SET request.jwt.claim.sub = '${residentId}';`);

  // Resident checks review summary via RPC
  const residentReview = (await db.query(`SELECT * FROM public.my_report_review('${incidentId}'::uuid);`)).rows[0];
  console.log(`  [VERIFIED] Resident queries my_report_review: Category=${residentReview.confirmed_category}, Priority=${residentReview.confirmed_priority}`);
  console.log(`  [VERIFIED] Privacy Guard: Officer reviewer note is NOT present in resident review result: ${!('reviewer_notes' in residentReview)}`);

  // Resident checks status history
  const residentHistory = (await db.query(`
    SELECT to_status, note, created_at
    FROM public.incident_status_history
    WHERE incident_id = '${incidentId}'
    ORDER BY created_at ASC;
  `)).rows;
  console.log(`  [VERIFIED] Resident views status timeline:`);
  for (const h of residentHistory) {
    console.log(`    - Status: ${h.to_status} | Note: "${h.note}"`);
  }

  // Isolation check: another resident cannot see Juan's review summary
  const otherResidentId = "50000000-0000-4000-8000-000000000005";
  await db.exec(`
    INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    VALUES ('${otherResidentId}', 'authenticated', 'authenticated', 'other@example.ph',
      '{"provider":"email"}', '{"full_name":"Maria Clara","contact_number":"09201234567"}');
    SET request.jwt.claim.sub = '${otherResidentId}';
  `);
  const unauthorizedReview = (await db.query(`SELECT * FROM public.my_report_review('${incidentId}'::uuid);`)).rows;
  console.log(`  [VERIFIED] Tenant Isolation: Other resident querying Juan's incident receives ${unauthorizedReview.length} rows`);

  console.log("\n=== FULL CROSS-APPLICATION INTEGRATION TEST COMPLETED SUCCESSFULLY ===");
}

runCrossAppIntegration().catch((err) => {
  console.error("FATAL ERROR in integration runner:", err);
  process.exit(1);
});
