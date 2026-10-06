-- The Milton Cookbook: database setup for Supabase.
-- Everything lives in one table. The tables are closed to the public;
-- the app can only reach them through the functions below, and only
-- with the family key that is part of the family link.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cookbook_settings (
  id int primary key default 1 check (id = 1),
  key_hash text not null
);

create table if not exists public.cookbook_docs (
  coll text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (coll, id)
);
create index if not exists cookbook_docs_updated_at on public.cookbook_docs (updated_at);

alter table public.cookbook_settings enable row level security;
alter table public.cookbook_docs enable row level security;
revoke all on public.cookbook_settings, public.cookbook_docs from anon, authenticated;

create or replace function public.cookbook_ok(p_key text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.cookbook_settings
    where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
  );
$$;

create or replace function public.cookbook_check(p_key text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select public.cookbook_ok(p_key);
$$;

create or replace function public.cookbook_pull(p_key text, p_since timestamptz default null)
returns setof public.cookbook_docs
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.cookbook_ok(p_key) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select d.* from public.cookbook_docs d
    where p_since is null or d.updated_at > p_since
    order by d.updated_at;
end $$;

create or replace function public.cookbook_put(p_key text, p_coll text, p_id text, p_data jsonb)
returns timestamptz
language plpgsql security definer set search_path = public, extensions as $$
declare t timestamptz;
begin
  if not public.cookbook_ok(p_key) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.cookbook_docs as d (coll, id, data, deleted, updated_at)
  values (p_coll, p_id, p_data, false, clock_timestamp())
  on conflict (coll, id) do update
    set data = excluded.data, deleted = false, updated_at = clock_timestamp()
  returning d.updated_at into t;
  return t;
end $$;

create or replace function public.cookbook_del(p_key text, p_coll text, p_id text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.cookbook_ok(p_key) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.cookbook_docs
    set deleted = true, data = null, updated_at = clock_timestamp()
    where coll = p_coll and id = p_id;
end $$;

revoke execute on function public.cookbook_ok(text) from public, anon, authenticated;
revoke execute on function public.cookbook_check(text) from public;
revoke execute on function public.cookbook_pull(text, timestamptz) from public;
revoke execute on function public.cookbook_put(text, text, text, jsonb) from public;
revoke execute on function public.cookbook_del(text, text, text) from public;
grant execute on function public.cookbook_check(text) to anon, authenticated;
grant execute on function public.cookbook_pull(text, timestamptz) to anon, authenticated;
grant execute on function public.cookbook_put(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.cookbook_del(text, text, text) to anon, authenticated;

-- Set the family key (run once). Replace the hash with the SHA-256 of your key:
-- insert into public.cookbook_settings (id, key_hash) values (1, '<sha256 hex of key>')
-- on conflict (id) do update set key_hash = excluded.key_hash;
