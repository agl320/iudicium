from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .base import BaseScraper


class WorkdayScraper(BaseScraper):
    """Workday scraper stub.

    For now this returns deterministic fake records for plumbing tests.
    """

    def __init__(self, url: str, company: str = "example", **kwargs: Any):
        super().__init__(url, **kwargs)
        self.company = company

    def scrape(self) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        return [
            {
                "source": "workday",
                "company": self.company,
                "title": "Software Engineer (Stub)",
                "location": "Remote",
                "url": self.url,
                "posted_at": now,
            },
            {
                "source": "workday",
                "company": self.company,
                "title": "Data Analyst (Stub)",
                "location": "New York, NY",
                "url": self.url,
                "posted_at": now,
            },
        ]


# Backwards-compat alias (typo kept for compatibility with earlier imports)
WorkDaySraper = WorkdayScraper
    