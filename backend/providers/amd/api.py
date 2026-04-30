from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.config import DEFAULT_HEADERS, COMPANY_URL_MAPPING
from backend.models import JobPosting
from backend.providers.errors import ProviderAPIError


class AMDAPIError(ProviderAPIError):
    pass


class AMDClient:
    def __init__(
        self,
        api_url: str,
        *,
        company: str = "AMD",
        company_url: str = "https://careers.amd.com",
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = AMDAPIError,
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
            raise self.error_cls(f"AMD API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"AMD API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("AMD API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("AMD API returned unexpected JSON shape")

        return decoded

    def search_job_postings(self) -> list[JobPosting]:
        decoded = self.search_raw()

        # Response shape may be {"jobs": [...]} or {"data": {"jobs": [...]}}
        jobs = decoded.get("jobs")
        if jobs is None:
            jobs = decoded.get("data", {}).get("jobs")

        if not isinstance(jobs, list):
            return []

        postings: list[JobPosting] = []
        seen_urls: set[str] = set()

        for entry in jobs:
            if not isinstance(entry, dict):
                continue

            data = entry.get("data") if isinstance(entry.get("data"), dict) else entry
            if not isinstance(data, dict):
                continue

            title = str(data.get("title") or "")
            url = str(data.get("apply_url") or data.get("canonical_url") or "")

            # location fields vary; prefer full_location, else city + country
            location = ""
            if data.get("full_location"):
                location = str(data.get("full_location"))
            else:
                city = data.get("city") or data.get("location_name")
                country = data.get("country")
                if city and country:
                    location = f"{city}, {country}"
                elif city:
                    location = str(city)

            if not title or not url or url in seen_urls:
                continue

            seen_urls.add(url)
            postings.append(
                JobPosting(
                    source=self.api_url,
                    title=title,
                    company=self.company,
                    company_url=self.company_url
                    or COMPANY_URL_MAPPING.get(self.company, ""),
                    location=location,
                    url=url,
                )
            )

        return postings
