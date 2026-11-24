-- Residents receive the reviewed classification without access to personnel notes.
create function app_private.my_report_review(p_incident_id uuid)
returns table (confirmed_category public.incident_category, confirmed_priority public.incident_priority)
language sql stable security definer set search_path = ''
as $$
  select r.confirmed_category, r.confirmed_priority
  from public.incidents i join public.classification_reviews r on r.incident_id = i.id
  where i.id = p_incident_id and i.resident_id = (select auth.uid())
  order by r.created_at desc, r.id desc limit 1;
$$;

create function public.my_report_review(p_incident_id uuid)
returns table (confirmed_category public.incident_category, confirmed_priority public.incident_priority)
language sql stable security invoker set search_path = ''
as $$ select * from app_private.my_report_review(p_incident_id); $$;

revoke all on function app_private.my_report_review(uuid), public.my_report_review(uuid) from public, anon;
grant execute on function app_private.my_report_review(uuid), public.my_report_review(uuid) to authenticated;
