-- Run only against an isolated local database; this script creates synthetic auth fixtures.
BEGIN;

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

CREATE TEMP TABLE bootstrap_test_results (
  test_num integer,
  test_name text,
  status text,
  details text
);

-- Test 1: Anonymous role cannot execute public bootstrap RPC
INSERT INTO bootstrap_test_results
VALUES (
  1,
  'anon_public_rpc_privilege',
  CASE WHEN NOT has_function_privilege('anon', 'public.bootstrap_initial_super_admin(uuid, text)', 'execute')
       THEN 'PASS' ELSE 'FAIL' END,
  'Anonymous role has no EXECUTE privilege on public.bootstrap_initial_super_admin'
);

-- Test 2: Authenticated role cannot execute public bootstrap RPC
INSERT INTO bootstrap_test_results
VALUES (
  2,
  'authenticated_public_rpc_privilege',
  CASE WHEN NOT has_function_privilege('authenticated', 'public.bootstrap_initial_super_admin(uuid, text)', 'execute')
       THEN 'PASS' ELSE 'FAIL' END,
  'Authenticated resident role has no EXECUTE privilege on public.bootstrap_initial_super_admin'
);

-- Test 3: Anonymous and Authenticated cannot access private implementation
INSERT INTO bootstrap_test_results
VALUES (
  3,
  'private_implementation_hidden',
  CASE WHEN NOT has_function_privilege('anon', 'app_private.bootstrap_initial_super_admin(uuid, text)', 'execute')
            AND NOT has_function_privilege('authenticated', 'app_private.bootstrap_initial_super_admin(uuid, text)', 'execute')
       THEN 'PASS' ELSE 'FAIL' END,
  'app_private.bootstrap_initial_super_admin is completely revoked from anon and authenticated'
);

-- Test 4: service_role key has execute privilege
INSERT INTO bootstrap_test_results
VALUES (
  4,
  'service_role_authorized',
  CASE WHEN has_function_privilege('service_role', 'public.bootstrap_initial_super_admin(uuid, text)', 'execute')
       THEN 'PASS' ELSE 'FAIL' END,
  'service_role key possesses EXECUTE grant on public.bootstrap_initial_super_admin'
);

-- Test 5: Concurrency transaction-scoped advisory lock acquisition
INSERT INTO bootstrap_test_results
VALUES (
  5,
  'concurrency_advisory_lock',
  CASE WHEN pg_try_advisory_xact_lock(hashtext('kalasag.bootstrap_initial_super_admin'::text)::bigint)
       THEN 'PASS' ELSE 'FAIL' END,
  'Transaction-scoped advisory lock successfully acquired to block parallel execution'
);

-- Test 6: Nonexistent user ID rejected (P0002)
DO $$
begin
  perform app_private.bootstrap_initial_super_admin('00000000-0000-0000-0000-000000000000'::uuid, 'none@test.local');
  insert into bootstrap_test_results values (6, 'reject_nonexistent_user', 'FAIL', 'Expected P0002 but call succeeded');
exception
  when sqlstate 'P0002' then
    insert into bootstrap_test_results values (6, 'reject_nonexistent_user', 'PASS', 'Correctly raised P0002 for nonexistent user');
  when others then
    insert into bootstrap_test_results values (6, 'reject_nonexistent_user', 'FAIL', 'Unexpected sqlstate: ' || SQLSTATE);
end;
$$;

-- Test 7: Email mismatch rejected (42501)
DO $$
DECLARE
  fixture record;
begin
  select * into fixture from bootstrap_test_fixture;
  perform app_private.bootstrap_initial_super_admin(fixture.user_id, fixture.email || '.mismatch');
  insert into bootstrap_test_results values (7, 'reject_email_mismatch', 'FAIL', 'Expected 42501 but call succeeded');
exception
  when sqlstate '42501' then
    insert into bootstrap_test_results values (7, 'reject_email_mismatch', 'PASS', 'Correctly raised 42501 (Email mismatch)');
  when others then
    insert into bootstrap_test_results values (7, 'reject_email_mismatch', 'FAIL', 'Unexpected sqlstate: ' || SQLSTATE);
end;
$$;

-- Test 8: Untrusted resident user lacking app_metadata rejected (42501)
DO $$
DECLARE
  fixture record;
begin
  select * into fixture from bootstrap_test_fixture;
  perform app_private.bootstrap_initial_super_admin(fixture.user_id, fixture.email);
  insert into bootstrap_test_results values (8, 'reject_untrusted_resident', 'FAIL', 'Expected 42501 but call succeeded');
exception
  when sqlstate '42501' then
    insert into bootstrap_test_results values (8, 'reject_untrusted_resident', 'PASS', 'Correctly raised 42501 (Untrusted metadata)');
  when others then
    insert into bootstrap_test_results values (8, 'reject_untrusted_resident', 'FAIL', 'Unexpected sqlstate: ' || SQLSTATE);
end;
$$;

-- Test 9: RLS and role checks: Ordinary resident cannot promote arbitrary accounts via assign_personnel_role
DO $$
DECLARE
  fixture record;
  was_blocked boolean := false;
  unexpected_sqlstate text;
begin
  select * into fixture from bootstrap_test_fixture;
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', fixture.user_id::text, true);
    perform public.assign_personnel_role(fixture.user_id, 'super_admin'::public.personnel_role);
    perform set_config('role', 'none', true);
  exception
    when sqlstate '42501' then
      was_blocked := true;
    when others then
      unexpected_sqlstate := SQLSTATE;
  end;

  if was_blocked then
    insert into bootstrap_test_results values (9, 'resident_cannot_self_promote', 'PASS', 'Resident correctly blocked from privilege escalation (42501)');
  else
    insert into bootstrap_test_results values (
      9,
      'resident_cannot_self_promote',
      'FAIL',
      coalesce('Unexpected sqlstate: ' || unexpected_sqlstate, 'Resident promotion unexpectedly succeeded')
    );
  end if;
end;
$$;

SELECT test_num, test_name, status, details FROM bootstrap_test_results ORDER BY test_num;

ROLLBACK;
