from __future__ import annotations

from typing import Any

from src.models import JobPosting


class BaseScraper:
    def __init__(self, url: str, **kwargs: Any):
        self.url = url
        self.kwargs = kwargs

    def scrape(self) -> list[JobPosting]:
        return []