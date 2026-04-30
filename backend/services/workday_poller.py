from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import monotonic

from backend.providers.errors import WorkdayAPIError
from backend.providers.workday.cxs import WorkdayCxsClient
from backend.providers.workday.capitalone import CapitalOneAPIClient
from backend.providers.workday.autodesk import AutodeskAPIClient
from backend.providers.workday.cibc import CIBCAPIClient
from backend.providers.workday.motorola import MotorolaAPIClient
from backend.providers.workday.nvidia import NvidiaAPIClient
from backend.providers.workday.rbc import RBCAPIClient
from backend.providers.workday.salesforce import SalesforceAPIClient
from backend.providers.workday.td import TDAPIClient
from backend.providers.workday.telus import TelusAPIClient
from backend.services.job_store import JobPostingStore
from backend.config.config import INTEL_API_URL, INTEL_COMPANY_URL


def build_default_workday_clients() -> list[object]:
    return [
        CapitalOneAPIClient(),
        AutodeskAPIClient(),
        CIBCAPIClient(),
        MotorolaAPIClient(),
        NvidiaAPIClient(),
        RBCAPIClient(),
        SalesforceAPIClient(),
        TDAPIClient(),
        TelusAPIClient(),
        WorkdayCxsClient(
            api_url=INTEL_API_URL, company="Intel", company_url=INTEL_COMPANY_URL
        ),
    ]


class WorkdayPoller:
    def __init__(
        self,
        *,
        interval_minutes: float = 5.0,
        max_jobs_per_client: int = 500,
        db_path: str = "data/iudicium.db",
    ) -> None:
        self.clients = build_default_workday_clients()
        self.interval_seconds = max(1.0, interval_minutes * 60.0)
        self.max_jobs_per_client = max(1, max_jobs_per_client)
        self.store = JobPostingStore(db_path=db_path)

    """Polls Workday job postings for multiple clients and stores them in a local database."""

    async def _run_client(self, client: object) -> None:
        try:
            postings = await self._collect_postings(client)
            self.store.upsert_postings(postings)
            first = postings[:1]
            print(first, end="\n")
        except WorkdayAPIError as exc:
            print(f"[{client.__class__.__name__}] error: {exc}\n")

    async def _collect_postings(self, client: object) -> list[object]:
        if not isinstance(client, WorkdayCxsClient):
            return await client.search_job_postings()

        collected: list[object] = []
        offset = 0
        page_size = 20
        total: int | None = None

        while len(collected) < self.max_jobs_per_client:
            remaining = self.max_jobs_per_client - len(collected)
            request_limit = min(page_size, remaining)
            page, reported_total = await client.search_job_postings_page(
                limit=request_limit,
                offset=offset,
            )

            if total is None and isinstance(reported_total, int):
                total = reported_total

            if not page:
                break

            collected.extend(page)
            offset += page_size

            if total is not None and offset >= total:
                break
            if len(page) < request_limit:
                break

        return collected

    async def run(self) -> None:
        tasks = [self._run_client(client) for client in self.clients]
        await asyncio.gather(*tasks)

    async def run_poll(self) -> None:
        while True:
            cycle_started = datetime.now(UTC).isoformat()
            print(f"\nCycle started at {cycle_started}")

            started_monotonic = monotonic()
            await self.run()

            elapsed = monotonic() - started_monotonic
            sleep_seconds = max(0.0, self.interval_seconds - elapsed)
            print(f"Cycle complete. Sleeping for {sleep_seconds:.1f}s")
            await asyncio.sleep(sleep_seconds)

    def close(self) -> None:
        self.store.close()
