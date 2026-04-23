from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from src.api.errors import TeslaAPIError
from src.config import DEFAULT_HEADERS, TESLA_CAREERS_STATE_API_URL

from playwright.sync_api import sync_playwright


class TeslaCareersStateClient:
    def __init__(
        self,
        api_url: str = TESLA_CAREERS_STATE_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = TeslaAPIError,
    ) -> None:
        self.api_url = api_url
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.error_cls = error_cls

    def search_raw(self) -> dict[str, Any]:
        # request_headers = dict(self.headers)
        # request_headers.setdefault("Accept", "application/json")
        # request_headers.setdefault("User-Agent", "iudicium/0.1")

        # request = Request(self.api_url, headers=request_headers, method="GET")

        # try:
        #     with urlopen(request, timeout=self.timeout_s) as response:
        #         body = response.read().decode("utf-8")
        # except HTTPError as exc:
        #     error_body = ""
        #     try:
        #         error_body = exc.read().decode("utf-8", errors="replace")
        #     except Exception:
        #         error_body = ""
        #     detail = f"HTTP {exc.code} {exc.reason}"
        #     if error_body:
        #         detail += f": {error_body}"
        #     raise self.error_cls(f"Tesla careers API request failed: {detail}") from exc
        # except URLError as exc:
        #     raise self.error_cls(f"Tesla careers API request failed: {exc}") from exc

        # try:
        #     decoded = json.loads(body)
        # except json.JSONDecodeError as exc:
        #     raise self.error_cls(
        #         f"Tesla careers API request failed: Invalid JSON response: {exc}"
        #     ) from exc

        # if not isinstance(decoded, dict):
        #     raise self.error_cls(
        #         "Tesla careers API request failed: Expected JSON object in response"
        #     )

        # return decoded

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)
            page = browser.new_page()
            page.goto("https://example.com")
            print(page.title())
            browser.close()

        return {}
