from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .base import BaseScraper
from src.models import EmploymentType, JobPosting, JobTitle


class WorkdayScraper(BaseScraper):
    """Workday scraper stub.

    For now this returns deterministic fake records for plumbing tests.
    """

    def __init__(self, url: str, company: str = "example", **kwargs: Any):
        super().__init__(url, **kwargs)
        self.company = company

    def scrape(self) -> list[JobPosting]:
        now = datetime.now(timezone.utc).isoformat()
        return [
            JobPosting(
                source="workday",
                company=self.company,
                title=JobTitle.SOFTWARE_ENGINEER,
                employment_type=EmploymentType.FULL_TIME,
                location="Remote",
                url=self.url,
                posted_at=now,
            ),
            JobPosting(
                source="workday",
                company=self.company,
                title=JobTitle.DEVOPS_ENGINEER,
                employment_type=EmploymentType.PART_TIME,
                location="New York, NY",
                url=self.url,
                posted_at=now,
            ),
            JobPosting(
                source="workday",
                company=self.company,
                title=JobTitle.DATA_ANALYST,
                employment_type=EmploymentType.INTERN,
                location="San Francisco, CA",
                url=self.url,
                posted_at=now,
            ),
        ]


# Backwards-compat alias (typo kept for compatibility with earlier imports)
WorkDaySraper = WorkdayScraper
    