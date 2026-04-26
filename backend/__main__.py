from __future__ import annotations

import asyncio
from json.tool import main

from backend.services.workday_poller import WorkdayPoller


async def run_once_and_read() -> None:
    poller = WorkdayPoller()
    try:
        await poller.run()
        rows = poller.store.get_recent_postings(limit=20)  # read from DB
        print(rows[:3])
    finally:
        poller.close()


if __name__ == "__main__":
    asyncio.run(run_once_and_read())
