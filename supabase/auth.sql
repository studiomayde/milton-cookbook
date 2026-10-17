-- Milton Manor: sign-in with an email link, for approved people only.
-- Run this once in Supabase (SQL Editor). It replaces the family-key link:
-- after this, only signed-in people on the list below can see or change anything.

create table if not exists public.cookbook_members (
  email text primary key,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_at timestamptz not null default now()
);
alter table public.cookbook_members enable row level security;
revoke all on public.cookbook_members from anon, authenticated;

-- The signed-in person's role ('owner' or 'member'), or null if they are not on the list.
create or replace function public.cookbook_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.cookbook_members
  where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Every data function already calls this. It now means "is a signed-in, approved person".
create or replace function public.cookbook_ok(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.cookbook_role() is not null;
$$;

create or replace function public.cookbook_can_join(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cookbook_members where email = lower(trim(coalesce(p_email, ''))));
$$;

create or replace function public.cookbook_whoami() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('email', lower(coalesce(auth.jwt() ->> 'email', '')), 'role', public.cookbook_role());
$$;

create or replace function public.cookbook_members_list() returns setof public.cookbook_members
language plpgsql stable security definer set search_path = public as $$
begin
  if public.cookbook_role() is distinct from 'owner' then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select * from public.cookbook_members order by role desc, added_at;
end $$;

create or replace function public.cookbook_member_add(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.cookbook_role() is distinct from 'owner' then raise exception 'Not allowed' using errcode = '42501'; end if;
  if position('@' in coalesce(p_email, '')) = 0 then raise exception 'Not an email address'; end if;
  insert into public.cookbook_members (email) values (lower(trim(p_email))) on conflict (email) do nothing;
end $$;

create or replace function public.cookbook_member_remove(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.cookbook_role() is distinct from 'owner' then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from public.cookbook_members where email = lower(trim(p_email)) and role <> 'owner';
end $$;

revoke execute on function public.cookbook_role() from public, anon, authenticated;
revoke execute on function public.cookbook_can_join(text) from public;
revoke execute on function public.cookbook_whoami() from public;
revoke execute on function public.cookbook_members_list() from public;
revoke execute on function public.cookbook_member_add(text) from public;
revoke execute on function public.cookbook_member_remove(text) from public;
grant execute on function public.cookbook_can_join(text) to anon, authenticated;
grant execute on function public.cookbook_whoami() to authenticated;
grant execute on function public.cookbook_members_list() to authenticated;
grant execute on function public.cookbook_member_add(text) to authenticated;
grant execute on function public.cookbook_member_remove(text) to authenticated;

-- The owner (can add and remove people from the People page in Milton Manor).
insert into public.cookbook_members (email, role) values ('may@studiomayde.com', 'owner')
on conflict (email) do update set role = 'owner';
