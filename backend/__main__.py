from __future__ import annotations

import asyncio

from backend.services.workday_poller import WorkdayPoller
from backend.services.greenhouse_poller import GreenhousePoller


async def run_pollers_once() -> None:
    workday_poller = WorkdayPoller()
    greenhouse_poller = GreenhousePoller()

    try:
        await asyncio.gather(
            workday_poller.run(),
            greenhouse_poller.run(),
        )
        rows = workday_poller.store.get_recent_postings(limit=20)
        print(rows[:3])
    finally:
        workday_poller.close()
        greenhouse_poller.close()


if __name__ == "__main__":
    asyncio.run(run_pollers_once())
