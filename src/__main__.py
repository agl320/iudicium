from __future__ import annotations

import sys
from pprint import pprint

from src.api.motorola import MotorolaAPIError, MotorolaAPIClient


def main() -> None:
    try:
        pprint(MotorolaAPIClient().search_raw())
    except MotorolaAPIError as exc:
        print(str(exc), file=sys.stderr)


if __name__ == "__main__":
    main()