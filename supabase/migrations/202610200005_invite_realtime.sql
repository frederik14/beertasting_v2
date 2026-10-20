-- Keep the admin's invite list current when someone accepts an invite.
--
-- The invite panel filters by tenant_id, which is not the primary key, so
-- replica identity full is needed for filtered DELETE events. Updates to
-- accepted_at/accepted_by use the primary key and are covered either way.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'tenant_invites'
     ) then
    alter publication supabase_realtime add table public.tenant_invites;
  end if;
end $$;

alter table public.tenant_invites replica identity full;
