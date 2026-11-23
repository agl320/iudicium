[![Netlify Status](https://api.netlify.com/api/v1/badges/db111ce5-16eb-41b2-9ac4-d47fb8be7742/deploy-status)](https://app.netlify.com/projects/iudicium/deploys)
# iudicium

https://iudicium.netlify.app/

A personal job-search project: it collects postings from company career sites, and includes a resume builder and an application autofill prototype.

- **Job board.** A Python poller reads company career boards every 30 minutes (Workday, Greenhouse, Ashby, Lever, SmartRecruiters and others), sorts postings into tracks (tech internships, HR/HRIS), filters them by region and salary, stores them in Postgres and posts new ones to Discord. Companies and tracks are set in `backend/config/`.
- **Website.** A React frontend for browsing and searching the stored postings by track.
- **Resume builder.** Edits resumes as sections, entries and bullet points, with a pool of alternate points per entry. Exports PDF, .docx, .tex and .txt laid out for applicant tracking systems. Resumes save to a Supabase account or to the browser.
- **Autofill (prototype).** A Chrome extension in `extension/` that fills applications on Workday, Greenhouse, Ashby and Lever (and, from the toolbar button, any other site's form) from a saved profile. It answers what it can from the profile (contact details, work history, education, self-identification, common screening questions), attaches the resume, marks the rest for the user, and never submits. Answers the user types can be saved and reused on later applications.
- **Applications page** (`#/applications`). Turns a resume into an autofill profile and sends it, with the resume file, to the extension. It also tracks every application the extension fills (company, role, resume used, dates, status). See [docs/autofill-flow.md](docs/autofill-flow.md) for the flow. Cloud sync needs `supabase/autofill_schema.sql`.

## Polling from your own machine

A few boards block GitHub's runners but answer a home connection (Tesla: 403
on GitHub). Those have `local_only = true` in `backend/config/companies.toml`:
the scheduled run skips them, and you poll them yourself with the same poller.
It writes to the same database, so the postings show up on the site like any
other; nothing local to maintain beyond a Python venv.

```sh
pip install -r requirements.txt
# .env at the repo root (same values as the GitHub secrets):
#   DATABASE_SESSION_POOLER_URL=postgresql://...      (leave out for --dry-run)
#   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...   (optional)

python -m backend --company Tesla --dry-run --show   # just look: every match, nothing stored
python -m backend --local                            # poll the local_only boards into the database
python -m backend --local --every 30                 # keep doing it while you're targeting them
```

Any board works with `--company` (`--company Tesla --company SAP`). Runs can
overlap with the scheduled one: postings are de-duplicated by URL/title, and
only newly stored postings are notified, so nothing is posted twice.

**Failures and retries:**

- Per request: HTTP 429/5xx and timeouts are retried with Retry-After or
  exponential backoff (Workday, Tesla, Eightfold and the shared HTTP helper).
- Per host: requests to one host (e.g. `wd5.myworkdayjobs.com`, shared by
  many Workday tenants) go at most 2 at a time, 0.35 s apart, and a 429 pauses
  that host for everyone (`per_host_*` in `companies.toml`).
- Per run: boards that failed with a temporary error get one more pass at the
  end, one at a time, after 45 s (`retry_failed`, `retry_delay_seconds`).

**Fewer requests:** Workday searches HR with one job-family facet query
(e.g. "Human Resources") plus `facet_terms`, instead of 11 keyword searches,
where the tenant has such a facet (`facet_labels` on the track). Facets differ
per tenant, so the poller reads them on every run; `--dry-run` prints how each
board was queried and how many requests it took (example of the format):

```
NVIDIA: 14 request(s); 99 in a track of 346 fetched
    hr: jobFamilyGroup facet (Human Resources) + 2 keyword(s) instead of 11
```
