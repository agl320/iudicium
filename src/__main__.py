from __future__ import annotations
import argparse

from src.services.workday_poller import WorkdayPoller


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Workday debug poller.")
    parser.add_argument(
        "--interval-minutes",
        type=float,
        default=5.0,
        help="Polling interval in minutes (default: 5).",
    )
    parser.add_argument(
        "--run-once",
        action="store_true",
        help="Run one cycle and exit.",
    )
    args = parser.parse_args()

    poller = WorkdayPoller(interval_minutes=args.interval_minutes)
    if args.run_once:
        poller.run_once()
        return

    try:
        poller.run_forever()
    except KeyboardInterrupt:
        print("Poller stopped.")


if __name__ == "__main__":
    main()
