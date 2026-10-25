"""End-to-end poller test against a throwaway Postgres.

Needs `pip install pgserver` (an embedded Postgres); skipped otherwise.
"""

import asyncio
import dataclasses
import tempfile
import unittest
from unittest import mock

try:
    import pgserver
except ImportError:  # pragma: no cover
    pgserver = None

import psycopg2

from backend.config.loader import Company, load_config
from backend.models import JobPosting
from backend.services import poller as poller_module
from backend.services.job_store import JobPostingStore

OLD_SCHEMA = """
CREATE TABLE job_postings (
    id SERIAL PRIMARY KEY,
    entry_hash TEXT NOT NULL UNIQUE,
    company TEXT NOT NULL,
    company_url TEXT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT NOT NULL,
    location TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
)
"""


def job(company, title, url, location="Santa Clara, CA", employment_type=""):
    return JobPosting(
        source="test",
        title=title,
        company=company,
        company_url=f"{company.lower()}.com",
        location=location,
        url=url,
        employment_type=employment_type,
    )


@unittest.skipIf(pgserver is None, "pgserver not installed")
class PollerDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.server = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="stop")
        self.uri = self.server.get_uri()
        with psycopg2.connect(self.uri) as conn, conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS job_postings")
            cur.execute(OLD_SCHEMA)
            legacy = [
                job("NVIDIA", "Hardware Intern - 2027", "https://nv/1"),
                # Ashby postings used to be stored without a URL.
                job("RAMP", "Software Engineer Intern", ""),
                job("Stripe", "Senior Software Engineer", "https://stripe/1"),
            ]
            for p in legacy:
                cur.execute(
                    """INSERT INTO job_postings (entry_hash, company, company_url,
                       title, url, source, location, first_seen, last_seen)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,'2026-01-01','2026-01-01')""",
                    (
                        JobPostingStore.build_entry_hash(
                            company=p.company, title=p.title, url=p.url
                        ),
                        p.company,
                        p.company_url,
                        p.title,
                        p.url,
                        p.source,
                        p.location,
                    ),
                )
        self.env = mock.patch.dict(
            "os.environ", {"DATABASE_SESSION_POOLER_URL": self.uri}
        )
        self.env.start()
        self.config = dataclasses.replace(
            load_config(),
            settings=dataclasses.replace(
                load_config().settings, max_notifications_per_company=2
            ),
        )
        self.companies = [
            Company(name=n, provider="custom", domain=f"{n.lower()}.com")
            for n in ("NVIDIA", "RAMP", "Qualcomm")
        ]

    def tearDown(self):
        self.env.stop()

    def run_poller(self, fetched: dict[str, list[JobPosting]]):
        async def fake_fetch(company, tracks, settings):
            return fetched.get(company.name, [])

        sent: list[JobPosting] = []

        def fake_send(posting, track):
            sent.append(posting)
            return True

        poller = poller_module.Poller(self.config)
        with (
            mock.patch.object(poller_module, "fetch_company", fake_fetch),
            mock.patch.object(poller_module, "send_discord_notification", fake_send),
            mock.patch.object(poller_module, "DISCORD_DELAY_SECONDS", 0),
        ):
            results = asyncio.run(poller.run(self.companies))
        store = JobPostingStore(self.uri)
        return {r.company: r for r in results}, sent, store

    def test_migration_seeding_reposts_and_cap(self):
        results, sent, store = self.run_poller(
            {
                "NVIDIA": [
                    job("NVIDIA", "Hardware Intern - 2027", "https://nv/1"),
                    job("NVIDIA", "ASIC Intern - 2027", "https://nv/2"),
                    job("NVIDIA", "Senior HR Business Partner", "https://nv/3", employment_type="full_time"),
                    job("NVIDIA", "Senior Circuit Designer", "https://nv/4"),
                ],
                # Same job as before, now with a real URL -> new hash.
                "RAMP": [job("RAMP", "Software Engineer Intern", "https://ramp/1")],
                "Qualcomm": [job("Qualcomm", "Modem Software Intern", "https://q/1")],
            }
        )

        # Legacy rows were backfilled.
        rows = {r["title"]: r for r in store.get_recent_postings(limit=100)}
        self.assertEqual(rows["Hardware Intern - 2027"]["category"], "tech_intern")
        self.assertEqual(rows["Senior Software Engineer"]["category"], "")

        # Uncategorized postings are not stored.
        self.assertNotIn("Senior Circuit Designer", rows)

        sent_titles = sorted(p.title for p in sent)
        # Only the genuinely new NVIDIA intern is announced: HR is a new
        # track for NVIDIA (seeded), RAMP is a repost, Qualcomm is new.
        self.assertEqual(sent_titles, ["ASIC Intern - 2027"])
        self.assertEqual(results["NVIDIA"].seeded, 1)
        self.assertEqual(results["Qualcomm"].seeded, 1)
        self.assertEqual(results["RAMP"].new, 1)
        self.assertEqual(results["RAMP"].to_notify, [])

        hr_rows = store.get_recent_postings(category="hr")
        self.assertEqual([r["title"] for r in hr_rows], ["Senior HR Business Partner"])

        # Second run: Qualcomm is now known, so new postings notify (capped at 2).
        results, sent, store = self.run_poller(
            {
                "Qualcomm": [
                    job("Qualcomm", f"Modem Software Intern {i}", f"https://q/{i + 10}")
                    for i in range(4)
                ]
                + [job("Qualcomm", "Payroll Specialist", "https://q/99")],
            }
        )
        self.assertEqual(len(sent), 2)
        self.assertEqual(results["Qualcomm"].new, 5)
        # HR is still new for Qualcomm, so it was seeded rather than queued.
        self.assertEqual(results["Qualcomm"].seeded, 1)
        store.close()

        # A row classified under older rules is corrected once the rules
        # fingerprint changes, without re-notifying anything.
        with psycopg2.connect(self.uri) as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE job_postings SET category = 'tech_intern' "
                "WHERE title = 'Senior Software Engineer'"
            )
            cur.execute("UPDATE iudicium_meta SET value = 'old-rules'")
        results, sent, store = self.run_poller({})
        rows = {r["title"]: r for r in store.get_recent_postings(limit=100)}
        self.assertEqual(rows["Senior Software Engineer"]["category"], "")
        self.assertEqual(rows["Hardware Intern - 2027"]["category"], "tech_intern")
        self.assertEqual(sent, [])
        store.close()


if __name__ == "__main__":
    unittest.main()
