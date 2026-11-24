BEGIN;
SET LOCAL search_path = public, extensions, net, pg_temp;
SELECT plan(14);

SELECT ok(
  has_table_privilege('authenticated', 'public.ai_assessments', 'select'),
  'authenticated table access remains available for staff Realtime subscriptions'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.my_ai_assessments(uuid[])',
    'execute'
  ),
  'authenticated residents can call the owner-checked safe assessment RPC'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_staff_ai_assessment(uuid)',
    'execute'
  ),
  'authenticated clients can call the staff-gated assessment RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.my_ai_assessments(uuid[])',
    'execute'
  )
    AND NOT has_function_privilege(
      'anon',
      'public.get_staff_ai_assessment(uuid)',
      'execute'
    ),
  'anonymous clients cannot call either assessment RPC'
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '66666666-6666-4666-8666-666666666666',
    'authenticated', 'authenticated', 'assessment-resident@example.test', '',
    now(), '{"provider":"email","providers":["email"]}',
    '{"full_name":"Assessment Resident","contact_number":"09171234567"}',
    now(), now()
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    'authenticated', 'authenticated', 'assessment-responder@example.test', '',
    now(), '{"provider":"email","providers":["email"],"account_type":"personnel","personnel_role":"responder"}',
    '{"full_name":"Assessment Responder"}',
    now(), now()
  );

INSERT INTO public.incidents (
  id, reference, resident_id, idempotency_key, description, location_label,
  latitude, longitude
) VALUES
  (
    '88888888-8888-4888-8888-888888888888',
    'KAL-TEST-ASSESSMENT-PRIVACY-000001',
    '66666666-6666-4666-8666-666666666666',
    '99999999-9999-4999-8999-999999999999',
    'A sufficiently detailed privacy test incident',
    'Assessment privacy test location', 13.9221, 122.1005
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'KAL-TEST-ASSESSMENT-PRIVACY-000002',
    '77777777-7777-4777-8777-777777777777',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'A sufficiently detailed foreign privacy test incident',
    'Foreign assessment privacy test location', 13.9222, 122.1006
  );

INSERT INTO public.ai_assessments (
  incident_id, suggested_category, suggested_priority, rationale, model, created_at
) VALUES
  (
    '88888888-8888-4888-8888-888888888888',
    'flooding', 'medium', 'Earlier private rationale.', 'privacy-test-model',
    now() - interval '1 minute'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    'fire', 'high', 'Latest private rationale.', 'privacy-test-model',
    now()
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'road_obstruction', 'low', 'Foreign private rationale.', 'privacy-test-model',
    now()
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.ai_assessments
   WHERE incident_id = '88888888-8888-4888-8888-888888888888'),
  0,
  'residents cannot directly read their own assessment rows'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.ai_assessments
   WHERE incident_id = '88888888-8888-4888-8888-888888888888'
     AND rationale = 'Latest private rationale.'),
  0,
  'resident table queries expose no rationale'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.my_ai_assessments(ARRAY[
     '88888888-8888-4888-8888-888888888888'::uuid,
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
   ])),
  1,
  'the safe resident RPC returns only the latest assessment for an owned incident'
);
SELECT is(
  (SELECT suggested_category
   FROM public.my_ai_assessments(ARRAY[
     '88888888-8888-4888-8888-888888888888'::uuid,
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
   ])),
  'fire'::public.incident_category,
  'the safe resident RPC returns the latest category'
);
SELECT throws_ok(
  $$SELECT rationale FROM public.my_ai_assessments(ARRAY[
    '88888888-8888-4888-8888-888888888888'::uuid
  ])$$,
  '42703',
  NULL,
  'the safe resident RPC does not expose a rationale column'
);
SELECT throws_ok(
  $$SELECT model FROM public.my_ai_assessments(ARRAY[
    '88888888-8888-4888-8888-888888888888'::uuid
  ])$$,
  '42703',
  NULL,
  'the safe resident RPC does not expose model metadata'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.get_staff_ai_assessment('88888888-8888-4888-8888-888888888888')),
  0,
  'the staff RPC returns no assessment details to a resident'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '77777777-7777-4777-8777-777777777777',
  true
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.ai_assessments),
  3,
  'authorized staff retain direct assessment reads for their lists and Realtime'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.get_staff_ai_assessment('88888888-8888-4888-8888-888888888888')),
  1,
  'authorized staff can retrieve the latest assessment'
);
SELECT is(
  (SELECT rationale
   FROM public.get_staff_ai_assessment('88888888-8888-4888-8888-888888888888')),
  'Latest private rationale.',
  'the staff RPC returns only the latest rationale'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
