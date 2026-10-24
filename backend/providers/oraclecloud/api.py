from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from backend.config import COMPANY_URL_MAPPING, DEFAULT_HEADERS
from backend.models import JobPosting
from backend.providers.errors import OracleCloudAPIError

PAGE_SIZE = 25


class OracleCloudClient:
    def __init__(
        self,
        api_url: str,
        *,
        company: str,
        company_url: str,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = OracleCloudAPIError,
        site_number: str = "CX",
        job_url_template: str = "",
    ) -> None:
        self.api_url = api_url
        self.site_number = site_number
        # Formatted with {id}; defaults to Oracle's hosted candidate site.
        self.job_url_template = job_url_template or (
            api_url.split("/hcmRestApi/")[0]
            + f"/hcmUI/CandidateExperience/en/sites/{site_number}/job/{{id}}"
        )
        self.company = company
        self.company_url = company_url
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.error_cls = error_cls

    def _page_url(self, *, keyword: str, offset: int) -> str:
        finder = f"findReqs;siteNumber={self.site_number},limit={PAGE_SIZE},offset={offset}"
        if keyword:
            finder += f',keyword="{keyword}"'
        base_url = self.api_url.split("?")[0]
        return (
            f"{base_url}?onlyData=true&expand=requisitionList.workLocation"
            f"&finder={quote(finder, safe=';,=')}"
        )

    def search_raw(self, *, keyword: str = "", offset: int = 0) -> dict[str, Any]:
        request_headers = dict(self.headers)
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        request = Request(
            self._page_url(keyword=keyword, offset=offset),
            headers=request_headers,
            method="GET",
        )

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
            raise self.error_cls(f"Oracle Cloud API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Oracle Cloud API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("Oracle Cloud API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("Oracle Cloud API returned unexpected JSON shape")

        return decoded

    def search_job_postings(
        self, *, keyword: str = "", max_jobs: int = 200
    ) -> list[JobPosting]:
        postings: list[JobPosting] = []
        offset = 0
        while offset < max_jobs:
            page, total = self.search_job_postings_page(keyword=keyword, offset=offset)
            postings.extend(page)
            offset += PAGE_SIZE
            if not page or total is None or offset >= total:
                break
        return postings

    def search_job_postings_page(
        self, *, keyword: str = "", offset: int = 0
    ) -> tuple[list[JobPosting], int | None]:
        decoded = self.search_raw(keyword=keyword, offset=offset)
        items = decoded.get("items")
        if not isinstance(items, list):
            return [], None

        total = None
        if items and isinstance(items[0], dict):
            reported = items[0].get("TotalJobsCount")
            total = reported if isinstance(reported, int) else None

        postings: list[JobPosting] = []
        seen_ids: set[str] = set()

        for item in items:
            if not isinstance(item, dict):
                continue

            requisitions = item.get("requisitionList")
            if not isinstance(requisitions, list):
                continue

            for req in requisitions:
                if not isinstance(req, dict):
                    continue

                req_id = str(req.get("Id") or "")
                title = str(req.get("Title") or "")

                # location: prefer PrimaryLocation then PrimaryLocationCountry
                location = str(req.get("PrimaryLocation") or "")
                if not location:
                    location = str(req.get("PrimaryLocationCountry") or "")

                if not title or not req_id or req_id in seen_ids:
                    continue

                seen_ids.add(req_id)

                postings.append(
                    JobPosting(
                        source=self.api_url,
                        title=title,
                        company=self.company,
                        company_url=COMPANY_URL_MAPPING.get(
                            self.company, self.company_url
                        ),
                        location=location,
                        url=self.job_url_template.format(id=req_id),
                    )
                )

        return postings, total
