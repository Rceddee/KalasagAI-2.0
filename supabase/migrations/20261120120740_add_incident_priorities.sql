create type public.incident_priority as enum ('low', 'medium', 'high');

alter table public.ai_assessments
  add column suggested_priority public.incident_priority not null default 'medium';

alter table public.ai_assessments
  alter column suggested_priority drop default;

alter table public.classification_reviews
  add column confirmed_priority public.incident_priority;

drop function public.review_incident_classification(
  uuid, public.incident_category, uuid, text
);

create function public.review_incident_classification(
  p_incident_id uuid,
  p_category public.incident_category,
  p_priority public.incident_priority,
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
  if p_priority is null then
    raise exception 'A confirmed priority is required' using errcode = '22023';
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
    incident_id, assessment_id, confirmed_category, confirmed_priority, reviewer_id, note
  )
  values (
    p_incident_id, p_assessment_id, p_category, p_priority, (select auth.uid()), p_note
  )
  returning * into v_review;

  insert into public.audit_logs (actor_id, action, incident_id, details)
  values (
    (select auth.uid()),
    'incident.classification_reviewed',
    p_incident_id,
    jsonb_build_object(
      'category', p_category,
      'priority', p_priority,
      'assessment_id', p_assessment_id
    )
  );

  return v_review;
end;
$$;

revoke all on function public.review_incident_classification(
  uuid, public.incident_category, public.incident_priority, uuid, text
) from public, anon, authenticated;

grant execute on function public.review_incident_classification(
  uuid, public.incident_category, public.incident_priority, uuid, text
) to authenticated;

drop function public.record_ai_assessment(
  uuid, public.incident_category, text, text, uuid
);

create function public.record_ai_assessment(
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
declare
  v_assessment public.ai_assessments;
begin
  if not app_private.can_classify_incident(p_actor_id, p_incident_id) then
    raise exception 'Not authorized to record an AI assessment' using errcode = '42501';
  end if;
  if p_priority is null
     or char_length(btrim(coalesce(p_rationale, ''))) not between 1 and 1200
     or char_length(btrim(coalesce(p_model, ''))) not between 1 and 120 then
    raise exception 'Invalid AI assessment' using errcode = '22023';
  end if;

  insert into public.ai_assessments (
    incident_id, suggested_category, suggested_priority, rationale, model
  )
  values (
    p_incident_id, p_category, p_priority, btrim(p_rationale), btrim(p_model)
  )
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
    jsonb_build_object(
      'assessment_id', v_assessment.id,
      'model', p_model,
      'priority', p_priority
    )
  );

  return v_assessment;
end;
$$;

revoke all on function public.record_ai_assessment(
  uuid, public.incident_category, public.incident_priority, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.record_ai_assessment(
  uuid, public.incident_category, public.incident_priority, text, text, uuid
) to service_role;