# Migrating the old DynamoDB data into ZBL

This is the one-off migration from the old Amplify/DynamoDB app in
`../beertasting` into the Supabase tenant **ZBL**.

The importer reads the DynamoDB S3 export and generates a transactional SQL
file. It does not write to Supabase by itself.

- Script: `scripts/migrate-legacy-zbl.mjs`
- Input: `s3://front-door-camera/AWSDynamoDB/` (region `eu-west-1`)
- Output: `.legacy-export/zbl-legacy-import.sql` and
  `.legacy-export/zbl-legacy-report.md`
- `.legacy-export/` is gitignored; do not commit the export or generated SQL.

## Source exports

| Old table | Items |
| --- | ---: |
| `BeerTasting-...-dev` | 50 |
| `Beer-...-dev` | 1,356 |
| `BeerRating-...-dev` | 5,233 |

## Mapping

| Old | New |
| --- | --- |
| `BeerTasting` | `tastings` |
| `BeerTasting.host` | `tastings.title` (the old “Location” text) |
| `BeerTasting.createdAt` | `tastings.tasting_date` / timestamps |
| `Beer` | `beers` + `tasting_beers` |
| `Beer.name` | `beers.name` |
| `Beer.alcohol` | `beers.alcohol` |
| `Beer.description` | `beers.style` (the old “Type”) |
| `Beer.beerBeerTastingId` | `tasting_beers.tasting_id` |
| `BeerRating` | `tasting_participants` + `scores` |
| `BeerRating.userName` | participant `display_name` |
| `BeerRating.beerRatingBeerId` | `scores.beer_id` |
| `BeerRating.smell/color/branding` | `scores` (0–10) |
| `BeerRating.taste` | `scores.taste` (0–20) |
| `BeerRating.description` | notes only if a real comment |
| `BeerRating.createdAt/updatedAt` | score timestamps |

The old scale already matches the new model:

```text
(smell + color + branding + taste) × 2 = 0–100
```

## What the export contains

- **50 real tastings** with 197 linked beers and 1,804 linked ratings.
- **1,159 orphan beers**. Only the 284 orphan beers that actually have ratings
  are used; the rest are unrated test/import leftovers.
- **3,427 orphan ratings**, all dated **2020-10-27**, with no original tasting
  link. They are imported into one synthetic completed tasting:
  **“Imported 2020 ratings (2020-10-27)”**.

The synthetic tasting is the only way to preserve those 2020 ratings in the
tasting-centric model. To drop them instead, generate the linked-only SQL:

```bash
node scripts/migrate-legacy-zbl.mjs \
  --skip-orphans \
  --out .legacy-export/zbl-legacy-linked-only.sql \
  --report .legacy-export/zbl-legacy-linked-only-report.md
```

| Variant | Tastings | Catalog beers | Assignments | Participants | Scores |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default (all data) | 51 | 478 | 481 | 452 | 5,195 |
| `--skip-orphans` | 50 | 196 | 197 | 433 | 1,768 |

## User names

The importer uses the exact `BeerRating.userName` values found in the database.
It does **not** create users from the Cognito list and does not create the extra
renamed/duplicate Cognito identities.

The importer is locked to tenant **ZBL**
(`045e449a-4b22-4000-a6c2-fa42350c888e`, name `ZBL`). For that tenant only, it
can use the old Cognito user pool to resolve old names to email addresses, then
links matching historical participant rows to existing Supabase profiles with
that email. It never creates accounts. Use `--no-cognito` to disable this, or
provide explicit overrides with `--email-map`.

Old database names imported:

```text
Krikke, Jarno, Fonne, Joost, Fille, Vinny, Rikke, Tim, Steven, Dieter,
Ruben, Fre, Joef, Niels, Tibo, Abé, Gil, Gill, Vince, Michiel, Robin
```

- `Vinny` and `Vince` remain separate historical participants.
- `Gil` and `Gill` remain separate.
- `Abé`, `Vince` and `Robin` are present in the database but not in the pasted
  Cognito list; they are kept because they have ratings.
- `Vincent`, `RubenClaessens`, `Rikke.Heremans` and the throwaway email accounts
  are not database `userName`s, so they are ignored.
- The importer creates **guest participants** (`user_id = null`) first, then
  optionally links them to existing profiles. Automatic linking is only enabled
  for the ZBL tenant. It reads the old Cognito pool by default and matches old
  names to emails; the SQL then matches those emails against `auth.users`.
  Participants whose email has no Supabase account stay guests.
- Use `--user-map` for explicit display-name/user-id overrides. It accepts an
  optional `email` too:

```json
{
  "Fre": {
    "displayName": "Fre",
    "email": "frederik.vandenbruel@gmail.com"
  },
  "Vinny": {
    "displayName": "Vincent",
    "userId": "<new-profile-uuid>"
  }
}
```

```bash
node scripts/migrate-legacy-zbl.mjs \
  --user-map .legacy-export/user-map.json \
  --email-map .legacy-export/name-email-map.json
```

`--email-map` is a simple JSON object mapping old names to email addresses and
overrides the Cognito lookup. `--no-cognito` disables the automatic Cognito
lookup entirely.

### Current ZBL linkage

The existing ZBL data has since been linked using the same mapping:

| Participant | Linked rows | Supabase account |
| --- | ---: | --- |
| Fre | 27 | frederik.vandenbruel@gmail.com (already linked) |
| Fonne | 47 | gilianvanroosbroeck@hotmail.com |
| Jarno | 35 | jarno.heremans@hotmail.com |
| Steven | 46 | steven_goeleven@hotmail.com |

