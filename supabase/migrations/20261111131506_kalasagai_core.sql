create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create type public.personnel_role as enum (
  'resident',
  'responder',
  'communication_officer',
  'admin',
  'super_admin'
);

create type public.incident_category as enum (
  'fire',
  'flooding',
  'road_accident',
  'road_obstruction',
  'medical_emergency',
  'other'
);

create type public.incident_status as enum (
  'pending',
  'in_progress',
  'resolved',
  'closed'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  email text not null,
  contact_number text,
  role public.personnel_role not null default 'resident',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_contact_number_format
    check (contact_number is null or contact_number ~ '^\+639[0-9]{9}$'),
  constraint resident_profiles_require_contact
    check (role <> 'resident' or contact_number is not null)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  resident_id uuid not null references auth.users (id) on delete restrict,
  idempotency_key uuid not null,
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  location_label text not null check (char_length(btrim(location_label)) between 2 and 250),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  status public.incident_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resident_id, idempotency_key)
);

create index incidents_created_at_idx on public.incidents (created_at desc);
create index incidents_status_created_at_idx on public.incidents (status, created_at desc);
create index incidents_coordinates_idx on public.incidents (latitude, longitude);
create index incidents_resident_created_at_idx on public.incidents (resident_id, created_at desc);
create sequence public.incident_reference_seq;

create table app_private.incident_contact_snapshots (
  incident_id uuid primary key references public.incidents (id) on delete cascade,
  contact_snapshot text not null check (contact_snapshot ~ '^\+639[0-9]{9}$'),
  captured_at timestamptz not null default now()
);
alter table app_private.incident_contact_snapshots enable row level security;
revoke all on table app_private.incident_contact_snapshots from anon, authenticated;

