BEGIN;
SELECT plan(35);

SELECT ok(
  NOT has_table_privilege('anon', 'public.incidents', 'select')
    AND NOT has_table_privilege('anon', 'public.incidents', 'insert')
    AND NOT has_table_privilege('anon', 'public.incidents', 'update')
    AND NOT has_table_privilege('anon', 'public.incidents', 'delete'),
  'anonymous users have no direct incident access'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.incidents', 'insert')
    AND NOT has_table_privilege('authenticated', 'public.incidents', 'update')
    AND NOT has_table_privilege('authenticated', 'public.incidents', 'delete'),
  'authenticated users cannot bypass the incident submission RPC'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.submit_incident(uuid,text,text,double precision,double precision,text[])',
    'execute'
  ),
  'authenticated users can call the validated submission RPC'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_incident_status(uuid,public.incident_status,text)',
    'execute'
  )
    AND has_function_privilege(
      'authenticated',
      'public.review_incident_classification(uuid,public.incident_category,public.incident_priority,uuid,text)',
      'execute'
    )
    AND has_function_privilege(
      'authenticated',
      'public.assign_personnel_role(uuid,public.personnel_role)',
      'execute'
    )
    AND has_function_privilege(
      'authenticated',
      'public.set_system_setting(text,jsonb)',
      'execute'
    ),
  'authorized authenticated roles can invoke personnel operations RPCs'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.audit_logs', 'insert'),
  'authenticated users cannot forge audit records'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.record_ai_assessment(uuid,public.incident_category,public.incident_priority,text,text,uuid)',
    'execute'
  ),
  'authenticated users cannot forge AI assessments'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.record_ai_assessment(uuid,public.incident_category,public.incident_priority,text,text,uuid)',
    'execute'
  ),
  'the trusted Edge Function role can record AI assessments'
);
SELECT ok(
  has_function_privilege('service_role', 'public.claim_ai_job(uuid,uuid)', 'execute')
    AND has_function_privilege('service_role', 'public.fail_ai_job(uuid,uuid)', 'execute'),
  'the trusted Edge Function role can manage AI job state'
);
SELECT ok(
  NOT (SELECT public FROM storage.buckets WHERE id = 'incident-evidence'),
  'incident evidence is stored in a private bucket'
);
SELECT ok(
  (SELECT file_size_limit = 10485760 FROM storage.buckets WHERE id = 'incident-evidence'),
  'incident evidence uploads are size-limited'
);
SELECT ok(
  (SELECT value = 'false'::jsonb FROM public.system_settings WHERE key = 'surge_mode'),
  'manual surge mode defaults to disabled'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'incidents'
  ),
  'incident records are available to authenticated realtime subscribers'
);

SELECT throws_ok(
  $$INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '33333333-3333-4333-8333-333333333333',
      'authenticated', 'authenticated', 'missing-name@example.test', '',
      now(), '{"provider":"email","providers":["email"]}',
      '{"contact_number":"09171234567"}', now(), now()
    )$$,
  '22023',
  NULL,
  'registration rejects accounts without a full name'
);
SELECT throws_ok(
  $$INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '44444444-4444-4444-8444-444444444444',
      'authenticated', 'authenticated', 'missing-phone@example.test', '',
      now(), '{"provider":"email","providers":["email"]}',
      '{"full_name":"Missing Phone"}', now(), now()
    )$$,
  '22023',
  NULL,
  'registration rejects accounts without a contact number'
);
SELECT throws_ok(
  $$INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '55555555-5555-4555-8555-555555555555',
      'authenticated', 'authenticated', 'invalid-phone@example.test', '',
      now(), '{"provider":"email","providers":["email"]}',
      '{"full_name":"Invalid Phone","contact_number":"123"}', now(), now()
    )$$,
  '22023',
  NULL,
  'registration rejects an invalid contact number'
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'resident-one@example.test', '',
    now(), '{"provider":"email","providers":["email"]}',
    '{"full_name":"Resident One","contact_number":"09171234567"}', now(), now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'resident-two@example.test', '',
    now(), '{"provider":"email","providers":["email"]}',
    '{"full_name":"Resident Two","contact_number":"+639181234567"}', now(), now()
  );

SELECT is(
  (SELECT contact_number FROM public.profiles WHERE id = '11111111-1111-4111-8111-111111111111'),
  '+639171234567',
  'registration normalizes a Philippine 09 mobile number'
);

INSERT INTO public.incidents (
  id, reference, resident_id, idempotency_key, description, location_label,
  latitude, longitude
) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'KAL-TEST-000001',
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'A sufficiently detailed test incident',
    'Test location', 13.9221, 122.1005
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'KAL-TEST-000002',
    '22222222-2222-4222-8222-222222222222',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'Another sufficiently detailed test incident',
    'Another test location', 13.9222, 122.1006
  );

