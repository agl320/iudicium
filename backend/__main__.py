from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time

from dotenv import load_dotenv

from backend.config.loader import Company, load_config
from backend.services.poller import Poller, format_plan, format_summary

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
    parser.add_argument(
        "--local",
        action="store_true",
        help="Poll the local_only companies (boards that block GitHub's runners, "
        "e.g. Tesla). Run this on your own machine; it adds to the shared database.",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="With --dry-run: list every posting that matches a track, not just 5.",
    )
    parser.add_argument(
        "--every",
        type=float,
        metavar="MINUTES",
        help="Keep polling every MINUTES (Ctrl+C to stop) instead of once.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config(args.config)

    if args.list:
        for track in config.tracks:
            print(f"track  {track.key:<12} {track.color_hex}  {track.label}")
        for company in config.companies:
            state = ("loc" if company.local_only else "on ") if company.enabled else "off"
            print(f"[{state}] {company.name:<20} {company.provider}")
        return 0

    companies = select_companies(config, args)
    if companies is None:
        return 2

    while True:
        started = time.monotonic()
        poller = Poller(config, dry_run=args.dry_run, sample_size=None if args.show else 5)
        try:
            results = asyncio.run(poller.run(companies))
        finally:
            poller.close()
        report(results, config, args)
        if not args.every:
            return 0
        wait = max(60.0, args.every * 60 - (time.monotonic() - started))
        print(f"\nNext poll in {wait / 60:.0f} min (Ctrl+C to stop).", flush=True)
        time.sleep(wait)


def select_companies(config, args) -> list[Company] | None:
    """--company: exactly those (any state). --local: the local_only ones.
    --all: everything. Default (the scheduled run): enabled, not local_only."""
    if args.company:
        wanted = {name.lower() for name in args.company}
        companies = [c for c in config.companies if c.name.lower() in wanted]
        missing = wanted - {c.name.lower() for c in companies}
        if missing:
            print(f"Unknown company: {', '.join(sorted(missing))}", file=sys.stderr)
            return None
        return companies
    if args.all:
        return list(config.companies)
    if args.local:
        companies = [c for c in config.enabled_companies if c.local_only]
        if not companies:
            print("No company has local_only = true in companies.toml.", file=sys.stderr)
            return None
        return companies
    return [c for c in config.enabled_companies if not c.local_only]


def report(results, config, args) -> None:
    print(format_summary(results, config.tracks))
    if not args.dry_run:
        return
    print("\nHow each board was queried:")
    print(format_plan(results))
    print()
    for result in results:
        for posting in sorted(result.samples, key=lambda p: (p.category or "", p.title)):
            print(
                f"  {result.company:<18} [{posting.category or '-':<11}] "
                f"{posting.title[:70]:<70} | {posting.location[:30]} | {posting.url}"
            )

if __name__ == "__main__":
    sys.exit(main())
