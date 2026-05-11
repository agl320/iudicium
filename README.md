[![Netlify Status](https://api.netlify.com/api/v1/badges/db111ce5-16eb-41b2-9ac4-d47fb8be7742/deploy-status)](https://app.netlify.com/projects/iudicium/deploys)
# iudicium

Technical overview
------------------

Brief: iudicium aggregates job postings from multiple provider adapters, stores them in a Postgres table, and serves a lightweight React frontend. Supabase is used as the hosted Postgres instance for the frontend client.

Architecture
- Backend: Python service under `backend/`.
	- `backend/services/job_store.py` — Postgres access and upsert logic for the `job_postings` table.
	- `backend/api/main.py` — HTTP API that returns recent postings as `JobPostingResponse` objects.
	- `backend/providers/` — adapters and scrapers for various sources; each provider normalizes provider-specific data into `JobPosting` models.
	- Data model: `job_postings` contains at minimum `id, entry_hash, company, title, url, source, location, first_seen, last_seen`.

- Frontend: React + Vite under `frontend/`.
	- Uses the Supabase client to read from the `job_postings` table (`frontend/src/api/jobs.ts`).
	- The UI renders `JobList` and `JobCard` components and relies on backend ordering by `first_seen` to show newest postings first.
