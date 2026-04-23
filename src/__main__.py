from __future__ import annotations

import sys
from pprint import pprint

from src.api.errors import TeslaAPIError
from src.api.tesla import TeslaCareersStateClient


def main() -> None:
    try:
        pprint(TeslaCareersStateClient().search_raw())
    except TeslaAPIError as exc:
        print(str(exc), file=sys.stderr)


if __name__ == "__main__":
    main()
