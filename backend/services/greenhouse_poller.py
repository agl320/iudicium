from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import monotonic

from backend.providers.errors import GreenhouseAPIError
from backend.providers.greenhouse.pinterest import PinterestGreenhouseAPIClient
from backend.providers.greenhouse.stripe import StripeGreenhouseAPIClient
from backend.providers.greenhouse.twilio import TwilioGreenhouseAPIClient
from backend.services.job_store import JobPostingStore


def build_default_greenhouse_clients() -> list[object]:
    return [
        PinterestGreenhouseAPIClient(),
        StripeGreenhouseAPIClient(),
        TwilioGreenhouseAPIClient(),
    ]


class GreenhousePoller:
    def __init__(
        self,
        *,
        interval_minutes: float = 5.0,
        db_path: str = "data/iudicium.db",
    ) -> None:
        self.clients = build_default_greenhouse_clients()
        self.interval_seconds = max(1.0, interval_minutes * 60.0)
        self.store = JobPostingStore(db_path=db_path)

    async def _run_client(self, client: object) -> None:
        try:
            postings = await asyncio.to_thread(client.search_job_postings)
            self.store.upsert_postings(postings)
            first = postings[:1]
            print(first, end="\n")
        except GreenhouseAPIError as exc:
            print(f"[{client.__class__.__name__}] error: {exc}\n")

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
