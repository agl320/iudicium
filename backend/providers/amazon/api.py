from __future__ import annotations

import json
from urllib.parse import urlencode

from backend.models import JobPosting
from backend.providers.errors import AmazonAPIError
from backend.providers.http import fetch
from backend.services.classifier import normalize_employment_type

API_URL = "https://www.amazon.jobs/en/search.json"
PAGE_SIZE = 100


class AmazonClient:
    """amazon.jobs public search API (newest first)."""

    def __init__(self, *, company: str = "Amazon", company_url: str = "amazon.com"):
        self.company = company
        self.company_url = company_url

    def search_page(
        self, *, query: str = "", offset: int = 0
    ) -> tuple[list[JobPosting], int | None]:
        params = {
            "base_query": query,
            "loc_query": "",
            "result_limit": PAGE_SIZE,
            "offset": offset,
            "sort": "recent",
        }
        body, _ = fetch(
            f"{API_URL}?{urlencode(params)}",
            error_cls=AmazonAPIError,
            headers={"Accept": "application/json"},
        )
        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise AmazonAPIError("Amazon API returned non-JSON response") from exc

        hits = decoded.get("hits")
        postings: list[JobPosting] = []
        for job in decoded.get("jobs") or []:
            if not isinstance(job, dict):
                continue
            title = str(job.get("title") or "")
            path = str(job.get("job_path") or "")
            if not title or not path:
                continue
            employment = (
                "intern" if job.get("is_intern") else job.get("job_schedule_type")
            )
            postings.append(
                JobPosting(
                    source=API_URL,
                    title=title,
                    company=self.company,
                    company_url=self.company_url,
                    location=str(job.get("location") or ""),
                    url=f"https://www.amazon.jobs{path}",
                    employment_type=normalize_employment_type(employment),
                )
            )
        return postings, hits if isinstance(hits, int) else None