create table public.incident_photos (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index incident_photos_incident_id_idx on public.incident_photos (incident_id);

create table public.incident_status_history (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  from_status public.incident_status,
  to_status public.incident_status not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index incident_status_history_incident_created_idx
  on public.incident_status_history (incident_id, created_at desc);

create table public.ai_assessments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  suggested_category public.incident_category not null,
  rationale text not null check (char_length(btrim(rationale)) between 1 and 1200),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  created_at timestamptz not null default now()
);

create index ai_assessments_incident_created_idx
  on public.ai_assessments (incident_id, created_at desc);

create table public.classification_reviews (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  assessment_id uuid references public.ai_assessments (id) on delete set null,
  confirmed_category public.incident_category not null,
  reviewer_id uuid not null references auth.users (id) on delete restrict,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index classification_reviews_incident_created_idx
  on public.classification_reviews (incident_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  incident_id uuid references public.incidents (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_incident_created_idx on public.audit_logs (incident_id, created_at desc);

create table public.system_settings (
  key text primary key check (key in ('surge_threshold', 'surge_mode', 'gemini_enabled')),
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value)
values
  ('surge_threshold', '20'::jsonb),
  ('surge_mode', 'false'::jsonb),
  ('gemini_enabled', 'false'::jsonb);

create table app_private.ai_jobs (
  id bigint generated always as identity primary key,
  incident_id uuid not null unique references public.incidents (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'complete', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app_private.normalize_philippine_mobile(p_number text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_number text;
begin
  if p_number is null or btrim(p_number) = '' then
    return null;
  end if;

  v_number := regexp_replace(btrim(p_number), '[[:space:]()-]', '', 'g');
  if v_number ~ '^09[0-9]{9}$' then
    return '+63' || substr(v_number, 2);
  end if;
  if v_number ~ '^\+639[0-9]{9}$' then
    return v_number;
  end if;

  return null;
end;
$$;

create or replace function app_private.current_role()
returns public.personnel_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
$$;

create or replace function app_private.has_any_role(p_roles public.personnel_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = any (p_roles)
  )
$$;

create or replace function app_private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_personnel_invite boolean;
  v_role public.personnel_role;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), '');
  v_phone := app_private.normalize_philippine_mobile(new.raw_user_meta_data ->> 'contact_number');
  v_personnel_invite := new.raw_app_meta_data ->> 'account_type' = 'personnel';
  v_role := case
    when v_personnel_invite and new.raw_app_meta_data ->> 'personnel_role' in (
      'responder', 'communication_officer', 'admin', 'super_admin'
    ) then (new.raw_app_meta_data ->> 'personnel_role')::public.personnel_role
    else 'resident'::public.personnel_role
  end;

  if v_name is null then
    raise exception 'Full name is required' using errcode = '22023';
  end if;
  if new.raw_user_meta_data ->> 'contact_number' is not null and v_phone is null then
    raise exception 'A valid Philippine mobile number is required' using errcode = '22023';
  end if;
  if v_role = 'resident' and v_phone is null then
    raise exception 'A contact number is required' using errcode = '22023';
  end if;

  insert into public.profiles (id, full_name, email, contact_number, role)
  values (new.id, v_name, new.email, v_phone, v_role);
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function app_private.create_profile_for_new_user();

create or replace function app_private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function app_private.sync_profile_email();

create or replace function app_private.protect_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('kalasag.allow_role_change', true), '') <> 'on' then
    raise exception 'Profile roles can only be changed by authorized personnel' using errcode = '42501';
  end if;

  if new.contact_number is distinct from old.contact_number then
    new.contact_number := app_private.normalize_philippine_mobile(new.contact_number);
    if new.contact_number is null and new.role = 'resident' then
      raise exception 'A valid Philippine mobile number is required' using errcode = '22023';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile_update
  before update on public.profiles
  for each row execute function app_private.protect_profile_update();

create or replace function app_private.record_incident_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.incident_status_history (incident_id, from_status, to_status, actor_id, note)
  values (new.id, null, new.status, new.resident_id, 'Report submitted');

  insert into public.audit_logs (actor_id, action, incident_id, details)
  values (new.resident_id, 'incident.submitted', new.id, jsonb_build_object('reference', new.reference));

  insert into app_private.ai_jobs (incident_id)
  values (new.id);

  return new;
end;
$$;

create trigger incident_created_records
  after insert on public.incidents
  for each row execute function app_private.record_incident_creation();

create or replace function app_private.record_incident_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.status is distinct from old.status then
    insert into public.incident_status_history (incident_id, from_status, to_status, actor_id, note)
    values (new.id, old.status, new.status, (select auth.uid()), null);

    insert into public.audit_logs (actor_id, action, incident_id, details)
    values (
      (select auth.uid()),
      'incident.status_changed',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return new;
end;
$$;

create trigger incident_update_history
  before update on public.incidents
  for each row execute function app_private.record_incident_update();

create or replace function public.submit_incident(
  p_idempotency_key uuid,
  p_description text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_photo_paths text[]
)
returns public.incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_phone text;
  v_existing public.incidents;
  v_incident public.incidents;
  v_valid_photo_count integer;
  v_path text;
  v_has_existing boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '28000';
  end if;

  select i.* into v_existing
  from public.incidents as i
  where i.resident_id = v_user_id and i.idempotency_key = p_idempotency_key;
  v_has_existing := found;

  select app_private.normalize_philippine_mobile(p.contact_number)
  into v_phone
  from public.profiles as p
  where p.id = v_user_id and p.role = 'resident';
  if v_phone is null then
    raise exception 'A valid profile contact number is required' using errcode = '22023';
  end if;

  if p_idempotency_key is null
     or p_description is null
     or char_length(btrim(p_description)) not between 10 and 2000
     or p_location_label is null
     or char_length(btrim(p_location_label)) not between 2 and 250
     or p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'Valid description and incident location are required' using errcode = '22023';
  end if;

  if p_photo_paths is null
     or cardinality(p_photo_paths) not between 1 and 5
     or cardinality(p_photo_paths) <> (select count(distinct path) from unnest(p_photo_paths) as path) then
    raise exception 'Between one and five unique evidence photos are required' using errcode = '22023';
  end if;

  select count(distinct o.name)::integer into v_valid_photo_count
  from storage.objects as o
  where o.bucket_id = 'incident-evidence'
    and o.name = any (p_photo_paths)
    and (storage.foldername(o.name))[1] = v_user_id::text
    and (storage.foldername(o.name))[2] = p_idempotency_key::text
    and array_length(storage.foldername(o.name), 1) = 2
    and o.metadata ->> 'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
    and case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint between 1 and 10485760
      else false
    end;

  if v_valid_photo_count <> cardinality(p_photo_paths) then
    raise exception 'Required evidence must be uploaded to the private incident bucket first' using errcode = '22023';
  end if;

  if not v_has_existing then
    begin
      insert into public.incidents (
        reference,
        resident_id,
        idempotency_key,
        description,
        location_label,
        latitude,
        longitude
      )
      values (
        'KAL-' || to_char(timezone('UTC', now()), 'YYYYMMDD') || '-' ||
          lpad(nextval('public.incident_reference_seq')::text, 6, '0'),
        v_user_id,
        p_idempotency_key,
        btrim(p_description),
        btrim(p_location_label),
        p_latitude,
        p_longitude
      )
      returning * into v_incident;
    exception
      when unique_violation then
        select i.* into v_existing
        from public.incidents as i
        where i.resident_id = v_user_id and i.idempotency_key = p_idempotency_key;
        if not found then
          raise;
        end if;
        v_has_existing := true;
    end;
  end if;

  if v_has_existing then
    if v_existing.description <> btrim(p_description)
       or v_existing.location_label <> btrim(p_location_label)
       or v_existing.latitude <> p_latitude
       or v_existing.longitude <> p_longitude
       or coalesce(
         (select array_agg(p.storage_path order by p.storage_path)
          from public.incident_photos as p where p.incident_id = v_existing.id),
         array[]::text[]
       ) <> (
         select array_agg(path order by path)
         from unnest(p_photo_paths) as submitted(path)
       ) then
      raise exception 'Idempotency key was reused with different report data' using errcode = '22023';
    end if;
    return v_existing;
  end if;

  insert into app_private.incident_contact_snapshots (incident_id, contact_snapshot)
  values (v_incident.id, v_phone);

  foreach v_path in array p_photo_paths loop
    insert into public.incident_photos (incident_id, storage_path, content_type, file_size_bytes)
    select v_incident.id, o.name, o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
    from storage.objects as o
    where o.bucket_id = 'incident-evidence' and o.name = v_path;
  end loop;

  return v_incident;
end;
$$;

create or replace function public.update_incident_status(
  p_incident_id uuid,
  p_status public.incident_status,
  p_note text default null
)
returns public.incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.personnel_role := app_private.current_role();
  v_incident public.incidents;
begin
  if v_actor_role is null or v_actor_role not in ('communication_officer', 'admin', 'super_admin') then
    raise exception 'Not authorized to update incident status' using errcode = '42501';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Status note is too long' using errcode = '22023';
  end if;

  update public.incidents as i
  set status = p_status
  where i.id = p_incident_id
    and (
      (i.status = 'pending' and p_status in ('in_progress', 'resolved'))
      or (i.status = 'in_progress' and p_status = 'resolved')
      or (i.status = 'resolved' and p_status = 'closed')
    )
  returning * into v_incident;

  if not found then
    raise exception 'Incident not found or invalid status transition' using errcode = '22023';
  end if;

  if p_note is not null then
    update public.incident_status_history
    set note = p_note
    where id = (
      select h.id from public.incident_status_history as h
      where h.incident_id = p_incident_id
      order by h.created_at desc, h.id desc limit 1
    );
  end if;

  return v_incident;
end;
$$;

create or replace function public.review_incident_classification(
  p_incident_id uuid,
  p_category public.incident_category,
  p_assessment_id uuid default null,
  p_note text default null
)
returns public.classification_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.classification_reviews;
begin
  if app_private.current_role() is null
     or app_private.current_role() not in ('communication_officer', 'admin', 'super_admin') then
    raise exception 'Not authorized to review classifications' using errcode = '42501';
  end if;
  if not exists (select 1 from public.incidents where id = p_incident_id) then
    raise exception 'Incident not found' using errcode = 'P0002';
  end if;
  if p_assessment_id is not null and not exists (
    select 1 from public.ai_assessments
    where id = p_assessment_id and incident_id = p_incident_id
  ) then
    raise exception 'Assessment does not belong to this incident' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Review note is too long' using errcode = '22023';
  end if;

  insert into public.classification_reviews (
    incident_id, assessment_id, confirmed_category, reviewer_id, note
  )
  values (p_incident_id, p_assessment_id, p_category, (select auth.uid()), p_note)
  returning * into v_review;

  insert into public.audit_logs (actor_id, action, incident_id, details)
  values (
    (select auth.uid()),
    'incident.classification_reviewed',
    p_incident_id,
    jsonb_build_object('category', p_category, 'assessment_id', p_assessment_id)
  );

  return v_review;
end;
$$;

create or replace function public.get_incident_contact(p_incident_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.personnel_role := app_private.current_role();
  v_contact text;
begin
  if v_actor_role is null or v_actor_role not in ('communication_officer', 'admin', 'super_admin') then
    raise exception 'Not authorized to view reporter contact information' using errcode = '42501';
  end if;

  select contact_snapshot into v_contact
  from app_private.incident_contact_snapshots
  where incident_id = p_incident_id;
  if not found then
    raise exception 'Incident contact information not found' using errcode = 'P0002';
  end if;

  return v_contact;
end;
$$;

create or replace function public.record_ai_assessment(
  p_incident_id uuid,
  p_category public.incident_category,
  p_rationale text,
  p_model text,
  p_actor_id uuid
)
returns public.ai_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.ai_assessments;
  v_actor_role public.personnel_role;
begin
  select role into v_actor_role
  from public.profiles
  where id = p_actor_id;
  if v_actor_role is null or v_actor_role not in ('communication_officer', 'admin', 'super_admin') then
    raise exception 'Not authorized to record an AI assessment' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_rationale, ''))) not between 1 and 1200
     or char_length(btrim(coalesce(p_model, ''))) not between 1 and 120 then
    raise exception 'Invalid AI assessment' using errcode = '22023';
  end if;

  insert into public.ai_assessments (incident_id, suggested_category, rationale, model)
  values (p_incident_id, p_category, btrim(p_rationale), btrim(p_model))
  returning * into v_assessment;

  update app_private.ai_jobs
  set status = 'complete', updated_at = now()
  where incident_id = p_incident_id and status = 'processing';
  if not found then
    raise exception 'AI job was not claimed for processing' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_id, action, incident_id, details)
  values (
    p_actor_id,
    'incident.ai_assessed',
    p_incident_id,
    jsonb_build_object('assessment_id', v_assessment.id, 'model', p_model)
  );

  return v_assessment;
end;
$$;

create or replace function public.claim_ai_job(p_incident_id uuid, p_actor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.personnel_role;
begin
  select role into v_actor_role from public.profiles where id = p_actor_id;
  if v_actor_role is null or v_actor_role not in ('communication_officer', 'admin', 'super_admin') then
    raise exception 'Not authorized to process AI jobs' using errcode = '42501';
  end if;

  update app_private.ai_jobs
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where incident_id = p_incident_id
    and status in ('queued', 'failed')
    and attempts < 3;

  return found;
end;
$$;

create or replace function public.fail_ai_job(p_incident_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.personnel_role;
begin
  select role into v_actor_role from public.profiles where id = p_actor_id;
  if v_actor_role is null or v_actor_role not in ('communication_officer', 'admin', 'super_admin') then
    raise exception 'Not authorized to process AI jobs' using errcode = '42501';
  end if;

  update app_private.ai_jobs
  set status = 'failed', updated_at = now()
  where incident_id = p_incident_id and status = 'processing';
end;
$$;

create or replace function public.set_system_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.personnel_role := app_private.current_role();
begin
  if v_actor_role is null or v_actor_role not in ('admin', 'super_admin') then
    raise exception 'Not authorized to update system settings' using errcode = '42501';
  end if;

  if p_key = 'surge_threshold' then
    if jsonb_typeof(p_value) is distinct from 'number'
       or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
       or (p_value #>> '{}')::numeric not between 1 and 1000 then
      raise exception 'Surge threshold must be a whole number between 1 and 1000' using errcode = '22023';
    end if;
  elsif p_key = 'gemini_enabled' then
    if jsonb_typeof(p_value) is distinct from 'boolean' then
      raise exception 'Gemini setting must be a boolean' using errcode = '22023';
    end if;
    if p_value = 'true'::jsonb and v_actor_role <> 'super_admin' then
      raise exception 'Only a super admin can enable paid AI processing' using errcode = '42501';
    end if;
  elsif p_key = 'surge_mode' then
    if jsonb_typeof(p_value) is distinct from 'boolean' then
      raise exception 'Surge mode setting must be a boolean' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown system setting' using errcode = '22023';
  end if;

  insert into public.system_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, (select auth.uid()), now())
  on conflict (key) do update
  set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  insert into public.audit_logs (actor_id, action, details)
  values (
    (select auth.uid()),
    'system.setting_changed',
    jsonb_build_object('key', p_key, 'value', p_value)
  );
end;
$$;

create or replace function app_private.assign_personnel_role(
  p_user_id uuid,
  p_role public.personnel_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.personnel_role := app_private.current_role();
  v_target_role public.personnel_role;
begin
  if v_actor_role is null or v_actor_role not in ('admin', 'super_admin') or p_role = 'resident' then
    raise exception 'Not authorized to manage personnel roles' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'Personnel profile not found' using errcode = 'P0002';
  end if;

  if v_actor_role <> 'super_admin'
     and (p_role in ('admin', 'super_admin') or v_target_role in ('admin', 'super_admin')) then
    raise exception 'Only a super admin can manage privileged personnel' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Personnel cannot change their own role' using errcode = '42501';
  end if;

  perform set_config('kalasag.allow_role_change', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;

  insert into public.audit_logs (actor_id, action, details)
  values (
    (select auth.uid()),
    'personnel.role_changed',
    jsonb_build_object('user_id', p_user_id, 'from', v_target_role, 'to', p_role)
  );
end;
$$;

create or replace function public.assign_personnel_role(
  p_user_id uuid,
  p_role public.personnel_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode = '28000';
  end if;
  perform app_private.assign_personnel_role(p_user_id, p_role);
end;
$$;

alter table public.profiles enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_photos enable row level security;
alter table public.incident_status_history enable row level security;
alter table public.ai_assessments enable row level security;
alter table public.classification_reviews enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;
alter table app_private.ai_jobs enable row level security;

revoke all on table public.profiles, public.incidents, public.incident_photos,
  public.incident_status_history, public.ai_assessments, public.classification_reviews,
  public.audit_logs, public.system_settings from anon, authenticated;
grant select, update (full_name, contact_number) on public.profiles to authenticated;
grant select on public.incidents, public.incident_photos, public.incident_status_history,
  public.ai_assessments, public.classification_reviews, public.audit_logs, public.system_settings
  to authenticated;
revoke all on table app_private.ai_jobs from anon, authenticated;

create policy "Residents read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "Residents update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Residents and staff read authorized incidents"
  on public.incidents for select to authenticated
  using (
    resident_id = (select auth.uid())
    or app_private.has_any_role(array['responder', 'communication_officer', 'admin', 'super_admin']::public.personnel_role[])
  );
create policy "Residents and staff read authorized incident photos"
  on public.incident_photos for select to authenticated
  using (
    exists (
      select 1 from public.incidents as i
      where i.id = incident_id
        and (
          i.resident_id = (select auth.uid())
          or app_private.has_any_role(array['responder', 'communication_officer', 'admin', 'super_admin']::public.personnel_role[])
        )
    )
  );
create policy "Residents and staff read authorized incident history"
  on public.incident_status_history for select to authenticated
  using (
    exists (
      select 1 from public.incidents as i
      where i.id = incident_id
        and (
          i.resident_id = (select auth.uid())
          or app_private.has_any_role(array['responder', 'communication_officer', 'admin', 'super_admin']::public.personnel_role[])
        )
    )
  );
create policy "Residents and staff read authorized assessments"
  on public.ai_assessments for select to authenticated
  using (
    exists (
      select 1 from public.incidents as i
      where i.id = incident_id
        and (
          i.resident_id = (select auth.uid())
          or app_private.has_any_role(array['responder', 'communication_officer', 'admin', 'super_admin']::public.personnel_role[])
        )
    )
  );
create policy "Staff read classification reviews"
  on public.classification_reviews for select to authenticated
  using (app_private.has_any_role(array['responder', 'communication_officer', 'admin', 'super_admin']::public.personnel_role[]));
create policy "Authorized operators read audit logs"
  on public.audit_logs for select to authenticated
  using (app_private.has_any_role(array['communication_officer', 'admin', 'super_admin']::public.personnel_role[]));
create policy "Administrators read system settings"
  on public.system_settings for select to authenticated
  using (app_private.has_any_role(array['admin', 'super_admin']::public.personnel_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-evidence',
  'incident-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Residents upload evidence to their own incident draft"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'incident-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and array_length(storage.foldername(name), 1) = 2
  );
create policy "Residents and personnel read authorized incident evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'incident-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or app_private.has_any_role(array['responder', 'communication_officer', 'admin', 'super_admin']::public.personnel_role[])
    )
  );
create policy "Residents remove unsubmitted evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'incident-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.incident_photos as p where p.storage_path = name
    )
  );

revoke all on function app_private.normalize_philippine_mobile(text) from public, anon, authenticated;
revoke all on function app_private.current_role() from public, anon, authenticated;
revoke all on function app_private.has_any_role(public.personnel_role[]) from public, anon, authenticated;
revoke all on function app_private.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function app_private.protect_profile_update() from public, anon, authenticated;
revoke all on function app_private.record_incident_creation() from public, anon, authenticated;
revoke all on function app_private.record_incident_update() from public, anon, authenticated;
revoke all on function app_private.sync_profile_email() from public, anon, authenticated;
revoke all on function public.submit_incident(uuid, text, text, double precision, double precision, text[]) from public, anon, authenticated;
revoke all on function public.update_incident_status(uuid, public.incident_status, text) from public, anon, authenticated;
revoke all on function public.review_incident_classification(uuid, public.incident_category, uuid, text) from public, anon, authenticated;
revoke all on function public.assign_personnel_role(uuid, public.personnel_role) from public, anon, authenticated;
revoke all on function public.get_incident_contact(uuid) from public, anon, authenticated;
revoke all on function public.record_ai_assessment(uuid, public.incident_category, text, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_ai_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_ai_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_system_setting(text, jsonb) from public, anon, authenticated;
revoke all on function app_private.assign_personnel_role(uuid, public.personnel_role) from public, anon, authenticated;

grant execute on function app_private.has_any_role(public.personnel_role[]) to authenticated;
grant execute on function public.submit_incident(uuid, text, text, double precision, double precision, text[]) to authenticated;
grant execute on function public.update_incident_status(uuid, public.incident_status, text) to authenticated;
grant execute on function public.review_incident_classification(uuid, public.incident_category, uuid, text) to authenticated;
grant execute on function public.assign_personnel_role(uuid, public.personnel_role) to authenticated;
grant execute on function public.get_incident_contact(uuid) to authenticated;
grant execute on function public.set_system_setting(text, jsonb) to authenticated;
grant execute on function public.record_ai_assessment(uuid, public.incident_category, text, text, uuid) to service_role;
grant execute on function public.claim_ai_job(uuid, uuid) to service_role;
grant execute on function public.fail_ai_job(uuid, uuid) to service_role;
grant execute on function app_private.assign_personnel_role(uuid, public.personnel_role) to authenticated;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'incidents',
      'incident_photos',
      'incident_status_history',
      'ai_assessments',
      'classification_reviews',
      'audit_logs',
      'system_settings'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;