-- Make invite acceptance safe for QR/join links.
--
-- * An existing member who opens a link for their group is returned to the
--   group without consuming the invite.
-- * The same user can reopen a link they already accepted.
-- * A different user still cannot reuse an accepted or expired invite.

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

  -- Existing members can reopen a join link without consuming it.
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

grant execute on function public.accept_tenant_invite(uuid) to authenticated;
