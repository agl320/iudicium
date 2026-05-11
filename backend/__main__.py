from __future__ import annotations

import asyncio
import argparse
import os
import logging

from dotenv import load_dotenv

from backend.services.workday_poller import WorkdayPoller
from backend.services.greenhouse_poller import GreenhousePoller
from backend.services.api_poller import APIPoller

# Load environment variables from .env file
load_dotenv()

log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


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
    finally:
        workday_poller.close()
        greenhouse_poller.close()
        api_poller.close()


if __name__ == "__main__":

    asyncio.run(run_pollers_once(max_jobs_per_client=2000))
