from __future__ import annotations

from pprint import pprint

from src import run_test


def main() -> None:
    pprint([job.to_dict() for job in run_test()])


if __name__ == "__main__":
    main()