-- BeerTasting v2 — consolidated schema
--
-- This file is idempotent and reflects the current state of the
-- supabase/migrations directory.
--
-- Apply it in a fresh Supabase project (SQL editor or `supabase db push`).
-- The migrations are the canonical source of truth; this consolidated file
-- exists for convenience and for projects that do not use the CLI.
--
-- Security model in one sentence: every tenant-scoped table is protected by
-- RLS, membership is checked through SECURITY DEFINER helpers, and all
-- multi-row operations go through RPCs so they are atomic.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (
    char_length(slug) between 1 and 80
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  role text not null default 'member' check (role in ('admin', 'member')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.tastings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  host_user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  tasting_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasting_participants (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  is_host boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tasting_id, user_id),
  unique (tasting_id, display_name)
);

create table if not exists public.beers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brewery text check (brewery is null or char_length(brewery) <= 120),
  style text check (style is null or char_length(style) <= 120),
  alcohol numeric(5, 2) check (alcohol is null or (alcohol >= 0 and alcohol <= 100)),
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.tasting_beers (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings (id) on delete cascade,
  beer_id uuid not null references public.beers (id) on delete restrict,
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now(),
  unique (tasting_id, beer_id),
  unique (tasting_id, position)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings (id) on delete cascade,
  beer_id uuid not null references public.beers (id) on delete restrict,
  participant_id uuid not null references public.tasting_participants (id) on delete cascade,
  smell numeric(3, 1) check (smell is null or (smell >= 0 and smell <= 10)),
  color numeric(3, 1) check (color is null or (color >= 0 and color <= 10)),
  branding numeric(3, 1) check (branding is null or (branding >= 0 and branding <= 10)),
  taste numeric(3, 1) check (taste is null or (taste >= 0 and taste <= 20)),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tasting_id, beer_id, participant_id)
);

-- ---------------------------------------------------------------------------
-- 2. Bring older installations forward and add integrity constraints
-- ---------------------------------------------------------------------------

alter table public.tenants add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.tenant_members add column if not exists updated_at timestamptz not null default now();
alter table public.tastings add column if not exists updated_at timestamptz not null default now();
alter table public.tasting_participants add column if not exists updated_at timestamptz not null default now();
alter table public.beers add column if not exists updated_at timestamptz not null default now();
alter table public.scores add column if not exists updated_at timestamptz not null default now();

-- The first scaffold's tasting_participants and tasting_beers tables were
-- created without created_at. `create table if not exists` does not add
-- columns to existing tables, so upgrades need these explicit additions.
alter table public.tasting_participants
  add column if not exists created_at timestamptz not null default now();
alter table public.tasting_beers
  add column if not exists created_at timestamptz not null default now();

-- Older installations created alcohol as numeric(4,2), which cannot store 100.
alter table public.beers alter column alcohol type numeric(5, 2);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tastings'
      and column_name = 'tasting_date'
      and data_type = 'timestamp with time zone'
  ) then
    alter table public.tastings
      alter column tasting_date type date using tasting_date::date;
    alter table public.tastings
      alter column tasting_date set default current_date;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasting_participants_id_tasting_key'
  ) then
    alter table public.tasting_participants
      add constraint tasting_participants_id_tasting_key unique (id, tasting_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scores_participant_tasting_fk'
  ) then
    alter table public.scores
      add constraint scores_participant_tasting_fk
      foreign key (participant_id, tasting_id)
      references public.tasting_participants (id, tasting_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scores_tasting_beer_fk'
  ) then
    alter table public.scores
      add constraint scores_tasting_beer_fk
      foreign key (tasting_id, beer_id)
      references public.tasting_beers (tasting_id, beer_id)
      on delete cascade
      not valid;
  end if;
end $$;

-- A legacy table from the first scaffold. It is intentionally not used:
-- rankings are always derived from normalized rows. If it exists in an older
-- project it remains RLS-protected and inaccessible; drop it manually when
-- you have confirmed it is empty.
-- drop table if exists public.tasting_snapshots;

