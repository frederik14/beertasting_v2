# BeerTasting v2

A multi-tenant beer-tasting app for groups of friends. Each group is a private
tenant; members can create tastings, add participants and beers, submit scores,
and see a ranking derived from the complete score rows.

Built with React 19, TypeScript, Vite, Supabase Auth, PostgreSQL and Supabase
Realtime.

## What works

- Email/password sign-up, sign-in, sign-out and password reset.
- Users can belong to multiple groups and switch between them. The selected
  group and tasting are kept in the URL.
- Owners/admins can create invite codes and show a join link/QR that carries
  the invite and the current tasting. Invites expire after 14 days.
- Group members can create tastings. Creating a tasting also creates the host
  participant in the same transaction.
- Members can add themselves as participants. Owners/admins can also add guest
  participants and enter scores on their behalf.
- Members can add beers to a tasting. Beer metadata is not silently erased when
  a beer is re-added with blank fields.
- Scores are saved through an RPC that detects concurrent changes. A conflicting
  save is reported and can be reloaded or explicitly overwritten.
- Completed tastings are read-only (participants, beer assignments and scores)
  until reopened.
- Rankings are derived in the browser. Only rows with all four criteria
  (smell, color, branding, taste) count as votes.
- Each tasting has its own ranking. A group-wide **Overall beer ranking**
  aggregates every complete rating across all tastings, with the old app's
  per-criterion columns, date/taster/type/search filters and sortable headers.
- Supabase Realtime subscribes to scores, participants, tasting beers and the
  tasting itself. The client refetches a full snapshot after events and after
  reconnect/visibility changes.
- The Scoring panel has a phone-friendly **My ratings** view (one card per beer
  for the signed-in participant) and an **All ratings** matrix view.

## Rating from multiple phones

Each friend rates their own row with their own account. The host does not need
to pass a device around.

1. An owner or admin creates an invite in **Invite people to this group** and
   shares the code.
2. Each friend signs in or creates an account on their own phone.
3. They join the group with the invite code:
   - on the initial screen if they have no groups yet; or
   - under **Create or join another group** if they already belong to one.
4. They open the tasting.
5. In the **Participants** panel they choose **Add me**. This links their auth
   account to their own participant row.
6. In **Scoring** they use **My ratings** (the default view) and score each
   beer. If they have not added themselves yet, this view links to the
   Participants panel. The full **All ratings** matrix is still available, but other
   people's rows are read-only for regular members.
7. Other phones receive the updates through Supabase Realtime.

Important details:

- Invite links are single-use per person. Create one invite per friend. The same
  account can reopen its link; a different account cannot reuse an accepted
  invite.
- If a new account requires email confirmation, confirm the email and reopen the
  invite/QR link if the confirmation lands on the app home page without the
  original query parameters.
- Use a separate account for each person. Two people using the same account
  share the same participant row and overwrite each other.
- Do not pre-create a guest with the same display name as someone who will add
  themselves; display names are unique per tasting. The host can either let
  everyone add themselves, or add guest names and enter scores for those guests.
- Regular members can only edit their own scores. A tenant owner/admin can edit
  any score.
- If the host is a regular member rather than an owner/admin, an owner/admin
  must create the group invite.

## Stack

- React 19 + TypeScript (strict mode)
- Vite 8
- Supabase JS client
- PostgreSQL with Row Level Security
- Vitest + React Testing Library

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project.

3. Copy `.env.example` to `.env` and fill in the project URL and anon key:

   ```bash
   cp .env.example .env
   ```

   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

   The anon key is public by design; never put a `service_role` key in a
   `VITE_*` variable.

4. Apply the schema. Either use the Supabase CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   or paste `supabase/schema.sql` into the SQL editor. The file is idempotent
   and can be re-run.

### Local Supabase

A minimal `supabase/config.toml` is included. To run everything locally:

```bash
supabase start
supabase db reset      # applies supabase/migrations
supabase status        # prints the local API URL and anon key
```

Put the printed URL and anon key in `.env`, then run `npm run dev`. Run
`npm run test:db` after `supabase start` to execute the pgTAP RLS suite in
`supabase/tests/`.

5. Start the app:

   ```bash
   npm run dev
   ```

## Scripts

