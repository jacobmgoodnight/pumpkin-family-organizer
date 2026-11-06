-- Run only in a disposable PostgreSQL database as a superuser, never production.
-- This shim creates the Supabase roles and auth.uid() required by the migration;
-- it does not emulate Storage, the Data API, or the invitation Edge Function.
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.pc_accounts (user_id uuid primary key);
insert into public.pc_accounts values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

\ir ../supabase/migrations/20261106193325_builtin_originals.sql

-- These helpers are security invoker, so statements run with the test role.
create function public.test_assert(ok boolean, message text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Assertion failed: %', message; end if;
end $$;
create function public.test_expect_error(statement text, expected text) returns void
language plpgsql as $$
declare actual text;
begin
  begin
    execute statement;
  exception when others then
    actual := sqlstate;
  end;
  if actual is distinct from expected then
    raise exception 'Expected SQLSTATE %, got % for %', expected, coalesce(actual, 'success'), statement;
  end if;
end $$;

select public.test_assert(relrowsecurity, 'row-level security is enabled')
  from pg_class where oid = 'public.pc_builtin_originals'::regclass;
select public.test_assert(not has_table_privilege('anon', 'public.pc_builtin_originals', privilege),
                          'anonymous role has no ' || privilege)
  from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege;
select public.test_assert(has_table_privilege('authenticated', 'public.pc_builtin_originals', privilege),
                          'authenticated role has ' || privilege)
  from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege;
select public.test_assert(not has_table_privilege('authenticated', 'public.pc_builtin_originals', privilege),
                          'authenticated role has no ' || privilege)
  from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege;

insert into public.pc_builtin_originals values
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222/imports/builtin-22222222-2222-4222-8222-222222222222-original.pdf');

set role anon;
select public.test_expect_error('select * from public.pc_builtin_originals', '42501');
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111/imports/builtin-11111111-1111-4111-8111-111111111111-original.pdf')$sql$, '42501');
select public.test_expect_error('update public.pc_builtin_originals set template_id = template_id', '42501');
select public.test_expect_error('delete from public.pc_builtin_originals', '42501');
reset role;

set role authenticated;
select public.test_assert((select count(*) = 0 from public.pc_builtin_originals), 'missing identity cannot read mappings');
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111/imports/builtin-11111111-1111-4111-8111-111111111111-original.pdf')$sql$, '42501');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.test_assert((select count(*) = 0 from public.pc_builtin_originals), 'owner cannot read another account');
insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111/imports/builtin-11111111-1111-4111-8111-111111111111-original.pdf');
select public.test_assert((select count(*) = 1 from public.pc_builtin_originals), 'owner can insert and read own mapping');
with updated as (
  update public.pc_builtin_originals set original_path = '11111111-1111-4111-8111-111111111111/imports/builtin-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-original.png'
  where template_id = 'aaaaaaaaaaaaaaaa' returning 1
) select public.test_assert(count(*) = 1, 'owner can update own mapping') from updated;
with updated as (
  update public.pc_builtin_originals set template_id = 'cccccccccccccccc'
  where user_id = '22222222-2222-4222-8222-222222222222' returning 1
) select public.test_assert(count(*) = 0, 'owner cannot update another account') from updated;
with deleted as (
  delete from public.pc_builtin_originals where user_id = '22222222-2222-4222-8222-222222222222' returning 1
) select public.test_assert(count(*) = 0, 'owner cannot delete another account') from deleted;
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('22222222-2222-4222-8222-222222222222', 'dddddddddddddddd', '22222222-2222-4222-8222-222222222222/imports/builtin-dddddddd-dddd-4ddd-8ddd-dddddddddddd-original.pdf')$sql$, '42501');
select public.test_expect_error($sql$update public.pc_builtin_originals set
  user_id = '22222222-2222-4222-8222-222222222222',
  original_path = '22222222-2222-4222-8222-222222222222/imports/builtin-dddddddd-dddd-4ddd-8ddd-dddddddddddd-original.pdf'
  where template_id = 'aaaaaaaaaaaaaaaa'$sql$, '42501');

-- Even the owner cannot point a built-in mapping at another account, a normal
-- import, an unexpected extension, or reuse the same storage object twice.
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'cccccccccccccccc', '22222222-2222-4222-8222-222222222222/imports/builtin-cccccccc-cccc-4ccc-8ccc-cccccccccccc-original.pdf')$sql$, '23514');
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'cccccccccccccccc', '11111111-1111-4111-8111-111111111111/imports/ordinary-original.pdf')$sql$, '23514');
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'cccccccccccccccc', '11111111-1111-4111-8111-111111111111/imports/builtin-cccccccc-cccc-4ccc-8ccc-cccccccccccc-original.html')$sql$, '23514');
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'not-a-catalog-id', '11111111-1111-4111-8111-111111111111/imports/builtin-cccccccc-cccc-4ccc-8ccc-cccccccccccc-original.pdf')$sql$, '23514');
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'cccccccccccccccc', '11111111-1111-4111-8111-111111111111/imports/builtin-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-original.png')$sql$, '23505');
select public.test_expect_error($sql$insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111/imports/builtin-dddddddd-dddd-4ddd-8ddd-dddddddddddd-original.pdf')$sql$, '23505');
insert into public.pc_builtin_originals values
  ('11111111-1111-4111-8111-111111111111', 'extra:family-test', '11111111-1111-4111-8111-111111111111/imports/builtin-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee-original.webp');
with deleted as (delete from public.pc_builtin_originals where user_id = '11111111-1111-4111-8111-111111111111' returning 1)
  select public.test_assert(count(*) = 2, 'owner can delete own mappings') from deleted;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select public.test_assert((select count(*) = 1 from public.pc_builtin_originals), 'second owner can still read own mapping');
reset role;

set role service_role;
select public.test_assert((select count(*) = 1 from public.pc_builtin_originals), 'service role can read remaining account mapping');
reset role;

\echo 'Built-in original mapping RLS tests passed.'
