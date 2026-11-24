create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_cron;
create extension if not exists pgcrypto with schema extensions;

revoke all on table vault.secrets, vault.decrypted_secrets
  from public, anon, authenticated, service_role;

alter table app_private.ai_jobs
  add column if not exists worker_token uuid,
  add column if not exists dispatch_timestamp text,
  add column if not exists dispatch_attempts integer not null default 0,
  add column if not exists next_dispatch_at timestamptz not null default now(),
  add column if not exists last_dispatch_request_id bigint,
  add column if not exists last_reconciled_request_id bigint,
  add column if not exists last_dispatch_http_status integer,
  add column if not exists last_dispatch_error_code text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_error_code text;

update app_private.ai_jobs
set processing_started_at = updated_at
where status = 'processing'
  and processing_started_at is null;

-- Ensure existing queued jobs created prior to migration are held safely
-- until live inference and replay are separately authorized.
update app_private.ai_jobs
set next_dispatch_at = 'infinity'::timestamptz,
    last_dispatch_error_code = 'awaiting_authorization'
where status = 'queued';

create index if not exists ai_jobs_dispatch_due_idx
  on app_private.ai_jobs (next_dispatch_at, created_at)
  where status in ('queued', 'failed') and attempts < 3;

create index if not exists ai_jobs_processing_started_idx
  on app_private.ai_jobs (processing_started_at)
  where status = 'processing';

