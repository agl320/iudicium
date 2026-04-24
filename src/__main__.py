from __future__ import annotations
from pprint import pprint

from src.api.errors import MotorolaAPIError, NvidiaAPIError
from src.api.workday.motorola import MotorolaAPIClient
from src.api.workday.nvidia import NvidiaAPIClient
from src.api.workday.td import TDAPIClient


def main() -> None:
    clients = [
        MotorolaAPIClient(),
        NvidiaAPIClient(),
        TDAPIClient(),
    ]
    try:
        for client in clients:
            pprint(client.search_job_postings()[:1])

    except (MotorolaAPIError, NvidiaAPIError) as exc:
        print(f"Error: {exc}")


if __name__ == "__main__":
    main()
