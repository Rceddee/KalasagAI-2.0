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
  where p.id = v_user_id
    and p.role in (
      'resident'::public.personnel_role,
      'responder'::public.personnel_role,
      'communication_officer'::public.personnel_role,
      'admin'::public.personnel_role,
      'super_admin'::public.personnel_role
    );
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

create or replace function app_private.can_classify_incident(
  p_actor_id uuid,
  p_incident_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = p_actor_id
      and (
        p.role in (
          'communication_officer'::public.personnel_role,
          'admin'::public.personnel_role,
          'super_admin'::public.personnel_role
        )
        or (
          p.role in (
            'resident'::public.personnel_role,
            'responder'::public.personnel_role
          )
          and exists (
            select 1
            from public.incidents as i
            where i.id = p_incident_id
              and i.resident_id = p.id
          )
        )
      )
  );
$$;