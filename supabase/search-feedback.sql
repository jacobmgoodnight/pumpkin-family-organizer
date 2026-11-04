-- Additive search feedback tables. Review against the target project before applying.
-- Guest writes go through the invitation function; only the signed-in owner may
-- read/delete reports or manage approved metadata. No public role gets access.
begin;
create table public.pc_search_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.pc_accounts(user_id) on delete cascade,
  person_id text not null check (char_length(person_id) between 1 and 80),
  template_id text not null check (template_id ~ '^(?:[a-f0-9]{16}|extra:[a-z0-9-]{1,100})$'),
  note text not null check (char_length(trim(note)) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (user_id, person_id) references public.pc_people(user_id, person_id) on delete cascade
);
create index pc_search_feedback_owner_time_idx on public.pc_search_feedback(user_id, created_at desc);
alter table public.pc_search_feedback enable row level security;
revoke all on public.pc_search_feedback from public, anon, authenticated;
grant select, delete on public.pc_search_feedback to authenticated;
grant select, insert, delete on public.pc_search_feedback to service_role;
create policy pc_search_feedback_owner_select on public.pc_search_feedback for select to authenticated using ((select auth.uid()) = user_id);
create policy pc_search_feedback_owner_delete on public.pc_search_feedback for delete to authenticated using ((select auth.uid()) = user_id);

-- Only the invitation endpoint may submit. Serialize each family's count and
-- insert so parallel requests cannot race past the limits.
create function public.pc_submit_search_feedback(p_user_id uuid, p_person_id text, p_template_id text, p_note text)
returns text language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('pumpkin-feedback:' || p_user_id::text, 0));
  if (select count(*) from public.pc_search_feedback where user_id=p_user_id and person_id=p_person_id and created_at >= now() - interval '1 hour') >= 20 then
    return 'hourly_limit';
  end if;
  if (select count(*) from public.pc_search_feedback where user_id=p_user_id) >= 1000 then
    return 'household_limit';
  end if;
  insert into public.pc_search_feedback(user_id,person_id,template_id,note) values (p_user_id,p_person_id,p_template_id,p_note);
  return 'ok';
end;
$$;
revoke all on function public.pc_submit_search_feedback(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.pc_submit_search_feedback(uuid,text,text,text) to service_role;

create table public.pc_search_overrides (
  user_id uuid not null references public.pc_accounts(user_id) on delete cascade,
  template_id text not null check (template_id ~ '^(?:[a-f0-9]{16}|extra:[a-z0-9-]{1,100})$'),
  description text not null default '' check (char_length(description) <= 500),
  tags text[] not null default '{}' check (cardinality(tags) <= 20 and array_position(tags, null) is null and char_length(array_to_string(tags, '')) <= 800 and array_to_string(tags, '') !~ '[|[:cntrl:]]' and array_to_string(tags, '|') !~ '(^|[|])[^|]{41}'),
  updated_at timestamptz not null default now(),
  primary key (user_id, template_id)
);
alter table public.pc_search_overrides enable row level security;
revoke all on public.pc_search_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.pc_search_overrides to authenticated;
grant select on public.pc_search_overrides to service_role;
create policy pc_search_overrides_owner_select on public.pc_search_overrides for select to authenticated using ((select auth.uid()) = user_id);
create policy pc_search_overrides_owner_insert on public.pc_search_overrides for insert to authenticated with check ((select auth.uid()) = user_id);
create policy pc_search_overrides_owner_update on public.pc_search_overrides for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy pc_search_overrides_owner_delete on public.pc_search_overrides for delete to authenticated using ((select auth.uid()) = user_id);
commit;
