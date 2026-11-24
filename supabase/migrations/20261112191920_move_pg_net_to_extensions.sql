-- pg_net is non-relocatable, so reinstall it in Supabase's extensions schema.
drop function app_private.dispatch_ai_classification(uuid);
drop extension pg_net;
drop schema if exists net;

create schema if not exists extensions;
create extension pg_net with schema extensions;

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

revoke all on function app_private.dispatch_ai_classification(uuid)
  from public, anon, authenticated, service_role;