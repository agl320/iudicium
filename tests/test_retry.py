"""Retries, pacing and query planning, without touching any real job board:
Workday answers come from a throwaway aiohttp server on 127.0.0.1, the rest
is mocked."""

import asyncio
import sys
import dataclasses
import time
import unittest
from unittest import mock

from aiohttp import web

import backend.__main__ as main_module
from backend.config.loader import Company, load_config
from backend.models import JobPosting
from backend.providers.errors import WorkdayAPIError
from backend.providers.workday.cxs import WorkdayCxsClient
from backend.services import poller as poller_module
from backend.services import sources
from backend.services.throttle import HostThrottle, RequestLog, current_log, retry_delay


class FakeWorkday:
    """Answers with the given statuses in turn, then 200."""

    def __init__(self, statuses, retry_after=None):
        self.statuses = list(statuses)
        self.retry_after = retry_after
        self.hits = []

    async def handle(self, request):
        self.hits.append(time.monotonic())
        if self.statuses:
            status = self.statuses.pop(0)
            headers = {"Retry-After": self.retry_after} if self.retry_after else {}
            return web.Response(status=status, text="<html>busy</html>", headers=headers)
        return web.json_response({"total": 0, "jobPostings": [], "facets": []})


async def serve(fake):
    app = web.Application()
    app.router.add_post("/jobs", fake.handle)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    return runner, f"http://127.0.0.1:{port}/jobs"


class WorkdayRetryTests(unittest.IsolatedAsyncioTestCase):
    async def client_for(self, fake):
        runner, url = await serve(fake)
        self.addAsyncCleanup(runner.cleanup)
        return WorkdayCxsClient(url, backoff_base=0.01, max_attempts=4)

    async def test_429_is_retried_then_succeeds(self):
        fake = FakeWorkday([429, 503])
        client = await self.client_for(fake)
        log = RequestLog()
        current_log.set(log)
        result = await client.search_raw(limit=1, offset=0)
        self.assertEqual(result["total"], 0)
        self.assertEqual(len(fake.hits), 3)
        self.assertEqual((log.count, log.retries), (3, 2))

    async def test_retry_after_is_honoured(self):
        fake = FakeWorkday([429], retry_after="1")
        client = await self.client_for(fake)
        await client.search_raw(limit=1, offset=0)
        self.assertGreaterEqual(fake.hits[1] - fake.hits[0], 0.9)

    async def test_gives_up_after_max_attempts(self):
        fake = FakeWorkday([429] * 10)
        client = await self.client_for(fake)
        with self.assertRaisesRegex(WorkdayAPIError, "429"):
            await client.search_raw(limit=1, offset=0)
        self.assertEqual(len(fake.hits), 4)

    async def test_other_4xx_fail_at_once(self):
        fake = FakeWorkday([404])
        client = await self.client_for(fake)
        with self.assertRaisesRegex(WorkdayAPIError, "404"):
            await client.search_raw(limit=1, offset=0)
        self.assertEqual(len(fake.hits), 1)


class ThrottleTests(unittest.IsolatedAsyncioTestCase):
    async def test_same_host_requests_are_spaced(self):
        gate = HostThrottle(per_host=2, min_interval=0.1)
        starts = []

        async def one():
            async with gate.slot("https://wd5.myworkdayjobs.com/x"):
                starts.append(time.monotonic())

        await asyncio.gather(*(one() for _ in range(4)))
        gaps = [b - a for a, b in zip(starts, starts[1:])]
        self.assertTrue(all(g >= 0.09 for g in gaps), gaps)

    async def test_other_hosts_are_not_held_up(self):
        gate = HostThrottle(per_host=1, min_interval=0.5)
        t0 = time.monotonic()
        async with gate.slot("https://wd1.myworkdayjobs.com/a"):
            pass
        async with gate.slot("https://wd5.myworkdayjobs.com/b"):
            pass
        self.assertLess(time.monotonic() - t0, 0.2)

    def test_retry_delay(self):
        self.assertEqual(retry_delay(1, "7"), 7.0)
        self.assertEqual(retry_delay(1, "9999"), 60.0)
        self.assertLess(retry_delay(1, None, base=1.0), 2.01)
        self.assertGreaterEqual(retry_delay(3, None, base=1.0), 4.0)


def facets(*groups):
    """Workday facet JSON: (parameter, [(id, label), ...])."""
    return [
        {"facetParameter": p, "values": [{"id": i, "descriptor": d} for i, d in values]}
        for p, values in groups
    ]


class WorkdayQueryPlanTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.config = load_config()
        self.company = Company(
            name="Acme", enabled=True, provider="workday", domain="acme.com",
            options={"host": "acme.wd5", "site": "Careers"},
        )

    async def plan(self, available):
        calls = []

        async def collect(client, *, search_text, facets, max_jobs):
            calls.append((search_text, facets))
            return []

        async def raw(self, **kwargs):
            return {"facets": available}

        with mock.patch.object(sources, "_collect_workday", collect), mock.patch.object(WorkdayCxsClient, "search_raw", raw):
            log = RequestLog()
            current_log.set(log)
            await sources.fetch_workday(self.company, self.config.tracks, self.config.settings)
        return calls, log.notes

    async def test_hr_family_facet_replaces_keywords(self):
        calls, notes = await self.plan(
            facets(
                ("timeType", [("ft", "Full time"), ("pt", "Part time")]),
                ("jobFamilyGroup", [("hr", "Human Resources"), ("eng", "Engineering"), ("int", "Internships")]),
            )
        )
        hr_calls = [c for c in calls if c[1].get("timeType") == ["ft"]]
        self.assertIn(("", {"timeType": ["ft"], "jobFamilyGroup": ["hr"]}), hr_calls)
        self.assertEqual(sorted(q for q, _ in hr_calls if q), ["HRIS", "payroll"])
        self.assertEqual(len(hr_calls), 3, "was 11 keyword searches")
        self.assertTrue(any("instead of 11" in n for n in notes), notes)

    async def test_without_a_family_facet_keywords_are_kept(self):
        calls, notes = await self.plan(facets(("timeType", [("ft", "Full time")])))
        hr_calls = [c for c in calls if c[1].get("timeType") == ["ft"]]
        self.assertEqual(len(hr_calls), 11)
        self.assertTrue(any("no matching job-family facet" in n for n in notes), notes)


def posting(title):
    return JobPosting(source="t", title=title, company="X", company_url="x.com", location="Vancouver, BC", url=f"https://x/{title}")


class PollerRetryPassTests(unittest.IsolatedAsyncioTestCase):
    def poller(self, **settings):
        config = load_config()
        config = dataclasses.replace(
            config, settings=dataclasses.replace(config.settings, retry_delay_seconds=0, **settings)
        )
        return poller_module.Poller(config, dry_run=True), config

    async def test_temporary_failure_gets_a_second_pass(self):
        p, config = self.poller()
        calls = {"n": 0}

        async def fetch(company, tracks, settings):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("Workday API request failed: HTTP 429 Too Many Requests")
            return [posting("Software Engineering Intern")]

        company = config.companies[0]
        with mock.patch.object(poller_module, "fetch_company", fetch), mock.patch.object(poller_module, "enrich", self.passthrough):
            results = await p.run([company])
        self.assertEqual(calls["n"], 2)
        self.assertEqual(results[0].error, "")
        self.assertEqual(results[0].attempts, 2)
        self.assertIn("ok on retry", poller_module.format_summary(results, config.tracks))

    async def test_permanent_failure_is_not_retried(self):
        p, config = self.poller()
        calls = {"n": 0}

        async def fetch(company, tracks, settings):
            calls["n"] += 1
            raise RuntimeError("Tesla request failed: HTTP 403 Forbidden")

        with mock.patch.object(poller_module, "fetch_company", fetch):
            results = await p.run([config.companies[0]])
        self.assertEqual(calls["n"], 1)
        self.assertIn("403", results[0].error)

    @staticmethod
    async def passthrough(company, postings, tracks, settings):
        return postings


class CompanySelectionTests(unittest.TestCase):
    """The scheduled run skips local_only boards; --local runs only those."""

    def select(self, *argv):
        with mock.patch.object(sys, "argv", ["backend", *argv]):
            args = main_module.parse_args()
        return [c.name for c in main_module.select_companies(load_config(), args)]

    def test_scheduled_run_skips_local_only(self):
        self.assertNotIn("Tesla", self.select())
        self.assertIn("NVIDIA", self.select())

    def test_local_runs_only_local_only(self):
        self.assertEqual(self.select("--local"), ["Tesla"])

    def test_company_flag_still_reaches_any_board(self):
        self.assertEqual(self.select("--company", "tesla"), ["Tesla"])


if __name__ == "__main__":
    unittest.main()
