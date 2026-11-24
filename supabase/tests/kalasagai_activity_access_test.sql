BEGIN;
SELECT plan(3);

INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'activity-admin@example.test',
   '{"account_type":"personnel","personnel_role":"admin"}', '{"full_name":"Activity Admin"}'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'activity-super@example.test',
   '{"account_type":"personnel","personnel_role":"super_admin"}', '{"full_name":"Activity Super Admin"}'),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'activity-officer@example.test',
   '{"account_type":"personnel","personnel_role":"communication_officer"}', '{"full_name":"Activity Officer"}');

INSERT INTO public.audit_logs (actor_id, action, details)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'system.setting_changed',
  '{"key":"surge_mode","value":true}'::jsonb
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT is(
  (SELECT count(*) FROM public.audit_logs),
  0::bigint,
  'communication officers cannot read activity logs'
);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT is(
  (SELECT count(*) FROM public.audit_logs),
  1::bigint,
  'admins can read activity logs'
);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT is(
  (SELECT count(*) FROM public.audit_logs),
  1::bigint,
  'super admins can read activity logs'
);

SELECT * FROM finish();
ROLLBACK;
