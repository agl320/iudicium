from __future__ import annotations
from pprint import pprint

from src.api.errors import MotorolaAPIError, NvidiaAPIError
from src.api.workday.motorola import MotorolaAPIClient
from src.api.workday.nvidia import NvidiaAPIClient


def main() -> None:
    try:
        client = MotorolaAPIClient()
        client_nvidia = NvidiaAPIClient()
        pprint(client.search_job_postings()[:1])
        pprint(client_nvidia.search_job_postings()[:1])

    except (MotorolaAPIError, NvidiaAPIError) as exc:
        print(f"Error: {exc}")


if __name__ == "__main__":
    main()
