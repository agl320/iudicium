from __future__ import annotations

import asyncio
import logging
from collections import Counter
from dataclasses import dataclass, field
from time import monotonic

from backend.config.loader import AppConfig, Company, Track
from backend.models import JobPosting
from backend.services.classifier import categorize, classify, rules_fingerprint
from backend.services.discord import send_discord_notification
from backend.services.job_store import JobPostingStore
from backend.services.sources import fetch_company

logger = logging.getLogger(__name__)

DISCORD_DELAY_SECONDS = 0.5


@dataclass
class CompanyResult:
    company: str
    fetched: int = 0
    by_category: Counter[str] = field(default_factory=Counter)
    new: int = 0
    to_notify: list[JobPosting] = field(default_factory=list)
    seeded: int = 0
    error: str = ""
    seconds: float = 0.0
    samples: list[JobPosting] = field(default_factory=list)


class Poller:
    """Polls every enabled company once, stores matching postings and sends
    Discord notifications for the new ones."""

    def __init__(self, config: AppConfig, *, dry_run: bool = False) -> None:
        self.config = config
        self.settings = config.settings
        self.tracks = config.tracks
        self.dry_run = dry_run
        self.store = None if dry_run else JobPostingStore()

    def _track(self, key: str) -> Track | None:
        return self.config.track(key)

    async def _run_company(
        self, company: Company, semaphore: asyncio.Semaphore
    ) -> CompanyResult:
        result = CompanyResult(company=company.name)
        start = monotonic()
        async with semaphore:
            try:
                postings = await fetch_company(company, self.tracks, self.settings)
            except Exception as exc:  # one broken board must not stop the run
                logger.warning("%s failed: %s", company.name, exc)
                result.error = str(exc)[:200] or exc.__class__.__name__
                result.seconds = monotonic() - start
                return result

        postings = categorize(postings, self.tracks)
        result.fetched = len(postings)
        if not self.settings.store_uncategorized:
            postings = [p for p in postings if p.category]
        # Count unique postings so repeated hits across queries are not
        # double counted.
        unique = JobPostingStore._unique_postings(postings)
        result.by_category = Counter(p.category or "-" for p in unique)
        result.samples = unique[:5]

        if self.store is not None:
            self._store_and_queue(company, unique, result)

        result.seconds = monotonic() - start
        return result

    def _store_and_queue(
        self, company: Company, postings: list[JobPosting], result: CompanyResult
    ) -> None:
        assert self.store is not None
        known_categories = self.store.get_known_categories(company.name)
        new_postings = self.store.upsert_postings(postings)
        result.new = len(new_postings)
        reposts = self.store.find_reposts(new_postings)

        for posting in new_postings:
            if not posting.category:
                continue
            if self.settings.seed_silently and posting.category not in known_categories:
                result.seeded += 1
                continue
            entry_hash = JobPostingStore.build_entry_hash(
                company=posting.company, title=posting.title, url=posting.url
            )
            if entry_hash in reposts:
                continue
            result.to_notify.append(posting)

        cap = self.settings.max_notifications_per_company
        if len(result.to_notify) > cap:
            logger.warning(
                "%s: %d new postings, only notifying the first %d",
                company.name,
                len(result.to_notify),
                cap,
            )
            result.to_notify = result.to_notify[:cap]

    def backfill(self) -> None:
        if self.store is None:
            return

        def classify_title(title: str) -> str:
            posting = JobPosting(
                source="", title=title, company="", company_url="", location="", url=""
            )
            return classify(posting, self.tracks)

        updated = self.store.backfill_categories(
            classify_title, rules_fingerprint(self.tracks)
        )
        if updated:
            logger.info("Updated categories for %d existing postings", updated)

    async def notify(self, postings: list[JobPosting]) -> int:
        sent = 0
        for posting in postings:
            track = self._track(posting.category)
            if track is None:
                continue
            if await asyncio.to_thread(send_discord_notification, posting, track):
                sent += 1
            await asyncio.sleep(DISCORD_DELAY_SECONDS)
        return sent

    async def run(self, companies: list[Company] | None = None) -> list[CompanyResult]:
        targets = companies if companies is not None else list(self.config.enabled_companies)
        self.backfill()

        semaphore = asyncio.Semaphore(max(1, self.settings.concurrency))
        results = await asyncio.gather(
            *(self._run_company(company, semaphore) for company in targets)
        )

        if not self.dry_run:
            pending = [p for result in results for p in result.to_notify]
            sent = await self.notify(pending)
            logger.info("Sent %d/%d Discord notifications", sent, len(pending))

        return list(results)

    def close(self) -> None:
        if self.store is not None:
            self.store.close()


def format_summary(results: list[CompanyResult], tracks: tuple[Track, ...]) -> str:
    keys = [track.key for track in tracks]
    header = f"{'company':<20} {'fetched':>7} " + " ".join(f"{k:>11}" for k in keys)
    header += f" {'new':>5} {'notify':>6} {'seeded':>6} {'secs':>6}  error"
    lines = [header, "-" * len(header)]
    for r in sorted(results, key=lambda r: r.company.lower()):
        counts = " ".join(f"{r.by_category.get(k, 0):>11}" for k in keys)
        lines.append(
            f"{r.company[:20]:<20} {r.fetched:>7} {counts} {r.new:>5} "
            f"{len(r.to_notify):>6} {r.seeded:>6} {r.seconds:>6.1f}  {r.error}"
        )
    return "\n".join(lines)
