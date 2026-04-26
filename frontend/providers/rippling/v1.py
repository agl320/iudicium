import json
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from src.providers.errors import RipplingAPIError


class RipplingAtsV1BoardClient:
    def __init__(
        self,
        api_url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout_s: float = 30.0,
        error_cls: type[RuntimeError] = RipplingAPIError,
    ) -> None:
        self.api_url = api_url
        self.headers = dict(headers or {})
        self.params = dict(params or {})
        self.timeout_s = timeout_s
        self.error_cls = error_cls

    def search_raw(
        self, *, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        request_params = dict(self.params)
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
            raise self.error_cls(
                f"Rippling ATS v1 Board API request failed: {detail}"
            ) from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls(
                f"Rippling ATS v1 Board API request failed: Invalid JSON response: {exc}"
            ) from exc

        if not isinstance(decoded, list):
            raise self.error_cls(
                "Rippling ATS v1 Board API request failed: Expected JSON array in response"
            )

        jobs: list[dict[str, Any]] = []
        for item in decoded:
            if not isinstance(item, dict):
                raise self.error_cls(
                    "Rippling ATS v1 Board API request failed: Expected job objects in array"
                )
            jobs.append(item)

        return jobs
