from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.config import COMPANY_URL_MAPPING, DEFAULT_HEADERS, MICROSOFT_COMPANY_URL
from backend.models import JobPosting
from backend.providers.errors import MicrosoftAPIError


class MicrosoftClient:
    def __init__(
        self,
        api_url: str,
        *,
        company: str = "Microsoft",
        company_url: str = MICROSOFT_COMPANY_URL,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = MicrosoftAPIError,
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
            raise self.error_cls(f"Microsoft API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Microsoft API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("Microsoft API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("Microsoft API returned unexpected JSON shape")

        status = decoded.get("status")
        error = decoded.get("error")
        if status not in (200, "200"):
            raise self.error_cls(f"Microsoft API request failed: status={status!r}")
        if isinstance(error, dict):
            message = str(error.get("message") or "")
            body = str(error.get("body") or "")
            if message or body:
                detail = message or body
                raise self.error_cls(f"Microsoft API request failed: {detail}")

        return decoded

    def search_job_postings(self) -> list[JobPosting]:
        decoded = self.search_raw()
        data = decoded.get("data")
        if not isinstance(data, dict):
            return []

        positions = data.get("positions")
        if not isinstance(positions, list):
            return []

        postings: list[JobPosting] = []
        seen_urls: set[str] = set()

        for item in positions:
            if not isinstance(item, dict):
                continue

            title = str(item.get("name") or "")
            position_id = item.get("id")
            if position_id is None:
                continue

            url = f"https://apply.careers.microsoft.com/careers?pid={position_id}"

            location = ""
            locations = item.get("locations")
            if isinstance(locations, list):
                location_parts = [str(part).strip() for part in locations if part]
                location = " | ".join(part for part in location_parts if part)

            if not location:
                standardized_locations = item.get("standardizedLocations")
                if isinstance(standardized_locations, list):
                    location_parts = [
                        str(part).strip() for part in standardized_locations if part
                    ]
                    location = " | ".join(part for part in location_parts if part)

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
                )
            )

        return postings