The other historical names still have no Supabase account with the mapped
Cognito email, so they remain guests. At the time of linking, Jarno's auth
account was not yet a ZBL member; it needs a group invite before it can see the
linked ratings.

## Notes and comments

The old app stored the taste value in `BeerRating.description` for normal
ratings, and `"Imported from excel"` for the 2020 import. The old comment
textarea was not bound to the form, so **no real comments survived**. The
importer drops numeric values and the “Imported from excel” placeholder; the
imported notes are therefore empty.

## Preflight

Before running the import, make sure the tasting schema migrations are applied:

- `202610200002_legacy_tasting_timestamps.sql` — adds `created_at` to
  `tasting_participants` / `tasting_beers`; the import sets
  `tasting_beers.created_at`.
- `202610200003_taste_out_of_twenty.sql` — allows taste values up to 20; the
  old ratings contain taste values above 10.

`supabase db push` applies them. Check the target:

```sql
select id, name, slug
from public.tenants
where lower(trim(name)) = 'zbl' or lower(trim(slug)) = 'zbl';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.scores'::regclass and contype = 'c';

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tasting_participants', 'tasting_beers')
  and column_name = 'created_at';
```

The import aborts if ZBL already has tastings or beers. It is meant for the
freshly created tenant. Take a backup first.

### Clean the ZBL test data

If you already created a test tasting (for example the one that produced the
`tasting_participants.created_at` error), the import guard will abort. Delete
the test tasting and any test beer catalog rows first:

```sql
do $$
declare
  v_tenant uuid;
begin
  select id into v_tenant
  from public.tenants
  where lower(trim(name)) = 'zbl' or lower(trim(slug)) = 'zbl';

  if v_tenant is null then
    raise exception 'ZBL tenant not found';
  end if;

  -- Deletes the test tasting and cascades participants, assignments and scores.
  delete from public.tastings where tenant_id = v_tenant;

  -- Deletes any test beers from the ZBL catalog.
  delete from public.beers where tenant_id = v_tenant;
end $$;
```

Do this only on the freshly created ZBL tenant. It is destructive.

## Generate and run

```bash
# uses the default AWS profile and region eu-west-1
node scripts/migrate-legacy-zbl.mjs
```

The SQL resolves the tenant automatically:

- tenant: exactly one row whose trimmed name or slug is `ZBL`;
- host: the first `owner` membership of that tenant.

Override if needed:

```bash
node scripts/migrate-legacy-zbl.mjs \
  --tenant-id <ZBL_TENANT_UUID> \
  --host-user-id <ZBL_OWNER_PROFILE_UUID>
```

Run `.legacy-export/zbl-legacy-import.sql` in the Supabase **SQL Editor** as
`postgres`, or with `psql` using a privileged connection. It must not be run as
the `authenticated` role: direct score inserts are intentionally RPC-only under
RLS.

The file:

- starts a transaction and sets a 10-minute statement timeout;
- resolves tenant and host and aborts if ZBL is missing, has no owner, or is not
  empty;
- inserts tastings, catalog beers, tasting-beer assignments, participants and
  scores;
- commits only if everything succeeds.

## Expected result

After import:

- 51 tastings (50 real + 1 synthetic 2020);
- 478 catalog beers;
- 481 tasting-beer assignments;
- 452 participants;
- 5,195 scores;
- imported tastings have status `completed`;
- old tasting IDs, beer IDs and rating IDs are reused where they are UUIDs.

Verify:

```sql
-- replace with the ZBL uuid if needed
with z as (select id from public.tenants where lower(trim(slug)) = 'zbl' limit 1)
select
  (select count(*) from public.tastings where tenant_id = z.id) as tastings,
  (select count(*) from public.beers where tenant_id = z.id) as beers,
  (select count(*) from public.tasting_participants p
     join public.tastings t on t.id = p.tasting_id
   where t.tenant_id = z.id) as participants,
  (select count(*) from public.scores s
     join public.tastings t on t.id = s.tasting_id
   where t.tenant_id = z.id) as scores
from z;

select title, tasting_date, status
from public.tastings
where tenant_id = (select id from public.tenants where lower(trim(slug)) = 'zbl' limit 1)
order by tasting_date desc;
```

Open ZBL in the app, check a few tastings, and check the synthetic 2020 ranking.

## Caveats

- The old app had no tenant concept; all old ratings go into ZBL.
- Old rankings were global across tastings. The new app has both per-tasting
  rankings and a tenant-wide **Overall beer ranking**. The overall view combines
  the 50 real tastings with the synthetic 2020 tasting and can filter them by
  date/taster/type/search. The 2020 orphan data remains in its own synthetic
  tasting so it is not mixed into a specific real tasting's per-tasting results.
- Imported tastings are completed/read-only. The ZBL owner can reopen one from
  the Tasting panel.
- Old users start as guest participant rows. For ZBL only, the importer can
  automatically link them to existing Supabase accounts by matching the old
  Cognito name -> email to `auth.users.email`. Names without a Supabase account
  with that email remain guests; no accounts are created.
- Beers are merged by trimmed name into ZBL’s tenant-wide beer catalog. One
  merge conflict (same name, different alcohol/style) was detected; the
  earliest beer’s metadata is used.
- 36 duplicate ratings (same tasting/beer/user after beer-name merging) were
  reduced to the latest one.
