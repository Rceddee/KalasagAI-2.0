BEGIN;
SELECT plan(9);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated', 'responder@example.test', '',
    now(), '{"provider":"email","providers":["email"],"account_type":"personnel","personnel_role":"responder"}',
    '{"full_name":"Test Responder","contact_number":"09171234567"}', now(), now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated', 'authenticated', 'officer@example.test', '',
    now(), '{"provider":"email","providers":["email"],"account_type":"personnel","personnel_role":"communication_officer"}',
    '{"full_name":"Test Communication Officer","contact_number":"09181234567"}', now(), now()
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'authenticated', 'authenticated', 'admin@example.test', '',
    now(), '{"provider":"email","providers":["email"],"account_type":"personnel","personnel_role":"admin"}',
    '{"full_name":"Test Admin","contact_number":"09191234567"}', now(), now()
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'authenticated', 'authenticated', 'super-admin@example.test', '',
    now(), '{"provider":"email","providers":["email"],"account_type":"personnel","personnel_role":"super_admin"}',
    '{"full_name":"Test Super Admin","contact_number":"09201234567"}', now(), now()
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    'authenticated', 'authenticated', 'resident@example.test', '',
    now(), '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test Resident","contact_number":"09211234567"}', now(), now()
  );

INSERT INTO public.incidents (
  id, reference, resident_id, idempotency_key, description, location_label,
  latitude, longitude
) VALUES
  (
    '88888888-8888-4888-8888-888888888888',
    'KAL-TEST-PERSONNEL-0001',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'A sufficiently detailed responder report',
    'Responder test location', 13.9221, 122.1005
  ),
  (
    '99999999-9999-4999-8999-999999999999',
    'KAL-TEST-PERSONNEL-0002',
    '77777777-7777-4777-8777-777777777777',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'A sufficiently detailed resident report',
    'Resident test location', 13.9222, 122.1006
  );

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT throws_ok(
  $$SELECT public.submit_incident(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'A sufficiently detailed test incident',
      'Test location',
      13.9221,
      122.1005,
      ARRAY[]::text[]
    )$$,
  '42501',
  'Responder access is read-only',
  'responders cannot submit incident reports'
);

SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT throws_ok(
  $$SELECT public.submit_incident(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'A sufficiently detailed test incident',
      'Test location',
      13.9221,
      122.1005,
      ARRAY[]::text[]
    )$$,
  '22023',
  'Between one and five unique evidence photos are required',
  'communication officers pass authorization and retain evidence validation'
);

SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
SELECT throws_ok(
  $$SELECT public.submit_incident(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'A sufficiently detailed test incident',
      'Test location',
      13.9221,
      122.1005,
      ARRAY[]::text[]
    )$$,
  '22023',
  'Between one and five unique evidence photos are required',
  'admins pass authorization and retain evidence validation'
);

SELECT set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
SELECT throws_ok(
  $$SELECT public.submit_incident(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'A sufficiently detailed test incident',
      'Test location',
      13.9221,
      122.1005,
      ARRAY[]::text[]
    )$$,
  '22023',
  'Between one and five unique evidence photos are required',
  'super admins pass authorization and retain evidence validation'
);

SELECT is(
  (SELECT count(*)::integer FROM public.incidents
   WHERE idempotency_key = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0,
  'incomplete personnel submissions do not create incidents'
);

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT throws_ok(
  $$SELECT public.update_incident_status(
      '88888888-8888-4888-8888-888888888888',
      'in_progress',
      NULL
    )$$,
  '42501',
  NULL,
  'responders cannot change operational status'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$SELECT public.claim_ai_job('88888888-8888-4888-8888-888888888888','33333333-3333-4333-8333-333333333333')$$,
  '42501', NULL, 'responders cannot claim their own historical report'
);
SELECT throws_ok(
  $$SELECT public.record_ai_assessment('88888888-8888-4888-8888-888888888888','fire','high','Fixture','test-model','33333333-3333-4333-8333-333333333333')$$,
  '42501', NULL, 'responders cannot record assessments for their own historical reports'
);
SELECT throws_ok(
  $$SELECT public.claim_ai_job(
      '99999999-9999-4999-8999-999999999999',
      '33333333-3333-4333-8333-333333333333'
    )$$,
  '42501',
  NULL,
  'responders cannot claim AI jobs for other users reports'
);

SELECT * FROM finish();
ROLLBACK;
