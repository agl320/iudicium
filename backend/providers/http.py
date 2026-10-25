"""Small shared HTTP helper for the simpler provider clients."""

from __future__ import annotations

import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)


def fetch(
    url: str,
    *,
    error_cls: type[RuntimeError],
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout_s: float = 30.0,
    max_attempts: int = 3,
):
    """Returns (body, response headers). Retries HTTP 429/5xx with backoff."""
    request_headers = {"User-Agent": BROWSER_USER_AGENT, **(headers or {})}
    request = Request(url, data=data, headers=request_headers)

    for attempt in range(1, max_attempts + 1):
        try:
            with urlopen(request, timeout=timeout_s) as response:
                body = response.read().decode("utf-8", errors="replace")
                return body, response.headers
        except HTTPError as exc:
            retryable = exc.code == 429 or exc.code >= 500
            if retryable and attempt < max_attempts:
                retry_after = exc.headers.get("Retry-After")
                delay = (
                    float(retry_after)
                    if retry_after and retry_after.isdigit()
                    else 3.0 * attempt
                )
                time.sleep(min(delay, 60.0))
                continue
            raise error_cls(f"HTTP {exc.code} {exc.reason} for {url}") from exc
        except URLError as exc:
            if attempt < max_attempts:
                time.sleep(2.0 * attempt)
                continue
            raise error_cls(f"Request failed for {url}: {exc}") from exc

    raise error_cls(f"Request failed for {url}")
