from __future__ import annotations

import sys
from pprint import pprint

from src.api.errors import NvidiaAPIError
from src.api.workday.nvidia import NvidiaAPIClient


def main() -> None:
    try:
        pprint(NvidiaAPIClient().search_raw())
    except NvidiaAPIError as exc:
        print(str(exc), file=sys.stderr)


if __name__ == "__main__":
    main()
