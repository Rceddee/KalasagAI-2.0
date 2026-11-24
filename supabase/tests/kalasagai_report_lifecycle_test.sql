BEGIN;
SELECT plan(10);
INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data) VALUES
('11111111-1111-4111-8111-111111111111','owner@example.test','{}','{"full_name":"Owner","contact_number":"09171234567"}'),
('22222222-2222-4222-8222-222222222222','officer@example.test','{"account_type":"personnel","personnel_role":"communication_officer"}','{"full_name":"Officer"}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES
('incident-evidence','11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/evidence.jpg',
 '11111111-1111-4111-8111-111111111111','{"mimetype":"image/jpeg","size":128}');

CREATE FUNCTION pg_temp.submit_fixture() RETURNS public.incidents LANGUAGE sql AS $$
  SELECT public.submit_incident('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Water has risen across the test road', 'Fixture crossing', 13.92,122.10,
    ARRAY['11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/evidence.jpg']);
$$;
SELECT set_config('test.report_id',(pg_temp.submit_fixture()).id::text,true);
SELECT is((pg_temp.submit_fixture()).id,current_setting('test.report_id')::uuid,
  'retry after a lost response returns the original incident');
SELECT is((SELECT count(*) FROM public.incident_photos WHERE incident_id=current_setting('test.report_id')::uuid),
  1::bigint,'retry retains one evidence record');
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.ai_jobs WHERE incident_id=current_setting('test.report_id')::uuid),
  1::bigint,'retry retains one AI job');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
SELECT is((SELECT count(*) FROM public.incidents WHERE id=current_setting('test.report_id')::uuid),
  1::bigint,'personnel can open the submitted report');
SELECT public.review_incident_classification(current_setting('test.report_id')::uuid,'flooding','high',null,'Private reviewer note');
SELECT public.update_incident_status(current_setting('test.report_id')::uuid,'in_progress','Checked by personnel');
SELECT is((SELECT count(*) FROM public.my_report_review(current_setting('test.report_id')::uuid)),
  0::bigint,'resident review endpoint restricts even personnel to their own submissions');
SELECT throws_ok($$SELECT public.update_incident_status(current_setting('test.report_id')::uuid,'closed',NULL)$$,
  '22023',NULL,'personnel cannot skip resolution');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT is((SELECT to_jsonb(r) FROM public.my_report_review(current_setting('test.report_id')::uuid) r),
  '{"confirmed_category":"flooding","confirmed_priority":"high"}'::jsonb,'owner receives only the reviewed category and priority');
SELECT is((SELECT count(*) FROM public.classification_reviews WHERE incident_id=current_setting('test.report_id')::uuid),
  0::bigint,'reviewer notes remain private');
SELECT is((SELECT to_status FROM public.incident_status_history WHERE incident_id=current_setting('test.report_id')::uuid
  ORDER BY created_at DESC,id DESC LIMIT 1), 'in_progress'::public.incident_status,'owner sees the personnel status transition');
SELECT ok(NOT has_function_privilege('anon','public.my_report_review(uuid)','execute'),'anonymous review lookup is denied');
SELECT * FROM finish();
ROLLBACK;
