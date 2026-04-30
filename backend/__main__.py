from __future__ import annotations

import asyncio
import argparse

from backend.services.workday_poller import WorkdayPoller
from backend.services.greenhouse_poller import GreenhousePoller
from backend.services.api_poller import APIPoller


async def run_pollers_once(*, max_jobs_per_client: int = 100) -> None:
    workday_poller = WorkdayPoller(max_jobs_per_client=max_jobs_per_client)
    greenhouse_poller = GreenhousePoller()
    api_poller = APIPoller()

    try:
        await asyncio.gather(
            workday_poller.run(),
            greenhouse_poller.run(),
            api_poller.run(),
        )
        rows = workday_poller.store.get_recent_postings(limit=20)
        print(rows[:3])
    finally:
        workday_poller.close()
        greenhouse_poller.close()
        api_poller.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--workday-max-jobs-per-client",
        type=int,
        default=100,
        help="Maximum number of Workday postings to fetch per client",
    )
    args = parser.parse_args()

    asyncio.run(run_pollers_once(max_jobs_per_client=args.workday_max_jobs_per_client))
