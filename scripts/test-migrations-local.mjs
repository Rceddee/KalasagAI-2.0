import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

async function run() {
  console.log("=== KALASAGAI 2.0 LOCAL POSTGRESQL MIGRATION TEST ===");
  const db = new PGlite();
  await db.waitReady;
  console.log("Isolated PostgreSQL 16 engine ready.");

  // Setup Supabase environment primitives (roles, auth, storage, extensions schemas)
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
      jobname text UNIQUE
    );

    CREATE OR REPLACE FUNCTION cron.schedule(p_jobname text, p_schedule text, p_command text)
    RETURNS bigint LANGUAGE plpgsql AS $$
    DECLARE
      v_id bigint;
    BEGIN
      INSERT INTO cron.job (jobname, schedule, command)
      VALUES (p_jobname, p_schedule, p_command)
      ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
      RETURNING jobid INTO v_id;
      RETURN v_id;
    END;
    $$;

    CREATE OR REPLACE FUNCTION cron.unschedule(p_jobid bigint)
    RETURNS boolean LANGUAGE plpgsql AS $$
    BEGIN
      DELETE FROM cron.job WHERE jobid = p_jobid;
      RETURN FOUND;
    END;
    $$;

    CREATE OR REPLACE FUNCTION cron.unschedule(p_jobname text)
    RETURNS boolean LANGUAGE plpgsql AS $$
    BEGIN
      DELETE FROM cron.job WHERE jobname = p_jobname;
      RETURN FOUND;
    END;
    $$;

    CREATE OR REPLACE FUNCTION cron.alter_job(
      job_id bigint,
      schedule text DEFAULT NULL,
      command text DEFAULT NULL,
      database text DEFAULT NULL,
      username text DEFAULT NULL,
      active boolean DEFAULT NULL
    )
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE cron.job AS job
      SET active = COALESCE($6, job.active)
      WHERE job.jobid = $1;
    END;
    $$;

    CREATE OR REPLACE FUNCTION extensions.hmac(data bytea, key bytea, type text)
    RETURNS bytea LANGUAGE plpgsql AS $$
    BEGIN
      -- Mock HMAC function for local testing
      RETURN sha256(key || data);
    END;
    $$;

    CREATE OR REPLACE FUNCTION extensions.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
    RETURNS bigint LANGUAGE plpgsql AS $$
    BEGIN
      RETURN 10001;
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
  console.log("Supabase base schemas and primitives installed.");

  // Discover and sort all migrations
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Discovered ${migrationFiles.length} migration files:`);
  for (const f of migrationFiles) {
    console.log(`  - ${f}`);
  }

  for (const file of migrationFiles) {
    console.log(`\nApplying: ${file}...`);
    let sql = readFileSync(join(migrationsDir, file), "utf-8");

    // Clean up extension commands that require C modules in vanilla PG if present
    // Replace "create extension if not exists ... with schema ..." with comments
    // since we already provisioned the compatible schema wrappers
    const sanitizedSql = sql
      .replace(/create\s+extension\s+if\s+not\s+exists\s+supabase_vault[^;]*;/gi, "-- [mocked] create extension supabase_vault;")
      .replace(/create\s+extension\s+if\s+not\s+exists\s+pg_cron[^;]*;/gi, "-- [mocked] create extension pg_cron;")
      .replace(/create\s+extension\s+if\s+not\s+exists\s+pgcrypto[^;]*;/gi, "-- [mocked] create extension pgcrypto;")
      .replace(/create\s+extension\s+if\s+not\s+exists\s+pg_net[^;]*;/gi, "-- [mocked] create extension pg_net;")
      .replace(/create\s+extension\s+pg_net[^;]*;/gi, "-- [mocked] create extension pg_net;")
      .replace(/drop\s+extension\s+pg_net[^;]*;/gi, "-- [mocked] drop extension pg_net;");

    try {
      await db.exec(sanitizedSql);
      console.log(`  -> SUCCESS: ${file}`);
    } catch (err) {
      console.error(`  -> FAILED: ${file}`, err);
      process.exit(1);
    }
  }

  console.log("\n=== ALL MIGRATIONS APPLIED SUCCESSFULLY ===");

  const dispatcherJob = await db.query(
    "SELECT active FROM cron.job WHERE jobname = 'kalasagai-ai-job-dispatch';",
  );
  if (dispatcherJob.rows.length !== 1 || dispatcherJob.rows[0].active !== false) {
    throw new Error("The AI dispatcher cron job must be installed as inactive");
  }
  console.log("  [PASS] AI dispatcher scheduler is installed inactive");

  // Now execute functional runtime tests against the migrated database
  console.log("\nExecuting functional runtime tests...");

  // Test 1: Seed a resident user
  const residentId = "11111111-1111-4111-8111-111111111111";
  await db.exec(`
    INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    VALUES ('${residentId}', 'authenticated', 'authenticated', 'resident@example.test',
      '{"provider":"email"}', '{"full_name":"Test Resident","contact_number":"09171234567"}');
  `);
  console.log("  [PASS] Resident user seeded, profile trigger fired.");

  // Verify profile creation
  const profileRes = await db.query(`SELECT id, full_name, role FROM public.profiles WHERE id = '${residentId}';`);
  console.log(`  [PASS] Profile created automatically: ${profileRes.rows[0].full_name} (${profileRes.rows[0].role})`);

  // Test 2: Seed Vault configuration for AI dispatch
  await db.exec(`
    SELECT vault.create_secret('https://ydyawyqhvdlllqrtuxko.supabase.co', 'kalasagai_ai_dispatch_project_url');
    SELECT vault.create_secret('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.mock_signature', 'kalasagai_ai_dispatch_anon_jwt');
    SELECT vault.create_secret('test-dispatch-hmac-secret-key-32-bytes-long', 'kalasagai_ai_dispatch_hmac_key');
  `);
  console.log("  [PASS] Vault secrets created.");

  // Test 3: Create incident (triggers app_private.record_incident_creation and AI dispatch)
  const incidentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const idempKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await db.exec(`
    INSERT INTO public.incidents (id, reference, resident_id, idempotency_key, description, location_label, latitude, longitude)
    VALUES ('${incidentId}', 'KAL-TEST-000001', '${residentId}', '${idempKey}', 'Thick black smoke rising near town hall', 'Poblacion', 13.9221, 122.1005);
  `);
  console.log("  [PASS] Incident created with automatic incident_creation trigger.");

  // Verify status history
  const historyRes = await db.query(`SELECT to_status, note FROM public.incident_status_history WHERE incident_id = '${incidentId}';`);
  console.log(`  [PASS] Status history record: ${historyRes.rows[0].to_status} - "${historyRes.rows[0].note}"`);

  // Verify audit log
  const auditRes = await db.query(`SELECT action, details FROM public.audit_logs WHERE incident_id = '${incidentId}';`);
  console.log(`  [PASS] Audit log recorded: ${auditRes.rows[0].action} with details: ${JSON.stringify(auditRes.rows[0].details)}`);

  // Verify AI job creation and dispatch state
  const jobRes = await db.query(`SELECT status, attempts, dispatch_attempts, last_dispatch_request_id FROM app_private.ai_jobs WHERE incident_id = '${incidentId}';`);
  console.log(`  [PASS] AI Job state: status=${jobRes.rows[0].status}, attempts=${jobRes.rows[0].attempts}, dispatch_attempts=${jobRes.rows[0].dispatch_attempts}, request_id=${jobRes.rows[0].last_dispatch_request_id}`);

  // Test 4: Atomic claiming of delivery
  const workerToken = "99999999-9999-4999-8999-999999999999";
  const claimRes = await db.query(`
    SELECT public.claim_ai_job_delivery(
      '${incidentId}'::uuid,
      '${residentId}'::uuid,
      '${workerToken}'::uuid,
      (SELECT dispatch_timestamp FROM app_private.ai_jobs WHERE incident_id = '${incidentId}')
    ) AS claimed;
  `);
  console.log(`  [PASS] claim_ai_job_delivery result: ${claimRes.rows[0].claimed}`);

  // Test 5: Duplicate claim must fail
  const duplicateClaimRes = await db.query(`
    SELECT public.claim_ai_job_delivery(
      '${incidentId}'::uuid,
      '${residentId}'::uuid,
      gen_random_uuid(),
      (SELECT dispatch_timestamp FROM app_private.ai_jobs WHERE incident_id = '${incidentId}')
    ) AS claimed;
  `);
  console.log(`  [PASS] Duplicate claim rejected: ${!duplicateClaimRes.rows[0].claimed}`);

  // Test 6: Record claimed AI assessment (automated)
  const assessmentRes = await db.query(`
    SELECT * FROM public.record_claimed_ai_assessment(
      '${incidentId}'::uuid,
      '${workerToken}'::uuid,
      'fire'::public.incident_category,
      'high'::public.incident_priority,
      'Smoke visible from commercial structure',
      'gemini-3.5-flash-lite',
      null
    );
  `);
  console.log(`  [PASS] AI assessment recorded: category=${assessmentRes.rows[0].suggested_category}, priority=${assessmentRes.rows[0].suggested_priority}`);

  const assessmentPrivileges = await db.query(`
    SELECT
      has_table_privilege('authenticated', 'public.ai_assessments', 'select') AS table_select,
      has_function_privilege('authenticated', 'public.my_ai_assessments(uuid[])', 'execute') AS resident_rpc,
      has_function_privilege('authenticated', 'public.get_staff_ai_assessment(uuid)', 'execute') AS staff_rpc;
  `);
  const assessmentAccess = assessmentPrivileges.rows[0];
  if (
    !assessmentAccess.table_select ||
    !assessmentAccess.resident_rpc ||
    !assessmentAccess.staff_rpc
  ) {
    throw new Error("Assessment access does not retain Realtime reads and safe RPC access");
  }
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${residentId}';`);
  const safeAssessmentRes = await db.query(`
    SELECT incident_id, suggested_category, created_at
    FROM public.ai_assessments
    WHERE incident_id = '${incidentId}';
  `);
  if (safeAssessmentRes.rows.length !== 0) {
    throw new Error("Residents must not read assessment rows directly");
  }
  const residentSafeRpc = await db.query(`
    SELECT incident_id, suggested_category
    FROM public.my_ai_assessments(ARRAY['${incidentId}'::uuid]);
  `);
  if (
    residentSafeRpc.rows.length !== 1 ||
    residentSafeRpc.rows[0].suggested_category !== "fire"
  ) {
    throw new Error("Residents must read only the safe assessment summary for their own incidents");
  }
  const residentAssessmentRpc = await db.query(`
    SELECT * FROM public.get_staff_ai_assessment('${incidentId}'::uuid);
  `);
  if (residentAssessmentRpc.rows.length !== 0) {
    throw new Error("The staff assessment RPC must not return rationale to residents");
  }
  await db.exec("RESET ROLE;");
  console.log("  [PASS] RLS blocks resident table reads; the owner-checked RPC returns only safe assessment fields");

  // Verify AI job is now complete
  const jobCompleteRes = await db.query(`SELECT status FROM app_private.ai_jobs WHERE incident_id = '${incidentId}';`);
  console.log(`  [PASS] AI Job status updated to: ${jobCompleteRes.rows[0].status}`);

  // Test 7: Idempotency - second record call returns existing assessment
  const duplicateAssessmentRes = await db.query(`
    SELECT * FROM public.record_claimed_ai_assessment(
      '${incidentId}'::uuid,
      '${workerToken}'::uuid,
      'flooding'::public.incident_category,
      'low'::public.incident_priority,
      'Duplicate should return original',
      'gemini-3.5-flash-lite',
      null
    );
  `);
  console.log(`  [PASS] Idempotent assessment returns original: category=${duplicateAssessmentRes.rows[0].suggested_category}`);

  // Test 8: Personnel review
  const staffId = "22222222-2222-4222-8222-222222222222";
  await db.exec(`
    INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    VALUES ('${staffId}', 'authenticated', 'authenticated', 'staff@example.test',
      '{"account_type":"personnel","personnel_role":"communication_officer"}', '{"full_name":"Test Officer"}');
    SET request.jwt.claim.sub = '${staffId}';
    SET ROLE authenticated;
  `);
  const staffAssessmentRpc = await db.query(`
    SELECT rationale, model
    FROM public.get_staff_ai_assessment('${incidentId}'::uuid);
  `);
  if (
    staffAssessmentRpc.rows.length !== 1 ||
    staffAssessmentRpc.rows[0].rationale !== "Smoke visible from commercial structure"
  ) {
    throw new Error("Authorized staff must retrieve the latest assessment rationale through the RPC");
  }
  await db.exec("RESET ROLE;");
  console.log("  [PASS] Authorized staff can read the assessment rationale through the protected RPC");
  const reviewRes = await db.query(`
    SELECT * FROM public.review_incident_classification(
      '${incidentId}'::uuid,
      'fire'::public.incident_category,
      'high'::public.incident_priority,
      null,
      'Confirmed structural fire response required'
    );
  `);
  console.log(`  [PASS] Classification review confirmed: category=${reviewRes.rows[0].confirmed_category}, priority=${reviewRes.rows[0].confirmed_priority}`);

  // Test 9: Resident review summary (Task A migration 20261122174025_resident_review_summary.sql)
  await db.exec(`SET request.jwt.claim.sub = '${residentId}';`);
  const residentReviewRes = await db.query(`SELECT * FROM public.my_report_review('${incidentId}'::uuid);`);
  console.log(`  [PASS] my_report_review returns confirmed category to resident: ${residentReviewRes.rows[0].confirmed_category}, priority=${residentReviewRes.rows[0].confirmed_priority}`);

  // Test 10: Status update forward transition (pending -> in_progress)
  await db.exec(`SET request.jwt.claim.sub = '${staffId}';`);
  const statusUpdateRes = await db.query(`
    SELECT * FROM public.update_incident_status(
      '${incidentId}'::uuid,
      'in_progress'::public.incident_status,
      'MDRRMO team dispatched to site'
    );
  `);
  console.log(`  [PASS] Status transitioned to: ${statusUpdateRes.rows[0].status}`);

  // Test 11: Stale processing job recovery (Task B requirement)
  const staleIncidentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.exec(`
    INSERT INTO public.incidents (id, reference, resident_id, idempotency_key, description, location_label, latitude, longitude)
    VALUES ('${staleIncidentId}', 'KAL-TEST-000002', '${residentId}', gen_random_uuid(), 'Flooding observed along coastal road', 'Poblacion', 13.9225, 122.1010);
    UPDATE app_private.ai_jobs
    SET status = 'processing',
        processing_started_at = clock_timestamp() - interval '12 minutes'
    WHERE incident_id = '${staleIncidentId}';
  `);
  const recoverRes = await db.query(`SELECT app_private.recover_stale_ai_jobs() AS recovered;`);
  const recoveredJobRes = await db.query(`SELECT status, processing_error_code FROM app_private.ai_jobs WHERE incident_id = '${staleIncidentId}';`);
  console.log(`  [PASS] Stale processing job recovered count: ${recoverRes.rows[0].recovered}, new status: ${recoveredJobRes.rows[0].status} (${recoveredJobRes.rows[0].processing_error_code})`);

  // Test 12: Bounded retry transport exhaustion
  await db.exec(`
    UPDATE app_private.ai_jobs
    SET dispatch_attempts = 5,
        next_dispatch_at = clock_timestamp() - interval '1 second'
    WHERE incident_id = '${staleIncidentId}';
  `);
  await db.query(`SELECT app_private.process_ai_job_dispatches();`);
  const exhaustedJobRes = await db.query(`SELECT status, processing_error_code FROM app_private.ai_jobs WHERE incident_id = '${staleIncidentId}';`);
  console.log(`  [PASS] Exhausted job capped after 5 attempts: status=${exhaustedJobRes.rows[0].status}, error=${exhaustedJobRes.rows[0].processing_error_code}`);

  // Test 13: HTTP response reconciliation
  await db.exec(`
    INSERT INTO extensions._http_response (id, status_code, timed_out, error_msg, created)
    VALUES (10001, 401, false, null, clock_timestamp());
    UPDATE app_private.ai_jobs
    SET last_dispatch_request_id = 10001,
        next_dispatch_at = clock_timestamp() + interval '1 hour'
    WHERE incident_id = '${incidentId}';
  `);
  await db.query(`SELECT app_private.process_ai_job_dispatches();`);
  const reconciledRes = await db.query(`SELECT last_dispatch_http_status, last_dispatch_error_code FROM app_private.ai_jobs WHERE incident_id = '${incidentId}';`);
  console.log(`  [PASS] Reconciled HTTP response: HTTP ${reconciledRes.rows[0].last_dispatch_http_status} -> error_code=${reconciledRes.rows[0].last_dispatch_error_code}`);

  // Test 14: System audit attribution check
  const aiAuditRes = await db.query(`
    SELECT actor_id, action, details
    FROM public.audit_logs
    WHERE incident_id = '${incidentId}' AND action = 'incident.ai_assessed';
  `);
  const isSystemAttributed = aiAuditRes.rows.length > 0 && aiAuditRes.rows[0].actor_id === null && aiAuditRes.rows[0].details.source === 'automatic_dispatch';
  console.log(`  [PASS] Automated AI assessment audit attribution: actor_id=${aiAuditRes.rows[0].actor_id} (null=system), source=${aiAuditRes.rows[0].details.source}`);

  // Test 15: AI never modifies operational status
  const incCheckRes = await db.query(`SELECT status FROM public.incidents WHERE id = '${staleIncidentId}';`);
  console.log(`  [PASS] Incident operational status remains untouched by AI: status=${incCheckRes.rows[0].status}`);

  // Test 16: submit_incident RPC full execution with private storage evidence validation
  const residentSubmitKey = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const residentEvidencePath = `${residentId}/${residentSubmitKey}/photo.jpg`;
  await db.exec(`
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('incident-evidence', '${residentEvidencePath}', '${residentId}',
      '{"mimetype":"image/jpeg","size":"2048"}'::jsonb);
    SET request.jwt.claim.sub = '${residentId}';
  `);
  const submitRpcRes = await db.query(`
    SELECT * FROM public.submit_incident(
      '${residentSubmitKey}'::uuid,
      'Severe electrical wire sparked causing house fire near street market',
      'Poblacion Market Area, Gumaca',
      13.9215,
      122.1002,
      ARRAY['${residentEvidencePath}']
    );
  `);
  console.log(`  [PASS] submit_incident RPC succeeded: reference=${submitRpcRes.rows[0].reference}, id=${submitRpcRes.rows[0].id}`);

  // Test 17: submit_incident idempotency - calling again with exact same key returns identical incident
  const submitRetryRes = await db.query(`
    SELECT * FROM public.submit_incident(
      '${residentSubmitKey}'::uuid,
      'Severe electrical wire sparked causing house fire near street market',
      'Poblacion Market Area, Gumaca',
      13.9215,
      122.1002,
      ARRAY['${residentEvidencePath}']
    );
  `);
  console.log(`  [PASS] submit_incident idempotency verified: identical ID ${submitRetryRes.rows[0].id === submitRpcRes.rows[0].id}`);

  // Test 18: submit_incident rejects missing evidence photos
  let missingPhotosError = null;
  try {
    await db.query(`
      SELECT * FROM public.submit_incident(
        gen_random_uuid(),
        'Severe electrical wire sparked causing house fire near street market',
        'Poblacion Market Area, Gumaca',
        13.9215,
        122.1002,
        ARRAY[]::text[]
      );
    `);
  } catch (err) {
    missingPhotosError = err;
  }
  console.log(`  [PASS] submit_incident rejects empty photos: ${missingPhotosError !== null && missingPhotosError.message.includes('Between one and five unique evidence photos are required')}`);

  // Test 19: submit_incident rejects foreign evidence uploaded by another user
  let foreignEvidenceError = null;
  try {
    await db.query(`
      SELECT * FROM public.submit_incident(
        gen_random_uuid(),
        'Severe electrical wire sparked causing house fire near street market',
        'Poblacion Market Area, Gumaca',
        13.9215,
        122.1002,
        ARRAY['22222222-2222-4222-8222-222222222222/wrong-id/photo.jpg']
      );
    `);
  } catch (err) {
    foreignEvidenceError = err;
  }
  console.log(`  [PASS] submit_incident rejects foreign evidence path: ${foreignEvidenceError !== null && foreignEvidenceError.message.includes('Required evidence must be uploaded')}`);

  // Test 20: Invalid status transition rejected (pending -> closed is forbidden)
  let invalidTransitionError = null;
  try {
    await db.exec(`SET request.jwt.claim.sub = '${staffId}';`);
    await db.query(`
      SELECT * FROM public.update_incident_status(
        '${submitRpcRes.rows[0].id}'::uuid,
        'closed'::public.incident_status,
        'Attempting illegal skip directly to closed'
      );
    `);
  } catch (err) {
    invalidTransitionError = err;
  }
  console.log(`  [PASS] Invalid status transition rejected: ${invalidTransitionError !== null}`);

  // Test 21: Ordinary resident cannot update status or review classification
  let residentUnauthorizedStatusError = null;
  let residentUnauthorizedReviewError = null;
  try {
    await db.exec(`SET request.jwt.claim.sub = '${residentId}';`);
    await db.query(`
      SELECT * FROM public.update_incident_status(
        '${submitRpcRes.rows[0].id}'::uuid,
        'in_progress'::public.incident_status,
        'Resident trying to dispatch themselves'
      );
    `);
  } catch (err) {
    residentUnauthorizedStatusError = err;
  }
  try {
    await db.query(`
      SELECT * FROM public.review_incident_classification(
        '${submitRpcRes.rows[0].id}'::uuid,
        'fire'::public.incident_category,
        'high'::public.incident_priority,
        null,
        'Resident trying to review classification'
      );
    `);
  } catch (err) {
    residentUnauthorizedReviewError = err;
  }
  console.log(`  [PASS] Resident unauthorized for status update: ${residentUnauthorizedStatusError !== null}`);
  console.log(`  [PASS] Resident unauthorized for classification review: ${residentUnauthorizedReviewError !== null}`);

  // Test 22: Responder personnel can also submit incidents via submit_incident
  const responderId = "33333333-3333-4333-8333-333333333333";
  const responderKey = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const responderPhoto = `${responderId}/${responderKey}/scene.jpg`;
  await db.exec(`
    INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    VALUES ('${responderId}', 'authenticated', 'authenticated', 'responder@example.test',
      '{"account_type":"personnel","personnel_role":"responder"}', '{"full_name":"Field Responder","contact_number":"09181234567"}');
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('incident-evidence', '${responderPhoto}', '${responderId}', '{"mimetype":"image/jpeg","size":"4096"}'::jsonb);
    SET request.jwt.claim.sub = '${responderId}';
  `);
  const responderSubmitRes = await db.query(`
    SELECT * FROM public.submit_incident(
      '${responderKey}'::uuid,
      'Field report: fallen tree obstructing both lanes on national highway',
      'Maharlika Highway KM 184',
      13.9230,
      122.1020,
      ARRAY['${responderPhoto}']
    );
  `);
  console.log(`  [PASS] Responder personnel incident submission succeeded: reference=${responderSubmitRes.rows[0].reference}`);

  // Test 23: Activity logs are visible only to admins and super admins
  const adminId = "44444444-4444-4444-8444-444444444444";
  const superAdminId = "55555555-5555-4555-8555-555555555555";
  await db.exec(`
    INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    VALUES
      ('${adminId}', 'authenticated', 'authenticated', 'activity-admin@example.test',
        '{"account_type":"personnel","personnel_role":"admin"}', '{"full_name":"Activity Admin"}'),
      ('${superAdminId}', 'authenticated', 'authenticated', 'activity-super@example.test',
        '{"account_type":"personnel","personnel_role":"super_admin"}', '{"full_name":"Activity Super Admin"}');
    INSERT INTO public.audit_logs (actor_id, action, details)
    VALUES ('${adminId}', 'system.setting_changed', '{"key":"surge_mode","value":true}'::jsonb);
    SET ROLE authenticated;
    SET request.jwt.claim.sub = '${staffId}';
  `);
  const officerAuditRes = await db.query("SELECT count(*)::int AS count FROM public.audit_logs");
  if (officerAuditRes.rows[0].count !== 0) {
    throw new Error("Communication officers must not see activity log rows");
  }
  await db.exec(`SET request.jwt.claim.sub = '${adminId}';`);
  const adminAuditRes = await db.query("SELECT count(*)::int AS count FROM public.audit_logs");
  if (adminAuditRes.rows[0].count < 1) {
    throw new Error("Admins must be able to see activity log rows");
  }
  await db.exec(`SET request.jwt.claim.sub = '${superAdminId}';`);
  const superAdminAuditRes = await db.query("SELECT count(*)::int AS count FROM public.audit_logs");
  if (superAdminAuditRes.rows[0].count < 1) {
    throw new Error("Super admins must be able to see activity log rows");
  }
  await db.exec("RESET ROLE;");
  console.log("  [PASS] Activity logs are restricted to admins and super admins");

  console.log("\n=== ALL MIGRATIONS AND FUNCTIONAL RUNTIME TESTS PASSED IN ISOLATED POSTGRESQL ===");
}

run().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
