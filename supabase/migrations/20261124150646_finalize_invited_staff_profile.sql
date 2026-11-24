create or replace function app_private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_name text;
  v_phone text;
  v_role public.personnel_role;
begin
  -- A deferred trigger's NEW row still contains the metadata from the INSERT.
  select email, raw_user_meta_data, raw_app_meta_data into v_user
  from auth.users where id = new.id;
  if not found then
    return null;
  end if;

  v_name := nullif(btrim(coalesce(v_user.raw_user_meta_data ->> 'full_name', v_user.raw_user_meta_data ->> 'name')), '');
  v_phone := app_private.normalize_philippine_mobile(v_user.raw_user_meta_data ->> 'contact_number');
  v_role := case
    when v_user.raw_app_meta_data ->> 'account_type' = 'personnel'
      and v_user.raw_app_meta_data ->> 'personnel_role' in ('responder', 'communication_officer', 'admin', 'super_admin')
      then (v_user.raw_app_meta_data ->> 'personnel_role')::public.personnel_role
    else 'resident'::public.personnel_role
  end;

  if v_name is null then
    raise exception 'Full name is required' using errcode = '22023';
  end if;
  if v_user.raw_user_meta_data ->> 'contact_number' is not null and v_phone is null then
    raise exception 'A valid Philippine mobile number is required' using errcode = '22023';
  end if;
  if v_role = 'resident' and v_phone is null then
    raise exception 'A contact number is required' using errcode = '22023';
  end if;

  insert into public.profiles (id, full_name, email, contact_number, role)
  values (new.id, v_name, v_user.email, v_phone, v_role);
  return null;
end;
$$;

drop trigger on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users for each row
  when (new.raw_user_meta_data ->> 'contact_number' is not null
    or (new.raw_app_meta_data ->> 'account_type') is not distinct from 'personnel')
  execute function app_private.create_profile_for_new_user();

-- Auth's admin API writes trusted staff metadata after INSERT in the same transaction.
create constraint trigger finalize_pending_auth_profile
  after insert on auth.users deferrable initially deferred for each row
  when (new.raw_user_meta_data ->> 'contact_number' is null
    and (new.raw_app_meta_data ->> 'account_type') is distinct from 'personnel')
  execute function app_private.create_profile_for_new_user();
