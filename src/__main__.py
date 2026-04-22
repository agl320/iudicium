from __future__ import annotations

import sys
from pprint import pprint

from src.api.rippling.dwave import DWaveAPIClient
from src.api.errors import DWaveAPIError


def main() -> None:
    try:
        pprint(DWaveAPIClient().search_raw())
    except DWaveAPIError as exc:
        print(str(exc), file=sys.stderr)


if __name__ == "__main__":
    main()
