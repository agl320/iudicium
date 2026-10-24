from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backend.config import COMPANY_URL_MAPPING, DEFAULT_HEADERS
from backend.models import JobPosting
from backend.providers.errors import SmartRecruitersAPIError
from backend.services.classifier import normalize_employment_type

PAGE_SIZE = 100


class SmartRecruitersClient:
    def __init__(
        self,
        api_url: str,
        *,
        company: str,
        company_url: str,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = SmartRecruitersAPIError,
    ) -> None:
        self.api_url = api_url
        self.company = company
        self.company_url = company_url
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.error_cls = error_cls

    def search_raw(self, *, offset: int = 0, limit: int = PAGE_SIZE) -> dict[str, Any]:
        request_headers = dict(self.headers)
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        request_url = f"{self.api_url}?{urlencode({'offset': offset, 'limit': limit})}"
        request = Request(request_url, headers=request_headers, method="GET")

        try:
            with urlopen(request, timeout=self.timeout_s) as response:
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = ""
            try:
                error_body = exc.read().decode("utf-8", errors="replace")
            except Exception:
                error_body = ""
            detail = f"HTTP {exc.code} {exc.reason}"
            if error_body:
                detail += f": {error_body}"
            raise self.error_cls(
                f"SmartRecruiters API request failed: {detail}"
            ) from exc
        except URLError as exc:
            raise self.error_cls(f"SmartRecruiters API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls(
                "SmartRecruiters API returned non-JSON response"
            ) from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("SmartRecruiters API returned unexpected JSON shape")

        return decoded

    def search_job_postings(self, *, max_jobs: int = 1000) -> list[JobPosting]:
        postings: list[JobPosting] = []
        offset = 0
        while offset < max_jobs:
            page, total = self.search_job_postings_page(offset=offset)
            postings.extend(page)
            offset += PAGE_SIZE
            if not page or total is None or offset >= total:
                break
        return postings

    def search_job_postings_page(
        self, *, offset: int = 0
    ) -> tuple[list[JobPosting], int | None]:
        decoded = self.search_raw(offset=offset)
        total = decoded.get("totalFound")
        total = total if isinstance(total, int) else None
        content = decoded.get("content")
        if not isinstance(content, list):
            return [], total

        postings: list[JobPosting] = []
        seen_urls: set[str] = set()

        for item in content:
            if not isinstance(item, dict):
                continue

            title = str(item.get("name") or "")
            # "ref" is the API resource; link to the public posting instead.
            company_info = item.get("company")
            identifier = (
                company_info.get("identifier")
                if isinstance(company_info, dict)
                else None
            )
            posting_id = item.get("id")
            url = (
                f"https://jobs.smartrecruiters.com/{identifier}/{posting_id}"
                if identifier and posting_id
                else str(item.get("ref") or "")
            )
            employment = item.get("typeOfEmployment")
            employment_label = (
                employment.get("label") or employment.get("id")
                if isinstance(employment, dict)
                else None
            )

            location_value = item.get("location")
            location = ""
            if isinstance(location_value, dict):
                location = str(location_value.get("fullLocation") or "")
                if not location:
                    city = location_value.get("city")
                    region = location_value.get("region")
                    country = location_value.get("country")
                    parts = [str(part) for part in (city, region, country) if part]
                    location = ", ".join(parts)
            elif location_value is not None:
                location = str(location_value)

            if not title or not url or url in seen_urls:
                continue

            seen_urls.add(url)
            postings.append(
                JobPosting(
                    source=self.api_url,
                    title=title,
                    company=self.company,
                    company_url=COMPANY_URL_MAPPING.get(self.company, self.company_url),
                    location=location,
                    url=url,
                    employment_type=normalize_employment_type(employment_label),
                )
            )

        return postings, total
