from __future__ import annotations

import asyncio
import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from time import monotonic

from backend.config.loader import AppConfig, Company, Track
from backend.models import JobPosting
from backend.services.classifier import (
    categorize,
    classify,
    match_track,
    rules_fingerprint,
)
from backend.services.details import enrich
from backend.services.discord import send_discord_notification
from backend.services.job_store import JobPostingStore
from backend.services.sources import fetch_company
from backend.services.throttle import (
    RequestLog,
    configure as configure_throttle,
    current_log,
    install_request_counter,
)

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
    requests: int = 0
    retries: int = 0  # request-level retries (429/5xx/timeouts) inside this run
    notes: list[str] = field(default_factory=list)  # how the board was queried
    attempts: int = 1  # 2 = failed once, retried at the end of the run


# Errors worth trying again later in the same run (rate limits, server or
# network trouble). 403 and other 4xx are left alone: retrying soon won't help.
TEMPORARY_ERROR = re.compile(
    r"\b(429|500|502|503|504|408)\b|too many requests|timed? ?out|timeout|temporar|"
    r"connection (reset|refused|aborted)|server disconnected|cannot connect|eof occurred",
    re.IGNORECASE,
)


def is_temporary(error: str) -> bool:
    return bool(error) and bool(TEMPORARY_ERROR.search(error))


class Poller:
    """Polls every enabled company once, stores matching postings and sends
    Discord notifications for the new ones."""

    def __init__(
        self, config: AppConfig, *, dry_run: bool = False, sample_size: int | None = 5
    ) -> None:
        self.config = config
        self.settings = config.settings
        self.tracks = config.tracks
        self.dry_run = dry_run
        self.sample_size = sample_size  # postings kept for the dry-run listing (None = all)
        self.store = None if dry_run else JobPostingStore()
        install_request_counter()
        configure_throttle(self.settings.per_host_concurrency, self.settings.per_host_interval_seconds)

    def _track(self, key: str) -> Track | None:
        return self.config.track(key)

    async def _run_company(
        self, company: Company, semaphore: asyncio.Semaphore
    ) -> CompanyResult:
        result = CompanyResult(company=company.name)
        start = monotonic()
        log = RequestLog()
        current_log.set(log)  # this task's context only (and threads it starts)
        async with semaphore:
            try:
                postings = await fetch_company(company, self.tracks, self.settings)
            except Exception as exc:  # one broken board must not stop the run
                logger.warning("%s failed: %s", company.name, exc)
                result.error = str(exc)[:200] or exc.__class__.__name__
                result.seconds = monotonic() - start
                self._record_requests(result, log)
                return result

            result.fetched = len(postings)
            if not self.settings.store_uncategorized:
                # Track filters (location, salary, stricter titles) are ignored
                # here: postings that fail them are still stored uncategorized
                # and show up unfiltered, just not in the track.
                postings = [p for p in postings if match_track(p, self.tracks)]
            # Unique postings only, so repeated hits across queries are neither
            # double counted nor fetched twice.
            postings = JobPostingStore._unique_postings(postings)
            if self.store is not None:
                postings = self.store.apply_cached_details(postings)
            postings = await enrich(company, postings, self.tracks, self.settings)

        unique = categorize(postings, self.tracks)
        result.by_category = Counter(p.category or "-" for p in unique)
        result.samples = unique[: self.sample_size]

        if self.store is not None:
            self._store_and_queue(company, unique, result)

        result.seconds = monotonic() - start
        self._record_requests(result, log)
        return result

    @staticmethod
    def _record_requests(result: CompanyResult, log: RequestLog) -> None:
        result.requests, result.retries, result.notes = log.count, log.retries, list(log.notes)

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

        def classify_row(posting: JobPosting) -> str:
            return classify(posting, self.tracks)

        updated = self.store.backfill_categories(
            classify_row, rules_fingerprint(self.tracks)
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
        results = list(
            await asyncio.gather(*(self._run_company(company, semaphore) for company in targets))
        )

        # Second chance for boards that failed with a temporary error: after a
        # pause, one at a time, so the host's rate limit has time to reset.
        retry = [i for i, r in enumerate(results) if is_temporary(r.error)]
        if retry and self.settings.retry_failed:
            logger.info(
                "Retrying %d board(s) in %.0fs: %s",
                len(retry),
                self.settings.retry_delay_seconds,
                ", ".join(results[i].company for i in retry),
            )
            await asyncio.sleep(self.settings.retry_delay_seconds)
            one_at_a_time = asyncio.Semaphore(1)
            by_name = {c.name: c for c in targets}
            for i in retry:
                first = results[i]
                again = await self._run_company(by_name[first.company], one_at_a_time)
                again.attempts = 2
                again.requests += first.requests
                again.retries += first.retries
                if again.error:
                    again.error = f"{again.error} (also failed on retry)"
                results[i] = again


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
    header += f" {'new':>5} {'notify':>6} {'seeded':>6} {'secs':>6} {'reqs':>6}  error"
    lines = [header, "-" * len(header)]
    for r in sorted(results, key=lambda r: r.company.lower()):
        counts = " ".join(f"{r.by_category.get(k, 0):>11}" for k in keys)
        reqs = f"{r.requests}" + (f"+{r.retries}" if r.retries else "")
        # Error pages are HTML: keep only the status line.
        error = r.error.split(": <", 1)[0].split(":\n", 1)[0]
        if r.attempts > 1 and not r.error:
            error = "ok on retry"
        lines.append(
            f"{r.company[:20]:<20} {r.fetched:>7} {counts} {r.new:>5} "
            f"{len(r.to_notify):>6} {r.seeded:>6} {r.seconds:>6.1f} {reqs:>6}  {error}"
        )
    return "\n".join(lines)


def format_plan(results: list[CompanyResult]) -> str:
    """How each board was queried and what it cost (dry-run report)."""
    lines = []
    for r in sorted(results, key=lambda r: r.company.lower()):
        cost = f"{r.requests} request(s)" + (f", {r.retries} retried" if r.retries else "")
        kept = f"{sum(r.by_category.values())} in a track of {r.fetched} fetched"
        lines.append(f"{r.company}: {cost}; {kept}")
        lines.extend(f"    {n}" for n in r.notes)
    return "\n".join(lines)
