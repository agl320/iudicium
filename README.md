[![Netlify Status](https://api.netlify.com/api/v1/badges/db111ce5-16eb-41b2-9ac4-d47fb8be7742/deploy-status)](https://app.netlify.com/projects/iudicium/deploys)
# iudicium

https://iudicium.netlify.app/

Technical overview
------------------

Iudicium aggregates job postings from company career sites, stores them in a Postgres table, posts new ones to Discord, and serves a lightweight React frontend. Updated every 30 minutes. Built because I'm lazy when it comes to searching for jobs.

Configuration
- Everything lives in `backend/config/companies.toml` (no env vars needed):
	- `[[companies]]` — one entry per company; flip `enabled` to turn it on/off. Each names a `provider` (`workday`, `greenhouse`, `ashby`, `smartrecruiters`, `oraclecloud`, `eightfold`, `amd`, `custom`) plus the board details.
	- `[tracks.*]` — the job categories to collect. Currently `tech_intern` (blue Discord cards) and `hr` (HR / HRIS / payroll, full-time only, pink cards). Each track has title regexes (`priority_titles` always match, `include_titles`/`exclude_titles` for generic words, `block_titles` never match), an employment requirement (`intern` / `full_time` / `any`), keyword `search_terms` and a `color`.
	- `[settings]` — paging limits, concurrency, and notification flood protection.
- Boards disagree on job types, so `backend/services/classifier.py` normalizes provider hints (Workday facets, Ashby `employmentType`, SmartRecruiters `typeOfEmployment`, …) and job titles into one employment type, then assigns each posting a `category` (track key).

Running locally
- `python -m backend --list` — show companies and tracks.
- `python -m backend --dry-run --company "NVIDIA"` — fetch + classify one company without touching the DB or Discord (`--all` includes disabled companies).
- `python -m backend` — the real run (needs `DATABASE_SESSION_POOLER_URL`, `DISCORD_WEBHOOK_URL`, `LOGO_DEV_PUBLIC_KEY`).
- `python -m unittest discover -s tests -t .` — tests. The database test runs against an embedded Postgres when `pgserver` is installed (`pip install pgserver`), and is skipped otherwise.

Architecture
- Backend: Python service under `backend/`.
	- `backend/services/poller.py` — polls every enabled company concurrently, classifies, stores and sends Discord notifications.
	- `backend/services/sources.py` — one adapter per provider type that turns a config entry into postings (e.g. Workday intern / full-time facets are resolved by label, so no per-company facet ids).
	- `backend/services/job_store.py` — Postgres access and upsert logic for the `job_postings` table.
	- `backend/services/discord.py` — Discord embeds, coloured per track.
	- `backend/providers/` — HTTP clients for each job board.
	- `backend/api/main.py` — HTTP API that returns recent postings (optionally filtered by `category`).
	- Data model: `job_postings` contains `id, entry_hash, company, company_url, title, url, source, location, category, first_seen, last_seen`.
	- When the track rules change, every stored posting is re-classified on the next run so the website filters stay accurate.
	- New companies/tracks are seeded silently on their first run, reposted jobs (same company/title/location under a new URL) are not re-announced, and notifications are capped per company per run.

- Frontend: React + Vite + Tailwind under `frontend/`.
	- Uses the Supabase client to read from the `job_postings` table (`frontend/src/api/jobs.ts`), filtered by search terms and category.
	- Category labels/colours live in `frontend/src/utils/categories.ts` and mirror the tracks in `companies.toml`.