-- Keep profile deletion behaviour consistent with the current table
-- definitions even when the tables came from the first scaffold.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tastings_host_user_id_fkey') then
    alter table public.tastings drop constraint tastings_host_user_id_fkey;
  end if;
  alter table public.tastings
    add constraint tastings_host_user_id_fkey
    foreign key (host_user_id) references public.profiles (id) on delete cascade;

  if exists (select 1 from pg_constraint where conname = 'tasting_participants_user_id_fkey') then
    alter table public.tasting_participants drop constraint tasting_participants_user_id_fkey;
  end if;
  alter table public.tasting_participants
    add constraint tasting_participants_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;
end $$;

-- Named checks are added idempotently so older installations also get
-- server-side validation. NOT VALID means existing rows are not scanned; new
-- writes are checked immediately.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scores_smell_range') then
    alter table public.scores add constraint scores_smell_range
      check (smell is null or (smell >= 0 and smell <= 10)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scores_color_range') then
    alter table public.scores add constraint scores_color_range
      check (color is null or (color >= 0 and color <= 10)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scores_branding_range') then
    alter table public.scores add constraint scores_branding_range
      check (branding is null or (branding >= 0 and branding <= 10)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scores_notes_length') then
    alter table public.scores add constraint scores_notes_length
      check (notes is null or char_length(notes) <= 4000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'beers_alcohol_range') then
    alter table public.beers add constraint beers_alcohol_range
      check (alcohol is null or (alcohol >= 0 and alcohol <= 100)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'beers_name_length') then
    alter table public.beers add constraint beers_name_length
      check (char_length(btrim(name)) between 1 and 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasting_beers_position_positive') then
    alter table public.tasting_beers add constraint tasting_beers_position_positive
      check (position > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasting_participants_display_name_length') then
    alter table public.tasting_participants add constraint tasting_participants_display_name_length
      check (char_length(btrim(display_name)) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tastings_title_length') then
    alter table public.tastings add constraint tastings_title_length
      check (char_length(btrim(title)) between 1 and 160) not valid;
  end if;
end $$;

-- Taste is scored out of 20. Drop both possible old constraint names so
-- re-running this consolidated schema also upgrades an older project whose
-- constraint still says taste <= 10.
alter table public.scores drop constraint if exists scores_taste_check;
alter table public.scores drop constraint if exists scores_taste_range;
alter table public.scores add constraint scores_taste_range
  check (taste is null or (taste >= 0 and taste <= 20)) not valid;

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

create index if not exists tastings_tenant_date_idx
  on public.tastings (tenant_id, tasting_date desc);

create index if not exists tenant_members_user_idx
  on public.tenant_members (user_id);

create index if not exists tenant_invites_tenant_idx
  on public.tenant_invites (tenant_id, created_at desc);

create index if not exists tasting_participants_tasting_idx
  on public.tasting_participants (tasting_id);

create index if not exists scores_participant_idx
  on public.scores (participant_id);

-- ---------------------------------------------------------------------------
-- 4. Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.tenant_role(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.tenant_members m
  where m.tenant_id = p_tenant_id
    and m.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.tenant_role(p_tenant_id) in ('owner', 'admin'), false);
$$;

create or replace function public.is_tasting_member(p_tasting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tastings t
    join public.tenant_members m on m.tenant_id = t.tenant_id
    where t.id = p_tasting_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_tasting_admin(p_tasting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tastings t
    join public.tenant_members m on m.tenant_id = t.tenant_id
    where t.id = p_tasting_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_tasting_open(p_tasting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tastings t
    where t.id = p_tasting_id
      and t.status <> 'completed'
  );
$$;

create or replace function public.can_edit_participant(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasting_participants p
    join public.tastings t on t.id = p.tasting_id
    where p.id = p_participant_id
      and (
        p.user_id = (select auth.uid())
        or exists (
          select 1
          from public.tenant_members m
          where m.tenant_id = t.tenant_id
            and m.user_id = (select auth.uid())
            and m.role in ('owner', 'admin')
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists set_tenants_updated_at on public.tenants;
create trigger set_tenants_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_tenant_members_updated_at on public.tenant_members;
create trigger set_tenant_members_updated_at
before update on public.tenant_members
for each row execute function public.set_updated_at();

drop trigger if exists set_tastings_updated_at on public.tastings;
create trigger set_tastings_updated_at
before update on public.tastings
for each row execute function public.set_updated_at();

drop trigger if exists set_tasting_participants_updated_at on public.tasting_participants;
create trigger set_tasting_participants_updated_at
before update on public.tasting_participants
for each row execute function public.set_updated_at();

drop trigger if exists set_beers_updated_at on public.beers;
create trigger set_beers_updated_at
before update on public.beers
for each row execute function public.set_updated_at();

drop trigger if exists set_scores_updated_at on public.scores;
create trigger set_scores_updated_at
before update on public.scores
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(new.email, 120))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
begin
  -- Only guard demotions. A tenant delete cascades into tenant_members, so
  -- guarding DELETE here would make deleting a tenant impossible.
  if old.role = 'owner' and new.role <> 'owner' then
    select count(*) into v_remaining
    from public.tenant_members
    where tenant_id = old.tenant_id
      and role = 'owner'
      and id <> old.id;

    if v_remaining = 0 then
      raise exception 'A tenant must keep at least one owner.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_last_owner on public.tenant_members;
create trigger protect_last_owner
before update on public.tenant_members
for each row execute function public.protect_last_owner();

create or replace function public.prevent_tasting_tenant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id <> old.tenant_id then
    raise exception 'A tasting cannot move between groups.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_tasting_tenant_change on public.tastings;
create trigger prevent_tasting_tenant_change
before update of tenant_id on public.tastings
for each row execute function public.prevent_tasting_tenant_change();

create or replace function public.prevent_participant_tasting_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tasting_id <> old.tasting_id then
    raise exception 'A participant cannot move between tastings.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_participant_tasting_change on public.tasting_participants;
create trigger prevent_participant_tasting_change
before update of tasting_id on public.tasting_participants
for each row execute function public.prevent_participant_tasting_change();

create or replace function public.prevent_membership_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id <> old.tenant_id or new.user_id <> old.user_id then
    raise exception 'A membership cannot move between groups or users.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_membership_identity_change on public.tenant_members;
create trigger prevent_membership_identity_change
before update of tenant_id, user_id on public.tenant_members
for each row execute function public.prevent_membership_identity_change();

create or replace function public.prevent_beer_tenant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id <> old.tenant_id then
    raise exception 'A beer cannot move between groups.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_beer_tenant_change on public.beers;
create trigger prevent_beer_tenant_change
before update of tenant_id on public.beers
for each row execute function public.prevent_beer_tenant_change();

create or replace function public.enforce_tasting_beer_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tasting_tenant uuid;
  v_beer_tenant uuid;
begin
  select t.tenant_id into v_tasting_tenant
  from public.tastings t
  where t.id = new.tasting_id;

  select b.tenant_id into v_beer_tenant
  from public.beers b
  where b.id = new.beer_id;

  if v_tasting_tenant is null or v_beer_tenant is null then
    raise exception 'Tasting or beer does not exist.' using errcode = '23503';
  end if;

  if v_tasting_tenant <> v_beer_tenant then
    raise exception 'Beer belongs to a different tenant.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_tasting_beer_tenant on public.tasting_beers;
create trigger enforce_tasting_beer_tenant
before insert or update of tasting_id, beer_id on public.tasting_beers
for each row execute function public.enforce_tasting_beer_tenant();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tenant_invites enable row level security;
alter table public.tastings enable row level security;
alter table public.tasting_participants enable row level security;
alter table public.beers enable row level security;
alter table public.tasting_beers enable row level security;
alter table public.scores enable row level security;

-- Policies from the first scaffold used different names. They are dropped
-- explicitly because old permissive policies (especially the self-service
-- tenant_members insert) would otherwise remain active alongside the new ones.
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can create a tenant" on public.tenants;
drop policy if exists "Users can view their tenants" on public.tenants;
drop policy if exists "Users can view tenant membership for their tenant" on public.tenant_members;
drop policy if exists "Users can insert their own tenant membership" on public.tenant_members;

-- profiles: users can only see and edit themselves.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Profiles are deleted by the auth admin path (auth.users -> profiles cascade),
-- not by the application. There is deliberately no DELETE policy here.

-- tenants: members read, admins update, owners delete. Creation is only
-- possible through public.create_tenant(), which also creates the owner
-- membership atomically.
drop policy if exists tenants_select_member on public.tenants;
create policy tenants_select_member on public.tenants
for select to authenticated
using (public.is_tenant_member(id));

drop policy if exists tenants_insert_through_rpc on public.tenants;
create policy tenants_insert_through_rpc on public.tenants
for insert to authenticated
with check (false);

drop policy if exists tenants_update_admin on public.tenants;
create policy tenants_update_admin on public.tenants
for update to authenticated
using (public.is_tenant_admin(id))
with check (public.is_tenant_admin(id));

drop policy if exists tenants_delete_owner on public.tenants;
create policy tenants_delete_owner on public.tenants
for delete to authenticated
using (public.tenant_role(id) = 'owner');

-- tenant_members: co-members are visible, admins add/remove, owners change
-- roles, and members can remove themselves.
drop policy if exists tenant_members_select_member on public.tenant_members;
create policy tenant_members_select_member on public.tenant_members
for select to authenticated
using (user_id = (select auth.uid()) or public.is_tenant_member(tenant_id));

drop policy if exists tenant_members_insert_admin on public.tenant_members;
create policy tenant_members_insert_admin on public.tenant_members
for insert to authenticated
with check (
  public.is_tenant_admin(tenant_id)
  and role in ('admin', 'member')
);

drop policy if exists tenant_members_update_owner on public.tenant_members;
create policy tenant_members_update_owner on public.tenant_members
for update to authenticated
using (public.tenant_role(tenant_id) = 'owner')
with check (public.tenant_role(tenant_id) = 'owner');

drop policy if exists tenant_members_delete_self_or_owner on public.tenant_members;
create policy tenant_members_delete_self_or_owner on public.tenant_members
for delete to authenticated
using (
  (
    user_id = (select auth.uid())
    and role <> 'owner'
  )
  or (
    public.tenant_role(tenant_id) = 'owner'
    and role <> 'owner'
  )
);

-- tenant_invites: admins manage invites. Accepting is an RPC because it must
-- atomically create a membership and mark the invite as used.
drop policy if exists tenant_invites_select_admin on public.tenant_invites;
create policy tenant_invites_select_admin on public.tenant_invites
for select to authenticated
using (public.is_tenant_admin(tenant_id));

drop policy if exists tenant_invites_insert_admin on public.tenant_invites;
create policy tenant_invites_insert_admin on public.tenant_invites
for insert to authenticated
with check (
  public.is_tenant_admin(tenant_id)
  and created_by = (select auth.uid())
  and role in ('admin', 'member')
);

drop policy if exists tenant_invites_delete_admin on public.tenant_invites;
create policy tenant_invites_delete_admin on public.tenant_invites
for delete to authenticated
using (public.is_tenant_admin(tenant_id));

-- Invites are only marked accepted by public.accept_tenant_invite().
drop policy if exists tenant_invites_update_never on public.tenant_invites;
create policy tenant_invites_update_never on public.tenant_invites
for update to authenticated
using (false)
with check (false);

-- tastings: members read, hosts/admins write.
drop policy if exists tastings_select_member on public.tastings;
create policy tastings_select_member on public.tastings
for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists tastings_insert_member on public.tastings;
create policy tastings_insert_member on public.tastings
for insert to authenticated
with check (
  public.is_tenant_member(tenant_id)
  and host_user_id = (select auth.uid())
);

drop policy if exists tastings_update_host_or_admin on public.tastings;
create policy tastings_update_host_or_admin on public.tastings
for update to authenticated
using (
  host_user_id = (select auth.uid())
  or public.is_tenant_admin(tenant_id)
)
with check (
  public.is_tenant_member(tenant_id)
  and (
    host_user_id = (select auth.uid())
    or public.is_tenant_admin(tenant_id)
  )
);

drop policy if exists tastings_delete_host_or_admin on public.tastings;
create policy tastings_delete_host_or_admin on public.tastings
for delete to authenticated
using (
  host_user_id = (select auth.uid())
  or public.is_tenant_admin(tenant_id)
);

-- participants: members read; members may add themselves; admins may add and
-- edit anyone. All writes are blocked once the tasting is completed.
drop policy if exists tasting_participants_select_member on public.tasting_participants;
create policy tasting_participants_select_member on public.tasting_participants
for select to authenticated
using (public.is_tasting_member(tasting_id));

drop policy if exists tasting_participants_insert_member on public.tasting_participants;
create policy tasting_participants_insert_member on public.tasting_participants
for insert to authenticated
with check (
  public.is_tasting_member(tasting_id)
  and public.is_tasting_open(tasting_id)
  and (
    user_id = (select auth.uid())
    or public.is_tasting_admin(tasting_id)
  )
);

drop policy if exists tasting_participants_update_self_or_admin on public.tasting_participants;
create policy tasting_participants_update_self_or_admin on public.tasting_participants
for update to authenticated
using (
  public.is_tasting_open(tasting_id)
  and (
    user_id = (select auth.uid())
    or public.is_tasting_admin(tasting_id)
  )
)
with check (
  public.is_tasting_member(tasting_id)
  and public.is_tasting_open(tasting_id)
  and (
    user_id = (select auth.uid())
    or public.is_tasting_admin(tasting_id)
  )
);

drop policy if exists tasting_participants_delete_self_or_admin on public.tasting_participants;
create policy tasting_participants_delete_self_or_admin on public.tasting_participants
for delete to authenticated
using (
  public.is_tasting_open(tasting_id)
  and (
    (user_id = (select auth.uid()) and not is_host)
    or public.is_tasting_admin(tasting_id)
  )
);

-- beers: tenant members collaborate on the catalog, admins delete.
drop policy if exists beers_select_member on public.beers;
create policy beers_select_member on public.beers
for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists beers_insert_member on public.beers;
create policy beers_insert_member on public.beers
for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists beers_update_member on public.beers;
create policy beers_update_member on public.beers
for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists beers_delete_admin on public.beers;
create policy beers_delete_admin on public.beers
for delete to authenticated
using (public.is_tenant_admin(tenant_id));

-- tasting_beers: any tasting member can add/remove beers while the tasting is open.
drop policy if exists tasting_beers_select_member on public.tasting_beers;
create policy tasting_beers_select_member on public.tasting_beers
for select to authenticated
using (public.is_tasting_member(tasting_id));

drop policy if exists tasting_beers_insert_member on public.tasting_beers;
create policy tasting_beers_insert_member on public.tasting_beers
for insert to authenticated
with check (
  public.is_tasting_member(tasting_id)
  and public.is_tasting_open(tasting_id)
);

drop policy if exists tasting_beers_update_member on public.tasting_beers;
create policy tasting_beers_update_member on public.tasting_beers
for update to authenticated
using (
  public.is_tasting_member(tasting_id)
  and public.is_tasting_open(tasting_id)
)
with check (
  public.is_tasting_member(tasting_id)
  and public.is_tasting_open(tasting_id)
);

drop policy if exists tasting_beers_delete_member on public.tasting_beers;
create policy tasting_beers_delete_member on public.tasting_beers
for delete to authenticated
using (
  public.is_tasting_member(tasting_id)
  and public.is_tasting_open(tasting_id)
);

-- scores: tasting members read; a participant can edit their own scores and
-- tenant admins can correct anyone's scores.
drop policy if exists scores_select_member on public.scores;
create policy scores_select_member on public.scores
for select to authenticated
using (public.is_tasting_member(tasting_id));

-- Score writes are RPC-only. Direct INSERT/UPDATE/DELETE is intentionally
-- denied so every write goes through public.save_score and its conflict check.
drop policy if exists scores_insert_own_or_admin on public.scores;
drop policy if exists scores_update_own_or_admin on public.scores;
drop policy if exists scores_delete_own_or_admin on public.scores;

-- ---------------------------------------------------------------------------
-- 7. Atomic RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_tenant(
  p_name text,
  p_slug text default null
)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text;
  v_base text;
  v_slug text;
  v_suffix integer := 0;
  v_tenant public.tenants;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Group name must be between 1 and 120 characters.'
      using errcode = '22023';
  end if;

  -- Make sure the profile exists even on projects that missed the auth trigger.
  insert into public.profiles (id, full_name)
  values (v_user, left((select u.email from auth.users u where u.id = v_user), 120))
  on conflict (id) do nothing;

  -- Simple quota so one account cannot create an unbounded number of tenants.
  if (
    select count(*)
    from public.tenant_members m
    where m.user_id = v_user
      and m.role = 'owner'
  ) >= 50 then
    raise exception 'You have reached the maximum number of groups.'
      using errcode = '54000';
  end if;

  v_base := lower(btrim(coalesce(nullif(p_slug, ''), v_name)));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '^-+|-+$', '', 'g');
  if v_base = '' then
    v_base := 'group';
  end if;
  v_base := left(v_base, 60);
  v_slug := v_base;

  loop
    begin
      insert into public.tenants (name, slug)
      values (v_name, v_slug)
      returning * into v_tenant;
      exit;
    exception when unique_violation then
      v_suffix := v_suffix + 1;
      if v_suffix > 1000 then
        raise exception 'Could not generate a unique group slug.'
          using errcode = '23505';
      end if;
      v_slug := v_base || '-' || v_suffix::text;
    end;
  end loop;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant.id, v_user, 'owner');

  return v_tenant;
end;
$$;

create or replace function public.create_tasting(
  p_tenant_id uuid,
  p_title text,
  p_date date default current_date
)
returns public.tastings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_title text;
  v_tasting public.tastings;
  v_display_name text;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' or char_length(v_title) > 160 then
    raise exception 'Tasting title must be between 1 and 160 characters.'
      using errcode = '22023';
  end if;

  insert into public.tastings (
    tenant_id,
    host_user_id,
    title,
    tasting_date,
    status
  )
  values (
    p_tenant_id,
    v_user,
    v_title,
    coalesce(p_date, current_date),
    'draft'
  )
  returning * into v_tasting;

  select coalesce(
    (select nullif(btrim(p.full_name), '')
     from public.profiles p
     where p.id = v_user),
    auth.jwt() ->> 'email',
    'Host'
  )
  into v_display_name;

  v_display_name := coalesce(nullif(left(coalesce(v_display_name, ''), 80), ''), 'Host');

  insert into public.tasting_participants (
    tasting_id,
    user_id,
    display_name,
    is_host
  )
  values (
    v_tasting.id,
    v_user,
    coalesce(v_display_name, 'Host'),
    true
  )
  on conflict (tasting_id, user_id) do nothing;

  return v_tasting;
end;
$$;

create or replace function public.add_beer_to_tasting(
  p_tasting_id uuid,
  p_name text,
  p_brewery text default null,
  p_style text default null,
  p_alcohol numeric default null
)
returns public.tasting_beers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_name text;
  v_beer public.beers;
  v_position integer;
  v_assignment public.tasting_beers;
begin
  if not public.is_tasting_member(p_tasting_id) then
    raise exception 'You are not a member of this tasting.' using errcode = '42501';
  end if;

  if not public.is_tasting_open(p_tasting_id) then
    raise exception 'This tasting is completed. Reopen it before adding beers.'
      using errcode = '55000';
  end if;

  select t.tenant_id into v_tenant_id
  from public.tastings t
  where t.id = p_tasting_id;

  if v_tenant_id is null then
    raise exception 'Tasting does not exist.' using errcode = '23503';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Beer name must be between 1 and 120 characters.'
      using errcode = '22023';
  end if;

  -- Serialise concurrent additions to the same tasting so positions cannot
  -- collide on the (tasting_id, position) unique constraint.
  perform pg_advisory_xact_lock(hashtextextended(p_tasting_id::text, 0));

  insert into public.beers (
    tenant_id,
    name,
    brewery,
    style,
    alcohol
  )
  values (
    v_tenant_id,
    v_name,
    nullif(btrim(coalesce(p_brewery, '')), ''),
    nullif(btrim(coalesce(p_style, '')), ''),
    p_alcohol
  )
  on conflict (tenant_id, name) do update
    set brewery = coalesce(excluded.brewery, beers.brewery),
        style = coalesce(excluded.style, beers.style),
        alcohol = coalesce(excluded.alcohol, beers.alcohol),
        updated_at = now()
  returning * into v_beer;

  select coalesce(max(tb.position), 0) + 1
  into v_position
  from public.tasting_beers tb
  where tb.tasting_id = p_tasting_id;

  insert into public.tasting_beers (tasting_id, beer_id, position)
  values (p_tasting_id, v_beer.id, v_position)
  on conflict (tasting_id, beer_id) do update
    set position = tasting_beers.position
  returning * into v_assignment;

  return v_assignment;
end;
$$;

create or replace function public.create_tenant_invite(
  p_tenant_id uuid,
  p_role text default 'member'
)
returns public.tenant_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invite public.tenant_invites;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if not public.is_tenant_admin(p_tenant_id) then
    raise exception 'Only group owners and admins can create invites.'
      using errcode = '42501';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Invite role must be admin or member.' using errcode = '22023';
  end if;

  insert into public.profiles (id, full_name)
  values (v_user, left((select u.email from auth.users u where u.id = v_user), 120))
  on conflict (id) do nothing;

  insert into public.tenant_invites (tenant_id, role, created_by)
  values (p_tenant_id, p_role, v_user)
  returning * into v_invite;

  return v_invite;
end;
$$;

create or replace function public.accept_tenant_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invite public.tenant_invites;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  insert into public.profiles (id, full_name)
  values (v_user, left((select u.email from auth.users u where u.id = v_user), 120))
  on conflict (id) do nothing;

  select * into v_invite
  from public.tenant_invites
  where token = p_token
  for update;

  if v_invite.id is null then
    raise exception 'This invite is invalid or has expired.' using errcode = '22023';
  end if;

  -- Existing members can reopen a join link without consuming it. This also
  -- makes a QR/link refresh safe after the member has already joined.
  if exists (
    select 1
    from public.tenant_members m
    where m.tenant_id = v_invite.tenant_id
      and m.user_id = v_user
  ) then
    return v_invite.tenant_id;
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used.' using errcode = '22023';
  end if;

  if v_invite.accepted_at is null and v_invite.expires_at <= now() then
    raise exception 'This invite is invalid or has expired.' using errcode = '22023';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_invite.tenant_id, v_user, v_invite.role)
  on conflict (tenant_id, user_id) do update
    set role = case
      when tenant_members.role = 'owner' then 'owner'
      else excluded.role
    end;

  update public.tenant_invites
  set accepted_at = coalesce(accepted_at, now()),
      accepted_by = coalesce(accepted_by, v_user)
  where id = v_invite.id;

  return v_invite.tenant_id;
end;
$$;

create or replace function public.save_score(
  p_tasting_id uuid,
  p_participant_id uuid,
  p_beer_id uuid,
  p_smell numeric,
  p_color numeric,
  p_branding numeric,
  p_taste numeric,
  p_notes text,
  p_expected_updated_at timestamptz,
  p_force boolean default false
)
returns public.scores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_score public.scores;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if not public.is_tasting_member(p_tasting_id) then
    raise exception 'You are not a member of this tasting.' using errcode = '42501';
  end if;

  if not public.is_tasting_open(p_tasting_id) then
    raise exception 'This tasting is completed and cannot be scored.'
      using errcode = '55000';
  end if;

  if not public.can_edit_participant(p_participant_id) then
    raise exception 'You can only edit your own scores.' using errcode = '42501';
  end if;

  if (p_smell is not null and (p_smell < 0 or p_smell > 10))
     or (p_color is not null and (p_color < 0 or p_color > 10))
     or (p_branding is not null and (p_branding < 0 or p_branding > 10))
     or (p_taste is not null and (p_taste < 0 or p_taste > 20)) then
    raise exception 'Smell, color and branding must be between 0 and 10; taste must be between 0 and 20.'
      using errcode = '22023';
  end if;

  insert into public.scores (
    tasting_id,
    beer_id,
    participant_id,
    smell,
    color,
    branding,
    taste,
    notes
  )
  values (
    p_tasting_id,
    p_beer_id,
    p_participant_id,
    p_smell,
    p_color,
    p_branding,
    p_taste,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  on conflict (tasting_id, beer_id, participant_id) do update
    set smell = excluded.smell,
        color = excluded.color,
        branding = excluded.branding,
        taste = excluded.taste,
        notes = excluded.notes,
        updated_at = now()
    where p_force
       or scores.updated_at = p_expected_updated_at
  returning * into v_score;

  if v_score.id is null then
    raise exception 'This score was changed by someone else.'
      using errcode = '40001';
  end if;

  return v_score;
end;
$$;

create or replace function public.save_scores(
  p_tasting_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_saved public.scores;
  v_result jsonb := '[]'::jsonb;
  v_participant_id uuid;
  v_beer_id uuid;
begin
  if not public.is_tasting_member(p_tasting_id) then
    raise exception 'You are not a member of this tasting.' using errcode = '42501';
  end if;

  if not public.is_tasting_open(p_tasting_id) then
    raise exception 'This tasting is completed and cannot be scored.'
      using errcode = '55000';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array.' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_participant_id := (v_row ->> 'participantId')::uuid;
    v_beer_id := (v_row ->> 'beerId')::uuid;

    begin
      select * into v_saved
      from public.save_score(
        p_tasting_id,
        v_participant_id,
        v_beer_id,
        (v_row ->> 'smell')::numeric,
        (v_row ->> 'color')::numeric,
        (v_row ->> 'branding')::numeric,
        (v_row ->> 'taste')::numeric,
        v_row ->> 'notes',
        (v_row ->> 'expectedUpdatedAt')::timestamptz,
        coalesce((v_row ->> 'force')::boolean, false)
      );

      v_result := v_result || jsonb_build_array(
        jsonb_build_object(
          'participantId', v_participant_id,
          'beerId', v_beer_id,
          'status', 'saved',
          'updatedAt', v_saved.updated_at
        )
      );
    exception when sqlstate '40001' then
      v_result := v_result || jsonb_build_array(
        jsonb_build_object(
          'participantId', v_participant_id,
          'beerId', v_beer_id,
          'status', 'conflict'
        )
      );
    end;
  end loop;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Privileges and realtime
-- ---------------------------------------------------------------------------

revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.tenant_role(uuid) from public;
revoke all on function public.is_tenant_admin(uuid) from public;
revoke all on function public.is_tasting_member(uuid) from public;
revoke all on function public.is_tasting_admin(uuid) from public;
revoke all on function public.is_tasting_open(uuid) from public;
revoke all on function public.can_edit_participant(uuid) from public;

grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.tenant_role(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
grant execute on function public.is_tasting_member(uuid) to authenticated;
grant execute on function public.is_tasting_admin(uuid) to authenticated;
grant execute on function public.is_tasting_open(uuid) to authenticated;
grant execute on function public.can_edit_participant(uuid) to authenticated;

revoke all on function public.create_tenant(text, text) from public;
revoke all on function public.create_tasting(uuid, text, date) from public;
revoke all on function public.add_beer_to_tasting(uuid, text, text, text, numeric) from public;
revoke all on function public.create_tenant_invite(uuid, text) from public;
revoke all on function public.accept_tenant_invite(uuid) from public;
revoke all on function public.save_score(uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, timestamptz, boolean) from public;
revoke all on function public.save_scores(uuid, jsonb) from public;

grant execute on function public.create_tenant(text, text) to authenticated;
grant execute on function public.create_tasting(uuid, text, date) to authenticated;
grant execute on function public.add_beer_to_tasting(uuid, text, text, text, numeric) to authenticated;
grant execute on function public.create_tenant_invite(uuid, text) to authenticated;
grant execute on function public.accept_tenant_invite(uuid) to authenticated;
grant execute on function public.save_score(uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, timestamptz, boolean) to authenticated;
grant execute on function public.save_scores(uuid, jsonb) to authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'scores',
      'tasting_participants',
      'tasting_beers',
      'tastings',
      'beers',
      'tenant_invites'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          v_table
        );
      end if;
    end loop;
  end if;
end $$;

-- Full replica identity is required so filtered DELETE events include the
-- tasting_id column. The client refetches the snapshot on every event anyway.
alter table public.scores replica identity full;
alter table public.tasting_participants replica identity full;
alter table public.tasting_beers replica identity full;
alter table public.beers replica identity full;
alter table public.tenant_invites replica identity full;
