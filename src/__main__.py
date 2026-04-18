from __future__ import annotations

import sys
from pprint import pprint

from src.api.motorola import MotorolaAPIError, MotorolaAPIClient
from src.api.td import TDAPIError, TDAPIClient


def main() -> None:
    try:
        pprint(TDAPIClient().search_raw())
    except TDAPIError as exc:
        print(str(exc), file=sys.stderr)


if __name__ == "__main__":
    main()