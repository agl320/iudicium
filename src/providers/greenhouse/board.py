from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from src.providers.errors import GreenhouseAPIError
from src.models import JobPosting


class GreenhouseBoardClient:
    def __init__(
        self,
        api_url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout_s: float = 30.0,
        error_cls: type[RuntimeError] = GreenhouseAPIError,
    ) -> None:
        self.api_url = api_url
        self.headers = dict(headers or {})
        self.params = dict(params or {})
        self.timeout_s = timeout_s
        self.error_cls = error_cls

    def search_raw(
        self,
        *,
        page: int | None = 1,
        per_page: int | None = 20,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        request_params = dict(self.params)
        if page is not None:
            request_params["page"] = page
        if per_page is not None:
            request_params["per_page"] = per_page
        if params:
            request_params.update({k: v for k, v in params.items() if v is not None})

        request_headers = dict(self.headers)
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        request_url = self.api_url
        if request_params:
            request_url = f"{request_url}?{urlencode(request_params)}"

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
            raise self.error_cls(f"Greenhouse API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Greenhouse API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls(
                f"Greenhouse API request failed: Invalid JSON response: {exc}"
            ) from exc

        if not isinstance(decoded, dict):
            raise self.error_cls(
                "Greenhouse API request failed: Expected JSON object in response"
            )

        return decoded

    def search_job_postings(
        self,
        *,
        page: int | None = 1,
        per_page: int | None = 20,
        params: dict[str, Any] | None = None,
    ) -> list[JobPosting]:
        decoded = self.search_raw(page=page, per_page=per_page, params=params)
        jobs = decoded.get("jobs")
        if not isinstance(jobs, list):
            return []

        results: list[JobPosting] = []
        for job in jobs:
            if not isinstance(job, dict):
                continue

            title = job.get("title")
            title_str = str(title) if title is not None else ""

            company_name = job.get("company_name")
            if isinstance(company_name, dict):
                company_str = str(company_name.get("name") or "")
            else:
                company_str = str(company_name) if company_name is not None else ""

            location = job.get("location")
            if isinstance(location, dict):
                location_str = str(location.get("name") or "")
            else:
                location_str = str(location) if location is not None else ""

            absolute_url = job.get("absolute_url")
            url_str = str(absolute_url) if absolute_url is not None else ""

            results.append(
                JobPosting(
                    source=self.api_url,
                    title=title_str,
                    company=company_str,
                    location=location_str,
                    url=url_str,
                )
            )

        return results
