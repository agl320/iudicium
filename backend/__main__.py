from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys

from dotenv import load_dotenv

from backend.config.loader import load_config
from backend.services.poller import Poller, format_summary

# Load environment variables from .env file
load_dotenv()

log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m backend",
        description="Poll job boards configured in backend/config/companies.toml.",
    )
    parser.add_argument(
        "--config", help="Path to a companies.toml (defaults to the bundled one)."
    )
    parser.add_argument(
        "--company",
        action="append",
        default=[],
        help="Only poll this company (repeatable). Works for disabled companies too.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Poll every company, including disabled ones.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and classify only; no database writes, no Discord.",
    )
    parser.add_argument(
        "--list", action="store_true", help="List companies and tracks, then exit."
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config(args.config)

    if args.list:
        for track in config.tracks:
            print(f"track  {track.key:<12} {track.color_hex}  {track.label}")
        for company in config.companies:
            state = "on " if company.enabled else "off"
            print(f"[{state}] {company.name:<20} {company.provider}")
        return 0

    if args.company:
        wanted = {name.lower() for name in args.company}
        companies = [c for c in config.companies if c.name.lower() in wanted]
        missing = wanted - {c.name.lower() for c in companies}
        if missing:
            print(f"Unknown company: {', '.join(sorted(missing))}", file=sys.stderr)
            return 2
    elif args.all:
        companies = list(config.companies)
    else:
        companies = list(config.enabled_companies)

    poller = Poller(config, dry_run=args.dry_run)
    try:
        results = asyncio.run(poller.run(companies))
    finally:
        poller.close()

    print(format_summary(results, config.tracks))
    if args.dry_run:
        for result in results:
            for posting in result.samples:
                print(
                    f"  {result.company:<18} [{posting.category or '-':<11}] "
                    f"{posting.title[:70]:<70} | {posting.location[:30]} | {posting.url}"
                )
    return 0


if __name__ == "__main__":
    sys.exit(main())
