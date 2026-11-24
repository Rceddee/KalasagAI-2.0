-- ============================================================================
-- 1. Narrowly Scoped Bootstrap Procedure in Private Schema
-- ============================================================================
create or replace function app_private.bootstrap_initial_super_admin(
  p_user_id uuid,
  p_expected_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_email text;
  v_app_meta jsonb;
  v_current_role public.personnel_role;
  v_contact text;
begin
  -- 1. Concurrency Guard: Transaction-scoped advisory lock
  if not pg_catalog.pg_try_advisory_xact_lock(hashtext('kalasag.bootstrap_initial_super_admin'::text)::bigint) then
    raise exception 'Another bootstrap transaction is currently in progress'
      using errcode = '55P03';
  end if;

  -- 2. Guard: Strictly one-time execution
  if exists (
    select 1 from public.profiles where role = 'super_admin'::public.personnel_role
  ) then
    raise exception 'Bootstrap already completed: a Super Admin already exists in this database'
      using errcode = '55000';
  end if;

  -- 3. Guard: Verify target Auth user exists
  select u.email, u.raw_app_meta_data
  into v_user_email, v_app_meta
  from auth.users as u
  where u.id = p_user_id;

  if not found then
    raise exception 'Target Auth user not found' using errcode = 'P0002';
  end if;

  -- 4. Guard: Exact email verification against designated administrator
  if lower(btrim(v_user_email)) <> lower(btrim(p_expected_email)) then
    raise exception 'Email mismatch: target user email does not match designated administrator'
      using errcode = '42501';
  end if;

  -- 5. Guard: Verify trusted app_metadata set by Supabase Admin API
  if coalesce(v_app_meta ->> 'account_type', '') <> 'personnel'
     or coalesce(v_app_meta ->> 'personnel_role', '') <> 'super_admin'
     or coalesce(v_app_meta ->> 'bootstrap_source', '') <> 'kalasagai-dev-initial-super-admin-v1' then
    raise exception 'Untrusted metadata: user lacks required personnel super_admin claims'
      using errcode = '42501';
  end if;

  -- 6. Guard: Verify profile row exists in initial resident state
  select role, contact_number into v_current_role, v_contact
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Target profile not found in public.profiles' using errcode = 'P0002';
  end if;

  if v_current_role <> 'resident'::public.personnel_role then
    raise exception 'Target profile is not in the expected initial resident state' using errcode = '22023';
  end if;

  if v_contact is null or v_contact !~ '^\+639[0-9]{9}$' then
    raise exception 'Target profile must have a valid registered Philippine contact number' using errcode = '22023';
  end if;

  -- 7. Satisfy protect_profile_update trigger within local transaction scope
  perform pg_catalog.set_config('kalasag.allow_role_change', 'on', true);

  -- 8. Promote profile to super_admin
  update public.profiles
  set role = 'super_admin'::public.personnel_role,
      updated_at = pg_catalog.now()
  where id = p_user_id;

  -- 9. Record audit trail with null actor_id to accurately distinguish system bootstrap authority
  insert into public.audit_logs (actor_id, action, details)
  values (
    null,
    'personnel.bootstrap_super_admin',
    pg_catalog.jsonb_build_object(
      'target_user_id', p_user_id,
      'target_email', p_expected_email,
      'bootstrap_source', 'kalasagai-dev-initial-super-admin-v1',
      'provisioning_authority', 'owner-controlled-development-bootstrap',
      'caller_role', 'service_role'
    )
  );
end;
$$;

-- Restrict private implementation
revoke all on function app_private.bootstrap_initial_super_admin(uuid, text) from public, anon, authenticated;

-- ============================================================================
-- 2. Exposed RPC Wrapper Strictly Restricted to Service Role
-- ============================================================================
create or replace function public.bootstrap_initial_super_admin(
  p_user_id uuid,
  p_expected_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Validate caller role: Must be service_role in PostgREST or postgres in direct SQL
  if coalesce((select auth.role()), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Not authorized: initial bootstrap can only be executed via owner/service_role'
      using errcode = '42501';
  end if;
  perform app_private.bootstrap_initial_super_admin(p_user_id, p_expected_email);
end;
$$;

revoke all on function public.bootstrap_initial_super_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_initial_super_admin(uuid, text) to service_role;
