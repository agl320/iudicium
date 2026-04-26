from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.providers.errors import DeloitteAPIError
from backend.config import DELOITTE_API_URL, DELOITTE_PAYLOAD, DEFAULT_HEADERS


class DeloitteAPIClient:
    def __init__(
        self,
        api_url: str = DELOITTE_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        error_cls: type[RuntimeError] = DeloitteAPIError,
    ) -> None:
        self.api_url = api_url
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.payload = dict(payload or DELOITTE_PAYLOAD)
        self.error_cls = error_cls

    def search_raw(
        self,
        *,
        locale: str | None = None,
        page_number: int | None = None,
        sort_by: str | None = None,
        keywords: str | None = None,
        location: str | None = None,
        facet_filters: dict[str, Any] | None = None,
        brand: str | None = None,
        skills: list[Any] | None = None,
        category_id: int | None = None,
        alert_id: str | None = None,
        rcm_candidate_id: str | None = None,
    ) -> dict[str, Any]:
        payload = dict(self.payload)

        if locale is not None:
            payload["locale"] = locale
        if page_number is not None:
            payload["pageNumber"] = page_number
        if sort_by is not None:
            payload["sortBy"] = sort_by
        if keywords is not None:
            payload["keywords"] = keywords
        if location is not None:
            payload["location"] = location
        if facet_filters is not None:
            payload["facetFilters"] = facet_filters
        if brand is not None:
            payload["brand"] = brand
        if skills is not None:
            payload["skills"] = skills
        if category_id is not None:
            payload["categoryId"] = category_id
        if alert_id is not None:
            payload["alertId"] = alert_id
        if rcm_candidate_id is not None:
            payload["rcmCandidateId"] = rcm_candidate_id

        request_headers = dict(self.headers)
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        data = json.dumps(payload).encode("utf-8")
        request = Request(
            self.api_url, data=data, headers=request_headers, method="POST"
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
            raise self.error_cls(f"Deloitte API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Deloitte API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("Deloitte API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("Deloitte API returned unexpected JSON shape")

        return decoded
