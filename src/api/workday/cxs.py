from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from src.api.errors import WorkdayAPIError


class WorkdayCxsClient:
    """Generic Workday Careers (CXS) JSON API client.

    This is intentionally minimal: it POSTs a JSON payload to the configured CXS
    endpoint and returns the decoded JSON object.
    """

    def __init__(
        self,
        api_url: str,
        *,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        timeout_s: float = 30.0,
        error_cls: type[RuntimeError] = WorkdayAPIError,
    ) -> None:
        self.api_url = api_url
        self.headers = dict(headers or {})
        self.payload = dict(payload or {})
        self.timeout_s = timeout_s
        self.error_cls = error_cls

    def search_raw(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        search_text: str | None = None,
        applied_facets: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = dict(self.payload)
        if limit is not None:
            payload["limit"] = limit
        if offset is not None:
            payload["offset"] = offset
        if search_text is not None:
            payload["searchText"] = search_text

        if applied_facets is not None:
            base_facets: dict[str, Any] = {}
            existing_facets = payload.get("appliedFacets")
            if isinstance(existing_facets, dict):
                base_facets.update(existing_facets)
            base_facets.update(applied_facets)
            payload["appliedFacets"] = base_facets

        request_headers = dict(self.headers)
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        data = json.dumps(payload).encode("utf-8")
        request = Request(self.api_url, data=data, headers=request_headers, method="POST")

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
                detail = f"{detail}\nResponse body:\n{error_body}"
            raise self.error_cls(f"Workday API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Workday API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("Workday API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("Workday API returned unexpected JSON shape")
        return decoded
