drop policy if exists "Residents and staff read authorized assessments"
  on public.ai_assessments;

create policy "Staff read authorized assessments"
  on public.ai_assessments for select to authenticated
  using (
    (select app_private.has_any_role(
      array['responder', 'communication_officer', 'admin', 'super_admin']::public.personnel_role[]
    ))
  );

create function app_private.my_ai_assessments(p_incident_ids uuid[])
returns table (
  incident_id uuid,
  suggested_category public.incident_category,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (a.incident_id)
    a.incident_id,
    a.suggested_category,
    a.created_at
  from public.ai_assessments as a
  join public.incidents as i on i.id = a.incident_id
  where i.resident_id = (select auth.uid())
    and a.incident_id = any(coalesce(p_incident_ids, array[]::uuid[]))
  order by a.incident_id, a.created_at desc, a.id desc;
$$;

create function public.my_ai_assessments(p_incident_ids uuid[])
returns table (
  incident_id uuid,
  suggested_category public.incident_category,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app_private.my_ai_assessments(p_incident_ids);
$$;

create function public.get_staff_ai_assessment(p_incident_id uuid)
returns table (
  id uuid,
  suggested_category public.incident_category,
  suggested_priority public.incident_priority,
  rationale text,
  model text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id,
    a.suggested_category,
    a.suggested_priority,
    a.rationale,
    a.model,
    a.created_at
  from public.ai_assessments as a
  where a.incident_id = p_incident_id
    and (select app_private.has_any_role(
      array['responder', 'communication_officer', 'admin', 'super_admin']::public.personnel_role[]
    ))
  order by a.created_at desc, a.id desc
  limit 1;
$$;

revoke all on function app_private.my_ai_assessments(uuid[]),
  public.my_ai_assessments(uuid[]),
  public.get_staff_ai_assessment(uuid)
  from public, anon, authenticated;
grant execute on function app_private.my_ai_assessments(uuid[]),
  public.my_ai_assessments(uuid[]),
  public.get_staff_ai_assessment(uuid)
  to authenticated;