```bash
npm run dev        # Vite dev server
npm run build      # type-check and production build
npm run typecheck  # composite TypeScript build
npm run lint       # oxlint
npm run test       # Vitest
npm run test:watch # Vitest in watch mode
```

## Deploying the frontend

Supabase hosts the database, auth and APIs, but it does **not** host this Vite
frontend. Use a static host such as Cloudflare Pages. Supabase Storage is not a
supported replacement for a static site host: HTML assets may be returned as
plain text and there is no SPA routing layer.

The production site is deployed at **https://beertasting-v2.pages.dev**.

The repository includes `wrangler.toml` and `public/_headers` for Cloudflare
Pages. The app only uses query parameters (`?tenant=`, `?tasting=`, `?join=`),
so no path-based SPA rewrite is needed.

### Cloudflare Pages from Git (recommended)

1. Commit and push the branch you want to deploy.
2. In Cloudflare, open **Workers & Pages → Create → Pages → Connect to Git** and
   select this repository.
3. Use the Vite preset with:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: `22`
4. Add these environment variables for Production and Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. The first URL will look like
   `https://beertasting-v2.pages.dev`.
6. In Supabase, open **Authentication → URL Configuration** and set:
   - Site URL: `https://beertasting-v2.pages.dev`
   - Additional Redirect URLs: `https://beertasting-v2.pages.dev/**`
   - Add your custom domain here too, if you attach one.

Preview deployments use different origins. Add a preview pattern such as
`https://*.<project-name>.pages.dev/**` if you want password-reset and email
confirmation links to work on previews.

### Direct upload from this machine

The site is currently deployed with direct upload. To publish a new build:

```bash
npm run deploy:cloudflare
```

That runs the production build and uploads it to the `main` branch of the
Cloudflare Pages project. The first run requires `npx wrangler login`.

Direct upload bakes `VITE_*` values into the build at build time, so make sure
the local `.env` points at the production Supabase project before building.
The equivalent manual command is:

```bash
npm run build
npx wrangler pages deploy dist --project-name beertasting-v2 --branch main
```

The checked-in `supabase/config.toml` is for local development and still points
at `http://localhost:5173`. Do not run `supabase config push` from the repo root
without updating its `[auth]` values first; production auth URLs are managed in
the Supabase dashboard. The current production values are:

- Site URL: `https://beertasting-v2.pages.dev`
- Redirect URLs: `http://localhost:5173`, `http://127.0.0.1:5173`,
  `http://localhost:4173`, `https://beertasting-v2.pages.dev`,
  `https://beertasting-v2.pages.dev/**`

Never put a Supabase `service_role` key in a `VITE_*` variable. The anon key is
public by design.

## Data model

| Table | Purpose |
| --- | --- |
| `tenants` | A private friend group. `slug` is unique. |
| `profiles` | One row per auth user. Created by an `auth.users` trigger. |
| `tenant_members` | Membership and role (`owner`, `admin`, `member`). |
| `tenant_invites` | Expiring invite tokens. Accepted only through an RPC. |
| `tastings` | A tasting inside a tenant. `tasting_date` is a `date`. |
| `tasting_participants` | Named tasters; optionally linked to an auth user. |
| `beers` | Tenant-scoped beer catalog. |
| `tasting_beers` | Which beers are in a tasting, with a position. |
| `scores` | One row per participant/beer, with four criteria and notes. |

`scores` has composite foreign keys ensuring that the participant belongs to
the tasting and that the beer is assigned to that tasting. A trigger ensures a
tasting-beer row cannot cross tenant boundaries.

The old `tasting_snapshots` table is not used. Rankings are always derived from
normalized rows. If it exists in an older project, drop it after confirming it
is empty.

## Security model

RLS is enabled on every public table. Access is checked through
`SECURITY DEFINER` helpers such as `is_tenant_member`, `is_tenant_admin`,
`is_tasting_member`, `is_tasting_admin` and `can_edit_participant`.

Key rules:

- A user can only see tenants they are a member of.
- A user cannot add themselves to an arbitrary tenant. Direct `tenant_members`
  inserts require admin rights; the invite RPC is the self-service path.
- Members can add themselves. Owners/admins can add guests. Scores are writable
  only by the participant who owns the row or a tenant admin.
- Scores are visible to all members of the tasting's tenant, but writable only
  by the participant who owns the row or a tenant admin. Score writes are
  RPC-only; direct table INSERT/UPDATE/DELETE is denied, so no client can bypass
  the concurrency check.
