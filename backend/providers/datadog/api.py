from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backend.config import (
    DATADOG_API_KEY,
    DATADOG_COMPANY_URL,
    DATADOG_PAYLOAD,
    DEFAULT_HEADERS,
    COMPANY_URL_MAPPING,
)
from backend.models import JobPosting
from backend.providers.errors import DatadogAPIError


class DatadogClient:
    def __init__(
        self,
        api_url: str,
        *,
        api_key: str = DATADOG_API_KEY,
        payload: dict[str, Any] | None = None,
        company: str = "Datadog",
        company_url: str = DATADOG_COMPANY_URL,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = DatadogAPIError,
    ) -> None:
        self.api_url = api_url
        self.api_key = api_key
        self.payload = dict(payload or DATADOG_PAYLOAD)
        self.company = company
        self.company_url = company_url
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.error_cls = error_cls

    def search_raw(self) -> dict[str, Any]:
        request_headers = dict(self.headers)
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        request_url = (
            f"{self.api_url}?{urlencode({'x-typesense-api-key': self.api_key})}"
        )
        data = json.dumps(self.payload).encode("utf-8")
        request = Request(
            request_url, data=data, headers=request_headers, method="POST"
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
            raise self.error_cls(f"Datadog API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Datadog API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("Datadog API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("Datadog API returned unexpected JSON shape")

        return decoded

    def search_job_postings(self) -> list[JobPosting]:
        decoded = self.search_raw()
        results = decoded.get("results", [])
        if not isinstance(results, list):
            return []

        postings: list[JobPosting] = []
        seen_urls: set[str] = set()

        for result in results:
            if not isinstance(result, dict):
                continue

            hits = result.get("hits", [])
            if not isinstance(hits, list):
                continue

            for hit in hits:
                if not isinstance(hit, dict):
                    continue

                document = hit.get("document")
                if isinstance(document, dict):
                    item = document
                else:
                    item = hit

                title = self._pick_title(item)
                url = self._pick_url(item)
                location = self._pick_location(item)

                if not title or not url or url in seen_urls:
                    continue

                seen_urls.add(url)
                postings.append(
                    JobPosting(
                        source=self.api_url,
                        title=title,
                        company=self.company,
                        company_url=self.company_url,
                        location=location,
                        url=url,
                    )
                )

        return postings

    def _pick_title(self, item: dict[str, Any]) -> str:
        for key in ("title", "job_title", "name", "position"):
            value = item.get(key)
            if value:
                return str(value)
        return ""

    def _pick_url(self, item: dict[str, Any]) -> str:
        for key in (
            "absolute_url",
            "url",
            "apply_url",
            "job_url",
            "career_url",
            "hosted_url",
        ):
            value = item.get(key)
            if value:
                return str(value)

        slug = item.get("slug") or item.get("job_slug")
        if slug:
            slug_str = str(slug).lstrip("/")
            return f"{self.company_url}/{slug_str}"

        return ""

    def _pick_location(self, item: dict[str, Any]) -> str:
        value = item.get("location")
        if isinstance(value, dict):
            name = value.get("name")
            return str(name) if name else ""
        if isinstance(value, list):
            return ", ".join(str(part) for part in value if part)
        if value:
            return str(value)

        for key in ("office", "city", "region", "country"):
            fallback = item.get(key)
            if fallback:
                return str(fallback)

        return ""
