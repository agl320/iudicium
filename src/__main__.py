from __future__ import annotations

from src.services.workday_poller import WorkdayPoller


def main() -> None:
    poller = WorkdayPoller()
    poller.run()


if __name__ == "__main__":
    main()
