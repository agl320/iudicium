from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.config import DATABRICKS_COMPANY_URL, DEFAULT_HEADERS
from backend.models import JobPosting
from backend.providers.errors import DatabricksAPIError


class DatabricksClient:
    def __init__(
        self,
        api_url: str,
        *,
        company: str = "Databricks",
        company_url: str = DATABRICKS_COMPANY_URL,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = DatabricksAPIError,
    ) -> None:
        self.api_url = api_url
        self.company = company
        self.company_url = company_url
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.error_cls = error_cls

    def search_raw(self) -> dict[str, Any]:
        request_headers = dict(self.headers)
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        request = Request(self.api_url, headers=request_headers, method="GET")

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
            raise self.error_cls(f"Databricks API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Databricks API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("Databricks API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("Databricks API returned unexpected JSON shape")

        return decoded

    def search_job_postings(self) -> list[JobPosting]:
        decoded = self.search_raw()

        nodes = (
            decoded.get("result", {})
            .get("pageContext", {})
            .get("data", {})
            .get("allGreenhouseDepartment", {})
            .get("nodes", [])
        )
        if not isinstance(nodes, list):
            return []

        postings: list[JobPosting] = []
        seen_urls: set[str] = set()

        for node in nodes:
            if not isinstance(node, dict):
                continue

            jobs = node.get("jobs", [])
            if not isinstance(jobs, list):
                continue

            for job in jobs:
                if not isinstance(job, dict):
                    continue

                title = str(job.get("title") or "")
                url = str(job.get("absolute_url") or "")

                location = ""
                location_value = job.get("location")
                if isinstance(location_value, dict):
                    location = str(location_value.get("name") or "")
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
                        location=location,
                        url=url,
                    )
                )

        return postings
