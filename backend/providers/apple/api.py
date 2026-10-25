from __future__ import annotations

import json

from backend.models import JobPosting
from backend.providers.errors import AppleAPIError
from backend.providers.http import fetch

BASE_URL = "https://jobs.apple.com"
PAGE_SIZE = 20


class AppleClient:
    """jobs.apple.com search API. Needs a CSRF token + cookie, which the site
    hands out to anyone from /api/v1/CSRFToken."""

    def __init__(self, *, company: str = "Apple", company_url: str = "apple.com"):
        self.company = company
        self.company_url = company_url
        self._session_headers: dict[str, str] | None = None

    def _session(self) -> dict[str, str]:
        if self._session_headers is None:
            _, headers = fetch(f"{BASE_URL}/api/v1/CSRFToken", error_cls=AppleAPIError)
            token = headers.get("X-Apple-CSRF-Token")
            if not token:
                raise AppleAPIError("Apple did not return a CSRF token")
            cookie = (headers.get("Set-Cookie") or "").split(";")[0]
            self._session_headers = {"X-Apple-CSRF-Token": token, "Cookie": cookie}
        return self._session_headers

    def search_page(
        self, *, query: str = "", page: int = 1
    ) -> tuple[list[JobPosting], int | None]:
        payload = {
            "query": query,
            "filters": {},
            "page": page,
            "locale": "en-us",
            "sort": "newest",
            # Apple returns no results without a format block.
            "format": {"longDate": "MMMM D, YYYY", "mediumDate": "MMM D, YYYY"},
        }
        body, _ = fetch(
            f"{BASE_URL}/api/v1/search",
            error_cls=AppleAPIError,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                **self._session(),
            },
        )
        try:
            result = json.loads(body).get("res") or {}
        except (json.JSONDecodeError, AttributeError) as exc:
            raise AppleAPIError("Apple API returned unexpected response") from exc

        postings: list[JobPosting] = []
        for job in result.get("searchResults") or []:
            if not isinstance(job, dict):
                continue
            title = str(job.get("postingTitle") or "")
            position_id = job.get("positionId")
            slug = job.get("transformedPostingTitle") or ""
            if not title or not position_id:
                continue
            locations = job.get("locations") or []
            location = " | ".join(
                str(loc.get("name") or "") for loc in locations if isinstance(loc, dict)
            )
            postings.append(
                JobPosting(
                    source=f"{BASE_URL}/api/v1/search",
                    title=title,
                    company=self.company,
                    company_url=self.company_url,
                    location=location,
                    url=f"{BASE_URL}/en-us/details/{position_id}/{slug}",
                )
            )
        total = result.get("totalRecords")
        return postings, total if isinstance(total, int) else None
