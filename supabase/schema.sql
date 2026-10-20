create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.tastings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  host_user_id uuid not null references public.profiles (id),
  title text not null,
  description text,
  tasting_date timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.tasting_participants (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings (id) on delete cascade,
  user_id uuid references public.profiles (id),
  display_name text not null,
  is_host boolean not null default false,
  unique (tasting_id, user_id),
  unique (tasting_id, display_name)
);

create table if not exists public.beers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  brewery text,
  style text,
  alcohol numeric(4,2),
  description text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.tasting_beers (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings (id) on delete cascade,
  beer_id uuid not null references public.beers (id) on delete restrict,
  position integer not null default 1,
  unique (tasting_id, beer_id),
  unique (tasting_id, position)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings (id) on delete cascade,
  beer_id uuid not null references public.beers (id) on delete restrict,
  participant_id uuid not null references public.tasting_participants (id) on delete cascade,
  smell numeric(3,1),
  color numeric(3,1),
  branding numeric(3,1),
  taste numeric(3,1),
  notes text,
  created_at timestamptz not null default now(),
  unique (tasting_id, beer_id, participant_id)
);

create table if not exists public.tasting_snapshots (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null unique references public.tastings (id) on delete cascade,
  snapshot jsonb not null,
  generated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tastings enable row level security;
alter table public.tasting_participants enable row level security;
alter table public.beers enable row level security;
alter table public.tasting_beers enable row level security;
alter table public.scores enable row level security;
alter table public.tasting_snapshots enable row level security;

create policy "Users can view their own profile" on public.profiles
for select using (auth.uid() = id);

create policy "Users can insert their own profile" on public.profiles
for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
for update using (auth.uid() = id);

create policy "Users can create a tenant" on public.tenants
for insert with check (auth.uid() is not null);

create policy "Users can view tenant membership for their tenant" on public.tenant_members
for select using (
  user_id = auth.uid()
);

create policy "Users can insert their own tenant membership" on public.tenant_members
for insert with check (user_id = auth.uid());

create policy "Users can view their tenants" on public.tenants
for select using (
  id in (
    select tenant_id from public.tenant_members where user_id = auth.uid()
  )
);
