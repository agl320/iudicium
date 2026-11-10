-- Resume builder accounts + storage. Run once in the Supabase SQL editor of
-- the same project the job board uses. The job_postings table is untouched.
--
-- Each resume is one JSON document (name, contact, sections -> entries ->
-- points, style). Every point lives inside its own entry, with `active`
-- marking the ones on the page and the rest forming that entry's pool, so a
-- point can never belong to another job or section. Saving is one atomic
-- write, and `version` stops two tabs/devices from overwriting each other.
--
-- Access: only signed-in users (Supabase Auth), only their own rows. The
-- public anon key used by the site cannot read or write any of this.

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled resume' check (char_length(title) <= 120),
  data jsonb not null check (pg_column_size(data) < 512000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resumes_owner_updated on public.resumes (owner, updated_at desc);

alter table public.resumes enable row level security;

revoke all on public.resumes from anon;
grant select, insert, update, delete on public.resumes to authenticated;

drop policy if exists "read own resumes" on public.resumes;
drop policy if exists "add own resumes" on public.resumes;
drop policy if exists "edit own resumes" on public.resumes;
drop policy if exists "delete own resumes" on public.resumes;

create policy "read own resumes" on public.resumes
  for select to authenticated using (owner = auth.uid());
create policy "add own resumes" on public.resumes
  for insert to authenticated with check (owner = auth.uid());
create policy "edit own resumes" on public.resumes
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "delete own resumes" on public.resumes
  for delete to authenticated using (owner = auth.uid());

-- Keep accounts from piling up rows (signups are open to anyone unless
-- disabled in Authentication -> Sign In / Providers).
create or replace function public.limit_resumes_per_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.resumes where owner = new.owner) >= 25 then
    raise exception 'Resume limit reached (25 per account)';
  end if;
  return new;
end;
$$;

drop trigger if exists resumes_limit on public.resumes;
create trigger resumes_limit before insert on public.resumes
  for each row execute function public.limit_resumes_per_user();

-- "Delete account" in the app: removes the auth user; resumes go with it.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