create or replace function app_private.dispatch_ai_classification(p_incident_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_anon_jwt text;
  v_hmac_key text;
  v_payload text;
  v_role text;
  v_timestamp text;
  v_message text;
  v_signature text;
  v_url text;
  v_body jsonb;
  v_headers jsonb;
  v_request_id bigint;
  v_pg_net_schema text;
  v_sqlstate text;
begin
  if not exists (
    select 1
    from public.system_settings
    where key = 'gemini_enabled'
      and value = 'true'::jsonb
  ) then
    update app_private.ai_jobs
    set next_dispatch_at = clock_timestamp() + interval '5 minutes',
        last_dispatch_error_code = 'classification_disabled',
        updated_at = clock_timestamp()
    where incident_id = p_incident_id
      and status in ('queued', 'failed')
      and attempts < 3;
    return;
  end if;

  select
    max(decrypted_secret) filter (
      where name = 'kalasagai_ai_dispatch_project_url'
    ),
    max(decrypted_secret) filter (
      where name = 'kalasagai_ai_dispatch_anon_jwt'
    ),
    max(decrypted_secret) filter (
      where name = 'kalasagai_ai_dispatch_hmac_key'
    )
  into v_project_url, v_anon_jwt, v_hmac_key
  from vault.decrypted_secrets
  where name in (
    'kalasagai_ai_dispatch_project_url',
    'kalasagai_ai_dispatch_anon_jwt',
    'kalasagai_ai_dispatch_hmac_key'
  );

  v_project_url := rtrim(coalesce(v_project_url, ''), '/');
  if v_project_url !~ '^https://[a-z0-9-]+[.]supabase[.]co$'
     and v_project_url <> 'http://host.docker.internal:54321' then
    v_project_url := null;
  end if;

  -- Only a low-privilege legacy anon JWT may enter pg_net. The gateway verifies its signature.
  if v_anon_jwt ~ '^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' then
    begin
      v_payload := translate(split_part(v_anon_jwt, '.', 2), '-_', '+/');
      v_role := convert_from(decode(rpad(v_payload, ((length(v_payload)+3)/4)*4, '='), 'base64'), 'UTF8')::jsonb ->> 'role';
    exception when data_exception then
      v_role := null;
    end;
  end if;

  if v_project_url is null
     or v_role is distinct from 'anon'
     or octet_length(convert_to(coalesce(v_hmac_key, ''), 'UTF8')) < 32 then
    update app_private.ai_jobs
    set next_dispatch_at = clock_timestamp() + interval '5 minutes',
        last_dispatch_error_code = 'missing_dispatch_configuration',
        updated_at = clock_timestamp()
    where incident_id = p_incident_id
      and status in ('queued', 'failed')
      and attempts < 3;
    raise log 'AI dispatch configuration unavailable for incident %', p_incident_id;
    return;
  end if;

  update app_private.ai_jobs
  set dispatch_attempts = dispatch_attempts + 1,
      next_dispatch_at = clock_timestamp() + make_interval(
        secs => least(900, (60 * power(2, least(dispatch_attempts + 1, 4)))::integer)
      ),
      dispatch_timestamp = null,
      last_dispatch_request_id = null,
      last_dispatch_http_status = null,
      last_dispatch_error_code = null,
      updated_at = clock_timestamp()
  where incident_id = p_incident_id
    and status in ('queued', 'failed')
    and attempts < 3
    and dispatch_attempts < 5
    and next_dispatch_at <= clock_timestamp();

  if not found then
    return;
  end if;

  v_timestamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
  v_message := v_timestamp || '.' || lower(p_incident_id::text);
  v_signature := encode(
    extensions.hmac(
      convert_to(v_message, 'UTF8'),
      convert_to(v_hmac_key, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_url := v_project_url || '/functions/v1/classify-incident';
  v_body := jsonb_build_object('incidentId', lower(p_incident_id::text));
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', v_anon_jwt,
    'Authorization', 'Bearer ' || v_anon_jwt,
    'x-kalasag-dispatch-timestamp', v_timestamp,
    'x-kalasag-dispatch-signature', v_signature
  );
  begin
    if to_regprocedure(
      'extensions.http_post(text,jsonb,jsonb,jsonb,integer)'
    ) is not null then
      v_pg_net_schema := 'extensions';
    elsif to_regprocedure(
      'net.http_post(text,jsonb,jsonb,jsonb,integer)'
    ) is not null then
      v_pg_net_schema := 'net';
    else
      raise exception 'pg_net http_post function is unavailable';
    end if;

    execute format('select %I.http_post($1, $2, $3, $4, $5)', v_pg_net_schema)
      into v_request_id
      using v_url, v_body, '{}'::jsonb, v_headers, 55000;

    if v_request_id is null then
      raise exception using errcode = '58000', message = 'pg_net returned no request id';
    end if;

    update app_private.ai_jobs
    set last_dispatch_request_id = v_request_id,
        dispatch_timestamp = v_timestamp,
        updated_at = clock_timestamp()
    where incident_id = p_incident_id;
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    update app_private.ai_jobs
    set last_dispatch_error_code = 'enqueue_' || coalesce(v_sqlstate, 'unknown'),
        updated_at = clock_timestamp()
    where incident_id = p_incident_id
      and status in ('queued', 'failed');
    raise log 'AI dispatch enqueue failed for incident %; SQLSTATE %',
      p_incident_id, coalesce(v_sqlstate, 'unknown');
  end;
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate;
  update app_private.ai_jobs
  set dispatch_attempts = dispatch_attempts + 1,
      next_dispatch_at = clock_timestamp() + make_interval(secs => least(900, (60 * power(2, least(dispatch_attempts + 1, 4)))::integer)),
      last_dispatch_error_code = 'dispatcher_' || coalesce(v_sqlstate, 'unknown'),
      updated_at = clock_timestamp()
  where incident_id = p_incident_id
    and status in ('queued', 'failed')
    and attempts < 3;
  raise log 'AI dispatcher failed for incident %; SQLSTATE %',
    p_incident_id, coalesce(v_sqlstate, 'unknown');
end;
$$;

create or replace function app_private.recover_stale_ai_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovered integer;
begin
  update app_private.ai_jobs as j
  set status = 'complete',
      processing_started_at = null,
      processing_error_code = null,
      updated_at = clock_timestamp()
  where j.status = 'processing'
    and exists (
      select 1
      from public.ai_assessments as a
      where a.incident_id = j.incident_id
    );

  update app_private.ai_jobs as j
  set status = 'failed',
      processing_started_at = null,
      processing_error_code = 'processing_timeout',
      next_dispatch_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where j.status = 'processing'
    and j.processing_started_at < clock_timestamp() - interval '10 minutes'
    and not exists (
      select 1
      from public.ai_assessments as a
      where a.incident_id = j.incident_id
    );

  get diagnostics v_recovered = row_count;
  return v_recovered;
end;
$$;

create or replace function app_private.process_ai_job_dispatches()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_response record;
  v_pg_net_schema text;
begin
  perform app_private.recover_stale_ai_jobs();

  if to_regclass('extensions._http_response') is not null then
    v_pg_net_schema := 'extensions';
  elsif to_regclass('net._http_response') is not null then
    v_pg_net_schema := 'net';
  end if;

  if v_pg_net_schema is not null then
    for v_response in execute format(
      'select j.incident_id, r.id, r.status_code, r.timed_out,
              (r.error_msg is not null) as has_network_error
       from app_private.ai_jobs as j
       join %I._http_response as r
         on r.id = j.last_dispatch_request_id
       where j.last_reconciled_request_id is distinct from r.id
         and j.last_dispatch_request_id is not null
         and r.created > clock_timestamp() - interval ''6 hours''',
      v_pg_net_schema
    )
    loop
      update app_private.ai_jobs
      set last_reconciled_request_id = v_response.id,
          last_dispatch_http_status = v_response.status_code,
          last_dispatch_error_code = case
            when v_response.timed_out then 'request_timeout'
            when v_response.has_network_error then 'network_error'
            when v_response.status_code between 200 and 299 then null
            else 'http_' || coalesce(v_response.status_code::text, 'unknown')
          end
      where incident_id = v_response.incident_id
        and last_dispatch_request_id = v_response.id
        and last_reconciled_request_id is distinct from v_response.id;
    end loop;
  end if;

  update app_private.ai_jobs
  set status = 'failed', dispatch_timestamp = null,
      processing_error_code = 'dispatch_exhausted', updated_at = clock_timestamp()
  where status in ('queued', 'failed') and dispatch_attempts >= 5
    and next_dispatch_at <= clock_timestamp()
    and processing_error_code is distinct from 'dispatch_exhausted';

  for v_job in
    select j.incident_id
    from app_private.ai_jobs as j
    where j.status in ('queued', 'failed')
      and j.dispatch_attempts < 5
      and j.attempts < 3
      and j.next_dispatch_at <= clock_timestamp()
    order by j.next_dispatch_at, j.created_at
    for update skip locked
    limit 25
  loop
    perform app_private.dispatch_ai_classification(v_job.incident_id);
  end loop;
end;
$$;

create or replace function public.claim_ai_job(p_incident_id uuid, p_actor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app_private.can_classify_incident(p_actor_id, p_incident_id) is not true then
    raise exception 'Not authorized to process AI jobs' using errcode = '42501';
  end if;

  update app_private.ai_jobs
  set status = 'processing',
      worker_token = null,
      attempts = attempts + 1,
      dispatch_timestamp = null,
      processing_started_at = clock_timestamp(),
      processing_error_code = null,
      last_dispatch_error_code = null,
      updated_at = clock_timestamp()
  where incident_id = p_incident_id
    and status in ('queued', 'failed')
    and attempts < 3;

  return found;
end;
$$;

-- Consume the timestamp under the same row lock as the claim. A signed retry
-- from an earlier delivery cannot start another provider request after failure.
create function public.claim_ai_job_delivery(
  p_incident_id uuid, p_actor_id uuid, p_worker_token uuid, p_dispatch_timestamp text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_worker_token is null then return false; end if;
  perform 1 from app_private.ai_jobs
  where incident_id = p_incident_id
    and (p_dispatch_timestamp is null or dispatch_timestamp = p_dispatch_timestamp)
  for update;
  if not found then return false; end if;
  if not public.claim_ai_job(p_incident_id, p_actor_id) then return false; end if;
  update app_private.ai_jobs set worker_token = p_worker_token where incident_id = p_incident_id;
  return true;
end;
$$;

revoke all on function public.claim_ai_job_delivery(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_job_delivery(uuid, uuid, uuid, text) to service_role;

create or replace function public.fail_ai_job(p_incident_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app_private.can_classify_incident(p_actor_id, p_incident_id) is not true then
    raise exception 'Not authorized to process AI jobs' using errcode = '42501';
  end if;

  update app_private.ai_jobs as j
  set status = case
        when exists (
          select 1
          from public.ai_assessments as a
          where a.incident_id = j.incident_id
        ) then 'complete'
        else 'failed'
      end,
      processing_started_at = null,
      processing_error_code = case
        when exists (
          select 1
          from public.ai_assessments as a
          where a.incident_id = j.incident_id
        ) then null
        else 'classification_failed'
      end,
      next_dispatch_at = greatest(
        next_dispatch_at,
        clock_timestamp() + interval '30 seconds'
      ),
      updated_at = clock_timestamp()
  where j.incident_id = p_incident_id
    and j.status = 'processing';
end;
$$;

create or replace function app_private.record_ai_assessment(
  p_incident_id uuid,
  p_category public.incident_category,
  p_priority public.incident_priority,
  p_rationale text,
  p_model text,
  p_authorization_actor_id uuid,
  p_audit_actor_id uuid,
  p_audit_source text
)
returns public.ai_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_status text;
  v_assessment public.ai_assessments;
begin
  if app_private.can_classify_incident(
    p_authorization_actor_id,
    p_incident_id
  ) is not true then
    raise exception 'Not authorized to record an AI assessment' using errcode = '42501';
  end if;
  if p_audit_source is null
     or p_audit_source not in ('user_request', 'automatic_dispatch')
     or (p_audit_source = 'user_request'
         and p_audit_actor_id is distinct from p_authorization_actor_id)
     or (p_audit_source = 'automatic_dispatch' and p_audit_actor_id is not null) then
    raise exception 'Invalid AI assessment audit attribution' using errcode = '22023';
  end if;
  if p_priority is null
     or char_length(btrim(coalesce(p_rationale, ''))) not between 1 and 1200
     or char_length(btrim(coalesce(p_model, ''))) not between 1 and 120 then
    raise exception 'Invalid AI assessment' using errcode = '22023';
  end if;

  select j.status into v_job_status
  from app_private.ai_jobs as j
  where j.incident_id = p_incident_id
  for update;
  if not found then
    raise exception 'AI job does not exist' using errcode = '22023';
  end if;

  select a.* into v_assessment
  from public.ai_assessments as a
  where a.incident_id = p_incident_id
  order by a.created_at desc, a.id desc
  limit 1;

  if v_job_status = 'complete' then
    if found then
      return v_assessment;
    end if;
    raise exception 'Completed AI job has no assessment' using errcode = '22023';
  end if;

  if v_job_status <> 'processing' then
    raise exception 'AI job was not claimed for processing' using errcode = '22023';
  end if;

  if found then
    update app_private.ai_jobs
    set status = 'complete',
        processing_started_at = null,
        processing_error_code = null,
        updated_at = clock_timestamp()
    where incident_id = p_incident_id;
    return v_assessment;
  end if;

  insert into public.ai_assessments (
    incident_id, suggested_category, suggested_priority, rationale, model
  )
  values (
    p_incident_id, p_category, p_priority, btrim(p_rationale), btrim(p_model)
  )
  returning * into v_assessment;

  update app_private.ai_jobs
  set status = 'complete',
      processing_started_at = null,
      processing_error_code = null,
      updated_at = clock_timestamp()
  where incident_id = p_incident_id;

  insert into public.audit_logs (actor_id, action, incident_id, details)
  values (
    p_audit_actor_id,
    'incident.ai_assessed',
    p_incident_id,
    jsonb_build_object(
      'assessment_id', v_assessment.id,
      'model', p_model,
      'priority', p_priority,
      'source', p_audit_source
    )
  );

  return v_assessment;
end;
$$;

create or replace function public.record_ai_assessment(
  p_incident_id uuid,
  p_category public.incident_category,
  p_priority public.incident_priority,
  p_rationale text,
  p_model text,
  p_actor_id uuid
)
returns public.ai_assessments
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.record_ai_assessment(
    p_incident_id,
    p_category,
    p_priority,
    p_rationale,
    p_model,
    p_actor_id,
    p_actor_id,
    'user_request'
  );
end;
$$;

create or replace function public.record_ai_assessment_automated(
  p_incident_id uuid,
  p_category public.incident_category,
  p_priority public.incident_priority,
  p_rationale text,
  p_model text
)
returns public.ai_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization_actor_id uuid;
begin
  select i.resident_id into v_authorization_actor_id
  from public.incidents as i
  where i.id = p_incident_id;
  if not found then
    raise exception 'Incident does not exist' using errcode = '22023';
  end if;

  return app_private.record_ai_assessment(
    p_incident_id,
    p_category,
    p_priority,
    p_rationale,
    p_model,
    v_authorization_actor_id,
    null,
    'automatic_dispatch'
  );
end;
$$;

-- Serialize worker completion with timeout recovery and subsequent claims.
create function app_private.lock_ai_worker(p_incident_id uuid, p_worker_token uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from app_private.ai_jobs where incident_id = p_incident_id
    and worker_token = p_worker_token and status in ('processing', 'complete') for update;
  if not found then raise exception 'AI worker claim expired' using errcode = '55000'; end if;
end;
$$;
revoke all on function app_private.lock_ai_worker(uuid, uuid) from public, anon, authenticated, service_role;

create function public.fail_ai_job(p_incident_id uuid, p_actor_id uuid, p_worker_token uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.lock_ai_worker(p_incident_id, p_worker_token);
  perform public.fail_ai_job(p_incident_id, p_actor_id);
end;
$$;

create function public.record_claimed_ai_assessment(
  p_incident_id uuid, p_worker_token uuid, p_category public.incident_category,
  p_priority public.incident_priority, p_rationale text, p_model text, p_actor_id uuid
) returns public.ai_assessments language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.lock_ai_worker(p_incident_id, p_worker_token);
  if p_actor_id is null then
    return public.record_ai_assessment_automated(p_incident_id,p_category,p_priority,p_rationale,p_model);
  end if;
  return public.record_ai_assessment(p_incident_id,p_category,p_priority,p_rationale,p_model,p_actor_id);
end;
$$;
revoke all on function public.fail_ai_job(uuid,uuid,uuid),
  public.record_claimed_ai_assessment(uuid,uuid,public.incident_category,public.incident_priority,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.fail_ai_job(uuid,uuid,uuid),
  public.record_claimed_ai_assessment(uuid,uuid,public.incident_category,public.incident_priority,text,text,uuid)
  to service_role;

revoke all on function app_private.dispatch_ai_classification(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.recover_stale_ai_jobs()
  from public, anon, authenticated, service_role;
revoke all on function app_private.process_ai_job_dispatches()
  from public, anon, authenticated, service_role;
revoke all on function app_private.record_ai_assessment(
  uuid, public.incident_category, public.incident_priority,
  text, text, uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_ai_assessment_automated(
  uuid, public.incident_category, public.incident_priority, text, text
) from public, anon, authenticated;
grant execute on function public.record_ai_assessment(
  uuid, public.incident_category, public.incident_priority, text, text, uuid
) to service_role;
grant execute on function public.record_ai_assessment_automated(
  uuid, public.incident_category, public.incident_priority, text, text
) to service_role;

do $$
declare
  v_job_id bigint;
begin
  -- Default-off scheduler: install job as inactive (active = false)
  -- to prevent unapproved automated replay of existing queued incidents.
  -- cron.schedule replaces any existing job with the same name.
  v_job_id := cron.schedule(
    'kalasagai-ai-job-dispatch',
    '* * * * *',
    'select app_private.process_ai_job_dispatches();'
  );

  perform cron.alter_job(job_id := v_job_id, active := false);
end;
$$;
