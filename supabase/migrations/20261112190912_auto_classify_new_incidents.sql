create extension if not exists pg_net;

-- Queue classification asynchronously so report submission does not wait on Gemini.
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
          p.role = 'resident'::public.personnel_role
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
begin
  if not app_private.can_classify_incident(p_actor_id, p_incident_id) then
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
begin
  if not app_private.can_classify_incident(p_actor_id, p_incident_id) then
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
begin
  if not app_private.can_classify_incident(p_actor_id, p_incident_id) then
    raise exception 'Not authorized to process AI jobs' using errcode = '42501';
  end if;

  update app_private.ai_jobs
  set status = 'failed', updated_at = now()
  where incident_id = p_incident_id and status = 'processing';
end;
$$;

create or replace function app_private.dispatch_ai_classification(p_incident_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  v_claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
  v_authorization text := v_headers ->> 'authorization';
  v_api_key text := v_headers ->> 'apikey';
  v_issuer text := v_claims ->> 'iss';
  v_function_url text;
begin
  if not exists (
    select 1
    from public.system_settings
    where key = 'gemini_enabled'
      and value = 'true'::jsonb
  ) then
    return;
  end if;

  if v_authorization is null or btrim(v_authorization) = ''
     or v_api_key is null or btrim(v_api_key) = '' then
    raise log 'Cannot dispatch AI classification for incident %: request credentials are unavailable',
      p_incident_id;
    return;
  end if;

  if v_issuer ~ '^https://[a-z0-9-]+[.]supabase[.]co/auth/v1$' then
    v_function_url :=
      regexp_replace(v_issuer, '/auth/v1$', '') ||
      '/functions/v1/classify-incident';
  elsif v_issuer ~ '^http://(127[.]0[.]0[.]1|localhost):54321/auth/v1$' then
    v_function_url := 'http://host.docker.internal:54321/functions/v1/classify-incident';
  else
    raise log 'Cannot dispatch AI classification for incident %: unsupported JWT issuer',
      p_incident_id;
    return;
  end if;

  begin
    perform net.http_post(
      url := v_function_url,
      body := jsonb_build_object('incidentId', p_incident_id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_api_key,
        'Authorization', v_authorization
      ),
      timeout_milliseconds := 55000
    );
  exception when others then
    raise log 'AI classification dispatch failed for incident %: %',
      p_incident_id, sqlerrm;
  end;
end;
$$;

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

  perform app_private.dispatch_ai_classification(new.id);

  return new;
end;
$$;

revoke all on function app_private.can_classify_incident(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.dispatch_ai_classification(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.record_ai_assessment(uuid, public.incident_category, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_ai_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_ai_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_ai_assessment(uuid, public.incident_category, text, text, uuid)
  to service_role;
grant execute on function public.claim_ai_job(uuid, uuid) to service_role;
grant execute on function public.fail_ai_job(uuid, uuid) to service_role;