- `tastings` can be edited by the host or a tenant admin; deleted by the host or
  an owner/admin.
- Participant, tasting-beer and score writes are blocked while the tasting has
  status `completed`; reopening it is a host/admin action.
- `tenants` can only be created through `create_tenant`, which creates the owner
  membership atomically.

### RPCs

- `create_tenant(name, slug)` — creates a tenant and its owner membership.
- `create_tasting(tenant_id, title, date)` — creates the tasting and host participant.
- `add_beer_to_tasting(tasting_id, name, brewery, style, alcohol)` — upserts the
  beer without erasing existing metadata, serialises position allocation, and
  assigns it to the tasting.
- `create_tenant_invite(tenant_id, role)` — admin-only invite creation.
- `accept_tenant_invite(token)` — atomically joins the group and consumes the invite.
- `save_score(...)` / `save_scores(tasting_id, rows)` — optimistic-concurrency
  score writes.

## Ranking policy

The scoring model is:

| Criterion | Range | Weight |
| --- | --- | --- |
| Smell | 0–10 | 1× |
| Color | 0–10 | 1× |
| Branding | 0–10 | 1× |
| Taste | 0–20 | 2× (its maximum is doubled) |

A complete row is scored out of 100:

```text
(smell + color + branding + taste) × 2
```

The raw maximum is 50 (10 + 10 + 10 + 20), doubled to 100.

Only complete rows count:

- All four criteria must be present and within their ranges (10/10/10/20).
- A notes-only row is not a vote. It is reported as `incompleteVotes`.
- A beer's average is the average of its complete row scores, out of 100.
- Ties share a rank; the next distinct average skips positions.

The per-tasting **Results** panel lists every beer in that tasting, including
beers with no complete rows (`votes: 0`, unranked, sorted last).

The **Overall beer ranking** panel uses the same row policy across every tasting
in the selected group:

- Ratings are grouped by catalog beer (the catalog already merges beers by name
  per tenant).
- Only beers with at least one complete rating appear.
- Per-criterion columns are the averages of the same complete rows, and the
  score is the average row score out of 100.
- **Votes** is the number of complete rows; **Tastings** is the number of
  distinct tastings that contributed a complete row.
- Filters by tasting date, taster, type and name/brewery/type search are applied
  row by row before aggregation. Date filters use `tastings.tasting_date`.
- Headers sort the visible table; the rank numbers stay based on the score.
- The panel has a **Refresh** button. It also refreshes after the signed-in
  user saves scores or changes participants, beers or tastings. Other people's
  changes are picked up on refresh, matching the old app's ranking workflow.

The overall fetch pages through PostgREST responses instead of relying on the
default 1,000-row cap. This matters for the imported ZBL data: the synthetic
2020 tasting alone has more than 3,000 scores, and the group has more than
5,000.

Both ranking functions live in `src/lib/rankings.ts` and are covered by unit
tests.

## Concurrency

`scores.updated_at` is the version token. The client sends the timestamp it
loaded for each dirty row. `save_scores` updates only when the timestamp still
matches; otherwise it returns `status: 'conflict'`. The UI keeps the local value,
explains what happened, and offers:

- **Reload their values** — discard local changes for the conflicting rows.
- **Overwrite with mine** — retry with `force: true`, an explicit last-write-wins.

Only dirty rows are sent. Clearing values is persisted. Notes-only edits are
persisted. Unsaved rows are guarded by a before-unload prompt and a confirmation
when switching group or tasting.

## Realtime

`useTastingSnapshot` subscribes to `postgres_changes` for:

- `scores` filtered by `tasting_id`
- `tasting_participants` filtered by `tasting_id`
- `tasting_beers` filtered by `tasting_id`
- `tastings` filtered by `id`

Events are debounced and trigger a full snapshot refetch. The hook also refetches
on reconnect, browser `online`, and when the tab becomes visible. A monotonic
request id prevents a stale response from overwriting a newer snapshot.

The migration adds these tables to the `supabase_realtime` publication when the
publication exists and sets `replica identity full` so filtered DELETE events
include `tasting_id`.

## Testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:db   # requires supabase start
```

Unit tests cover:

- complete/partial/notes-only score rows
- unscored beers
- shared ranks
- overall aggregation across tastings, including incomplete votes
- overall date/taster/type/search filters
- snapshot ordering and orphan-row filtering
- auth panel labels and `aria-pressed` state

RLS is not covered by the JS unit tests because it needs a real PostgreSQL
instance. The recommended integration matrix is:

1. Member A can read their own tenant's tastings, participants, beers and scores.
2. Member B (another tenant) sees zero rows and cannot insert/update/delete.
3. A user cannot insert themselves into another tenant or choose `owner`.
4. A user cannot add a beer from tenant B to a tasting in tenant A.
5. A user cannot create a score for a participant in another tasting.
6. A member cannot edit another member's score; a tenant admin can.
7. An invite can be accepted once and expires afterwards.
8. Deleting a tenant/tasting/participant/beer cascades or restricts as documented.

Run these against a local Supabase instance (`supabase start`) with pgTAP or a
small integration test runner before deploying.

## Migrating an existing project

The schema is written to be re-runnable, but several changes deserve attention:

- `tastings.tasting_date` is converted from `timestamptz` to `date`.
- Composite foreign keys are added `NOT VALID` so existing inconsistent score
  rows do not block the migration. New writes are still checked. Validate and
  clean old data before calling `ALTER TABLE ... VALIDATE CONSTRAINT` if you want
  the old rows checked too.

### Upgrading from the first scaffold

The first version of the schema created `tasting_participants` and
`tasting_beers` without a `created_at` column. `create table if not exists` does
not add columns to existing tables, so an upgraded project can fail with:

```text
column tasting_participants.created_at does not exist
```

Apply `supabase/migrations/202610200002_legacy_tasting_timestamps.sql` (or run
these statements in the SQL editor):

```sql
alter table public.tasting_participants
  add column if not exists created_at timestamptz not null default now();

alter table public.tasting_beers
  add column if not exists created_at timestamptz not null default now();
```

If you use the Supabase CLI, `supabase db push` applies this migration after the
initial one. Fresh projects get the columns from the `create table` statements
and these `alter` statements are no-ops.

### Taste is out of 20

The current scoring model gives taste a maximum of 20 (double weight). The first
schema limited it to 10. Apply
`supabase/migrations/202610200003_taste_out_of_twenty.sql` (or re-run
`supabase/schema.sql`) to widen the constraint and replace `save_score`.
Existing scores between 0 and 10 remain valid; scores from 11 to 20 become
allowed.

### Join-link invite behaviour

`supabase/migrations/202610200004_join_link_invites.sql` makes invite acceptance
idempotent for the same account and lets an existing member reopen a link
without consuming the invite. `202610200005_invite_realtime.sql` adds
`tenant_invites` to the realtime publication, so the admin's active invite list
updates when someone accepts an invite. Apply both if you use the QR/join-link
flow.

If the old `tasting_snapshots` table exists, it remains RLS-protected and unused.
Drop it manually once you have confirmed it is empty.

The first scaffold passed the signed-in user's id when adding every
participant. Because of the old unique constraint, that meant a tasting could
only ever get one participant. If you have legacy participant rows, review
`tasting_participants.user_id`: a row that represents a guest may still be
linked to the group creator. Set that `user_id` to `null` if the row is not
actually that person.

## Project structure

```text
src/
  App.tsx                     app shell and data orchestration
  components/                 auth, tenant, tasting, score, ranking and invite UI
  hooks/                      auth, tenant data, snapshot/realtime, URL state
  lib/
    api.ts                    typed Supabase queries and RPC calls
    database.types.ts         hand-maintained database types
    rankings.ts               local ranking policy
    snapshot.ts               pure snapshot builder
    supabase.ts               client setup and env validation
    types.ts                  domain types
  data/mockSnapshot.ts        demo fixture, not used by the live app
supabase/
  schema.sql                  consolidated idempotent schema
  migrations/                 canonical migration
```

## Known limitations

- Invites are copyable codes, not emails. There is no transactional email
  integration.
- There is no member-management screen beyond invite creation and revocation.
- The RLS integration matrix is available as pgTAP in `supabase/tests/rls.test.sql`,
  but it is not wired into CI yet.
- There is no Playwright end-to-end suite yet.
- The `tasting_snapshots` table from the first scaffold is deprecated and unused.
