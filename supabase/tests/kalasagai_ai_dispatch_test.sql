BEGIN;
SET LOCAL search_path = public, extensions, net, pg_temp;
SELECT plan(30);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'kalasagai-ai-job-dispatch'
      AND active = false
  ),
  'AI dispatcher cron job is installed but remains inactive'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'app_private.dispatch_ai_classification(uuid)',
    'execute'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'app_private.dispatch_ai_classification(uuid)',
      'execute'
    )
    AND NOT has_function_privilege(
      'anon',
      'app_private.process_ai_job_dispatches()',
      'execute'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'app_private.process_ai_job_dispatches()',
      'execute'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.record_ai_assessment_automated(uuid,public.incident_category,public.incident_priority,text,text)',
      'execute'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.record_ai_assessment_automated(uuid,public.incident_category,public.incident_priority,text,text)',
      'execute'
    )
    AND NOT has_function_privilege(
      'service_role',
      'app_private.record_ai_assessment(uuid,public.incident_category,public.incident_priority,text,text,uuid,uuid,text)',
      'execute'
    )
    AND has_function_privilege(
      'service_role',
      'public.record_ai_assessment_automated(uuid,public.incident_category,public.incident_priority,text,text)',
      'execute'
    ),
  'dispatch controls stay private and automatic assessment recording is service-role-only'
);

SELECT ok(
  NOT has_table_privilege('anon', 'vault.decrypted_secrets', 'select')
    AND NOT has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select')
    AND NOT has_table_privilege('service_role', 'vault.decrypted_secrets', 'select'),
  'decrypted Vault secrets are not directly readable by API roles'
);

DELETE FROM vault.secrets
WHERE name IN (
  'kalasagai_ai_dispatch_project_url',
  'kalasagai_ai_dispatch_anon_jwt',
  'kalasagai_ai_dispatch_hmac_key'
);

UPDATE public.system_settings
SET value = 'true'::jsonb
WHERE key = 'gemini_enabled';

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'ai-dispatch-resident@example.test', '',
  now(), '{"provider":"email","providers":["email"]}',
  '{"full_name":"AI Dispatch Test Resident","contact_number":"09171234567"}',
  now(), now()
);

INSERT INTO public.incidents (
  id, reference, resident_id, idempotency_key, description, location_label,
  latitude, longitude
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'KAL-TEST-AI-DISPATCH-000001',
  '11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'A sufficiently detailed dispatch test incident',
  'Dispatch test location', 13.9221, 122.1005
);

