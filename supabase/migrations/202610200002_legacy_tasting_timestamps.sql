-- Fix upgrades from the first scaffold.
--
-- The first schema created tasting_participants and tasting_beers without
-- created_at. The snapshot query in src/lib/api.ts orders participants by
-- created_at, so an upgraded project failed with:
--
--   column tasting_participants.created_at does not exist
--
-- `create table if not exists` does not add columns to existing tables, so the
-- columns need an explicit, idempotent addition.

alter table public.tasting_participants
  add column if not exists created_at timestamptz not null default now();

alter table public.tasting_beers
  add column if not exists created_at timestamptz not null default now();
