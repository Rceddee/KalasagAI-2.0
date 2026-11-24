-- Metadata-only RLS fixtures; this suite creates no binary Storage objects.
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    'a1111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'storage-resident-one@example.test', '',
    now(), '{"provider":"email","providers":["email"]}',
    '{"full_name":"Storage Resident One","contact_number":"09171234567"}', now(), now()
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'storage-resident-two@example.test', '',
    now(), '{"provider":"email","providers":["email"]}',
    '{"full_name":"Storage Resident Two","contact_number":"09181234567"}', now(), now()
  ),
  (
    'a3333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated', 'storage-responder@example.test', '',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"personnel","personnel_role":"responder"}',
    '{"full_name":"Storage Responder","contact_number":"09191234567"}', now(), now()
  );

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES
  (
    'incident-evidence',
    'a1111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/evidence-a.jpg',
    'a1111111-1111-4111-8111-111111111111',
    '{"mimetype":"image/jpeg","size":1024}'::jsonb
  ),
  (
    'incident-evidence',
    'a2222222-2222-4222-8222-222222222222/dddddddd-dddd-4ddd-8ddd-dddddddddddd/evidence-b.jpg',
    'a2222222-2222-4222-8222-222222222222',
    '{"mimetype":"image/jpeg","size":1024}'::jsonb
  );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);

SELECT results_eq(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'incident-evidence' ORDER BY name$$,
  $$VALUES ('a1111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/evidence-a.jpg'::text)$$,
  'resident A can enumerate only resident A evidence'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES (
      'incident-evidence',
      'a2222222-2222-4222-8222-222222222222/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/forbidden.jpg',
      '{"mimetype":"image/jpeg","size":512}'::jsonb
    )$$,
  '42501',
  NULL,
  'resident A cannot upload evidence under resident B folder'
);
SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES (
      'incident-evidence',
      'a1111111-1111-4111-8111-111111111111/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/evidence-extra.jpg',
      '{"mimetype":"image/jpeg","size":512}'::jsonb
    )$$,
  'resident A can upload evidence under their own incident draft folder'
);

SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
SELECT results_eq(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'incident-evidence' ORDER BY name$$,
  $$VALUES ('a2222222-2222-4222-8222-222222222222/dddddddd-dddd-4ddd-8ddd-dddddddddddd/evidence-b.jpg'::text)$$,
  'resident B can enumerate only resident B evidence'
);

SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
SELECT results_eq(
  $$SELECT name FROM storage.objects WHERE bucket_id = 'incident-evidence' ORDER BY name$$,
  $$VALUES
    ('a1111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/evidence-a.jpg'::text),
    ('a1111111-1111-4111-8111-111111111111/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/evidence-extra.jpg'::text),
    ('a2222222-2222-4222-8222-222222222222/dddddddd-dddd-4ddd-8ddd-dddddddddddd/evidence-b.jpg'::text)$$,
  'authorized responder can read evidence needed for incident review'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'incident-evidence'),
  0,
  'anonymous users cannot enumerate private evidence'
);

RESET ROLE;
SELECT ok(
  NOT (SELECT public FROM storage.buckets WHERE id = 'incident-evidence')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND cmd IN ('SELECT', 'ALL')
        AND ('anon'::name = ANY (roles) OR 'public'::name = ANY (roles))
    ),
  'private evidence has no public bucket or anonymous read policy'
);

SELECT * FROM finish();
ROLLBACK;
