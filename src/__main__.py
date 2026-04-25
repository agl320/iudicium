from __future__ import annotations

import asyncio

from src.services.workday_poller import WorkdayPoller


def main() -> None:
    poller = WorkdayPoller()
    try:
        asyncio.run(poller.run())
    finally:
        poller.close()


if __name__ == "__main__":
    main()
