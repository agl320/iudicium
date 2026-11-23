-- Job board behind the login. Run once in the Supabase SQL editor.
--
-- Until this runs, anyone holding the public anon key (it ships in the site's
-- JavaScript) can read job_postings straight from the REST API, whatever the
-- frontend shows. After it, only signed-in users can read, and nobody can
-- write through the API.
--
-- The poller is unaffected: it connects to Postgres directly
-- (DATABASE_SESSION_POOLER_URL) as the table owner, which bypasses RLS.
--
-- Undo: alter table public.job_postings disable row level security;

alter table public.job_postings enable row level security;

drop policy if exists "signed-in users read postings" on public.job_postings;
create policy "signed-in users read postings" on public.job_postings
  for select to authenticated using (true);

-- No insert/update/delete policies: with RLS on, the anon and authenticated
-- API roles cannot change rows.
revoke insert, update, delete on public.job_postings from anon, authenticated;
