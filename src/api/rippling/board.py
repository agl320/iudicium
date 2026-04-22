import json
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from src.api.errors import RipplingAPIError


class RipplingBoardClient:
    def __init__(
        self,
        api_url: str,
        *,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        timeout_s: float = 30.0,
        error_cls: type[RuntimeError] = RipplingAPIError,
    ) -> None:
        self.api_url = api_url
        self.headers = dict(headers or {})
        self.payload = dict(payload or {})
        self.timeout_s = timeout_s
        self.error_cls = error_cls

    def search_raw(
        self,
        *,
        page: int | None = None,
        page_size: int | None = None,
        search_query: str | None = None,
        city: str | None = None,
        state: str | None = None,
        country: str | None = None,
        workplace_type: str | None = None,
    ) -> dict[str, Any]:
        payload = dict(self.payload)
        if page is not None:
            payload["page"] = page
        if page_size is not None:
            payload["pageSize"] = page_size
        if search_query is not None:
            payload["searchQuery"] = search_query
        if city is not None:
            payload["city"] = city
        if state is not None:
            payload["state"] = state
        if country is not None:
            payload["country"] = country
        if workplace_type is not None:
            payload["workplaceType"] = workplace_type

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
            raise self.error_cls(
                f"Rippling Board API request failed: {detail}"
            ) from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls(
                f"Rippling Board API request failed: Invalid JSON response: {exc}"
            ) from exc

        if not isinstance(decoded, dict):
            raise self.error_cls(
                "Rippling Board API request failed: Expected JSON object in response"
            )

        return decoded
