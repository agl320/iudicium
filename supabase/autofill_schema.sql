-- Applications dashboard (#/applications). Run once in the Supabase SQL
-- editor, after resume_schema.sql. Until it exists the dashboard keeps its
-- data in the browser.
--
-- One small key/value table per user:
--   kind = 'application'  key = posting id from the extension (or 'manual:...')
--   kind = 'facts'        key = resume id (address, work authorization, EEO
--                         choices that a resume doesn't contain)
-- Learned answers stay in the browser extension and never reach this table.

create table if not exists public.autofill_items (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('application', 'facts')),
  key text not null check (char_length(key) <= 300),
  data jsonb not null check (pg_column_size(data) < 64000),
  updated_at timestamptz not null default now(),
  primary key (owner, kind, key)
);

alter table public.autofill_items enable row level security;

revoke all on public.autofill_items from anon;
grant select, insert, update, delete on public.autofill_items to authenticated;

drop policy if exists "own autofill items" on public.autofill_items;
create policy "own autofill items" on public.autofill_items
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- Keep accounts from piling up rows.
create or replace function public.limit_autofill_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.autofill_items where owner = new.owner) >= 2000 then
    raise exception 'Limit reached (2000 tracked items per account)';
  end if;
  return new;
end;
$$;

drop trigger if exists autofill_items_limit on public.autofill_items;
create trigger autofill_items_limit before insert on public.autofill_items
  for each row execute function public.limit_autofill_items();
