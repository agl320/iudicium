from __future__ import annotations

import html
import re
from urllib.parse import urlencode

from backend.models import JobPosting
from backend.providers.errors import GoogleCareersAPIError
from backend.providers.http import fetch

BASE_URL = "https://www.google.com/about/careers/applications/"
PAGE_SIZE = 20

# Each result card ends with a "Learn more" link carrying the id, slug and title.
_CARD_LINK = re.compile(
    r'href="jobs/results/(\d+)-([^"?]+)[^"]*"\s+aria-label="Learn more about ([^"]+)"'
)
_LOCATION = re.compile(r'<span class="r0wTof[^"]*">([^<]+)</span>')


class GoogleCareersClient:
    """Parses Google Careers search result pages (there is no public API)."""

    def __init__(self, *, company: str = "Google", company_url: str = "google.com"):
        self.company = company
        self.company_url = company_url

    def search_page(self, *, query: str = "", page: int = 1) -> list[JobPosting]:
        params = {"q": query, "sort_by": "date", "page": page}
        body, _ = fetch(
            f"{BASE_URL}jobs/results?{urlencode(params)}",
            error_cls=GoogleCareersAPIError,
        )

        postings: list[JobPosting] = []
        previous_end = 0
        for match in _CARD_LINK.finditer(body):
            card = body[previous_end : match.start()]
            previous_end = match.end()
            job_id, slug, title = match.groups()
            locations = [
                html.unescape(loc).strip(" ;") for loc in _LOCATION.findall(card)
            ]
            postings.append(
                JobPosting(
                    source=f"{BASE_URL}jobs/results",
                    title=html.unescape(title),
                    company=self.company,
                    company_url=self.company_url,
                    location="; ".join(loc for loc in locations if loc),
                    url=f"{BASE_URL}jobs/results/{job_id}-{slug}",
                )
            )
        return postings
