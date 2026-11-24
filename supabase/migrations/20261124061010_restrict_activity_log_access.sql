drop policy if exists "Authorized operators read audit logs" on public.audit_logs;

create policy "Administrators read audit logs"
  on public.audit_logs for select to authenticated
  using (
    (select app_private.has_any_role(
      array['admin', 'super_admin']::public.personnel_role[]
    ))
  );