SELECT ok(
  (SELECT status = 'queued'
       AND attempts = 0
       AND dispatch_attempts = 0
       AND last_dispatch_request_id IS NULL
       AND last_dispatch_error_code = 'missing_dispatch_configuration'
   FROM app_private.ai_jobs
   WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'missing Vault credentials leave the job queued without an HTTP request'
);

SELECT vault.create_secret(
  'https://dispatch-test.supabase.co',
  'kalasagai_ai_dispatch_project_url'
);
CREATE TEMP TABLE ai_dispatch_test_anon_secret_id ON COMMIT DROP AS
SELECT vault.create_secret(
  'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.fixture',
  'kalasagai_ai_dispatch_anon_jwt'
) AS id;
SELECT vault.create_secret(
  'local-only-mocked-dispatch-secret-32-bytes',
  'kalasagai_ai_dispatch_hmac_key'
);

UPDATE app_private.ai_jobs
SET next_dispatch_at = clock_timestamp() - interval '1 second'
WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

SELECT app_private.process_ai_job_dispatches();

SELECT ok(
  (SELECT status = 'queued'
       AND attempts = 0
       AND dispatch_attempts = 1
       AND last_dispatch_request_id IS NOT NULL
       AND last_dispatch_error_code IS NULL
   FROM app_private.ai_jobs
   WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'queued job recovery creates one authenticated pg_net request'
);

SELECT is(
  (
    SELECT headers ->> 'apikey'
    FROM http_request_queue
    WHERE id = (
      SELECT last_dispatch_request_id
      FROM app_private.ai_jobs
      WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  ),
  'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.fixture',
  'gateway receives a low-privilege anon JWT'
);

SELECT ok(
  (
    SELECT headers ->> 'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.fixture'
       AND length(headers ->> 'x-kalasag-dispatch-signature') = 64
       AND headers ->> 'x-kalasag-dispatch-timestamp' ~ '^[0-9]{10}$'
    FROM http_request_queue
    WHERE id = (
      SELECT last_dispatch_request_id
      FROM app_private.ai_jobs
      WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  ),
  'request queue contains a public API key and a short-lived signature, not a privileged bearer key'
);

SELECT is(
  (
    SELECT headers ->> 'x-kalasag-dispatch-signature'
    FROM http_request_queue
    WHERE id = (
      SELECT last_dispatch_request_id
      FROM app_private.ai_jobs
      WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  ),
  (
    SELECT encode(
      extensions.hmac(
        convert_to(
          (headers ->> 'x-kalasag-dispatch-timestamp') || '.' ||
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'UTF8'
        ),
        convert_to('local-only-mocked-dispatch-secret-32-bytes', 'UTF8'),
        'sha256'
      ),
      'hex'
    )
    FROM http_request_queue
    WHERE id = (
      SELECT last_dispatch_request_id
      FROM app_private.ai_jobs
      WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  ),
  'HMAC signature covers the timestamp and incident id'
);

INSERT INTO _http_response (id, status_code, timed_out, error_msg, created)
VALUES (9223372036854775000, NULL, true, 'mock timeout', clock_timestamp());
UPDATE app_private.ai_jobs
SET last_dispatch_request_id = 9223372036854775000,
    next_dispatch_at = clock_timestamp() + interval '1 hour'
WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT app_private.process_ai_job_dispatches();

SELECT ok(
  (SELECT last_dispatch_error_code = 'request_timeout'
       AND last_dispatch_http_status IS NULL
   FROM app_private.ai_jobs
   WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'asynchronous network failures are reduced to a safe error code'
);

INSERT INTO public.incidents (
  id, reference, resident_id, idempotency_key, description, location_label,
  latitude, longitude
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'KAL-TEST-AI-DISPATCH-000002',
  '11111111-1111-4111-8111-111111111111',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'A second sufficiently detailed dispatch test incident',
  'Dispatch timeout test location', 13.9222, 122.1006
);

SET LOCAL ROLE service_role;
SELECT ok(
  public.claim_ai_job(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111'
  ),
  'a valid owner can claim a queued AI job'
);
SELECT ok(
  NOT public.claim_ai_job(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111'
  ),
  'a duplicate claim cannot start parallel classification'
);
RESET ROLE;

UPDATE app_private.ai_jobs
SET processing_started_at = clock_timestamp() - interval '11 minutes'
WHERE incident_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

SELECT is(
  app_private.recover_stale_ai_jobs(),
  1,
  'stale processing jobs are recovered'
);
SELECT ok(
  (SELECT status = 'failed'
       AND processing_started_at IS NULL
       AND processing_error_code = 'processing_timeout'
   FROM app_private.ai_jobs
   WHERE incident_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'processing timeout returns the job to a retryable state'
);

SET LOCAL ROLE service_role;
SELECT ok(
  public.claim_ai_job(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111'
  ),
  'a recovered job can be claimed again under the existing attempt limit'
);
RESET ROLE;
UPDATE app_private.ai_jobs
SET next_dispatch_at = clock_timestamp() + interval '1 hour'
WHERE incident_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SET LOCAL ROLE service_role;
SELECT public.fail_ai_job(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111'
);
RESET ROLE;
SELECT ok(
  (SELECT status = 'failed'
       AND next_dispatch_at > clock_timestamp() + interval '50 minutes'
   FROM app_private.ai_jobs
   WHERE incident_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'a processing failure preserves the existing exponential retry backoff'
);
SET LOCAL ROLE service_role;
SELECT ok(
  public.claim_ai_job(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111'
  ),
  'a failed job remains claimable for its last allowed classification attempt'
);
SELECT is(
  (public.record_ai_assessment_automated(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'fire',
    'high',
    'Smoke is reported near the building.',
    'test-model'
  )).suggested_category,
  'fire'::public.incident_category,
  'the first assessment is recorded as a suggestion'
);
SELECT is(
  (public.record_ai_assessment_automated(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'flooding',
    'low',
    'This duplicate result must not replace the first assessment.',
    'duplicate-test-model'
  )).suggested_category,
  'fire'::public.incident_category,
  'repeated assessment recording returns the original suggestion'
);
RESET ROLE;

SELECT ok(
  (SELECT count(*) = 1
   FROM public.ai_assessments
   WHERE incident_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    AND (SELECT status = 'complete' AND processing_started_at IS NULL
         FROM app_private.ai_jobs
         WHERE incident_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'idempotent assessment recording completes the job without duplicates'
);

SELECT ok(
  (SELECT actor_id IS NULL
          AND details ->> 'source' = 'automatic_dispatch'
   FROM public.audit_logs
   WHERE incident_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
     AND action = 'incident.ai_assessed'),
  'automatic assessment audit is attributed to the system, not the reporter'
);

SELECT ok(
  (SELECT status = 'pending'
   FROM public.incidents
   WHERE id IN (
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
   )
   GROUP BY status),
  'classification dispatch and assessment do not change operational status'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.classification_reviews
   WHERE incident_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0,
  'AI assessment does not bypass mandatory personnel review'
);

SELECT ok(public.claim_ai_job_delivery(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',gen_random_uuid(),
  (SELECT dispatch_timestamp FROM app_private.ai_jobs WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
), 'current delivery can be claimed');
SELECT public.fail_ai_job('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
SELECT ok(NOT public.claim_ai_job_delivery(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',gen_random_uuid(),
  (SELECT headers ->> 'x-kalasag-dispatch-timestamp' FROM http_request_queue
   WHERE body = convert_to('{"incidentId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', 'UTF8') LIMIT 1)
), 'a consumed delivery cannot reclaim a failed job');
UPDATE app_private.ai_jobs SET dispatch_attempts = 5, next_dispatch_at = now() - interval '1 second'
WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT app_private.process_ai_job_dispatches();
SELECT ok((SELECT status = 'failed' AND processing_error_code = 'dispatch_exhausted' AND dispatch_attempts = 5
  FROM app_private.ai_jobs WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'requests that never reach a worker stop at the transport limit');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_ai_job_delivery(uuid,uuid,uuid,text)', 'execute'),
  'only the server can consume a delivery');
SELECT throws_ok(
  $$SELECT public.record_claimed_ai_assessment('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'fire','low','Test','test',null)$$,
  '55000', 'AI worker claim expired', 'an obsolete worker cannot write an assessment');
SELECT throws_ok(
  $$SELECT public.fail_ai_job('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',gen_random_uuid())$$,
  '55000', 'AI worker claim expired', 'an obsolete worker cannot fail a newer claim');
INSERT INTO _http_response (id, status_code, timed_out, created) VALUES
  (9223372036854775001, 401, false, clock_timestamp()),
  (9223372036854775002, 200, false, clock_timestamp());
UPDATE app_private.ai_jobs SET last_dispatch_request_id=9223372036854775001
WHERE incident_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE app_private.ai_jobs SET last_dispatch_request_id=9223372036854775002
WHERE incident_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT app_private.process_ai_job_dispatches();
SELECT is((SELECT last_dispatch_error_code FROM app_private.ai_jobs WHERE last_dispatch_request_id=9223372036854775001),
  'http_401','gateway rejection retains its HTTP status for diagnosis');
SELECT ok((SELECT status='complete' AND last_dispatch_http_status=200 FROM app_private.ai_jobs WHERE last_dispatch_request_id=9223372036854775002),
  'successful responses reconcile even after the assessment has completed');
SELECT vault.update_secret(
  (SELECT id FROM ai_dispatch_test_anon_secret_id),
  'sb_publishable_example',
  'kalasagai_ai_dispatch_anon_jwt',
  'Temporary invalid key fixture for a negative test'
);
UPDATE app_private.ai_jobs SET dispatch_attempts=0, next_dispatch_at=now(), last_dispatch_request_id=null
WHERE incident_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT app_private.process_ai_job_dispatches();
SELECT ok((SELECT last_dispatch_request_id IS NULL AND last_dispatch_error_code='missing_dispatch_configuration'
  FROM app_private.ai_jobs WHERE incident_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'a non-JWT API key never enters the HTTP queue');
SELECT * FROM finish();
ROLLBACK;
