-- Scoring model:
--   smell, color and branding: 0–10 (10 points each)
--   taste: 0–20 (20 points, i.e. double weight)
--   raw total: 50
--   final score: raw total × 2 = 0–100
--
-- The original schema limited taste to 10. This migration widens that limit
-- and replaces save_score so the RPC accepts the new range.

alter table public.scores
  drop constraint if exists scores_taste_check;

alter table public.scores
  drop constraint if exists scores_taste_range;

alter table public.scores
  add constraint scores_taste_range
  check (taste is null or (taste >= 0 and taste <= 20))
  not valid;

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

grant execute on function public.save_score(
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  timestamptz,
  boolean
) to authenticated;
