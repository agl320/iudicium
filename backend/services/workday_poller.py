from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from time import monotonic

from backend.providers.errors import WorkdayAPIError
from backend.providers.workday.adobe import AdobeAPIClient
from backend.providers.workday.cxs import WorkdayCxsClient
from backend.providers.workday.capitalone import CapitalOneAPIClient
from backend.providers.workday.autodesk import AutodeskAPIClient
from backend.providers.workday.cibc import CIBCAPIClient
from backend.providers.workday.intel import IntelAPIClient
from backend.providers.workday.motorola import MotorolaAPIClient
from backend.providers.workday.nvidia import NvidiaAPIClient
from backend.providers.workday.rbc import RBCAPIClient
from backend.providers.workday.salesforce import SalesforceAPIClient
from backend.providers.workday.td import TDAPIClient
from backend.providers.workday.telus import TelusAPIClient
from backend.providers.workday.mastercard import MastercardAPIClient
from backend.providers.workday.logitech import LogitechAPIClient
from backend.providers.workday.hp import HPAPIClient
from backend.models import JobPosting
from backend.services.job_store import JobPostingStore
from backend.services.discord import (
    send_discord_notification,
)
from backend.config.config import DEFAULT_WORKDAY_PAYLOAD


def build_default_workday_clients() -> list[object]:
    return [
        AdobeAPIClient(
            payload={
                **DEFAULT_WORKDAY_PAYLOAD,
                "appliedFacets": {
                    "workerSubType": ["3ba4ecdf4893100b2f8d08d56d8d6c8e"]
                },
            }
        ),
        # CapitalOneAPIClient(),
        AutodeskAPIClient(
            payload={
                **DEFAULT_WORKDAY_PAYLOAD,
                "appliedFacets": {
                    "workerSubType": ["39f5af07b0c54bc588b1a47788da7f81"]
                },
            }
        ),
        # CIBCAPIClient(),
        # MotorolaAPIClient(),
        NvidiaAPIClient(
            payload={
                **DEFAULT_WORKDAY_PAYLOAD,
                "appliedFacets": {
                    "workerSubType": ["0c40f6bd1d8f10adf6dae42e46d44a17"]
                },
            }
        ),
        # RBCAPIClient(),
        # SalesforceAPIClient(),
        # TDAPIClient(),
        # TelusAPIClient(),
        MastercardAPIClient(
            payload={
                **DEFAULT_WORKDAY_PAYLOAD,
                "appliedFacets": {
                    "workerSubType": ["cfba33fac07f49c9b6d3d53336c6a291"]
                },
            }
        ),
        # LogitechAPIClient(),
        # HPAPIClient(),
        IntelAPIClient(
            payload={
                **DEFAULT_WORKDAY_PAYLOAD,
                "appliedFacets": {
                    "workerSubType": ["dc8bf79476611087dfde99931439ae75"]
                },
            }
        ),
    ]


class WorkdayPoller:
    def __init__(
        self,
        *,
        interval_minutes: float = 5.0,
        max_jobs_per_client: int = 500,
        pagination_delay_seconds: float = 0.5,
        client_delay_seconds: float = 0.5,
    ) -> None:
        self.clients = build_default_workday_clients()
        self.interval_seconds = max(1.0, interval_minutes * 60.0)
        self.max_jobs_per_client = max(1, max_jobs_per_client)
        self.pagination_delay_seconds = max(0.0, pagination_delay_seconds)
        self.client_delay_seconds = max(0.0, client_delay_seconds)
        self.store = JobPostingStore()

    """Polls Workday job postings for multiple clients and stores them in a local database."""

    async def _run_client(self, client: object) -> None:
        logger = logging.getLogger(__name__)
        client_name = getattr(client, "company", client.__class__.__name__)
        logger.info("Starting Workday client: %s", client_name)
        start = monotonic()
        try:
            postings = await self._collect_postings(client)
            new_postings = self.store.upsert_postings(postings)
            await self._notify_new_postings(client_name, new_postings)
            duration = monotonic() - start
            logger.info(
                "Completed Workday client %s: fetched %d postings in %.2fs",
                client_name,
                len(postings),
                duration,
            )
            first = postings[:1]
            print(first, end="\n")
        except WorkdayAPIError as exc:
            duration = monotonic() - start
            logger.warning(
                "Workday client %s failed after %.2fs: %s",
                client_name,
                duration,
                exc,
            )
            print(f"[{client.__class__.__name__}] error: {exc}\n")

    async def _notify_new_postings(
        self,
        client_name: str,
        postings: list[JobPosting],
    ) -> None:
        for posting in postings:
            await asyncio.to_thread(send_discord_notification, posting, client_name)

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

            if self.pagination_delay_seconds > 0:
                await asyncio.sleep(self.pagination_delay_seconds)

        return collected

    async def run(self) -> None:
        for client in self.clients:
            await self._run_client(client)
            if self.client_delay_seconds > 0:
                await asyncio.sleep(self.client_delay_seconds)

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
