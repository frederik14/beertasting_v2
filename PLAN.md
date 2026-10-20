# BeerTasting v2 Plan

## Project goal

Build a fresh React + TypeScript app with Supabase + PostgreSQL for multi-tenant beer tasting groups.

The app should:
- support multiple friend groups as separate tenants
- keep the database normalized
- allow each tenant to manage its own tastings, beers, members, and rankings
- load a full tasting snapshot into the client
- derive rankings locally in the browser

## Core architecture

### Frontend
- React + TypeScript
- Vite
- local ranking logic in TypeScript
- tenant-aware dashboard and tasting UI

### Backend
- Supabase Auth
- Supabase/PostgreSQL database
- Row Level Security (RLS) by tenant membership

### Data model
The database stays normalized. The client gets a de-normalized snapshot when needed.

#### Main entities
- tenants
- profiles
- tenant_members
- tastings
- tasting_participants
- beers
- tasting_beers
- scores
- tasting_snapshots

## Key rules

### 1. Tenant-first model
Each user belongs to one or more tenants via `tenant_members`.
All tastings and beer data are scoped to a tenant.

### 2. Normalize storage
Store raw facts in separate tables:
- `tastings` for tasting metadata
- `beers` for the tenant beer catalog
- `scores` for each participant / beer / tasting score row

### 3. Derive rankings locally
Do not make ranking the primary data source. Instead:
- query the normalized tables
- build a complete tasting snapshot
- compute rankings in the client using TypeScript

This makes ranking logic easy to test and evolve without schema churn.

## Database schema direction

```sql
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.tastings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  host_user_id uuid not null references public.profiles(id),
  title text not null,
  description text,
  tasting_date timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  created_at timestamptz not null default now()
);

create table public.tasting_participants (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings(id) on delete cascade,
  user_id uuid references public.profiles(id),
  display_name text not null,
  is_host boolean not null default false,
  unique (tasting_id, user_id),
  unique (tasting_id, display_name)
);

create table public.beers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  brewery text,
  style text,
  alcohol numeric(4,2),
  description text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.tasting_beers (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings(id) on delete cascade,
  beer_id uuid not null references public.beers(id) on delete restrict,
  position integer not null default 1,
  unique (tasting_id, beer_id),
  unique (tasting_id, position)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references public.tastings(id) on delete cascade,
  beer_id uuid not null references public.beers(id) on delete restrict,
  participant_id uuid not null references public.tasting_participants(id) on delete cascade,
  smell numeric(3,1),
  color numeric(3,1),
  branding numeric(3,1),
  taste numeric(3,1),
  notes text,
  created_at timestamptz not null default now(),
  unique (tasting_id, beer_id, participant_id)
);

create table public.tasting_snapshots (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null unique references public.tastings(id) on delete cascade,
  snapshot jsonb not null,
  generated_at timestamptz not null default now()
);
```

## Example client snapshot shape

```ts
type TastingSnapshot = {
  tenant: {
    id: string
    name: string
    slug: string
  }
  tasting: {
    id: string
    title: string
    status: 'draft' | 'active' | 'completed'
    date: string
  }
  participants: Array<{
    id: string
    displayName: string
    userId?: string | null
  }>
  beers: Array<{
    id: string
    name: string
    brewery?: string | null
    style?: string | null
    alcohol?: number | null
  }>
  rows: Array<{
    participantId: string
    beerId: string
    smell: number | null
    color: number | null
    branding: number | null
    taste: number | null
    notes?: string | null
  }>
}
```

## Ranking logic

The client should calculate rankings by loading a full snapshot and aggregating values:
- score each beer per participant
- compute the average of smell + color + branding + taste
- aggregate per beer
- sort descending by average score

This is the local-derived ranking model.

## Planned app modules

- `src/lib/supabase.ts` - Supabase client setup
- `src/lib/types.ts` - domain types
- `src/lib/rankings.ts` - local ranking functions
- `src/data/mockSnapshot.ts` - local testing data
- `src/App.tsx` - main dashboard shell
- `src/App.css` - styling

## Next implementation steps

1. Create Supabase project and set env variables
2. Run the SQL schema in Supabase
3. Add auth flow with sign in / sign out
4. Build tenant creation and membership UI
5. Add tasting creation and participant management
6. Add beer catalog / tasting beer assignment
7. Add scoring forms for each participant
8. Build snapshot generation and fetch logic
9. Derive rankings in the client and render them
10. Add tenant dashboard with multi-group switching

## Important app principles

- No ranking data should be the single source of truth in the database
- Rankings are derived from normalized rows
- Tenant boundaries are required for all operations
- One table should never mix friend groups
- The app must support separate groups with isolated data

## Status

The project scaffold is created and a first tenant-aware app structure is in place.
The next work is to connect the app to Supabase and replace the mock snapshot with real data queries.
