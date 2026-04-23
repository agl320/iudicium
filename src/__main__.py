from __future__ import annotations

import sys
from pprint import pprint

from src.api.ashby.perplexity import PerplexityAPIClient
from src.api.errors import PerplexityAPIError


def main() -> None:
    try:
        pprint(PerplexityAPIClient().search_raw())
    except PerplexityAPIError as exc:
        print(str(exc), file=sys.stderr)


if __name__ == "__main__":
    main()