INSERT INTO app_private.incident_contact_snapshots (incident_id, contact_snapshot)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '+639171234567'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '+639181234567');

INSERT INTO public.incident_photos (incident_id, storage_path, content_type, file_size_bytes)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/evidence.jpg',
   'image/jpeg', 1024),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '22222222-2222-4222-8222-222222222222/dddddddd-dddd-4ddd-8ddd-dddddddddddd/evidence.jpg',
   'image/jpeg', 1024);

SET LOCAL ROLE service_role;
SELECT ok(
  public.claim_ai_job(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111'
  ),
  'a resident can start AI classification for their own report'
);
SELECT is(
  (public.record_ai_assessment(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'fire',
    'high',
    'Smoke is reported near the building.',
    'test-model',
    '11111111-1111-4111-8111-111111111111'
  )).suggested_category,
  'fire'::public.incident_category,
  'an AI assessment can be saved for the report owner'
);
SELECT is(
  (
    SELECT suggested_priority
    FROM public.ai_assessments
    WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  'high'::public.incident_priority,
  'the AI priority suggestion is stored with its assessment'
);
SELECT throws_ok(
  $$SELECT public.claim_ai_job(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  '42501',
  NULL,
  'a resident cannot start AI classification for another resident report'
);
SELECT throws_ok(
  $$SELECT public.record_ai_assessment(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'fire',
      'high',
      'Smoke is reported near the building.',
      'test-model',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  '42501',
  NULL,
  'a resident cannot save an assessment for another resident report'
);
SELECT throws_ok(
  $$SELECT public.fail_ai_job(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  '42501',
  NULL,
  'a resident cannot modify another resident AI job'
);
RESET ROLE;

SELECT is(
  (SELECT contact_snapshot FROM app_private.incident_contact_snapshots
   WHERE incident_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '+639171234567',
  'incident contact snapshots are preserved separately from incident records'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

SELECT throws_ok(
  $$SELECT public.submit_incident(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'too short',
      'Test location',
      13.9221,
      122.1005,
      ARRAY[]::text[]
    )$$,
  '22023',
  NULL,
  'the submission RPC rejects an invalid description'
);
SELECT throws_ok(
  $$SELECT public.submit_incident(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'A sufficiently detailed test incident',
      'X',
      13.9221,
      122.1005,
      ARRAY[]::text[]
    )$$,
  '22023',
  NULL,
  'the submission RPC rejects an invalid location description'
);
SELECT throws_ok(
  $$SELECT public.submit_incident(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'A sufficiently detailed test incident',
      'Test location',
      91,
      122.1005,
      ARRAY[]::text[]
    )$$,
  '22023',
  NULL,
  'the submission RPC rejects invalid coordinates'
);
SELECT throws_ok(
  $$SELECT public.submit_incident(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'A sufficiently detailed test incident',
      'Test location',
      13.9221,
      122.1005,
      ARRAY[]::text[]
    )$$,
  '22023',
  NULL,
  'the submission RPC requires photo evidence'
);
SELECT throws_ok(
  $$SELECT public.submit_incident(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'A sufficiently detailed test incident',
      'Test location',
      13.9221,
      122.1005,
      ARRAY['11111111-1111-4111-8111-111111111111/ffffffff-ffff-4fff-8fff-ffffffffffff/evidence.jpg']::text[]
    )$$,
  '22023',
  NULL,
  'the submission RPC rejects evidence without a stored private object'
);

SELECT throws_ok(
  $$SELECT public.get_incident_contact('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501',
  NULL,
  'residents cannot retrieve private reporter contact snapshots'
);
SELECT throws_ok(
  $$SELECT public.update_incident_status(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'in_progress',
      NULL
    )$$,
  '42501',
  NULL,
  'residents cannot change operational incident status'
);
SELECT throws_ok(
  $$SELECT public.review_incident_classification(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'fire',
      'high',
      NULL,
      NULL
    )$$,
  '42501',
  NULL,
  'residents cannot submit personnel classification reviews'
);
SELECT throws_ok(
  $$SELECT public.assign_personnel_role(
      '22222222-2222-4222-8222-222222222222',
      'responder'
    )$$,
  '42501',
  NULL,
  'residents cannot provision personnel roles'
);

SELECT results_eq(
  $$SELECT reference FROM public.incidents ORDER BY reference$$,
  ARRAY['KAL-TEST-000001']::text[],
  'residents only read their own incidents'
);
SELECT results_eq(
  $$SELECT incident_id FROM public.incident_photos ORDER BY incident_id$$,
  ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[],
  'residents only read photo metadata for their own incidents'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET role = 'admin' WHERE id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  NULL,
  'residents cannot promote their own profile'
);

SELECT * FROM finish();
ROLLBACK;
