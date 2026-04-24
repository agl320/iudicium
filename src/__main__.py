from __future__ import annotations

from src.services.workday_poller import WorkdayPoller


def main() -> None:
    poller = WorkdayPoller()
    poller.run_once()


if __name__ == "__main__":
    main()
