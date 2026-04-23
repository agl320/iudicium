from __future__ import annotations

import sys
from pprint import pprint

from src.api.errors import StripeGreenhouseAPIError
from src.api.greenhouse.stripe import StripeGreenhouseAPIClient


def main() -> None:
    try:
        pprint(StripeGreenhouseAPIClient().search_raw(page=1, per_page=20))
    except StripeGreenhouseAPIError as exc:
        print(str(exc), file=sys.stderr)


if __name__ == "__main__":
    main()
