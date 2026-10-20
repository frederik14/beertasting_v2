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
- tenant_invites

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

The canonical schema is `supabase/migrations/202610200001_init.sql`; the
consolidated, idempotent copy is `supabase/schema.sql`. It is not duplicated in
this plan to avoid drift. At a glance:

- `tenants`, `profiles`, `tenant_members`, `tenant_invites`
- `tastings`, `tasting_participants`
- `beers`, `tasting_beers`
- `scores`
- `updated_at` on tenants, profiles, memberships, tastings, participants,
  beers and scores
- composite foreign keys so a score cannot reference a participant or beer from
  another tasting
- a trigger that prevents a `tasting_beers` row from crossing tenant boundaries
- RLS helpers (`is_tenant_member`, `is_tasting_member`, `can_edit_participant`)
- atomic RPCs for tenant creation, tasting creation, beer assignment, invites and
  conflict-aware score saving

## Example client snapshot shape

```ts
type TastingSnapshot = {
  tenant: { id: string; name: string; slug: string }
  tasting: {
    id: string
    tenantId: string
    hostUserId: string
    title: string
    status: 'draft' | 'active' | 'completed'
    date: string
    createdAt: string
  }
  participants: Array<{
    id: string
    displayName: string
    userId: string | null
    isHost: boolean
  }>
  beers: Array<{
    id: string
    name: string
    brewery: string | null
    style: string | null
    alcohol: number | null
  }>
  rows: Array<{
    participantId: string
    beerId: string
    smell: number | null
    color: number | null
    branding: number | null
    taste: number | null
    notes: string | null
    updatedAt: string | null
  }>
}
```

## Ranking logic

The client calculates rankings by loading a full snapshot and aggregating values:
- a row counts only when smell, color, branding and taste are all present
- smell/color/branding are 0–10; taste is 0–20 (double weight)
- the row score is `(smell + color + branding + taste) × 2`, out of 100
- aggregate per beer across complete row scores only
- beers with no complete rows remain in the list as unranked
- sort descending by average, then by votes, then by name
- ties share a rank; the next distinct average skips positions

A notes-only row is not a vote. It is reported separately as an incomplete vote.
This is the local-derived ranking model and it is implemented in
`src/lib/rankings.ts` with unit tests.

Per-tasting rankings include unrated beers as unranked rows. The tenant-wide
overall ranking uses the same complete-row policy but aggregates across all
tastings, omits beers with no complete ratings and adds:

- per-criterion averages and a tasting count per beer
- date, taster, type and text filters applied before aggregation
- sortable columns, with rank still derived from the average score
- a refresh action, plus automatic refresh after the user's own writes

The group-wide data is fetched with pagination because PostgREST caps a single
response at 1,000 rows by default and the imported data exceeds that.

## App modules

- `supabase/migrations/202610200001_init.sql` - canonical schema, RLS and RPCs
- `supabase/schema.sql` - consolidated idempotent copy of the migration
- `src/lib/supabase.ts` - Supabase client setup and env validation
- `src/lib/api.ts` - typed queries, RPC calls and error formatting
- `src/lib/types.ts` - domain types
- `src/lib/database.types.ts` - database row and RPC types
- `src/lib/rankings.ts` - local ranking functions
- `src/lib/snapshot.ts` - pure snapshot builder
- `src/hooks/` - auth, tenant data, URL state, snapshot/realtime, overall ranking data
- `src/components/` - auth, tenant, tasting, scoring, ranking, overall ranking and invite UI
- `src/App.tsx` - app shell and orchestration
- `src/data/mockSnapshot.ts` - demo fixture, no longer used by the live app

## Completed implementation steps

1. Supabase project and env variables
2. Idempotent SQL schema with RLS, composite integrity constraints and RPCs
3. Auth flow with sign in / sign up / sign out / password reset
4. Tenant creation, invites, membership and multi-group switching
5. Tasting creation with automatic host participant
6. Beer catalog / tasting beer assignment with server-side positions
7. Scoring forms with own-score/admin permissions and completeness feedback
8. Snapshot fetch with error propagation and stale-data handling
9. Client-side rankings with complete-row policy and tests
10. Realtime subscriptions with reconnect and visibility catch-up
11. Optimistic concurrency via `updated_at` and conflict UI
12. Invite join links and QR codes with idempotent acceptance
13. Tenant-wide overall beer ranking with filters, sorting and paginated loading
14. Strict TypeScript, Vitest and documentation

## Follow-up work

1. Add a member-management screen (list members, change roles, remove members).
2. Replace copyable invite codes with transactional email invites.
3. Wire the pgTAP RLS suite in `supabase/tests/rls.test.sql` into CI.
4. Add a Playwright end-to-end test for the full tasting flow.
5. Consider a shared calendar/export feature.

## Important app principles

- No ranking data should be the single source of truth in the database
- Rankings are derived from normalized rows
- Tenant boundaries are required for all operations
- One table should never mix friend groups
- The app must support separate groups with isolated data

## Status

The app is connected to Supabase. The live path uses RLS-protected tables, atomic
RPCs for multi-row writes, an optimistic-concurrency score RPC and realtime
snapshot refreshes. The mock snapshot is retained only as a demo fixture and is
not used as a fallback in the live UI.

The remaining work is primarily operational: automated RLS integration tests,
end-to-end tests, email delivery for invites, and a member-management screen.
