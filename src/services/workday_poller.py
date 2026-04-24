from __future__ import annotations

from datetime import UTC, datetime
from time import monotonic, sleep

from src.api.errors import WorkdayAPIError
from src.api.workday.autodesk import AutodeskAPIClient
from src.api.workday.cibc import CIBCAPIClient
from src.api.workday.motorola import MotorolaAPIClient
from src.api.workday.nvidia import NvidiaAPIClient
from src.api.workday.rbc import RBCAPIClient
from src.api.workday.salesforce import SalesforceAPIClient
from src.api.workday.td import TDAPIClient
from src.api.workday.telus import TelusAPIClient


def build_default_workday_clients() -> list[object]:
    return [
        AutodeskAPIClient(),
        CIBCAPIClient(),
        MotorolaAPIClient(),
        NvidiaAPIClient(),
        RBCAPIClient(),
        SalesforceAPIClient(),
        TDAPIClient(),
        TelusAPIClient(),
    ]


class WorkdayPoller:
    def __init__(self, *, interval_minutes: float = 5.0) -> None:
        self.clients = build_default_workday_clients()
        self.interval_seconds = max(1.0, interval_minutes * 60.0)

    def run_once(self) -> None:
        for client in self.clients:
            try:
                postings = client.search_job_postings()
                first = postings[:1]
                print(f"[{client.__class__.__name__}] first job: {first}")
            except WorkdayAPIError as exc:
                print(f"[{client.__class__.__name__}] error: {exc}")

    def run_forever(self) -> None:
        while True:
            cycle_started = datetime.now(UTC).isoformat()
            print(f"\nCycle started at {cycle_started}")

            started_monotonic = monotonic()
            self.run_once()

            elapsed = monotonic() - started_monotonic
            sleep_seconds = max(0.0, self.interval_seconds - elapsed)
            print(f"Cycle complete. Sleeping for {sleep_seconds:.1f}s")
            sleep(sleep_seconds)
