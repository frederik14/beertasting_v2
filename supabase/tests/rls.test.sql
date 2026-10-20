-- RLS integration tests (pgTAP).
--
-- Run with a local Supabase database:
--
--   supabase start
--   supabase test db
--
-- The file creates three auth users (A = owner, B = outsider, C = admin),
-- one tenant and one tasting, then switches the authenticated role to verify
-- the policy matrix. Everything is rolled back at the end.

begin;

create extension if not exists pgtap;
set local search_path = public, extensions;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures (created as the migration owner, so RLS is bypassed here)
-- ---------------------------------------------------------------------------

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'a@example.com',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'b@example.com',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'c@example.com',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'd@example.com',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

insert into public.tenants (id, name, slug)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a');

insert into public.tenant_members (tenant_id, user_id, role)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'owner'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    'admin'
  );

insert into public.tastings (
  id,
  tenant_id,
  host_user_id,
  title,
  tasting_date,
  status
)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Test Tasting',
  current_date,
  'active'
);

insert into public.tasting_participants (
  id,
  tasting_id,
  user_id,
  display_name,
  is_host
)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  'A',
  true
);

insert into public.beers (id, tenant_id, name)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Test Beer'
);

insert into public.tasting_beers (id, tasting_id, beer_id, position)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  1
);

-- ---------------------------------------------------------------------------
-- Owner A
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '11111111-1111-1111-1111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.tenants)::bigint,
  1::bigint,
  'owner sees their own tenant'
);

select is(
  (select count(*) from public.tastings)::bigint,
  1::bigint,
  'owner sees the tenant tasting'
);

select lives_ok(
  $$
    select public.save_score(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      8,
      8,
      8,
      8,
      null,
      null,
      false
    )
  $$,
  'owner can score their own participant row'
);

-- ---------------------------------------------------------------------------
-- Admin C
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '33333333-3333-3333-3333-333333333333',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.save_score(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      8,
      8,
      8,
      9,
      null,
      null,
      true
    )
  $$,
  'tenant admin can correct another participant''s score'
);

-- ---------------------------------------------------------------------------
-- Outsider B
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '22222222-2222-2222-2222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.tenants)::bigint,
  0::bigint,
  'outsider sees no tenants'
);

select is(
  (select count(*) from public.tastings)::bigint,
  0::bigint,
  'outsider sees no tastings'
);

select throws_ok(
  $$
    insert into public.tenant_members (tenant_id, user_id, role)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '22222222-2222-2222-2222-222222222222',
      'owner'
    )
  $$,
  '42501',
  null,
  'outsider cannot self-join another tenant as owner'
);

select throws_ok(
  $$
    insert into public.tastings (tenant_id, host_user_id, title, tasting_date, status)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '22222222-2222-2222-2222-222222222222',
      'Intrusion',
      current_date,
      'draft'
    )
  $$,
  '42501',
  null,
  'outsider cannot create a tasting in another tenant'
);

select throws_ok(
  $$
    select public.save_score(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      1,
      1,
      1,
      1,
      null,
      null,
      false
    )
  $$,
  '42501',
  null,
  'outsider cannot score another tenant''s participant'
);

-- ---------------------------------------------------------------------------
-- Invite flow: owner creates an invite, outsider accepts it once
-- ---------------------------------------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '11111111-1111-1111-1111-111111111111',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select ok(
  set_config(
    'test.invite_token',
    (
      public.create_tenant_invite(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'member'
      )
    ).token::text,
    true
  ) is not null,
  'owner can create an invite'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '22222222-2222-2222-2222-222222222222',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select is(
  public.accept_tenant_invite(current_setting('test.invite_token')::uuid),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'outsider can accept a valid invite'
);

select is(
  (select count(*) from public.tenants)::bigint,
  1::bigint,
  'accepted member can now see the tenant'
);

select is(
  public.accept_tenant_invite(current_setting('test.invite_token')::uuid),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'the same member can reopen the join link'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '44444444-4444-4444-4444-444444444444',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$ select public.accept_tenant_invite(current_setting('test.invite_token')::uuid) $$,
  '22023',
  null,
  'another user cannot reuse the invite'
);

select * from finish();
rollback;
