from __future__ import annotations

import json
import re
from urllib.parse import urlencode

from backend.models import JobPosting
from backend.providers.errors import SAPCareersAPIError
from backend.providers.http import fetch
from backend.services.classifier import normalize_employment_type

BASE_URL = "https://jobs.sap.com"

# The (Next.js) search page embeds result objects in its server payload:
# {"id":"744000...","title":"...","url":"/en/jobs/...",...,"contractType":"Full-time"}
_JOB = re.compile(r'\{"id":"\d+","title":"[^{}]*?"contractType":"[^"]*"\}')


class SAPCareersClient:
    """jobs.sap.com search. Returns the first page (~25 results) per query."""

    def __init__(self, *, company: str = "SAP", company_url: str = "sap.com"):
        self.company = company
        self.company_url = company_url

    def search(self, *, query: str = "") -> list[JobPosting]:
        body, _ = fetch(
            f"{BASE_URL}/search/?{urlencode({'q': query})}",
            error_cls=SAPCareersAPIError,
        )
        payload = body.replace('\\"', '"')

        postings: list[JobPosting] = []
        for raw in _JOB.findall(payload):
            try:
                job = json.loads(raw)
            except json.JSONDecodeError:
                continue
            title = str(job.get("title") or "").strip()
            path = str(job.get("url") or "")
            if not title or not path:
                continue
            postings.append(
                JobPosting(
                    source=f"{BASE_URL}/search/",
                    title=title,
                    company=self.company,
                    company_url=self.company_url,
                    location=str(job.get("locations") or ""),
                    url=f"{BASE_URL}{path}",
                    employment_type=normalize_employment_type(job.get("contractType")),
                )
            )
        return postings
