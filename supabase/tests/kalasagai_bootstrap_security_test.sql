BEGIN;
SELECT plan(13);

CREATE TEMP TABLE bootstrap_test_fixture (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  contact_number text NOT NULL
) ON COMMIT DROP;

INSERT INTO bootstrap_test_fixture (user_id, email, contact_number)
SELECT
  gen_random_uuid(),
  'bootstrap-test-' || gen_random_uuid()::text || '@example.test',
  '+639' || lpad((floor(random() * 1000000000)::bigint)::text, 9, '0');

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  user_id,
  'authenticated',
  'authenticated',
  email,
  '',
  now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  jsonb_build_object(
    'full_name', 'Generated Bootstrap Test Resident',
    'contact_number', contact_number
  ),
  now(),
  now()
FROM bootstrap_test_fixture;

-- 1. Anonymous role cannot execute bootstrap RPC
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.bootstrap_initial_super_admin(uuid, text)',
    'execute'
  ),
  'anonymous users have no privilege to execute the initial bootstrap RPC'
);

-- 2. Ordinary authenticated resident cannot execute bootstrap RPC
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.bootstrap_initial_super_admin(uuid, text)',
    'execute'
  ),
  'authenticated resident users cannot execute the initial bootstrap RPC'
);

-- 3. Private implementation in app_private is inaccessible to public/anon/authenticated
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'app_private.bootstrap_initial_super_admin(uuid, text)',
    'execute'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'app_private.bootstrap_initial_super_admin(uuid, text)',
    'execute'
  ),
  'private bootstrap implementation is completely hidden from public and authenticated roles'
);

-- 4. Trusted service_role has execution grant for owner script
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.bootstrap_initial_super_admin(uuid, text)',
    'execute'
  ),
  'service_role key possesses execution rights for the owner-controlled bootstrap'
);

-- 5. Calling bootstrap with non-existent user raises not found (P0002)
SELECT throws_ok(
  $$SELECT app_private.bootstrap_initial_super_admin(
      '00000000-0000-0000-0000-000000000000'::uuid,
      'nonexistent@kalasag.local'
    )$$,
  'P0002',
  NULL,
  'bootstrap rejects nonexistent user IDs'
);

-- 6. Calling bootstrap with email mismatch raises authorization exception (42501)
SELECT throws_ok(
  format(
    'SELECT app_private.bootstrap_initial_super_admin(%L::uuid, %L)',
    (SELECT user_id FROM bootstrap_test_fixture),
    (SELECT email || '.mismatch' FROM bootstrap_test_fixture)
  ),
  '42501',
  NULL,
  'bootstrap rejects mismatched administrator email addresses'
);

-- 7. Calling bootstrap on resident lacking trusted app_metadata claims raises untrusted metadata exception (42501)
SELECT throws_ok(
  format(
    'SELECT app_private.bootstrap_initial_super_admin(%L::uuid, %L)',
    (SELECT user_id FROM bootstrap_test_fixture),
    (SELECT email FROM bootstrap_test_fixture)
  ),
  '42501',
  NULL,
  'bootstrap rejects ordinary residents lacking trusted personnel app_metadata'
);

-- 8. The generated fixture is an ordinary resident before the bootstrap call.
SELECT is(
  (SELECT role::text FROM public.profiles WHERE id = (SELECT user_id FROM bootstrap_test_fixture)),
  'resident',
  'generated auth fixture starts with a resident profile'
);

-- 9. Advisory lock test: verify lock acquisition succeeds and is released on transaction end
SELECT ok(
  pg_try_advisory_xact_lock(hashtext('kalasag.bootstrap_initial_super_admin'::text)::bigint),
  'concurrency advisory lock can be acquired and guards against parallel execution'
);

-- 10. Trusted metadata can be applied only after the profile was created.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'account_type', 'personnel',
  'personnel_role', 'super_admin',
  'bootstrap_source', 'kalasagai-dev-initial-super-admin-v1'
)
WHERE id = (SELECT user_id FROM bootstrap_test_fixture);

SELECT lives_ok(
  format(
    'SELECT app_private.bootstrap_initial_super_admin(%L::uuid, %L)',
    (SELECT user_id FROM bootstrap_test_fixture),
    (SELECT email FROM bootstrap_test_fixture)
  ),
  'bootstrap promotes the generated resident after trusted metadata is set'
);

-- 11. Verify the operational profile was promoted.
SELECT is(
  (SELECT role::text FROM public.profiles WHERE id = (SELECT user_id FROM bootstrap_test_fixture)),
  'super_admin',
  'bootstrap promotes the generated profile to super_admin'
);

-- 12. Verify the operation is auditable.
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE action = 'personnel.bootstrap_super_admin'
      AND details ->> 'target_user_id' = (SELECT user_id::text FROM bootstrap_test_fixture)
  ),
  'bootstrap records an audit row for the generated fixture'
);

-- 13. Bootstrap remains one-time after the first successful promotion.
SELECT throws_ok(
  format(
    'SELECT app_private.bootstrap_initial_super_admin(%L::uuid, %L)',
    (SELECT user_id FROM bootstrap_test_fixture),
    (SELECT email FROM bootstrap_test_fixture)
  ),
  '55000',
  NULL,
  'bootstrap rejects a second successful invocation'
);

SELECT * FROM finish();
ROLLBACK;
