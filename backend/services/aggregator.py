from __future__ import annotations

from typing import Any, Iterable

from src.models import JobPosting


class Aggregator:
    def __init__(self, scrapers: Iterable[Any] | None = None):
        self.scrapers: list[Any] = list(scrapers or [])

    def add_scraper(self, scraper: Any) -> None:
        self.scrapers.append(scraper)

    def run(self) -> list[JobPosting]:
        results: list[JobPosting] = []
        for scraper in self.scrapers:
            scraped = scraper.scrape()
            if scraped:
                results.extend(scraped)
        return results


def run_test() -> list[JobPosting]:
    return []