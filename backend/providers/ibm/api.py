from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.config import (
    COMPANY_URL_MAPPING,
    DEFAULT_HEADERS,
    IBM_COMPANY_URL,
    IBM_PAYLOAD,
)
from backend.models import JobPosting
from backend.providers.errors import IBMAPIError


class IBMClient:
    def __init__(
        self,
        api_url: str,
        *,
        company: str = "IBM",
        company_url: str = IBM_COMPANY_URL,
        payload: dict[str, Any] | None = None,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = IBMAPIError,
    ) -> None:
        self.api_url = api_url
        self.company = company
        self.company_url = company_url
        self.payload = dict(payload or IBM_PAYLOAD)
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.error_cls = error_cls

    def search_raw(self) -> dict[str, Any]:
        request_headers = dict(self.headers)
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        request = Request(
            self.api_url,
            data=json.dumps(self.payload).encode("utf-8"),
            headers=request_headers,
            method="POST",
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
            raise self.error_cls(f"IBM API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"IBM API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("IBM API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("IBM API returned unexpected JSON shape")

        return decoded

    def search_job_postings(self) -> list[JobPosting]:
        decoded = self.search_raw()
        hits = decoded.get("hits", {})
        if not isinstance(hits, dict):
            return []

        items = hits.get("hits", [])
        if not isinstance(items, list):
            return []

        postings: list[JobPosting] = []
        seen_urls: set[str] = set()

        for item in items:
            if not isinstance(item, dict):
                continue

            source = item.get("_source")
            if not isinstance(source, dict):
                continue

            title = str(source.get("title") or "")
            url = str(source.get("url") or "")
            location = str(source.get("field_keyword_17") or "")

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
