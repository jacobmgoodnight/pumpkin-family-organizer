-- Private, owner-scoped optional originals for designs already in the catalog.
-- Separate filenames protect ordinary imported originals from cleanup.
create table public.pc_builtin_originals (
 user_id uuid not null references public.pc_accounts(user_id) on delete cascade,
 template_id text not null check (template_id ~ '^(?:[a-f0-9]{16}|extra:[a-z0-9-]{1,100})$'),
 original_path text not null check (
   original_path ~ ('^' || user_id::text || '/imports/builtin-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-original\.(pdf|jpg|png|webp)$')
 ),
 primary key (user_id, template_id),
 unique (user_id, original_path)
);

alter table public.pc_builtin_originals enable row level security;
revoke all on public.pc_builtin_originals from public, anon;
grant select, insert, update, delete on public.pc_builtin_originals to authenticated;
grant all on public.pc_builtin_originals to service_role;

create policy builtin_originals_select on public.pc_builtin_originals for select to authenticated using ((select auth.uid()) = user_id);
create policy builtin_originals_insert on public.pc_builtin_originals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy builtin_originals_update on public.pc_builtin_originals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy builtin_originals_delete on public.pc_builtin_originals for delete to authenticated using ((select auth.uid()) = user_id);
