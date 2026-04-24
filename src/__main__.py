from __future__ import annotations
from pprint import pprint

from src.api.errors import StripeGreenhouseAPIError
from src.api.greenhouse.stripe import StripeGreenhouseAPIClient


def main() -> None:
    try:
        pprint(StripeGreenhouseAPIClient().search_job_postings())

    except StripeGreenhouseAPIError as exc:
        print(f"Error: {exc}")


if __name__ == "__main__":
    main()
